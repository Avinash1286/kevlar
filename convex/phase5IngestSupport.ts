import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { urlMatchesEndpoint } from "./phase5Auth";
import {
  aiInfrastructureObservationValidator,
  aiInfrastructureViolationValidator,
} from "./phase5Validators";

const gateResultValidator = v.object({
  sourceId: v.id("sources"),
  bindingId: v.id("collectorBindings"),
  collectorId: v.id("collectors"),
  sourceType: v.union(
    v.literal("pricing"),
    v.literal("catalog"),
    v.literal("documentation"),
    v.literal("changelog"),
  ),
  endpointUrl: v.string(),
  authorityPredicates: v.array(v.string()),
});

export const prepare = internalQuery({
  args: {
    bindingId: v.id("collectorBindings"),
    sourceUrl: v.string(),
  },
  returns: gateResultValidator,
  handler: async (ctx, args) => {
    const binding = await ctx.db.get("collectorBindings", args.bindingId);
    if (
      !binding ||
      !binding.sourceId ||
      !binding.endpointId ||
      binding.bindingKind !== "production" ||
      binding.lifecycleStatus !== "active" ||
      binding.coreGateStatus !== "certified" ||
      !binding.sourceCertificationId ||
      binding.bypassCore
    )
      throw new Error(
        "Ingestion requires active Core-certified production binding",
      );
    const [source, endpoint, collector, certification, authorities] =
      await Promise.all([
        ctx.db.get("sources", binding.sourceId),
        ctx.db.get("sourceEndpoints", binding.endpointId),
        ctx.db.get("collectors", binding.collectorId),
        ctx.db.get("sourceCertifications", binding.sourceCertificationId),
        ctx.db
          .query("sourceAuthorities")
          .withIndex("by_sourceId_and_active", (q) =>
            q.eq("sourceId", binding.sourceId!).eq("active", true),
          )
          .take(50),
      ]);
    if (
      !source ||
      !endpoint ||
      !collector ||
      !certification ||
      source.approvalStatus !== "approved" ||
      source.lifecycleStatus !== "active" ||
      source.visibility !== "public" ||
      !source.official ||
      endpoint.sourceId !== source._id ||
      endpoint.approvalStatus !== "approved" ||
      !endpoint.public ||
      certification.status !== "certified" ||
      certification.sourceId !== source._id ||
      certification.endpointId !== endpoint._id ||
      certification.collectorId !== collector._id ||
      authorities.every(
        (authority) => authority.authority !== "authoritative",
      ) ||
      !urlMatchesEndpoint(args.sourceUrl, endpoint.host, endpoint.pathPrefix)
    )
      throw new Error(
        "Source, endpoint, authority, URL, or Core gate rejected ingestion",
      );
    return {
      sourceId: source._id,
      bindingId: binding._id,
      collectorId: collector._id,
      sourceType: source.sourceType,
      endpointUrl: endpoint.url,
      authorityPredicates: authorities
        .filter((authority) => authority.authority === "authoritative")
        .map((authority) => authority.predicate),
    };
  },
});

export const persist = internalMutation({
  args: {
    bindingId: v.id("collectorBindings"),
    sourceUrl: v.string(),
    brightDataJobId: v.string(),
    raw: v.any(),
    normalized: v.optional(aiInfrastructureObservationValidator),
    trust: v.union(v.literal("verified"), v.literal("quarantined")),
    evidenceHash: v.string(),
    violations: v.array(aiInfrastructureViolationValidator),
    capturedAt: v.number(),
    operationKey: v.string(),
  },
  returns: v.object({
    observationId: v.id("aiInfrastructureObservations"),
    runId: v.id("runs"),
    trust: v.union(v.literal("verified"), v.literal("quarantined")),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const byOperation = await ctx.db
      .query("aiInfrastructureObservations")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (byOperation)
      return {
        observationId: byOperation._id,
        runId: byOperation.runId,
        trust: byOperation.trust,
        duplicate: true,
      };
    const binding = await ctx.db.get("collectorBindings", args.bindingId);
    if (
      !binding ||
      !binding.sourceId ||
      !binding.endpointId ||
      binding.bindingKind !== "production" ||
      binding.lifecycleStatus !== "active" ||
      binding.coreGateStatus !== "certified" ||
      !binding.sourceCertificationId ||
      binding.bypassCore
    )
      throw new Error("Ingestion binding no longer passes Core gate");
    const [source, endpoint, collector, certification, authorities] =
      await Promise.all([
        ctx.db.get("sources", binding.sourceId),
        ctx.db.get("sourceEndpoints", binding.endpointId),
        ctx.db.get("collectors", binding.collectorId),
        ctx.db.get("sourceCertifications", binding.sourceCertificationId),
        ctx.db
          .query("sourceAuthorities")
          .withIndex("by_sourceId_and_active", (q) =>
            q.eq("sourceId", binding.sourceId!).eq("active", true),
          )
          .take(50),
      ]);
    const authorityPredicates = authorities
      .filter((authority) => authority.authority === "authoritative")
      .map((authority) => authority.predicate);
    if (
      !source ||
      !endpoint ||
      !collector ||
      !certification ||
      source.approvalStatus !== "approved" ||
      source.lifecycleStatus !== "active" ||
      source.visibility !== "public" ||
      !source.official ||
      endpoint.sourceId !== source._id ||
      endpoint.approvalStatus !== "approved" ||
      !endpoint.public ||
      certification.status !== "certified" ||
      certification.sourceId !== source._id ||
      certification.endpointId !== endpoint._id ||
      certification.collectorId !== collector._id ||
      authorityPredicates.length === 0 ||
      !urlMatchesEndpoint(args.sourceUrl, endpoint.host, endpoint.pathPrefix)
    )
      throw new Error("Source gate changed before ingestion commit");
    if (
      args.normalized &&
      (args.normalized.source_type !== source.sourceType ||
        args.normalized.source_url !== args.sourceUrl)
    )
      throw new Error("Normalized observation does not match bound source");
    if (
      args.trust === "verified" &&
      (!args.normalized || args.violations.length > 0)
    )
      throw new Error(
        "Verified trust requires normalized violation-free observation",
      );
    const duplicateRun = await ctx.db
      .query("runs")
      .withIndex("by_bright_data_job", (q) =>
        q.eq("brightDataJobId", args.brightDataJobId),
      )
      .unique();
    if (duplicateRun) {
      const observation = await ctx.db
        .query("aiInfrastructureObservations")
        .withIndex("by_runId", (q) => q.eq("runId", duplicateRun._id))
        .unique();
      if (!observation || observation.bindingId !== binding._id)
        throw new Error("brightDataJobId belongs to another ingestion");
      return {
        observationId: observation._id,
        runId: duplicateRun._id,
        trust: observation.trust,
        duplicate: true,
      };
    }
    const now = Date.now();
    const runId = await ctx.db.insert("runs", {
      projectId: collector.projectId,
      collectorId: collector._id,
      mode: "monitor",
      status: args.trust,
      brightDataJobId: args.brightDataJobId,
      startedAt: args.capturedAt,
      completedAt: now,
      outputHash: args.evidenceHash,
      rowCount: 1,
    });
    await ctx.db.insert("rows", {
      runId,
      entityId: source.key,
      rawPayload: args.raw,
      normalizedPayload: args.normalized ?? null,
      fieldTrust: {
        state: args.trust,
        directReleaseAllowed: false,
        authorityPredicates,
      },
      recordHash: args.evidenceHash,
    });
    await ctx.db.insert("evidence", {
      projectId: collector.projectId,
      runId,
      kind: "visible_context",
      sourceUrl: args.sourceUrl,
      contentHash: args.normalized?.evidence.content_hash ?? args.evidenceHash,
      metadata: args.normalized?.evidence ?? {
        page_heading: "Schema-invalid observation",
        contexts: [],
        screenshot_ref: null,
      },
      capturedAt: args.capturedAt,
    });
    const observationId = await ctx.db.insert("aiInfrastructureObservations", {
      sourceId: source._id,
      bindingId: binding._id,
      runId,
      sourceType: source.sourceType,
      sourceUrl: args.sourceUrl,
      ...(args.normalized
        ? {
            providerId: args.normalized.provider.id,
            providerName: args.normalized.provider.name,
            normalized: args.normalized,
          }
        : {}),
      raw: args.raw,
      trust: args.trust,
      evidenceHash: args.evidenceHash,
      violations: args.violations,
      authorityPredicates,
      operationKey: args.operationKey,
      capturedAt: args.capturedAt,
      createdAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: collector.projectId,
      actorType: "system",
      action: `phase5.observation_${args.trust}`,
      targetType: "ai_infrastructure_observation",
      targetId: String(observationId),
      payload: {
        sourceId: source._id,
        bindingId: binding._id,
        runId,
        directReleaseAllowed: false,
        violationCount: args.violations.length,
      },
      createdAt: now,
    });
    return { observationId, runId, trust: args.trust, duplicate: false };
  },
});
