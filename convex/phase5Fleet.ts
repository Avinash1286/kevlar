import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import {
  publicFleetResultValidator,
  readKevlarCoreFleet,
} from "./phase5PublicRead";
import { assertPhase5Text, requirePhase5IngestKey } from "./phase5Auth";
import { isFairCandidateEligible, orderFairCandidates } from "./phase5Fairness";
import {
  fleetOutcomeValidator,
  sourceHealthStateValidator,
} from "./phase5Validators";

const claimValidator = v.object({
  leaseId: v.id("fleetLeases"),
  queueItemId: v.id("fleetQueueItems"),
  bindingId: v.id("collectorBindings"),
  sourceId: v.id("sources"),
  collectorId: v.id("collectors"),
  collectorPlatformId: v.string(),
  endpointUrl: v.string(),
  leaseToken: v.string(),
  expiresAt: v.number(),
});

export const claimDue = mutation({
  args: {
    ingestKey: v.string(),
    workerId: v.string(),
    now: v.number(),
    quotaDate: v.string(),
    leaseMs: v.number(),
    operationKey: v.string(),
  },
  returns: v.union(claimValidator, v.null()),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase5Text(args.workerId, "workerId", 240);
    assertPhase5Text(args.operationKey, "operationKey", 240);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.quotaDate))
      throw new Error("quotaDate must be YYYY-MM-DD");
    if (args.leaseMs < 1_000 || args.leaseMs > 30 * 60_000)
      throw new Error("leaseMs must be between 1 second and 30 minutes");

    const duplicate = await ctx.db
      .query("fleetLeases")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (duplicate) {
      if (duplicate.workerId !== args.workerId)
        throw new Error("operationKey belongs to another fleet worker");
      const [binding, source] = await Promise.all([
        ctx.db.get("collectorBindings", duplicate.bindingId),
        ctx.db.get("sources", duplicate.sourceId),
      ]);
      if (!binding || !source || !binding.endpointId)
        throw new Error("Existing fleet lease context is incomplete");
      const [collector, endpoint] = await Promise.all([
        ctx.db.get("collectors", binding.collectorId),
        ctx.db.get("sourceEndpoints", binding.endpointId),
      ]);
      if (!collector || !endpoint)
        throw new Error("Existing fleet lease target is incomplete");
      return {
        leaseId: duplicate._id,
        queueItemId: duplicate.queueItemId,
        bindingId: binding._id,
        sourceId: source._id,
        collectorId: collector._id,
        collectorPlatformId: collector.collectorId,
        endpointUrl: endpoint.url,
        leaseToken: duplicate.leaseToken,
        expiresAt: duplicate.expiresAt,
      };
    }

    const expired = await ctx.db
      .query("fleetLeases")
      .withIndex("by_status_and_expiresAt", (q) =>
        q.eq("status", "active").lte("expiresAt", args.now),
      )
      .take(50);
    for (const lease of expired) {
      await ctx.db.patch("fleetLeases", lease._id, {
        status: "expired",
        releasedAt: args.now,
      });
      const item = await ctx.db.get("fleetQueueItems", lease.queueItemId);
      if (item?.currentLeaseId === lease._id)
        await ctx.db.patch("fleetQueueItems", item._id, {
          state: "due",
          dueAt: args.now,
          currentLeaseId: undefined,
          updatedAt: args.now,
        });
    }

    const activeSources = await ctx.db
      .query("sources")
      .withIndex("by_approvalStatus_and_lifecycleStatus", (q) =>
        q.eq("approvalStatus", "approved").eq("lifecycleStatus", "active"),
      )
      .take(100);
    const due = (
      await Promise.all(
        activeSources.map((source) =>
          ctx.db
            .query("fleetQueueItems")
            .withIndex("by_sourceId_and_state_and_dueAt", (q) =>
              q
                .eq("sourceId", source._id)
                .eq("state", "due")
                .lte("dueAt", args.now),
            )
            .first(),
        ),
      )
    ).filter((item) => item !== null);
    const eligible: Array<{
      item: Doc<"fleetQueueItems">;
      binding: Doc<"collectorBindings">;
      source: Doc<"sources">;
      endpoint: Doc<"sourceEndpoints">;
      collector: Doc<"collectors">;
      policy: Doc<"schedulePolicies">;
      health: Doc<"sourceHealth">;
      quotaUsed: number;
    }> = [];
    for (const item of due) {
      const [binding, source, policy, health] = await Promise.all([
        ctx.db.get("collectorBindings", item.bindingId),
        ctx.db.get("sources", item.sourceId),
        ctx.db.get("schedulePolicies", item.schedulePolicyId),
        ctx.db
          .query("sourceHealth")
          .withIndex("by_sourceId", (q) => q.eq("sourceId", item.sourceId))
          .unique(),
      ]);
      if (!binding || !source || !policy || !health || !binding.endpointId)
        continue;
      const quotaUsed =
        health.quotaDate === args.quotaDate ? health.quotaUsed : 0;
      const [endpoint, collector, certification] = await Promise.all([
        ctx.db.get("sourceEndpoints", binding.endpointId),
        ctx.db.get("collectors", binding.collectorId),
        binding.sourceCertificationId
          ? ctx.db.get("sourceCertifications", binding.sourceCertificationId)
          : null,
      ]);
      if (!endpoint || !collector) continue;
      const active = await ctx.db
        .query("fleetLeases")
        .withIndex("by_bindingId_and_status", (q) =>
          q.eq("bindingId", binding._id).eq("status", "active"),
        )
        .take(21);
      if (
        !isFairCandidateEligible({
          bindingKind: binding.bindingKind,
          bindingLifecycle: binding.lifecycleStatus,
          coreGateStatus: binding.coreGateStatus,
          bypassCore: binding.bypassCore,
          certificationStatus: certification?.status ?? null,
          certificationMatches:
            certification?.sourceId === source._id &&
            certification.endpointId === endpoint._id &&
            certification.collectorId === collector._id,
          sourceApprovalStatus: source.approvalStatus,
          sourceLifecycle: source.lifecycleStatus,
          sourceVisibility: source.visibility,
          sourceOfficial: source.official,
          endpointApprovalStatus: endpoint.approvalStatus,
          endpointPublic: endpoint.public,
          policyEnabled: policy.enabled,
          healthState: health.state,
          cooldownUntil: health.cooldownUntil ?? null,
          now: args.now,
          quotaUsed,
          dailyQuota: policy.dailyQuota,
          activeLeases: active.length,
          maxConcurrency: policy.maxConcurrency,
        })
      )
        continue;
      eligible.push({
        item,
        binding,
        source,
        endpoint,
        collector,
        policy,
        health,
        quotaUsed,
      });
    }
    if (eligible.length === 0) return null;

    const bySource = new Map<string, (typeof eligible)[number]>();
    for (const candidate of eligible) {
      const current = bySource.get(candidate.source._id);
      if (
        !current ||
        candidate.item.virtualFinish / candidate.policy.weight <
          current.item.virtualFinish / current.policy.weight
      )
        bySource.set(candidate.source._id, candidate);
    }
    const selected = orderFairCandidates(
      [...bySource.values()].map((candidate) => ({
        candidate,
        sourceId: String(candidate.source._id),
        candidateId: String(candidate.item._id),
        lastClaimedAt: candidate.health.lastClaimedAt ?? null,
        virtualFinish: candidate.item.virtualFinish,
        weight: candidate.policy.weight,
      })),
    )[0]?.candidate;
    if (!selected) return null;
    const expiresAt = args.now + args.leaseMs;
    const leaseToken = `${args.operationKey}:${selected.item._id}:${selected.item.attempt + 1}`;
    const leaseId = await ctx.db.insert("fleetLeases", {
      queueItemId: selected.item._id,
      sourceId: selected.source._id,
      bindingId: selected.binding._id,
      leaseToken,
      workerId: args.workerId,
      status: "active",
      operationKey: args.operationKey,
      claimedAt: args.now,
      expiresAt,
    });
    await ctx.db.patch("fleetQueueItems", selected.item._id, {
      state: "leased",
      currentLeaseId: leaseId,
      virtualFinish: selected.item.virtualFinish + 1 / selected.policy.weight,
      updatedAt: args.now,
    });
    await ctx.db.patch("sourceHealth", selected.health._id, {
      state: "healthy",
      cooldownUntil: undefined,
      quotaDate: args.quotaDate,
      quotaUsed: selected.quotaUsed + 1,
      lastClaimedAt: args.now,
      totalClaims: selected.health.totalClaims + 1,
      updatedAt: args.now,
    });
    if (selected.binding.lifecycleStatus === "cooling")
      await ctx.db.patch("collectorBindings", selected.binding._id, {
        lifecycleStatus: "active",
        updatedAt: args.now,
      });
    return {
      leaseId,
      queueItemId: selected.item._id,
      bindingId: selected.binding._id,
      sourceId: selected.source._id,
      collectorId: selected.collector._id,
      collectorPlatformId: selected.collector.collectorId,
      endpointUrl: selected.endpoint.url,
      leaseToken,
      expiresAt,
    };
  },
});

export const recordOutcome = mutation({
  args: {
    ingestKey: v.string(),
    leaseId: v.id("fleetLeases"),
    leaseToken: v.string(),
    outcome: fleetOutcomeValidator,
    completedAt: v.number(),
    error: v.optional(v.string()),
    operationKey: v.string(),
  },
  returns: v.object({
    healthState: sourceHealthStateValidator,
    nextDueAt: v.number(),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase5Text(args.operationKey, "operationKey", 240);
    if (args.error && args.error.length > 1_000)
      throw new Error("error must be at most 1000 characters");
    const prior = await ctx.db
      .query("fleetLeases")
      .withIndex("by_outcomeOperationKey", (q) =>
        q.eq("outcomeOperationKey", args.operationKey),
      )
      .unique();
    if (prior) {
      if (prior._id !== args.leaseId || prior.leaseToken !== args.leaseToken)
        throw new Error("operationKey belongs to another fleet outcome");
      const [item, health] = await Promise.all([
        ctx.db.get("fleetQueueItems", prior.queueItemId),
        ctx.db
          .query("sourceHealth")
          .withIndex("by_sourceId", (q) => q.eq("sourceId", prior.sourceId))
          .unique(),
      ]);
      if (!item || !health) throw new Error("Outcome context is incomplete");
      return {
        healthState: health.state,
        nextDueAt: item.dueAt,
        duplicate: true,
      };
    }
    const lease = await ctx.db.get("fleetLeases", args.leaseId);
    if (
      !lease ||
      lease.status !== "active" ||
      lease.leaseToken !== args.leaseToken
    )
      throw new Error("Active fleet lease token is invalid");
    const [item, health, binding] = await Promise.all([
      ctx.db.get("fleetQueueItems", lease.queueItemId),
      ctx.db
        .query("sourceHealth")
        .withIndex("by_sourceId", (q) => q.eq("sourceId", lease.sourceId))
        .unique(),
      ctx.db.get("collectorBindings", lease.bindingId),
    ]);
    if (!item || !health || !binding)
      throw new Error("Fleet outcome context is incomplete");
    const policy = await ctx.db
      .query("schedulePolicies")
      .withIndex("by_bindingId", (q) => q.eq("bindingId", binding._id))
      .unique();
    if (!policy) throw new Error("Fleet schedule policy not found");
    const failed = args.outcome !== "success";
    const consecutiveFailures = failed ? health.consecutiveFailures + 1 : 0;
    const healthState = failed
      ? consecutiveFailures >= policy.failureThreshold
        ? ("failing" as const)
        : ("cooling" as const)
      : ("healthy" as const);
    const deterministicJitter =
      policy.jitterMs === 0
        ? 0
        : (item.attempt * 2_654_435_761) % policy.jitterMs;
    const backoff = Math.min(
      policy.maxBackoffMs,
      policy.baseBackoffMs * 2 ** Math.max(0, consecutiveFailures - 1),
    );
    const nextDueAt =
      args.completedAt +
      (failed ? backoff : policy.intervalMs + deterministicJitter);
    await ctx.db.patch("fleetLeases", lease._id, {
      status: "released",
      outcomeOperationKey: args.operationKey,
      releasedAt: args.completedAt,
    });
    await ctx.db.patch("fleetQueueItems", item._id, {
      state: policy.enabled ? "due" : "canceled",
      dueAt: nextDueAt,
      attempt: item.attempt + 1,
      currentLeaseId: undefined,
      lastOutcome: args.outcome,
      updatedAt: args.completedAt,
    });
    await ctx.db.patch("sourceHealth", health._id, {
      state: healthState,
      consecutiveFailures,
      ...(failed ? { cooldownUntil: nextDueAt } : { cooldownUntil: undefined }),
      ...(failed
        ? {
            lastFailureAt: args.completedAt,
            lastError: args.error ?? args.outcome,
          }
        : { lastSuccessAt: args.completedAt, lastError: undefined }),
      updatedAt: args.completedAt,
    });
    await ctx.db.patch("collectorBindings", binding._id, {
      lifecycleStatus: healthState === "healthy" ? "active" : healthState,
      updatedAt: args.completedAt,
    });
    const collector = await ctx.db.get("collectors", binding.collectorId);
    await ctx.db.insert("auditEvents", {
      ...(collector ? { projectId: collector.projectId } : {}),
      actorType: "system",
      action: `phase5.fleet_${args.outcome}`,
      targetType: "fleet_lease",
      targetId: String(lease._id),
      payload: { nextDueAt, healthState, consecutiveFailures },
      createdAt: args.completedAt,
    });
    return { healthState, nextDueAt, duplicate: false };
  },
});

export const dashboard = query({
  args: { now: v.number() },
  returns: publicFleetResultValidator,
  handler: async (ctx, args) => await readKevlarCoreFleet(ctx, args.now),
});
