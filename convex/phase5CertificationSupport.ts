import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { urlMatchesEndpoint } from "./phase5Auth";
import {
  aiInfrastructureObservationValidator,
  aiInfrastructureViolationValidator,
} from "./phase5Validators";

const certificationContextValidator = v.object({
  sourceType: v.union(
    v.literal("pricing"),
    v.literal("catalog"),
    v.literal("documentation"),
    v.literal("changelog"),
  ),
});

export const prepare = internalQuery({
  args: {
    sourceId: v.id("sources"),
    endpointId: v.id("sourceEndpoints"),
    collectorId: v.id("collectors"),
    sourceUrl: v.string(),
  },
  returns: certificationContextValidator,
  handler: async (ctx, args) => {
    const [source, endpoint, collector, authorities] = await Promise.all([
      ctx.db.get("sources", args.sourceId),
      ctx.db.get("sourceEndpoints", args.endpointId),
      ctx.db.get("collectors", args.collectorId),
      ctx.db
        .query("sourceAuthorities")
        .withIndex("by_sourceId_and_active", (q) =>
          q.eq("sourceId", args.sourceId).eq("active", true),
        )
        .take(50),
    ]);
    if (
      !source ||
      !endpoint ||
      !collector ||
      !source.official ||
      source.visibility !== "public" ||
      source.approvalStatus !== "approved" ||
      (source.lifecycleStatus !== "active" &&
        source.lifecycleStatus !== "onboarding") ||
      endpoint.sourceId !== source._id ||
      !endpoint.public ||
      endpoint.approvalStatus !== "approved" ||
      authorities.every(
        (authority) => authority.authority !== "authoritative",
      ) ||
      !urlMatchesEndpoint(args.sourceUrl, endpoint.host, endpoint.pathPrefix)
    )
      throw new Error(
        "Source certification requires approved official public source policy",
      );
    return { sourceType: source.sourceType };
  },
});

export const persist = internalMutation({
  args: {
    sourceId: v.id("sources"),
    endpointId: v.id("sourceEndpoints"),
    collectorId: v.id("collectors"),
    sourceUrl: v.string(),
    brightDataJobId: v.string(),
    contractVersion: v.string(),
    normalized: v.optional(aiInfrastructureObservationValidator),
    verifierDecision: v.union(
      v.literal("verified"),
      v.literal("quarantined"),
      v.literal("invalid"),
    ),
    outputHash: v.string(),
    evidenceHash: v.string(),
    violations: v.array(aiInfrastructureViolationValidator),
    operationKey: v.string(),
  },
  returns: v.object({
    sourceCertificationId: v.id("sourceCertifications"),
    status: v.union(v.literal("certified"), v.literal("rejected")),
    outputHash: v.string(),
    evidenceHash: v.string(),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const byOperation = await ctx.db
      .query("sourceCertifications")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (byOperation) {
      if (
        byOperation.sourceId !== args.sourceId ||
        byOperation.endpointId !== args.endpointId ||
        byOperation.collectorId !== args.collectorId ||
        byOperation.brightDataJobId !== args.brightDataJobId
      )
        throw new Error("operationKey belongs to another source certification");
      return {
        sourceCertificationId: byOperation._id,
        status: byOperation.status,
        outputHash: byOperation.outputHash,
        evidenceHash: byOperation.evidenceHash,
        duplicate: true,
      };
    }
    const byJob = await ctx.db
      .query("sourceCertifications")
      .withIndex("by_brightDataJobId", (q) =>
        q.eq("brightDataJobId", args.brightDataJobId),
      )
      .unique();
    if (byJob) {
      if (
        byJob.sourceId !== args.sourceId ||
        byJob.endpointId !== args.endpointId ||
        byJob.collectorId !== args.collectorId
      )
        throw new Error(
          "brightDataJobId belongs to another source certification",
        );
      return {
        sourceCertificationId: byJob._id,
        status: byJob.status,
        outputHash: byJob.outputHash,
        evidenceHash: byJob.evidenceHash,
        duplicate: true,
      };
    }
    const [source, endpoint, collector, authorities] = await Promise.all([
      ctx.db.get("sources", args.sourceId),
      ctx.db.get("sourceEndpoints", args.endpointId),
      ctx.db.get("collectors", args.collectorId),
      ctx.db
        .query("sourceAuthorities")
        .withIndex("by_sourceId_and_active", (q) =>
          q.eq("sourceId", args.sourceId).eq("active", true),
        )
        .take(50),
    ]);
    if (
      !source ||
      !endpoint ||
      !collector ||
      !source.official ||
      source.visibility !== "public" ||
      source.approvalStatus !== "approved" ||
      (source.lifecycleStatus !== "active" &&
        source.lifecycleStatus !== "onboarding") ||
      endpoint.sourceId !== source._id ||
      !endpoint.public ||
      endpoint.approvalStatus !== "approved" ||
      authorities.every(
        (authority) => authority.authority !== "authoritative",
      ) ||
      !urlMatchesEndpoint(args.sourceUrl, endpoint.host, endpoint.pathPrefix)
    )
      throw new Error("Source certification policy changed before commit");
    const certified =
      args.verifierDecision === "verified" &&
      args.violations.length === 0 &&
      args.normalized !== undefined &&
      args.normalized.source_type === source.sourceType &&
      args.normalized.source_url === args.sourceUrl;
    const status = certified ? ("certified" as const) : ("rejected" as const);
    const now = Date.now();
    const sourceCertificationId = await ctx.db.insert("sourceCertifications", {
      sourceId: source._id,
      endpointId: endpoint._id,
      collectorId: collector._id,
      status,
      contractVersion: args.contractVersion,
      snapshotId: `source:${source._id}:${args.brightDataJobId}`,
      brightDataJobId: args.brightDataJobId,
      outputHash: args.outputHash,
      evidenceHash: args.evidenceHash,
      violations: args.violations,
      operationKey: args.operationKey,
      createdAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: collector.projectId,
      actorType: "system",
      action: `phase5.source_certification_${status}`,
      targetType: "source_certification",
      targetId: String(sourceCertificationId),
      payload: {
        sourceId: source._id,
        endpointId: endpoint._id,
        collectorId: collector._id,
        brightDataJobId: args.brightDataJobId,
        operationKey: args.operationKey,
        violationCount: args.violations.length,
      },
      createdAt: now,
    });
    return {
      sourceCertificationId,
      status,
      outputHash: args.outputHash,
      evidenceHash: args.evidenceHash,
      duplicate: false,
    };
  },
});
