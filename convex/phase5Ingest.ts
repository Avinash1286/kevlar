"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requirePhase5IngestKey, assertPhase5Text } from "./phase5Auth";
import { verifyAiInfrastructureObservation } from "../domains/ai-infrastructure/src/index";

type IngestResult = {
  observationId: Id<"aiInfrastructureObservations">;
  runId: Id<"runs">;
  trust: "verified" | "quarantined";
  duplicate: boolean;
};

export const ingest = action({
  args: {
    ingestKey: v.string(),
    bindingId: v.id("collectorBindings"),
    sourceUrl: v.string(),
    brightDataJobId: v.string(),
    rawObservation: v.any(),
    operationKey: v.string(),
  },
  returns: v.object({
    observationId: v.id("aiInfrastructureObservations"),
    runId: v.id("runs"),
    trust: v.union(v.literal("verified"), v.literal("quarantined")),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args): Promise<IngestResult> => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase5Text(args.sourceUrl, "sourceUrl", 2_000);
    assertPhase5Text(args.brightDataJobId, "brightDataJobId", 240);
    assertPhase5Text(args.operationKey, "operationKey", 240);
    await ctx.runQuery(internal.phase5IngestSupport.prepare, {
      bindingId: args.bindingId,
      sourceUrl: args.sourceUrl,
    });
    const result = verifyAiInfrastructureObservation(args.rawObservation);
    const capturedAt = result.normalized
      ? Date.parse(result.normalized.captured_at)
      : Date.now();
    if (!Number.isFinite(capturedAt))
      throw new Error("Observation captured_at is invalid");
    return await ctx.runMutation(internal.phase5IngestSupport.persist, {
      bindingId: args.bindingId,
      sourceUrl: args.sourceUrl,
      brightDataJobId: args.brightDataJobId,
      raw: args.rawObservation,
      ...(result.normalized ? { normalized: result.normalized } : {}),
      trust: result.decision === "verified" ? "verified" : "quarantined",
      evidenceHash: result.evidenceHash,
      violations: result.violations,
      capturedAt,
      operationKey: args.operationKey,
    });
  },
});
