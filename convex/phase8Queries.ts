import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import {
  changeEventStateValidator,
  semanticEventTypeValidator,
  sourceConflictStatusValidator,
} from "./phase8Validators";
import { assertProjectScope, requireProjectReadAccess } from "./phase11Auth";

function limitOf(value: number | undefined): number {
  const limit = value ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error("limit must be an integer from 1 to 100");
  return limit;
}

export const events = query({
  args: {
    projectId: v.optional(v.id("projects")),
    entityId: v.optional(v.id("canonicalEntities")),
    eventType: v.optional(semanticEventTypeValidator),
    state: v.optional(changeEventStateValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(schema.doc("changeEvents")),
  handler: async (ctx, args) => {
    const limit = limitOf(args.limit);
    let projectId = args.projectId;
    if (args.entityId) {
      const entity = await ctx.db.get("canonicalEntities", args.entityId);
      if (!entity) {
        if (projectId) await requireProjectReadAccess(ctx, projectId);
        return [];
      }
      if (projectId && entity.projectId !== projectId)
        throw new Error("Cross-project data relationship");
      projectId = entity.projectId;
    }
    if (!projectId) {
      const project = await ctx.db
        .query("projects")
        .withIndex("by_slug", (q) => q.eq("slug", "kevlar-core"))
        .unique();
      projectId = project?._id;
    }
    if (!projectId) return [];
    await requireProjectReadAccess(ctx, projectId);
    let rows: Doc<"changeEvents">[];
    if (args.entityId)
      rows = await ctx.db
        .query("changeEvents")
        .withIndex("by_entityId_and_createdAt", (q) =>
          q.eq("entityId", args.entityId!),
        )
        .order("desc")
        .take(Math.min(limit * 3, 300));
    else if (args.eventType)
      rows = await ctx.db
        .query("changeEvents")
        .withIndex("by_projectId_and_eventType_and_createdAt", (q) =>
          q.eq("projectId", projectId!).eq("eventType", args.eventType!),
        )
        .order("desc")
        .take(Math.min(limit * 3, 300));
    else
      rows = await ctx.db
        .query("changeEvents")
        .withIndex("by_projectId_and_createdAt", (q) =>
          q.eq("projectId", projectId!),
        )
        .order("desc")
        .take(Math.min(limit * 3, 300));
    assertProjectScope(projectId, rows);
    return rows
      .filter(
        (row) =>
          (!args.eventType || row.eventType === args.eventType) &&
          (!args.state || row.state === args.state),
      )
      .slice(0, limit);
  },
});

export const conflicts = query({
  args: {
    projectId: v.optional(v.id("projects")),
    entityId: v.optional(v.id("canonicalEntities")),
    status: v.optional(sourceConflictStatusValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(schema.doc("sourceConflicts")),
  handler: async (ctx, args) => {
    const limit = limitOf(args.limit);
    let projectId = args.projectId;
    if (args.entityId) {
      const entity = await ctx.db.get("canonicalEntities", args.entityId);
      if (!entity) {
        if (projectId) await requireProjectReadAccess(ctx, projectId);
        return [];
      }
      if (projectId && entity.projectId !== projectId)
        throw new Error("Cross-project data relationship");
      projectId = entity.projectId;
    }
    if (!projectId) {
      const project = await ctx.db
        .query("projects")
        .withIndex("by_slug", (q) => q.eq("slug", "kevlar-core"))
        .unique();
      projectId = project?._id;
    }
    if (!projectId) return [];
    await requireProjectReadAccess(ctx, projectId);
    let rows: Doc<"sourceConflicts">[];
    if (args.entityId)
      rows = await ctx.db
        .query("sourceConflicts")
        .withIndex("by_entityId_and_predicate_and_openedAt", (q) =>
          q.eq("entityId", args.entityId!),
        )
        .order("desc")
        .take(Math.min(limit * 3, 300));
    else {
      rows = projectId
        ? await ctx.db
            .query("sourceConflicts")
            .withIndex("by_projectId_and_status_and_openedAt", (q) =>
              args.status
                ? q.eq("projectId", projectId!).eq("status", args.status)
                : q.eq("projectId", projectId!),
            )
            .order("desc")
            .take(Math.min(limit * 3, 300))
        : [];
    }
    assertProjectScope(projectId, rows);
    return rows
      .filter((row) => !args.status || row.status === args.status)
      .slice(0, limit);
  },
});

const courtroomValidator = v.object({
  event: v.union(schema.doc("changeEvents"), v.null()),
  conflict: v.union(schema.doc("sourceConflicts"), v.null()),
  decision: v.union(schema.doc("releaseDecisions"), v.null()),
  releaseDecision: v.union(schema.doc("releaseDecisions"), v.null()),
  policy: v.union(schema.doc("releasePolicies"), v.null()),
  releasePolicy: v.union(schema.doc("releasePolicies"), v.null()),
  policySources: v.array(schema.doc("releasePolicySources")),
  observations: v.array(schema.doc("canonicalObservations")),
  fields: v.array(schema.doc("canonicalObservationFields")),
  evidence: v.array(schema.doc("evidence")),
  previousFact: v.union(schema.doc("factVersions"), v.null()),
  nextFact: v.union(schema.doc("factVersions"), v.null()),
  factVersions: v.array(schema.doc("factVersions")),
  transitions: v.array(schema.doc("changeEventTransitions")),
  incomingRelations: v.array(schema.doc("changeEventRelations")),
  outgoingRelations: v.array(schema.doc("changeEventRelations")),
  relatedEvents: v.array(schema.doc("changeEvents")),
});

export const courtroom = query({
  args: {
    eventId: v.optional(v.string()),
    conflictId: v.optional(v.id("sourceConflicts")),
  },
  returns: v.union(courtroomValidator, v.null()),
  handler: async (ctx, args) => {
    if (!args.eventId && !args.conflictId)
      throw new Error("eventId or conflictId is required");
    let event = args.eventId
      ? await ctx.db
          .query("changeEvents")
          .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId!))
          .unique()
      : null;
    const conflict = args.conflictId
      ? await ctx.db.get("sourceConflicts", args.conflictId)
      : event?.conflictId
        ? await ctx.db.get("sourceConflicts", event.conflictId)
        : null;
    if (!event && conflict)
      event = await ctx.db
        .query("changeEvents")
        .withIndex("by_releaseDecisionId", (q) =>
          q.eq("releaseDecisionId", conflict.releaseDecisionId),
        )
        .first();
    if (!event && !conflict) return null;
    const projectId = event?.projectId ?? conflict!.projectId;
    assertProjectScope(projectId, [event, conflict]);
    await requireProjectReadAccess(ctx, projectId);
    const decisionId = event?.releaseDecisionId ?? conflict!.releaseDecisionId;
    const decision = await ctx.db.get("releaseDecisions", decisionId);
    const policy = decision
      ? await ctx.db.get("releasePolicies", decision.policyId)
      : null;
    const policySources = policy
      ? await ctx.db
          .query("releasePolicySources")
          .withIndex("by_policyId_and_priority", (q) =>
            q.eq("policyId", policy._id),
          )
          .take(20)
      : [];
    const observationIds =
      event?.sourceObservationIds ?? conflict?.candidateObservationIds ?? [];
    const observations = (
      await Promise.all(
        observationIds
          .slice(0, 20)
          .map((id) => ctx.db.get("canonicalObservations", id)),
      )
    ).filter((item): item is Doc<"canonicalObservations"> => item !== null);
    const fields = (
      await Promise.all(
        observations.map((observation) =>
          ctx.db
            .query("canonicalObservationFields")
            .withIndex("by_observationId", (q) =>
              q.eq("observationId", observation._id),
            )
            .take(100),
        ),
      )
    ).flat();
    const evidenceIds = [
      ...new Set([
        ...(event?.evidenceRefs ?? []),
        ...fields.flatMap((field) => field.evidenceRefs),
      ]),
    ].slice(0, 100);
    const evidence = (
      await Promise.all(evidenceIds.map((id) => ctx.db.get("evidence", id)))
    ).filter((item): item is Doc<"evidence"> => item !== null);
    const previousFactId =
      event?.previousFactVersionId ?? decision?.previousFactVersionId;
    const nextFactId = event?.nextFactVersionId ?? decision?.nextFactVersionId;
    const [
      previousFact,
      nextFact,
      transitions,
      incomingRelations,
      outgoingRelations,
    ] = await Promise.all([
      previousFactId ? ctx.db.get("factVersions", previousFactId) : null,
      nextFactId ? ctx.db.get("factVersions", nextFactId) : null,
      event
        ? ctx.db
            .query("changeEventTransitions")
            .withIndex("by_eventId_and_createdAt", (q) =>
              q.eq("eventId", event!._id),
            )
            .order("asc")
            .take(20)
        : [],
      event
        ? ctx.db
            .query("changeEventRelations")
            .withIndex("by_toEventId_and_createdAt", (q) =>
              q.eq("toEventId", event!._id),
            )
            .take(20)
        : [],
      event
        ? ctx.db
            .query("changeEventRelations")
            .withIndex("by_fromEventId_and_createdAt", (q) =>
              q.eq("fromEventId", event!._id),
            )
            .take(20)
        : [],
    ]);
    const relatedIds = [
      ...new Set(
        [...incomingRelations, ...outgoingRelations].flatMap((relation) => [
          relation.fromEventId,
          relation.toEventId,
        ]),
      ),
    ].filter((id) => id !== event?._id);
    const relatedEvents = (
      await Promise.all(
        relatedIds.slice(0, 40).map((id) => ctx.db.get("changeEvents", id)),
      )
    ).filter((item): item is Doc<"changeEvents"> => item !== null);
    const factVersions = [previousFact, nextFact].filter(
      (item): item is Doc<"factVersions"> => item !== null,
    );
    assertProjectScope(projectId, [
      event,
      conflict,
      decision,
      policy,
      ...observations,
      ...fields,
      ...evidence,
      previousFact,
      nextFact,
      ...incomingRelations,
      ...outgoingRelations,
      ...relatedEvents,
    ]);
    return {
      event,
      conflict,
      decision,
      releaseDecision: decision,
      policy,
      releasePolicy: policy,
      policySources,
      observations,
      fields,
      evidence,
      previousFact,
      nextFact,
      factVersions,
      transitions,
      incomingRelations,
      outgoingRelations,
      relatedEvents,
    };
  },
});

export const proof = query({
  args: { key: v.optional(v.string()) },
  returns: v.union(
    v.object({
      proof: v.object({ _id: v.id("phase8Proofs") }),
      events: v.array(
        v.object({
          _id: v.id("changeEvents"),
          eventId: v.string(),
          eventType: v.string(),
          state: v.string(),
          businessEvent: v.boolean(),
          predicate: v.optional(v.string()),
          observedAt: v.number(),
        }),
      ),
      conflicts: v.array(
        v.object({
          _id: v.id("sourceConflicts"),
          entityId: v.id("canonicalEntities"),
          predicate: v.string(),
          status: v.string(),
          candidateObservationIds: v.array(v.literal("redacted")),
          releasedFactVersionId: v.optional(v.id("factVersions")),
          reason: v.string(),
          openedAt: v.number(),
        }),
      ),
      businessEventCount: v.number(),
      layoutBusinessEventCount: v.number(),
      verifiedPriceEventCount: v.number(),
      quarantinedEventCount: v.number(),
      stableEventIds: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const proof = await ctx.db
      .query("phase8Proofs")
      .withIndex("by_key", (q) =>
        q.eq("key", args.key ?? "phase8:semantic-cdc-proof:v1"),
      )
      .unique();
    if (!proof) return null;
    await requireProjectReadAccess(ctx, proof.projectId);
    const [entity, policyDocs, decisionDocs, eventDocs, conflictDocs] =
      await Promise.all([
        ctx.db.get("canonicalEntities", proof.entityId),
        Promise.all(
          proof.policyIds
            .slice(0, 20)
            .map((id) => ctx.db.get("releasePolicies", id)),
        ),
        Promise.all(
          [...proof.decisionIds, ...proof.blockedDecisionIds]
            .slice(0, 100)
            .map((id) => ctx.db.get("releaseDecisions", id)),
        ),
        Promise.all(
          proof.eventIds
            .slice(0, 100)
            .map((id) => ctx.db.get("changeEvents", id)),
        ),
        Promise.all(
          proof.conflictIds
            .slice(0, 50)
            .map((id) => ctx.db.get("sourceConflicts", id)),
        ),
      ]);
    if (!entity) throw new Error("Phase 8 proof entity is missing");
    const policies = policyDocs.filter(
      (item): item is Doc<"releasePolicies"> => item !== null,
    );
    const decisions = decisionDocs.filter(
      (item): item is Doc<"releaseDecisions"> => item !== null,
    );
    const events = eventDocs.filter(
      (item): item is Doc<"changeEvents"> => item !== null,
    );
    const conflicts = conflictDocs.filter(
      (item): item is Doc<"sourceConflicts"> => item !== null,
    );
    const policySources = (
      await Promise.all(
        policies.map((policy) =>
          ctx.db
            .query("releasePolicySources")
            .withIndex("by_policyId_and_priority", (q) =>
              q.eq("policyId", policy._id),
            )
            .take(20),
        ),
      )
    ).flat();
    const transitions = (
      await Promise.all(
        events.map((event) =>
          ctx.db
            .query("changeEventTransitions")
            .withIndex("by_eventId_and_createdAt", (q) =>
              q.eq("eventId", event._id),
            )
            .take(20),
        ),
      )
    ).flat();
    const relations = (
      await Promise.all(
        events.map((event) =>
          ctx.db
            .query("changeEventRelations")
            .withIndex("by_fromEventId_and_createdAt", (q) =>
              q.eq("fromEventId", event._id),
            )
            .take(20),
        ),
      )
    ).flat();
    const policyIds = new Set(policies.map((policy) => policy._id));
    const eventIds = new Set(events.map((event) => event._id));
    if (policySources.some((item) => !policyIds.has(item.policyId)))
      throw new Error("Cross-project data relationship");
    if (transitions.some((item) => !eventIds.has(item.eventId)))
      throw new Error("Cross-project data relationship");
    const relatedEvents = await Promise.all(
      [
        ...new Set(
          relations.flatMap((relation) => [
            relation.fromEventId,
            relation.toEventId,
          ]),
        ),
      ].map((id) => ctx.db.get("changeEvents", id)),
    );
    if (relatedEvents.some((item) => item === null))
      throw new Error("Phase 8 proof relation endpoint is missing");
    assertProjectScope(proof.projectId, [
      proof,
      entity,
      ...policies,
      ...decisions,
      ...events,
      ...conflicts,
      ...relations,
      ...relatedEvents,
    ]);
    return {
      proof: { _id: proof._id },
      events: events.map((event) => ({
        _id: event._id,
        eventId: event.eventId,
        eventType: event.eventType,
        state: event.state,
        businessEvent: event.businessEvent,
        predicate: event.predicate,
        observedAt: event.observedAt,
      })),
      conflicts: conflicts.map((conflict) => ({
        _id: conflict._id,
        entityId: conflict.entityId,
        predicate: conflict.predicate,
        status: conflict.status,
        candidateObservationIds: conflict.candidateObservationIds.map(
          () => "redacted" as const,
        ),
        releasedFactVersionId: conflict.releasedFactVersionId,
        reason: conflict.reason,
        openedAt: conflict.openedAt,
      })),
      businessEventCount: events.filter((event) => event.businessEvent).length,
      layoutBusinessEventCount: events.filter(
        (event) =>
          event.eventType === "presentation_drift" && event.businessEvent,
      ).length,
      verifiedPriceEventCount: events.filter(
        (event) =>
          event.predicate === "model.input_price_usd_per_million_tokens" &&
          event.eventType === "update" &&
          event.businessEvent &&
          event.state === "released",
      ).length,
      quarantinedEventCount: events.filter((event) =>
        decisions.some(
          (decision) =>
            decision._id === event.releaseDecisionId &&
            decision.outcome === "blocked_quarantine",
        ),
      ).length,
      stableEventIds:
        new Set(events.map((event) => event.eventId)).size === events.length,
    };
  },
});
