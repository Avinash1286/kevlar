import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  assertProjectScope,
  resolveKevlarReleaseProjectReadAccess,
} from "./phase11Auth";

const publicQueueItemValidator = v.object({
  _id: v.id("fleetQueueItems"),
  sourceId: v.id("sources"),
  bindingId: v.id("collectorBindings"),
  state: v.string(),
  dueAt: v.number(),
  attempt: v.number(),
});

const publicLeaseValidator = v.object({
  _id: v.id("fleetLeases"),
  sourceId: v.id("sources"),
  bindingId: v.id("collectorBindings"),
  status: v.string(),
  claimedAt: v.number(),
  expiresAt: v.number(),
  releasedAt: v.optional(v.number()),
});

const publicHealthValidator = v.object({
  _id: v.string(),
  sourceId: v.id("sources"),
  state: v.string(),
  consecutiveFailures: v.number(),
  quotaUsed: v.number(),
  totalClaims: v.number(),
  lastClaimedAt: v.optional(v.number()),
  lastSuccessAt: v.optional(v.number()),
  lastFailureAt: v.optional(v.number()),
  updatedAt: v.number(),
});

const publicObservationValidator = v.object({
  _id: v.id("aiInfrastructureObservations"),
  sourceId: v.id("sources"),
  bindingId: v.id("collectorBindings"),
  runId: v.id("runs"),
  sourceType: v.string(),
  trust: v.string(),
  evidenceHash: v.string(),
  capturedAt: v.number(),
  createdAt: v.number(),
});

export const publicFleetResultValidator = v.object({
  due: v.array(publicQueueItemValidator),
  leased: v.array(publicQueueItemValidator),
  leases: v.array(publicLeaseValidator),
  health: v.array(publicHealthValidator),
  observations: v.array(publicObservationValidator),
});

function emptyFleetResult() {
  return { due: [], leased: [], leases: [], health: [], observations: [] };
}

export async function readKevlarCoreFleet(ctx: QueryCtx, now: number) {
  if (!Number.isFinite(now)) throw new Error("now must be finite");
  const project = await resolveKevlarReleaseProjectReadAccess(ctx);
  if (!project) return emptyFleetResult();

  const collectors = await ctx.db
    .query("collectors")
    .withIndex("by_project", (q) => q.eq("projectId", project._id))
    .take(50);
  assertProjectScope(project._id, collectors);
  const bindingGroups = await Promise.all(
    collectors.flatMap((collector) =>
      (["production", "regression"] as const).map((bindingKind) =>
        ctx.db
          .query("collectorBindings")
          .withIndex("by_collectorId_and_bindingKind", (q) =>
            q.eq("collectorId", collector._id).eq("bindingKind", bindingKind),
          )
          .take(20),
      ),
    ),
  );
  const bindingCandidates = bindingGroups.flat();
  const [sourceDocs, endpointDocs] = await Promise.all([
    Promise.all(
      bindingCandidates.map((binding) =>
        binding.sourceId ? ctx.db.get("sources", binding.sourceId) : null,
      ),
    ),
    Promise.all(
      bindingCandidates.map((binding) =>
        binding.endpointId
          ? ctx.db.get("sourceEndpoints", binding.endpointId)
          : null,
      ),
    ),
  ]);
  const bindingCandidatesById = new Map(
    bindingCandidates.map((item) => [item._id, item]),
  );
  const bindings = bindingCandidates.filter(
    (binding, index) =>
      sourceDocs[index]?.visibility === "public" &&
      endpointDocs[index]?.public === true &&
      endpointDocs[index]?.sourceId === binding.sourceId,
  );
  const bindingsById = new Map(bindings.map((item) => [item._id, item]));
  const bindingIds = new Set(bindingsById.keys());

  const scheduleGroups = await Promise.all(
    bindings.map((binding) =>
      ctx.db
        .query("schedulePolicies")
        .withIndex("by_bindingId", (q) => q.eq("bindingId", binding._id))
        .take(10),
    ),
  );
  const schedules = scheduleGroups.flat();
  if (schedules.some((schedule) => !bindingIds.has(schedule.bindingId)))
    throw new Error("Cross-project data relationship");

  const queueGroups = await Promise.all(
    schedules.map((schedule) =>
      ctx.db
        .query("fleetQueueItems")
        .withIndex("by_schedulePolicyId", (q) =>
          q.eq("schedulePolicyId", schedule._id),
        )
        .take(20),
    ),
  );
  const queueItems = queueGroups.flat();
  for (const item of queueItems) {
    const binding = bindingsById.get(item.bindingId);
    if (!binding || binding.sourceId !== item.sourceId)
      throw new Error("Cross-project data relationship");
  }

  const leaseGroups = await Promise.all(
    bindings.map((binding) =>
      ctx.db
        .query("fleetLeases")
        .withIndex("by_bindingId_and_status", (q) =>
          q.eq("bindingId", binding._id).eq("status", "active"),
        )
        .take(20),
    ),
  );
  const leases = leaseGroups.flat();
  for (const lease of leases) {
    const binding = bindingsById.get(lease.bindingId);
    if (!binding || binding.sourceId !== lease.sourceId)
      throw new Error("Cross-project data relationship");
  }

  const runs = await ctx.db
    .query("runs")
    .withIndex("by_project_started", (q) => q.eq("projectId", project._id))
    .order("desc")
    .take(50);
  assertProjectScope(project._id, runs);
  const runIds = new Set(runs.map((run) => run._id));
  const observationGroups = await Promise.all(
    runs.map((run) =>
      ctx.db
        .query("aiInfrastructureObservations")
        .withIndex("by_runId", (q) => q.eq("runId", run._id))
        .take(20),
    ),
  );
  const observationCandidates = observationGroups
    .flat()
    .sort((left, right) => right.createdAt - left.createdAt);
  for (const observation of observationCandidates) {
    const binding = bindingCandidatesById.get(observation.bindingId);
    if (
      !runIds.has(observation.runId) ||
      !binding ||
      binding.sourceId !== observation.sourceId
    )
      throw new Error("Cross-project data relationship");
  }
  const observations = observationCandidates
    .filter((observation) => bindingIds.has(observation.bindingId))
    .slice(0, 50);

  const sourceIds = [
    ...new Set(
      bindings.flatMap((binding) =>
        binding.sourceId ? [binding.sourceId] : [],
      ),
    ),
  ];

  const queueView = (item: Doc<"fleetQueueItems">) => ({
    _id: item._id,
    sourceId: item.sourceId,
    bindingId: item.bindingId,
    state: item.state,
    dueAt: item.dueAt,
    attempt: item.attempt,
  });
  return {
    due: queueItems
      .filter((item) => item.state === "due" && item.dueAt <= now)
      .slice(0, 50)
      .map(queueView),
    leased: queueItems
      .filter((item) => item.state === "leased")
      .slice(0, 50)
      .map(queueView),
    leases: leases.slice(0, 50).map((lease) => ({
      _id: lease._id,
      sourceId: lease.sourceId,
      bindingId: lease.bindingId,
      status: lease.status,
      claimedAt: lease.claimedAt,
      expiresAt: lease.expiresAt,
      releasedAt: lease.releasedAt,
    })),
    health: sourceIds.slice(0, 50).map((sourceId) => {
      const sourceObservations = observations.filter(
        (item) => item.sourceId === sourceId,
      );
      const latest = sourceObservations[0];
      const lastSuccess = sourceObservations.find(
        (item) => item.trust === "verified",
      );
      const lastFailure = sourceObservations.find(
        (item) => item.trust === "quarantined",
      );
      const firstSuccessIndex = sourceObservations.findIndex(
        (item) => item.trust === "verified",
      );
      return {
        _id: String(sourceId),
        sourceId,
        state:
          latest?.trust === "verified"
            ? "healthy"
            : latest
              ? "failing"
              : "cooling",
        consecutiveFailures:
          latest?.trust === "quarantined"
            ? firstSuccessIndex === -1
              ? sourceObservations.length
              : firstSuccessIndex
            : 0,
        quotaUsed: sourceObservations.length,
        totalClaims: sourceObservations.length,
        lastClaimedAt: latest?.capturedAt,
        lastSuccessAt: lastSuccess?.capturedAt,
        lastFailureAt: lastFailure?.capturedAt,
        updatedAt: latest?.createdAt ?? 0,
      };
    }),
    observations: observations.map((item) => ({
      _id: item._id,
      sourceId: item.sourceId,
      bindingId: item.bindingId,
      runId: item.runId,
      sourceType: item.sourceType,
      trust: item.trust,
      evidenceHash: item.evidenceHash,
      capturedAt: item.capturedAt,
      createdAt: item.createdAt,
    })),
  };
}
