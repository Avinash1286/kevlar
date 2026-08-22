import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  chooseProjection,
  materializedState,
  MAX_FACT_VERSIONS_PER_KEY,
  selectBeliefAt,
} from "./phase7Support";
import { assertProjectScope, requireProjectReadAccess } from "./phase11Auth";

function boundedLimit(value: number | undefined): number {
  const limit = value ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error("limit must be an integer from 1 to 100");
  return limit;
}

const timelineResultValidator = v.object({
  entity: schema.doc("canonicalEntities"),
  currentFacts: v.array(schema.doc("currentFacts")),
  versions: v.array(schema.doc("factVersions")),
  relations: v.array(schema.doc("factVersionRelations")),
  decisions: v.array(schema.doc("factReleaseDecisions")),
});

export const timeline = query({
  args: {
    entityId: v.id("canonicalEntities"),
    predicate: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.union(timelineResultValidator, v.null()),
  handler: async (ctx, args) => {
    const entity = await ctx.db.get("canonicalEntities", args.entityId);
    if (!entity) return null;
    await requireProjectReadAccess(ctx, entity.projectId);
    const limit = boundedLimit(args.limit);
    const currentFacts = args.predicate
      ? await ctx.db
          .query("currentFacts")
          .withIndex("by_entityId_and_predicate", (q) =>
            q.eq("entityId", args.entityId).eq("predicate", args.predicate!),
          )
          .take(1)
      : await ctx.db
          .query("currentFacts")
          .withIndex("by_entityId", (q) => q.eq("entityId", args.entityId))
          .take(100);
    const versions = args.predicate
      ? await ctx.db
          .query("factVersions")
          .withIndex("by_entityId_and_predicate_and_transactionFrom", (q) =>
            q.eq("entityId", args.entityId).eq("predicate", args.predicate!),
          )
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("factVersions")
          .withIndex("by_entityId_and_transactionFrom", (q) =>
            q.eq("entityId", args.entityId),
          )
          .order("desc")
          .take(limit);
    const relations = args.predicate
      ? await ctx.db
          .query("factVersionRelations")
          .withIndex("by_entityId_and_predicate_and_createdAt", (q) =>
            q.eq("entityId", args.entityId).eq("predicate", args.predicate!),
          )
          .order("desc")
          .take(Math.min(limit * 2, 100))
      : (
          await Promise.all(
            versions.slice(0, 50).map((version) =>
              ctx.db
                .query("factVersionRelations")
                .withIndex("by_toFactVersionId_and_createdAt", (q) =>
                  q.eq("toFactVersionId", version._id),
                )
                .take(2),
            ),
          )
        ).flat();
    const decisionIds = [
      ...new Set(versions.map((item) => item.releaseDecisionId)),
    ];
    const decisions = (
      await Promise.all(
        decisionIds
          .slice(0, 100)
          .map((id) => ctx.db.get("factReleaseDecisions", id)),
      )
    ).filter((item): item is Doc<"factReleaseDecisions"> => item !== null);
    assertProjectScope(entity.projectId, [
      entity,
      ...currentFacts,
      ...versions,
      ...relations,
      ...decisions,
    ]);
    return { entity, currentFacts, versions, relations, decisions };
  },
});

const historyResultValidator = v.object({
  entity: schema.doc("canonicalEntities"),
  predicate: v.string(),
  validAt: v.union(v.number(), v.null()),
  believedAt: v.union(v.number(), v.null()),
  versions: v.array(schema.doc("factVersions")),
  relations: v.array(schema.doc("factVersionRelations")),
  effectiveFactVersion: v.union(schema.doc("factVersions"), v.null()),
  decisionVersion: v.union(schema.doc("factVersions"), v.null()),
  decision: v.union(schema.doc("factReleaseDecisions"), v.null()),
  observations: v.array(schema.doc("canonicalObservations")),
  fields: v.array(schema.doc("canonicalObservationFields")),
  evidence: v.array(schema.doc("evidence")),
  mappingRevision: v.union(schema.doc("canonicalMappingRevisions"), v.null()),
  collectorBinding: v.union(schema.doc("collectorBindings"), v.null()),
  run: v.union(schema.doc("runs"), v.null()),
  certificate: v.union(schema.doc("certificates"), v.null()),
});

export const history = query({
  args: {
    entityId: v.id("canonicalEntities"),
    predicate: v.string(),
    validAt: v.optional(v.number()),
    believedAt: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.union(historyResultValidator, v.null()),
  handler: async (ctx, args) => {
    const entity = await ctx.db.get("canonicalEntities", args.entityId);
    if (!entity) return null;
    await requireProjectReadAccess(ctx, entity.projectId);
    const versions = await ctx.db
      .query("factVersions")
      .withIndex("by_entityId_and_predicate_and_transactionFrom", (q) =>
        q.eq("entityId", args.entityId).eq("predicate", args.predicate),
      )
      .order("desc")
      .take(boundedLimit(args.limit));
    const choice = selectBeliefAt(versions, args);
    const effectiveFactVersion = choice.currentVersion
      ? await ctx.db.get("factVersions", choice.currentVersion._id)
      : null;
    const decisionVersion = choice.decisionVersion
      ? await ctx.db.get("factVersions", choice.decisionVersion._id)
      : null;
    const decision = decisionVersion
      ? await ctx.db.get(
          "factReleaseDecisions",
          decisionVersion.releaseDecisionId,
        )
      : null;
    const observations = effectiveFactVersion
      ? (
          await Promise.all(
            effectiveFactVersion.sourceObservationIds
              .slice(0, 20)
              .map((id) => ctx.db.get("canonicalObservations", id)),
          )
        ).filter((item): item is Doc<"canonicalObservations"> => item !== null)
      : [];
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
    const evidence = effectiveFactVersion
      ? (
          await Promise.all(
            effectiveFactVersion.evidenceRefs
              .slice(0, 50)
              .map((id) => ctx.db.get("evidence", id)),
          )
        ).filter((item): item is Doc<"evidence"> => item !== null)
      : [];
    const [mappingRevision, collectorBinding, run, certificate] =
      effectiveFactVersion
        ? await Promise.all([
            ctx.db.get(
              "canonicalMappingRevisions",
              effectiveFactVersion.mappingRevisionId,
            ),
            ctx.db.get(
              "collectorBindings",
              effectiveFactVersion.collectorBindingId,
            ),
            effectiveFactVersion.runId
              ? ctx.db.get("runs", effectiveFactVersion.runId)
              : null,
            effectiveFactVersion.certificateId
              ? ctx.db.get("certificates", effectiveFactVersion.certificateId)
              : null,
          ])
        : [null, null, null, null];
    const relations = await ctx.db
      .query("factVersionRelations")
      .withIndex("by_entityId_and_predicate_and_createdAt", (q) =>
        q.eq("entityId", args.entityId).eq("predicate", args.predicate),
      )
      .order("desc")
      .take(100);
    const [mappingSpec, bindingCollector] = await Promise.all([
      mappingRevision
        ? ctx.db.get("canonicalMappingSpecs", mappingRevision.mappingSpecId)
        : null,
      collectorBinding
        ? ctx.db.get("collectors", collectorBinding.collectorId)
        : null,
    ]);
    if (mappingRevision && !mappingSpec)
      throw new Error("Mapping revision owner is missing");
    if (collectorBinding && !bindingCollector)
      throw new Error("Collector binding owner is missing");
    assertProjectScope(entity.projectId, [
      entity,
      ...versions,
      ...relations,
      effectiveFactVersion,
      decisionVersion,
      decision,
      ...observations,
      ...fields,
      ...evidence,
      mappingSpec,
      bindingCollector,
      run,
      certificate,
    ]);
    return {
      entity,
      predicate: args.predicate,
      validAt: args.validAt ?? null,
      believedAt: args.believedAt ?? null,
      versions,
      relations,
      effectiveFactVersion,
      decisionVersion,
      decision,
      observations,
      fields,
      evidence,
      mappingRevision,
      collectorBinding,
      run,
      certificate,
    };
  },
});

const proofResultValidator = v.object({
  proof: v.object({ _id: v.id("phase7Proofs") }),
  facts: v.array(
    v.object({
      _id: v.id("factVersions"),
      entityId: v.id("canonicalEntities"),
      predicate: v.string(),
      value: v.any(),
      validFrom: v.optional(v.number()),
      validTimeSource: v.string(),
      transactionFrom: v.number(),
      changeKind: v.string(),
    }),
  ),
  currentFacts: v.array(
    v.object({
      _id: v.id("currentFacts"),
      entityId: v.id("canonicalEntities"),
      predicate: v.string(),
      factVersionId: v.id("factVersions"),
      state: v.string(),
      servingLabel: v.string(),
      lastVerifiedAt: v.number(),
      freshnessDeadline: v.number(),
    }),
  ),
  observations: v.array(v.literal("redacted")),
  evidence: v.array(v.literal("redacted")),
  projectionMatches: v.boolean(),
});

export const proof = query({
  args: { key: v.optional(v.string()) },
  returns: v.union(proofResultValidator, v.null()),
  handler: async (ctx, args) => {
    const proof = await ctx.db
      .query("phase7Proofs")
      .withIndex("by_key", (q) =>
        q.eq("key", args.key ?? "phase7:bitemporal-proof:v1"),
      )
      .unique();
    if (!proof) return null;
    await requireProjectReadAccess(ctx, proof.projectId);
    const [policies, facts, relations, currentFacts] = await Promise.all([
      Promise.all(
        proof.policyIds
          .slice(0, 20)
          .map((id) => ctx.db.get("factFreshnessPolicies", id)),
      ),
      Promise.all(
        proof.factVersionIds
          .slice(0, MAX_FACT_VERSIONS_PER_KEY)
          .map((id) => ctx.db.get("factVersions", id)),
      ),
      Promise.all(
        proof.relationIds
          .slice(0, 100)
          .map((id) => ctx.db.get("factVersionRelations", id)),
      ),
      Promise.all(
        proof.currentFactIds
          .slice(0, 50)
          .map((id) => ctx.db.get("currentFacts", id)),
      ),
    ]);
    const presentPolicies = policies.filter(
      (item): item is Doc<"factFreshnessPolicies"> => item !== null,
    );
    const presentFacts = facts.filter(
      (item): item is Doc<"factVersions"> => item !== null,
    );
    const presentRelations = relations.filter(
      (item): item is Doc<"factVersionRelations"> => item !== null,
    );
    const presentCurrent = currentFacts.filter(
      (item): item is Doc<"currentFacts"> => item !== null,
    );
    const decisions = (
      await Promise.all(
        [...new Set(presentFacts.map((item) => item.releaseDecisionId))].map(
          (id) => ctx.db.get("factReleaseDecisions", id),
        ),
      )
    ).filter((item): item is Doc<"factReleaseDecisions"> => item !== null);
    const observations = (
      await Promise.all(
        [...new Set(presentFacts.flatMap((item) => item.sourceObservationIds))]
          .slice(0, 100)
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
    const evidence = (
      await Promise.all(
        [...new Set(presentFacts.flatMap((item) => item.evidenceRefs))]
          .slice(0, 100)
          .map((id) => ctx.db.get("evidence", id)),
      )
    ).filter((item): item is Doc<"evidence"> => item !== null);
    const mappingRevisions = (
      await Promise.all(
        [...new Set(presentFacts.map((item) => item.mappingRevisionId))].map(
          (id) => ctx.db.get("canonicalMappingRevisions", id),
        ),
      )
    ).filter((item): item is Doc<"canonicalMappingRevisions"> => item !== null);
    const collectorBindings = (
      await Promise.all(
        [...new Set(presentFacts.map((item) => item.collectorBindingId))].map(
          (id) => ctx.db.get("collectorBindings", id),
        ),
      )
    ).filter((item): item is Doc<"collectorBindings"> => item !== null);
    const [mappingOwners, collectorOwners] = await Promise.all([
      Promise.all(
        [...new Set(mappingRevisions.map((item) => item.mappingSpecId))].map(
          (id) => ctx.db.get("canonicalMappingSpecs", id),
        ),
      ),
      Promise.all(
        [...new Set(collectorBindings.map((item) => item.collectorId))].map(
          (id) => ctx.db.get("collectors", id),
        ),
      ),
    ]);
    if (mappingOwners.some((item) => item === null))
      throw new Error("Phase 7 proof mapping owner is missing");
    if (collectorOwners.some((item) => item === null))
      throw new Error("Phase 7 proof collector owner is missing");
    const runs = (
      await Promise.all(
        [
          ...new Set(
            presentFacts.flatMap((item) => (item.runId ? [item.runId] : [])),
          ),
        ].map((id) => ctx.db.get("runs", id)),
      )
    ).filter((item): item is Doc<"runs"> => item !== null);
    const certificates = (
      await Promise.all(
        [
          ...new Set(
            presentFacts.flatMap((item) =>
              item.certificateId ? [item.certificateId] : [],
            ),
          ),
        ].map((id) => ctx.db.get("certificates", id)),
      )
    ).filter((item): item is Doc<"certificates"> => item !== null);
    let projectionMatches =
      presentCurrent.length === proof.currentFactIds.length;
    for (const current of presentCurrent) {
      const matchingFacts = presentFacts.filter(
        (fact) =>
          fact.entityId === current.entityId &&
          fact.predicate === current.predicate,
      );
      const choice = chooseProjection(matchingFacts);
      const policy = presentPolicies.find(
        (item) => item._id === current.policyId,
      );
      const currentVersion = matchingFacts.find(
        (item) => item._id === choice.currentVersion?._id,
      );
      const observationTimes = observations
        .filter((observation) =>
          currentVersion?.sourceObservationIds.includes(observation._id),
        )
        .map((observation) => observation.observedAt);
      const lastVerifiedAt = currentVersion
        ? Math.max(...observationTimes, currentVersion.transactionFrom)
        : 0;
      const freshnessDeadline = policy
        ? lastVerifiedAt + policy.maxAgeMs
        : Number.NaN;
      const display = policy
        ? materializedState({
            baseState: choice.baseState,
            freshnessDeadline,
            evaluatedAt: current.updatedAt,
            allowLastKnownGood: policy.allowLastKnownGood,
          })
        : null;
      projectionMatches &&=
        currentVersion?._id === current.factVersionId &&
        choice.decisionVersion?.releaseDecisionId ===
          current.releaseDecisionId &&
        currentVersion.valueHash === current.valueHash &&
        lastVerifiedAt === current.lastVerifiedAt &&
        freshnessDeadline === current.freshnessDeadline &&
        display?.state === current.state &&
        display.servingLabel === current.servingLabel;
    }
    assertProjectScope(proof.projectId, [
      proof,
      ...presentPolicies,
      ...presentFacts,
      ...presentRelations,
      ...presentCurrent,
      ...decisions,
      ...observations,
      ...fields,
      ...evidence,
      ...mappingOwners,
      ...collectorOwners,
      ...runs,
      ...certificates,
    ]);
    return {
      proof: { _id: proof._id },
      facts: presentFacts.map((fact) => ({
        _id: fact._id,
        entityId: fact.entityId,
        predicate: fact.predicate,
        value: fact.value,
        validFrom: fact.validFrom,
        validTimeSource: fact.validTimeSource,
        transactionFrom: fact.transactionFrom,
        changeKind: fact.changeKind,
      })),
      currentFacts: presentCurrent.map((fact) => ({
        _id: fact._id,
        entityId: fact.entityId,
        predicate: fact.predicate,
        factVersionId: fact.factVersionId,
        state: fact.state,
        servingLabel: fact.servingLabel,
        lastVerifiedAt: fact.lastVerifiedAt,
        freshnessDeadline: fact.freshnessDeadline,
      })),
      observations: observations.map(() => "redacted" as const),
      evidence: evidence.map(() => "redacted" as const),
      projectionMatches,
    };
  },
});
