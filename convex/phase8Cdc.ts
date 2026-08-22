import { v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { requirePhase5IngestKey } from "./phase5Auth";
import { assertPhase6Text, stableHash } from "./phase6Support";
import { deterministicEventId, valuesEquivalent } from "./phase8Support";
import { removalEvidenceValidator } from "./phase8Validators";

const intentValidator = v.union(
  v.literal("auto"),
  v.literal("rename"),
  v.literal("deprecation"),
  v.literal("removal"),
  v.literal("presentation_drift"),
);

type EvaluateArgs = {
  projectId: Id<"projects">;
  entityId: Id<"canonicalEntities">;
  predicate: string;
  policyId: Id<"releasePolicies">;
  candidateObservationIds: Id<"canonicalObservations">[];
  previousFactVersionId?: Id<"factVersions">;
  nextFactVersionId?: Id<"factVersions">;
  intent: "auto" | "rename" | "deprecation" | "removal" | "presentation_drift";
  removalEvidence:
    | "none"
    | "explicit_authoritative"
    | "repeated_verified_absence"
    | "human_approved";
  verifiedAbsenceCount: number;
  presentationChanged: boolean;
  validFrom?: number;
  observedAt: number;
  operationKey: string;
};

type Candidate = {
  observation: Doc<"canonicalObservations">;
  field: Doc<"canonicalObservationFields">;
  policySource: Doc<"releasePolicySources">;
  value: unknown;
  valueHash: string;
};

type EvaluateResult = {
  decision: Doc<"releaseDecisions">;
  event: Doc<"changeEvents"> | null;
  conflict: Doc<"sourceConflicts"> | null;
  duplicate: boolean;
  blockedReason: string | null;
};

async function duplicateResult(
  ctx: MutationCtx,
  decision: Doc<"releaseDecisions">,
): Promise<EvaluateResult> {
  const [event, conflict] = await Promise.all([
    ctx.db
      .query("changeEvents")
      .withIndex("by_releaseDecisionId", (q) =>
        q.eq("releaseDecisionId", decision._id),
      )
      .first(),
    ctx.db
      .query("sourceConflicts")
      .withIndex("by_releaseDecisionId", (q) =>
        q.eq("releaseDecisionId", decision._id),
      )
      .unique(),
  ]);
  return {
    decision,
    event,
    conflict,
    duplicate: true,
    blockedReason:
      decision.outcome === "blocked_quarantine" ||
      decision.outcome === "blocked_absence"
        ? (decision.reasonCodes[0] ?? decision.outcome)
        : null,
  };
}

export async function evaluateSemanticChange(
  ctx: MutationCtx,
  args: EvaluateArgs,
): Promise<EvaluateResult> {
  assertPhase6Text(args.predicate, "predicate", 300);
  assertPhase6Text(args.operationKey, "operationKey", 240);
  if (args.candidateObservationIds.length > 20)
    throw new Error("Semantic evaluation supports at most 20 observations");
  if (
    !Number.isSafeInteger(args.verifiedAbsenceCount) ||
    args.verifiedAbsenceCount < 0 ||
    args.verifiedAbsenceCount > 1_000
  )
    throw new Error("verifiedAbsenceCount must be an integer from 0 to 1000");
  if (!Number.isFinite(args.observedAt))
    throw new Error("observedAt must be finite");
  const operationDuplicate = await ctx.db
    .query("releaseDecisions")
    .withIndex("by_operationKey", (q) =>
      q.eq("operationKey", args.operationKey),
    )
    .unique();
  if (operationDuplicate) return await duplicateResult(ctx, operationDuplicate);
  const [project, entity, policy, policySources, suppliedPrevious, nextFact] =
    await Promise.all([
      ctx.db.get("projects", args.projectId),
      ctx.db.get("canonicalEntities", args.entityId),
      ctx.db.get("releasePolicies", args.policyId),
      ctx.db
        .query("releasePolicySources")
        .withIndex("by_policyId_and_priority", (q) =>
          q.eq("policyId", args.policyId),
        )
        .take(20),
      args.previousFactVersionId
        ? ctx.db.get("factVersions", args.previousFactVersionId)
        : null,
      args.nextFactVersionId
        ? ctx.db.get("factVersions", args.nextFactVersionId)
        : null,
    ]);
  if (
    !project ||
    !entity ||
    !policy ||
    entity.projectId !== project._id ||
    policy.projectId !== project._id ||
    policy.predicate !== args.predicate ||
    policy.status !== "active" ||
    policySources.length < 1
  )
    throw new Error("Semantic evaluation context or active policy is invalid");
  let previousFact = suppliedPrevious;
  if (!previousFact) {
    const current = await ctx.db
      .query("currentFacts")
      .withIndex("by_entityId_and_predicate", (q) =>
        q.eq("entityId", entity._id).eq("predicate", args.predicate),
      )
      .unique();
    previousFact = current
      ? await ctx.db.get("factVersions", current.factVersionId)
      : null;
  }
  if (
    previousFact &&
    (previousFact.projectId !== project._id ||
      previousFact.entityId !== entity._id ||
      previousFact.predicate !== args.predicate)
  )
    throw new Error("Previous fact belongs to another fact key");
  if (
    nextFact &&
    (nextFact.projectId !== project._id ||
      nextFact.entityId !== entity._id ||
      nextFact.predicate !== args.predicate)
  )
    throw new Error("Next fact belongs to another fact key");

  const policySourceById = new Map(
    policySources.map((entry) => [String(entry.sourceId), entry]),
  );
  const candidates: Candidate[] = [];
  let quarantined = false;
  for (const observationId of args.candidateObservationIds) {
    const observation = await ctx.db.get(
      "canonicalObservations",
      observationId,
    );
    if (
      !observation ||
      observation.projectId !== project._id ||
      observation.resolvedEntityId !== entity._id
    )
      throw new Error("Candidate observation is outside the semantic fact key");
    const fields = await ctx.db
      .query("canonicalObservationFields")
      .withIndex("by_observationId", (q) =>
        q.eq("observationId", observation._id),
      )
      .take(100);
    const field = fields.find((item) => item.canonicalPath === args.predicate);
    const policySource = policySourceById.get(String(observation.sourceId));
    const authority = await ctx.db
      .query("sourceAuthorities")
      .withIndex("by_sourceId_and_predicate", (q) =>
        q.eq("sourceId", observation.sourceId).eq("predicate", args.predicate),
      )
      .unique();
    if (
      !field ||
      !policySource ||
      !authority ||
      !authority.active ||
      authority.authority === "forbidden"
    )
      throw new Error(
        "Candidate lacks policy membership or predicate authority",
      );
    if (observation.trustState !== "verified" || field.state !== "verified") {
      quarantined = true;
      continue;
    }
    candidates.push({
      observation,
      field,
      policySource,
      value: field.normalizedValue,
      valueHash: field.normalizedValueHash,
    });
  }
  const insertDecision = async (input: {
    outcome: Doc<"releaseDecisions">["outcome"];
    selected: Candidate[];
    reasonCodes: string[];
    details: unknown;
  }): Promise<Doc<"releaseDecisions">> => {
    const decisionId = await ctx.db.insert("releaseDecisions", {
      projectId: project._id,
      entityId: entity._id,
      predicate: args.predicate,
      policyId: policy._id,
      strategy: policy.strategy,
      candidateObservationIds: args.candidateObservationIds,
      candidateSourceIds: candidates.map((item) => item.observation.sourceId),
      candidateValueHashes: candidates.map((item) => item.valueHash),
      selectedObservationIds: input.selected.map(
        (item) => item.observation._id,
      ),
      ...(input.selected[0]
        ? { selectedValueHash: input.selected[0].valueHash }
        : {}),
      ...(previousFact ? { previousFactVersionId: previousFact._id } : {}),
      ...(nextFact ? { nextFactVersionId: nextFact._id } : {}),
      outcome: input.outcome,
      independentGroupCount: new Set(
        candidates.map((item) => item.policySource.independenceGroup),
      ).size,
      reasonCodes: input.reasonCodes,
      details: input.details,
      operationKey: args.operationKey,
      createdAt: Date.now(),
    });
    const decision = await ctx.db.get("releaseDecisions", decisionId);
    if (!decision) throw new Error("Release decision insert failed");
    return decision;
  };

  if (quarantined) {
    const decision = await insertDecision({
      outcome: "blocked_quarantine",
      selected: [],
      reasonCodes: ["candidate_field_not_verified"],
      details: { eventSuppressed: true },
    });
    return {
      decision,
      event: null,
      conflict: null,
      duplicate: false,
      blockedReason: "candidate_field_not_verified",
    };
  }
  if (candidates.length === 0) {
    const decision = await insertDecision({
      outcome: "blocked_absence",
      selected: [],
      reasonCodes: ["absence_never_auto_deletes"],
      details: {
        eventSuppressed: true,
        verifiedAbsenceCount: args.verifiedAbsenceCount,
      },
    });
    return {
      decision,
      event: null,
      conflict: null,
      duplicate: false,
      blockedReason: "absence_never_auto_deletes",
    };
  }
  if (
    args.intent === "removal" &&
    (args.removalEvidence === "none" ||
      (args.removalEvidence === "repeated_verified_absence" &&
        args.verifiedAbsenceCount < policy.repeatedAbsenceMinimum) ||
      (policy.explicitRemovalRequired &&
        args.removalEvidence !== "explicit_authoritative" &&
        args.removalEvidence !== "human_approved"))
  ) {
    const decision = await insertDecision({
      outcome: "blocked_absence",
      selected: [],
      reasonCodes: ["removal_evidence_threshold_not_met"],
      details: { eventSuppressed: true },
    });
    return {
      decision,
      event: null,
      conflict: null,
      duplicate: false,
      blockedReason: "removal_evidence_threshold_not_met",
    };
  }

  const groups: Array<{ representative: Candidate; members: Candidate[] }> = [];
  for (const candidate of candidates) {
    const group = groups.find((item) =>
      valuesEquivalent({
        left: item.representative.value,
        right: candidate.value,
        rule: policy.equivalenceRule,
        numericTolerancePercent: policy.numericTolerancePercent,
      }),
    );
    if (group) group.members.push(candidate);
    else groups.push({ representative: candidate, members: [candidate] });
  }
  let selected: Candidate[] = [];
  let conflictReason: string | null = null;
  if (policy.strategy === "quorum") {
    const winners = groups.filter(
      (group) =>
        new Set(
          group.members.map((item) => item.policySource.independenceGroup),
        ).size >= (policy.quorum ?? 2),
    );
    if (winners.length === 1) selected = winners[0].members;
    else conflictReason = "independent_source_quorum_not_met";
  } else if (policy.strategy === "human_review") {
    conflictReason =
      groups.length > 1
        ? "official_sources_disagree"
        : "human_review_required_by_policy";
  } else {
    const eligible =
      policy.strategy === "authoritative"
        ? candidates.filter(
            (item) => item.policySource.role === "authoritative",
          )
        : candidates;
    selected = [...eligible].sort(
      (left, right) =>
        left.policySource.priority - right.policySource.priority ||
        right.observation.observedAt - left.observation.observedAt,
    );
    if (selected[0]) selected = [selected[0]];
    else conflictReason = "no_eligible_policy_source";
  }

  if (conflictReason) {
    const conflictValueHash = stableHash(
      groups.map((item) => item.representative.valueHash).sort(),
    );
    const eventId = deterministicEventId({
      projectId: String(project._id),
      entityId: String(entity._id),
      predicate: args.predicate,
      previousValueHash: previousFact?.valueHash,
      nextValueHash: conflictValueHash,
      validFrom: args.validFrom,
      eventType: "conflict",
    });
    const eventDuplicate = await ctx.db
      .query("changeEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .unique();
    if (eventDuplicate) {
      const decision = await ctx.db.get(
        "releaseDecisions",
        eventDuplicate.releaseDecisionId,
      );
      if (!decision)
        throw new Error("Duplicate event lost its release decision");
      return await duplicateResult(ctx, decision);
    }
    const decision = await insertDecision({
      outcome: groups.length > 1 ? "conflict" : "needs_human_review",
      selected: [],
      reasonCodes: [conflictReason],
      details: { continueLastKnownGood: policy.continueLastKnownGood },
    });
    const conflictId = await ctx.db.insert("sourceConflicts", {
      projectId: project._id,
      entityId: entity._id,
      predicate: args.predicate,
      policyId: policy._id,
      releaseDecisionId: decision._id,
      status: "open",
      candidateObservationIds: candidates.map((item) => item.observation._id),
      candidateSourceIds: candidates.map((item) => item.observation.sourceId),
      candidateValueHashes: candidates.map((item) => item.valueHash),
      independentGroupCount: new Set(
        candidates.map((item) => item.policySource.independenceGroup),
      ).size,
      ...(previousFact ? { releasedFactVersionId: previousFact._id } : {}),
      reason: conflictReason,
      operationKey: `${eventId}:conflict`,
      openedAt: Date.now(),
    });
    const evidenceRefs = [
      ...new Set(candidates.flatMap((item) => item.field.evidenceRefs)),
    ].slice(0, 50);
    const eventDocId = await ctx.db.insert("changeEvents", {
      projectId: project._id,
      eventId,
      eventType: "conflict",
      state: "withheld",
      businessEvent: true,
      entityId: entity._id,
      predicate: args.predicate,
      releaseDecisionId: decision._id,
      conflictId,
      ...(previousFact ? { previousFactVersionId: previousFact._id } : {}),
      ...(previousFact ? { previousValueHash: previousFact.valueHash } : {}),
      nextValueHash: conflictValueHash,
      ...(args.validFrom !== undefined ? { validFrom: args.validFrom } : {}),
      observedAt: args.observedAt,
      sourceObservationIds: candidates.map((item) => item.observation._id),
      evidenceRefs,
      eventHash: stableHash({ eventId, conflictReason, evidenceRefs }),
      operationKey: `${args.operationKey}:event`,
      createdAt: Date.now(),
    });
    await ctx.db.insert("changeEventTransitions", {
      eventId: eventDocId,
      fromState: null,
      toState: "withheld",
      reason: conflictReason,
      operationKey: `${eventId}:state:withheld`,
      createdAt: Date.now(),
    });
    const [event, conflict] = await Promise.all([
      ctx.db.get("changeEvents", eventDocId),
      ctx.db.get("sourceConflicts", conflictId),
    ]);
    if (!event || !conflict) throw new Error("Conflict persistence failed");
    return {
      decision,
      event,
      conflict,
      duplicate: false,
      blockedReason: null,
    };
  }

  const chosen = selected[0];
  if (!chosen) throw new Error("Reconciliation selected no candidate");
  const equivalent = previousFact
    ? valuesEquivalent({
        left: previousFact.value,
        right: chosen.value,
        rule: policy.equivalenceRule,
        numericTolerancePercent: policy.numericTolerancePercent,
      })
    : false;
  let eventType: Doc<"changeEvents">["eventType"] | null = null;
  let businessEvent = true;
  if (
    args.intent === "presentation_drift" ||
    (equivalent && args.presentationChanged)
  ) {
    eventType = "presentation_drift";
    businessEvent = false;
  } else if (args.intent === "rename") eventType = "rename";
  else if (args.intent === "deprecation") eventType = "deprecation";
  else if (args.intent === "removal") eventType = "removal";
  else if (!previousFact) eventType = "creation";
  else if (!equivalent)
    eventType = nextFact?.changeKind === "correction" ? "correction" : "update";
  if (!eventType) {
    const decision = await insertDecision({
      outcome: "no_change",
      selected,
      reasonCodes: ["semantically_equivalent"],
      details: { presentationChanged: args.presentationChanged },
    });
    return {
      decision,
      event: null,
      conflict: null,
      duplicate: false,
      blockedReason: null,
    };
  }
  if (businessEvent && !nextFact && eventType !== "removal")
    throw new Error("Released business change must link a next fact version");
  if (
    nextFact &&
    eventType !== "correction" &&
    !valuesEquivalent({
      left: nextFact.value,
      right: chosen.value,
      rule: policy.equivalenceRule,
      numericTolerancePercent: policy.numericTolerancePercent,
    })
  )
    throw new Error("Selected observation does not support next fact value");
  const nextValueHash = nextFact?.valueHash ?? chosen.valueHash;
  const validFrom = args.validFrom ?? nextFact?.validFrom;
  const eventId = deterministicEventId({
    projectId: String(project._id),
    entityId: String(entity._id),
    predicate: args.predicate,
    previousValueHash: previousFact?.valueHash,
    nextValueHash,
    validFrom,
    eventType,
  });
  const eventDuplicate = await ctx.db
    .query("changeEvents")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .unique();
  if (eventDuplicate) {
    const decision = await ctx.db.get(
      "releaseDecisions",
      eventDuplicate.releaseDecisionId,
    );
    if (!decision) throw new Error("Duplicate event lost its release decision");
    return await duplicateResult(ctx, decision);
  }
  const decision = await insertDecision({
    outcome: eventType === "presentation_drift" ? "no_change" : "release",
    selected,
    reasonCodes: [
      eventType === "presentation_drift"
        ? "layout_changed_fact_unchanged"
        : `semantic_${eventType}`,
    ],
    details: { businessEvent },
  });
  const evidenceRefs = [
    ...new Set(selected.flatMap((item) => item.field.evidenceRefs)),
  ].slice(0, 50);
  const eventDocId = await ctx.db.insert("changeEvents", {
    projectId: project._id,
    eventId,
    eventType,
    state: "released",
    businessEvent,
    entityId: entity._id,
    predicate: args.predicate,
    releaseDecisionId: decision._id,
    ...(previousFact ? { previousFactVersionId: previousFact._id } : {}),
    ...(nextFact ? { nextFactVersionId: nextFact._id } : {}),
    ...(previousFact ? { previousValueHash: previousFact.valueHash } : {}),
    nextValueHash,
    ...(validFrom !== undefined ? { validFrom } : {}),
    observedAt: Math.max(
      args.observedAt,
      ...selected.map((item) => item.observation.observedAt),
    ),
    releasedAt: Date.now(),
    sourceObservationIds: selected.map((item) => item.observation._id),
    evidenceRefs,
    ...(nextFact?.certificateId
      ? { certificateId: nextFact.certificateId }
      : {}),
    eventHash: stableHash({
      eventId,
      eventType,
      previousValueHash: previousFact?.valueHash ?? null,
      nextValueHash,
      evidenceRefs,
    }),
    operationKey: `${args.operationKey}:event`,
    createdAt: Date.now(),
  });
  await ctx.db.insert("changeEventTransitions", {
    eventId: eventDocId,
    fromState: null,
    toState: "released",
    reason:
      eventType === "presentation_drift"
        ? "non-business presentation drift"
        : "policy released event",
    operationKey: `${eventId}:state:released`,
    createdAt: Date.now(),
  });
  const event = await ctx.db.get("changeEvents", eventDocId);
  if (!event) throw new Error("Change event insert failed");
  return {
    decision,
    event,
    conflict: null,
    duplicate: false,
    blockedReason: null,
  };
}

export const evaluate = mutation({
  args: {
    ingestKey: v.string(),
    projectId: v.id("projects"),
    entityId: v.id("canonicalEntities"),
    predicate: v.string(),
    policyId: v.id("releasePolicies"),
    candidateObservationIds: v.array(v.id("canonicalObservations")),
    previousFactVersionId: v.optional(v.id("factVersions")),
    nextFactVersionId: v.optional(v.id("factVersions")),
    intent: intentValidator,
    removalEvidence: removalEvidenceValidator,
    verifiedAbsenceCount: v.number(),
    presentationChanged: v.boolean(),
    validFrom: v.optional(v.number()),
    observedAt: v.number(),
    operationKey: v.string(),
  },
  returns: v.object({
    decision: schema.doc("releaseDecisions"),
    event: v.union(schema.doc("changeEvents"), v.null()),
    conflict: v.union(schema.doc("sourceConflicts"), v.null()),
    duplicate: v.boolean(),
    blockedReason: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    return await evaluateSemanticChange(ctx, args);
  },
});

export const correctEvent = mutation({
  args: {
    ingestKey: v.string(),
    originalEventId: v.id("changeEvents"),
    correctionFactVersionId: v.id("factVersions"),
    reason: v.string(),
    operationKey: v.string(),
  },
  returns: v.object({
    originalEvent: schema.doc("changeEvents"),
    correctionEvent: schema.doc("changeEvents"),
    relationId: v.id("changeEventRelations"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase6Text(args.reason, "reason", 1_000);
    assertPhase6Text(args.operationKey, "operationKey", 240);
    const duplicate = await ctx.db
      .query("changeEvents")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", `${args.operationKey}:event`),
      )
      .unique();
    if (duplicate) {
      const relation = await ctx.db
        .query("changeEventRelations")
        .withIndex("by_toEventId_and_createdAt", (q) =>
          q.eq("toEventId", duplicate._id),
        )
        .first();
      const original = relation
        ? await ctx.db.get("changeEvents", relation.fromEventId)
        : null;
      if (!relation || !original)
        throw new Error("Duplicate correction lost its relation");
      return {
        originalEvent: original,
        correctionEvent: duplicate,
        relationId: relation._id,
        duplicate: true,
      };
    }
    const [original, correctionFact] = await Promise.all([
      ctx.db.get("changeEvents", args.originalEventId),
      ctx.db.get("factVersions", args.correctionFactVersionId),
    ]);
    if (
      !original ||
      !correctionFact ||
      correctionFact.changeKind !== "correction" ||
      correctionFact.projectId !== original.projectId ||
      correctionFact.entityId !== original.entityId ||
      correctionFact.predicate !== original.predicate
    )
      throw new Error(
        "Correction fact does not correct the original event key",
      );
    const originalDecision = await ctx.db.get(
      "releaseDecisions",
      original.releaseDecisionId,
    );
    if (!originalDecision)
      throw new Error("Original event has no release decision");
    const correctionDecisionId = await ctx.db.insert("releaseDecisions", {
      projectId: original.projectId,
      entityId: original.entityId,
      predicate: original.predicate ?? correctionFact.predicate,
      policyId: originalDecision.policyId,
      strategy: originalDecision.strategy,
      candidateObservationIds: correctionFact.sourceObservationIds,
      candidateSourceIds: (
        await Promise.all(
          correctionFact.sourceObservationIds.map((id) =>
            ctx.db.get("canonicalObservations", id),
          ),
        )
      )
        .filter((item): item is Doc<"canonicalObservations"> => item !== null)
        .map((item) => item.sourceId),
      candidateValueHashes: [correctionFact.valueHash],
      selectedObservationIds: correctionFact.sourceObservationIds,
      selectedValueHash: correctionFact.valueHash,
      ...(original.nextFactVersionId
        ? { previousFactVersionId: original.nextFactVersionId }
        : {}),
      nextFactVersionId: correctionFact._id,
      outcome: "release",
      independentGroupCount: 1,
      reasonCodes: ["earlier_event_evidence_disproved", "emit_correction"],
      details: { correctionOfEventId: original.eventId, reason: args.reason },
      operationKey: `${args.operationKey}:decision`,
      createdAt: Date.now(),
    });
    const eventId = deterministicEventId({
      projectId: String(original.projectId),
      entityId: String(original.entityId),
      predicate: original.predicate,
      previousValueHash: original.nextValueHash,
      nextValueHash: correctionFact.valueHash,
      validFrom: correctionFact.validFrom,
      eventType: "correction",
    });
    if (original.state !== "retracted") {
      const fromState = original.state;
      await ctx.db.patch("changeEvents", original._id, { state: "retracted" });
      await ctx.db.insert("changeEventTransitions", {
        eventId: original._id,
        fromState,
        toState: "retracted",
        reason: args.reason,
        operationKey: `${args.operationKey}:retract-original`,
        createdAt: Date.now(),
      });
    }
    const correctionEventId = await ctx.db.insert("changeEvents", {
      projectId: original.projectId,
      eventId,
      eventType: "correction",
      state: "released",
      businessEvent: true,
      entityId: original.entityId,
      predicate: correctionFact.predicate,
      releaseDecisionId: correctionDecisionId,
      ...(original.nextFactVersionId
        ? { previousFactVersionId: original.nextFactVersionId }
        : {}),
      nextFactVersionId: correctionFact._id,
      previousValueHash: original.nextValueHash,
      nextValueHash: correctionFact.valueHash,
      ...(correctionFact.validFrom !== undefined
        ? { validFrom: correctionFact.validFrom }
        : {}),
      observedAt: correctionFact.transactionFrom,
      releasedAt: Date.now(),
      sourceObservationIds: correctionFact.sourceObservationIds,
      evidenceRefs: correctionFact.evidenceRefs,
      ...(correctionFact.certificateId
        ? { certificateId: correctionFact.certificateId }
        : {}),
      correctionOfEventId: original.eventId,
      eventHash: stableHash({
        eventId,
        correctionOf: original.eventId,
        nextValueHash: correctionFact.valueHash,
      }),
      operationKey: `${args.operationKey}:event`,
      createdAt: Date.now(),
    });
    await ctx.db.insert("changeEventTransitions", {
      eventId: correctionEventId,
      fromState: null,
      toState: "released",
      reason: args.reason,
      operationKey: `${args.operationKey}:correction-released`,
      createdAt: Date.now(),
    });
    const relationId = await ctx.db.insert("changeEventRelations", {
      projectId: original.projectId,
      fromEventId: original._id,
      toEventId: correctionEventId,
      kind: "corrects",
      reason: args.reason,
      operationKey: `${args.operationKey}:relation`,
      createdAt: Date.now(),
    });
    const [updatedOriginal, correctionEvent] = await Promise.all([
      ctx.db.get("changeEvents", original._id),
      ctx.db.get("changeEvents", correctionEventId),
    ]);
    if (!updatedOriginal || !correctionEvent)
      throw new Error("Correction persistence failed");
    return {
      originalEvent: updatedOriginal,
      correctionEvent,
      relationId,
      duplicate: false,
    };
  },
});

export const retractEvent = mutation({
  args: {
    ingestKey: v.string(),
    eventId: v.id("changeEvents"),
    reason: v.string(),
    operationKey: v.string(),
  },
  returns: v.object({
    event: schema.doc("changeEvents"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase6Text(args.reason, "reason", 1_000);
    const event = await ctx.db.get("changeEvents", args.eventId);
    if (!event) throw new Error("Event does not exist");
    const duplicate = await ctx.db
      .query("changeEventTransitions")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (duplicate || event.state === "retracted")
      return { event, duplicate: true };
    const fromState = event.state;
    await ctx.db.patch("changeEvents", event._id, { state: "retracted" });
    await ctx.db.insert("changeEventTransitions", {
      eventId: event._id,
      fromState,
      toState: "retracted",
      reason: args.reason,
      operationKey: args.operationKey,
      createdAt: Date.now(),
    });
    const updated = await ctx.db.get("changeEvents", event._id);
    if (!updated) throw new Error("Event retraction failed");
    return { event: updated, duplicate: false };
  },
});

export const resolveConflict = mutation({
  args: {
    ingestKey: v.string(),
    conflictId: v.id("sourceConflicts"),
    resolution: v.union(v.literal("resolved"), v.literal("ignored")),
    releasedFactVersionId: v.optional(v.id("factVersions")),
    reason: v.string(),
    operationKey: v.string(),
  },
  returns: v.object({
    conflict: schema.doc("sourceConflicts"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase6Text(args.reason, "reason", 1_000);
    const conflict = await ctx.db.get("sourceConflicts", args.conflictId);
    if (!conflict) throw new Error("Conflict does not exist");
    if (conflict.status !== "open") return { conflict, duplicate: true };
    const releasedFact = args.releasedFactVersionId
      ? await ctx.db.get("factVersions", args.releasedFactVersionId)
      : null;
    if (
      releasedFact &&
      (releasedFact.projectId !== conflict.projectId ||
        releasedFact.entityId !== conflict.entityId ||
        releasedFact.predicate !== conflict.predicate)
    )
      throw new Error("Conflict resolution fact belongs to another key");
    await ctx.db.patch("sourceConflicts", conflict._id, {
      status: args.resolution,
      ...(releasedFact ? { releasedFactVersionId: releasedFact._id } : {}),
      resolution: { reason: args.reason, operationKey: args.operationKey },
      resolvedAt: Date.now(),
    });
    const updated = await ctx.db.get("sourceConflicts", conflict._id);
    if (!updated) throw new Error("Conflict resolution failed");
    return { conflict: updated, duplicate: false };
  },
});
