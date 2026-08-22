"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { assertPhase5Text, requirePhase5IngestKey } from "./phase5Auth";
import {
  AI_INFRASTRUCTURE_SOURCE_SCHEMA_VERSION,
  verifyAiInfrastructureObservation,
} from "../domains/ai-infrastructure/src/index";

type CertificationResult = {
  sourceCertificationId: Id<"sourceCertifications">;
  status: "certified" | "rejected";
  outputHash: string;
  evidenceHash: string;
  duplicate: boolean;
};

export const certify = action({
  args: {
    ingestKey: v.string(),
    sourceId: v.id("sources"),
    endpointId: v.id("sourceEndpoints"),
    collectorId: v.id("collectors"),
    sourceUrl: v.string(),
    brightDataJobId: v.string(),
    rawObservation: v.any(),
    operationKey: v.string(),
  },
  returns: v.object({
    sourceCertificationId: v.id("sourceCertifications"),
    status: v.union(v.literal("certified"), v.literal("rejected")),
    outputHash: v.string(),
    evidenceHash: v.string(),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args): Promise<CertificationResult> => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase5Text(args.sourceUrl, "sourceUrl", 2_000);
    assertPhase5Text(args.brightDataJobId, "brightDataJobId", 240);
    assertPhase5Text(args.operationKey, "operationKey", 240);
    const context = await ctx.runQuery(
      internal.phase5CertificationSupport.prepare,
      {
        sourceId: args.sourceId,
        endpointId: args.endpointId,
        collectorId: args.collectorId,
        sourceUrl: args.sourceUrl,
      },
    );
    const result = verifyAiInfrastructureObservation(args.rawObservation);
    const violations = [...result.violations];
    if (
      result.normalized &&
      (result.normalized.source_type !== context.sourceType ||
        result.normalized.source_url !== args.sourceUrl)
    )
      violations.push({
        code: "source_policy_mismatch",
        severity: "critical",
        message:
          "Certified observation does not match the requested source type and URL.",
      });
    return await ctx.runMutation(internal.phase5CertificationSupport.persist, {
      sourceId: args.sourceId,
      endpointId: args.endpointId,
      collectorId: args.collectorId,
      sourceUrl: args.sourceUrl,
      brightDataJobId: args.brightDataJobId,
      contractVersion: AI_INFRASTRUCTURE_SOURCE_SCHEMA_VERSION,
      ...(result.normalized ? { normalized: result.normalized } : {}),
      verifierDecision:
        result.decision === "verified" && violations.length > 0
          ? "quarantined"
          : result.decision,
      outputHash: result.evidenceHash,
      evidenceHash:
        result.normalized?.evidence.content_hash ?? result.evidenceHash,
      violations,
      operationKey: args.operationKey,
    });
  },
});
