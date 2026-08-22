import { v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { requirePhase5IngestKey } from "./phase5Auth";
import { assertPhase6Text, stableHash } from "./phase6Support";
import {
  factChangeKindValidator,
  factFreshnessPolicyStatusValidator,
  factReleaseOutcomeValidator,
  factValidTimeSourceValidator,
} from "./phase7Validators";
import {
  chooseProjection,
  materializedState,
  MAX_FACT_VERSIONS_PER_KEY,
} from "./phase7Support";

async function rebuildCurrentFact(
  ctx: MutationCtx,
  args: {
    entityId: Id<"canonicalEntities">;
    predicate: string;
    policyId: Id<"factFreshnessPolicies">;
    evaluatedAt: number;
  },
): Promise<Doc<"currentFacts"> | null> {
  const [entity, policy, versions] = await Promise.all([
    ctx.db.get("canonicalEntities", args.entityId),
    ctx.db.get("factFreshnessPolicies", args.policyId),
    ctx.db
      .query("factVersions")
      .withIndex("by_entityId_and_predicate_and_transactionFrom", (q) =>
        q.eq("entityId", args.entityId).eq("predicate", args.predicate),
      )
      .order("asc")
      .take(MAX_FACT_VERSIONS_PER_KEY),
  ]);
  if (!entity || !policy || policy.projectId !== entity.projectId)
    throw new Error("Fact projection context is invalid");
  if (versions.length === MAX_FACT_VERSIONS_PER_KEY)
    throw new Error("Fact key exceeds the bounded projection rebuild limit");
  const choice = chooseProjection(versions);
  if (!choice.currentVersion || !choice.decisionVersion) return null;
  const currentVersion = await ctx.db.get(
    "factVersions",
    choice.currentVersion._id,
  );
  if (!currentVersion)
    throw new Error("Projection selected a missing fact version");
  const observations = await Promise.all(
    currentVersion.sourceObservationIds
      .slice(0, 20)
      .map((observationId) =>
        ctx.db.get("canonicalObservations", observationId),
      ),
  );
  const lastVerifiedAt = Math.max(
    ...observations.map((observation) => observation?.observedAt ?? 0),
    currentVersion.transactionFrom,
  );
  const freshnessDeadline = lastVerifiedAt + policy.maxAgeMs;
  const displayState = materializedState({
    baseState: choice.baseState,
    freshnessDeadline,
    evaluatedAt: args.evaluatedAt,
    allowLastKnownGood: policy.allowLastKnownGood,
  });
  const existing = await ctx.db
    .query("currentFacts")
    .withIndex("by_entityId_and_predicate", (q) =>
      q.eq("entityId", args.entityId).eq("predicate", args.predicate),
    )
    .unique();
  const replacement = {
    projectId: entity.projectId,
    entityId: entity._id,
    predicate: args.predicate,
    factVersionId: currentVersion._id,
    releaseDecisionId: choice.decisionVersion.releaseDecisionId,
    policyId: policy._id,
    valueHash: currentVersion.valueHash,
    state: displayState.state,
    servingLabel: displayState.servingLabel,
    lastVerifiedAt,
    freshnessDeadline,
    updatedAt: args.evaluatedAt,
  };
  if (existing) {
    await ctx.db.replace("currentFacts", existing._id, replacement);
    return await ctx.db.get("currentFacts", existing._id);
  }
  const currentFactId = await ctx.db.insert("currentFacts", replacement);
  return await ctx.db.get("currentFacts", currentFactId);
}

export const createFreshnessPolicy = mutation({
  args: {
    ingestKey: v.string(),
    projectId: v.id("projects"),
    entityType: v.optional(v.string()),
    predicate: v.string(),
    maxAgeMs: v.number(),
    allowLastKnownGood: v.boolean(),
    status: factFreshnessPolicyStatusValidator,
    operationKey: v.string(),
  },
  returns: v.object({
    policyId: v.id("factFreshnessPolicies"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase6Text(args.predicate, "predicate", 300);
    assertPhase6Text(args.operationKey, "operationKey", 240);
    if (args.entityType) assertPhase6Text(args.entityType, "entityType", 120);
    if (
      !Number.isSafeInteger(args.maxAgeMs) ||
      args.maxAgeMs < 1_000 ||
      args.maxAgeMs > 365 * 24 * 60 * 60 * 1_000
    )
      throw new Error(
        "maxAgeMs must be an integer between 1 second and 1 year",
      );
    const duplicate = await ctx.db
      .query("factFreshnessPolicies")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (duplicate) {
      if (
        duplicate.projectId !== args.projectId ||
        duplicate.predicate !== args.predicate ||
        duplicate.maxAgeMs !== args.maxAgeMs
      )
        throw new Error("operationKey belongs to another freshness policy");
      return { policyId: duplicate._id, duplicate: true };
    }
    if (!(await ctx.db.get("projects", args.projectId)))
      throw new Error("Project does not exist");
    const policyId = await ctx.db.insert("factFreshnessPolicies", {
      projectId: args.projectId,
      ...(args.entityType ? { entityType: args.entityType } : {}),
      predicate: args.predicate,
      maxAgeMs: args.maxAgeMs,
      allowLastKnownGood: args.allowLastKnownGood,
      status: args.status,
      operationKey: args.operationKey,
      createdAt: Date.now(),
    });
    return { policyId, duplicate: false };
  },
});

export const appendVersion = mutation({
  args: {
    ingestKey: v.string(),
    projectId: v.id("projects"),
    entityId: v.id("canonicalEntities"),
    predicate: v.string(),
    value: v.any(),
    unit: v.optional(v.string()),
    validFrom: v.optional(v.number()),
    validTo: v.optional(v.number()),
    validTimeSource: factValidTimeSourceValidator,
    transactionFrom: v.optional(v.number()),
    changeKind: factChangeKindValidator,
    policyId: v.id("factFreshnessPolicies"),
    outcome: factReleaseOutcomeValidator,
    reasonCodes: v.array(v.string()),
    details: v.any(),
    sourceObservationIds: v.array(v.id("canonicalObservations")),
    evidenceRefs: v.array(v.id("evidence")),
    mappingRevisionId: v.id("canonicalMappingRevisions"),
    collectorBindingId: v.id("collectorBindings"),
    runId: v.optional(v.id("runs")),
    certificateId: v.optional(v.id("certificates")),
    previousFactVersionId: v.optional(v.id("factVersions")),
    relationReason: v.optional(v.string()),
    operationKey: v.string(),
  },
  returns: v.object({
    factVersion: schema.doc("factVersions"),
    releaseDecision: schema.doc("factReleaseDecisions"),
    currentFact: v.union(schema.doc("currentFacts"), v.null()),
    relationId: v.union(v.id("factVersionRelations"), v.null()),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase6Text(args.predicate, "predicate", 300);
    assertPhase6Text(args.operationKey, "operationKey", 240);
    if (args.unit) assertPhase6Text(args.unit, "unit", 120);
    if (args.relationReason)
      assertPhase6Text(args.relationReason, "relationReason", 1_000);
    if (args.reasonCodes.length < 1 || args.reasonCodes.length > 20)
      throw new Error("A release decision requires 1-20 reason codes");
    for (const reason of args.reasonCodes)
      assertPhase6Text(reason, "reasonCode", 120);
    if (
      args.sourceObservationIds.length < 1 ||
      args.sourceObservationIds.length > 20
    )
      throw new Error("A fact version requires 1-20 source observations");
    if (args.evidenceRefs.length < 1 || args.evidenceRefs.length > 50)
      throw new Error("A fact version requires 1-50 evidence references");
    if (
      args.validFrom !== undefined &&
      args.validTo !== undefined &&
      args.validTo <= args.validFrom
    )
      throw new Error("validTo must be later than validFrom");
    const now = Date.now();
    const transactionFrom = args.transactionFrom ?? now;
    if (!Number.isFinite(transactionFrom) || transactionFrom > now + 60_000)
      throw new Error("transactionFrom must be a finite present or past time");
    const duplicate = await ctx.db
      .query("factVersions")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (duplicate) {
      if (
        duplicate.entityId !== args.entityId ||
        duplicate.predicate !== args.predicate ||
        duplicate.valueHash !== stableHash(args.value)
      )
        throw new Error("operationKey belongs to another fact version");
      const [decision, currentFact, relation] = await Promise.all([
        ctx.db.get("factReleaseDecisions", duplicate.releaseDecisionId),
        ctx.db
          .query("currentFacts")
          .withIndex("by_entityId_and_predicate", (q) =>
            q.eq("entityId", args.entityId).eq("predicate", args.predicate),
          )
          .unique(),
        ctx.db
          .query("factVersionRelations")
          .withIndex("by_toFactVersionId_and_createdAt", (q) =>
            q.eq("toFactVersionId", duplicate._id),
          )
          .first(),
      ]);
      if (!decision) throw new Error("Fact version has no release decision");
      return {
        factVersion: duplicate,
        releaseDecision: decision,
        currentFact,
        relationId: relation?._id ?? null,
        duplicate: true,
      };
    }
    const [entity, policy, mapping, binding, run, certificate, previous] =
      await Promise.all([
        ctx.db.get("canonicalEntities", args.entityId),
        ctx.db.get("factFreshnessPolicies", args.policyId),
        ctx.db.get("canonicalMappingRevisions", args.mappingRevisionId),
        ctx.db.get("collectorBindings", args.collectorBindingId),
        args.runId ? ctx.db.get("runs", args.runId) : null,
        args.certificateId
          ? ctx.db.get("certificates", args.certificateId)
          : null,
        args.previousFactVersionId
          ? ctx.db.get("factVersions", args.previousFactVersionId)
          : null,
      ]);
    if (
      !entity ||
      !policy ||
      !mapping ||
      !binding ||
      entity.projectId !== args.projectId ||
      policy.projectId !== args.projectId ||
      policy.predicate !== args.predicate ||
      policy.status !== "active"
    )
      throw new Error("Fact version context is invalid or policy is inactive");
    if (
      (args.changeKind === "initial" && args.previousFactVersionId) ||
      (args.changeKind !== "initial" && !previous)
    )
      throw new Error("Fact change kind does not match previousFactVersionId");
    if (
      previous &&
      (previous.projectId !== args.projectId ||
        previous.entityId !== args.entityId ||
        previous.predicate !== args.predicate)
    )
      throw new Error("Previous fact version belongs to another fact key");
    if (
      run &&
      (run.projectId !== args.projectId ||
        run.collectorId !== binding.collectorId)
    )
      throw new Error("Run does not match the fact collector binding");
    if (
      certificate &&
      (certificate.projectId !== args.projectId ||
        certificate.collectorId !== binding.collectorId ||
        certificate.status !== "certified")
    )
      throw new Error("Certificate does not certify the fact collector");
    const observations = await Promise.all(
      args.sourceObservationIds.map((id) =>
        ctx.db.get("canonicalObservations", id),
      ),
    );
    const suppliedEvidence = new Set(args.evidenceRefs);
    for (const observation of observations) {
      if (
        !observation ||
        observation.projectId !== args.projectId ||
        observation.resolvedEntityId !== args.entityId ||
        observation.trustState !== "verified" ||
        observation.mappingRevisionId !== args.mappingRevisionId ||
        observation.collectorBindingId !== args.collectorBindingId
      )
        throw new Error(
          "Every fact source must be a matching verified observation",
        );
      const fields = await ctx.db
        .query("canonicalObservationFields")
        .withIndex("by_observationId", (q) =>
          q.eq("observationId", observation._id),
        )
        .take(100);
      const matching = fields.filter(
        (field) =>
          field.canonicalPath === args.predicate && field.state === "verified",
      );
      if (matching.length < 1)
        throw new Error(
          "Verified observation does not verify the fact predicate",
        );
      if (
        !matching.some((field) =>
          field.evidenceRefs.some((evidenceId) =>
            suppliedEvidence.has(evidenceId),
          ),
        )
      )
        throw new Error("Fact evidence is not linked by its verified field");
    }
    for (const evidenceId of args.evidenceRefs) {
      const evidence = await ctx.db.get("evidence", evidenceId);
      if (!evidence || evidence.projectId !== args.projectId)
        throw new Error("Fact evidence is outside the project");
    }
    const state: Doc<"factVersions">["state"] =
      args.outcome === "release"
        ? "released"
        : args.outcome === "conflict"
          ? "conflicted"
          : args.outcome === "retract"
            ? "retracted"
            : "withheld";
    if (
      (args.changeKind === "retraction") !== (state === "retracted") ||
      (args.changeKind === "initial" && state !== "released")
    )
      throw new Error("Release outcome is incompatible with change kind");
    const decisionId = await ctx.db.insert("factReleaseDecisions", {
      projectId: args.projectId,
      entityId: args.entityId,
      predicate: args.predicate,
      policyId: args.policyId,
      candidateObservationIds: args.sourceObservationIds,
      ...(previous ? { previousFactVersionId: previous._id } : {}),
      outcome: args.outcome,
      reasonCodes: args.reasonCodes,
      details: args.details,
      operationKey: `${args.operationKey}:decision`,
      createdAt: transactionFrom,
    });
    const factVersionId = await ctx.db.insert("factVersions", {
      projectId: args.projectId,
      entityId: args.entityId,
      predicate: args.predicate,
      value: args.value,
      valueHash: stableHash(args.value),
      ...(args.unit ? { unit: args.unit } : {}),
      ...(args.validFrom !== undefined ? { validFrom: args.validFrom } : {}),
      ...(args.validTo !== undefined ? { validTo: args.validTo } : {}),
      validTimeSource: args.validTimeSource,
      transactionFrom,
      state,
      changeKind: args.changeKind,
      releaseDecisionId: decisionId,
      sourceObservationIds: args.sourceObservationIds,
      evidenceRefs: args.evidenceRefs,
      mappingRevisionId: args.mappingRevisionId,
      collectorBindingId: args.collectorBindingId,
      ...(run ? { runId: run._id } : {}),
      ...(certificate ? { certificateId: certificate._id } : {}),
      operationKey: args.operationKey,
      createdAt: transactionFrom,
    });
    let relationId: Id<"factVersionRelations"> | null = null;
    if (previous && (state === "released" || state === "retracted")) {
      const kind =
        args.changeKind === "correction"
          ? ("corrects" as const)
          : args.changeKind === "retraction"
            ? ("retracts" as const)
            : ("supersedes" as const);
      relationId = await ctx.db.insert("factVersionRelations", {
        projectId: args.projectId,
        entityId: args.entityId,
        predicate: args.predicate,
        fromFactVersionId: previous._id,
        toFactVersionId: factVersionId,
        kind,
        reason:
          args.relationReason ??
          `${args.changeKind} accepted by release policy`,
        operationKey: `${args.operationKey}:relation`,
        createdAt: transactionFrom,
      });
    }
    const [factVersion, releaseDecision, currentFact] = await Promise.all([
      ctx.db.get("factVersions", factVersionId),
      ctx.db.get("factReleaseDecisions", decisionId),
      rebuildCurrentFact(ctx, {
        entityId: args.entityId,
        predicate: args.predicate,
        policyId: args.policyId,
        evaluatedAt: now,
      }),
    ]);
    if (!factVersion || !releaseDecision)
      throw new Error("Fact append did not persist its immutable records");
    return {
      factVersion,
      releaseDecision,
      currentFact,
      relationId,
      duplicate: false,
    };
  },
});

export const regenerateCurrent = mutation({
  args: {
    ingestKey: v.string(),
    entityId: v.id("canonicalEntities"),
    predicate: v.string(),
    policyId: v.id("factFreshnessPolicies"),
    evaluatedAt: v.number(),
  },
  returns: v.union(schema.doc("currentFacts"), v.null()),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase6Text(args.predicate, "predicate", 300);
    if (!Number.isFinite(args.evaluatedAt))
      throw new Error("evaluatedAt must be finite");
    return await rebuildCurrentFact(ctx, args);
  },
});
