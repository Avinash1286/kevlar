import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { requirePhase5IngestKey } from "./phase5Auth";
import {
  blastImpactKindValidator,
  canaryStageValidator,
  canaryThresholdsValidator,
  downstreamConsumerKindValidator,
  downstreamConsumerStatusValidator,
  verificationOutcomeValidator,
} from "./phase9Validators";
import {
  CANARY_STAGE_ORDER,
  assertPhase9Text,
  canaryStagePasses,
  integrityDigest,
  isFullReleaseEligible,
} from "./phase9Support";

export const upsertDownstreamConsumer = mutation({
  args: {
    ingestKey: v.string(),
    projectId: v.id("projects"),
    name: v.string(),
    kind: downstreamConsumerKindValidator,
    predicate: v.string(),
    status: downstreamConsumerStatusValidator,
    operationKey: v.string(),
  },
  returns: v.object({
    consumer: schema.doc("downstreamConsumers"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase9Text(args.name, "name", 200);
    assertPhase9Text(args.predicate, "predicate", 300);
    assertPhase9Text(args.operationKey, "operationKey", 240);
    const existing = await ctx.db
      .query("downstreamConsumers")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (existing) return { consumer: existing, duplicate: true };
    const now = Date.now();
    const id = await ctx.db.insert("downstreamConsumers", {
      projectId: args.projectId,
      name: args.name,
      kind: args.kind,
      predicate: args.predicate,
      status: args.status,
      operationKey: args.operationKey,
      createdAt: now,
      updatedAt: now,
    });
    const consumer = await ctx.db.get("downstreamConsumers", id);
    if (!consumer) throw new Error("Downstream consumer insert failed");
    return { consumer, duplicate: false };
  },
});

const impactInputValidator = v.object({
  kind: blastImpactKindValidator,
  targetId: v.string(),
  label: v.string(),
  state: v.union(
    v.literal("affected"),
    v.literal("withheld"),
    v.literal("covered"),
    v.literal("last_known_good"),
    v.literal("at_risk"),
  ),
  details: v.any(),
});

export const calculateBlastRadius = mutation({
  args: {
    ingestKey: v.string(),
    incidentId: v.id("incidents"),
    affectedEventIds: v.array(v.id("changeEvents")),
    supplementalImpacts: v.array(impactInputValidator),
    freshnessImpact: v.string(),
    operationKey: v.string(),
  },
  returns: v.object({
    assessment: schema.doc("blastRadiusAssessments"),
    impacts: v.array(schema.doc("blastRadiusImpacts")),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase9Text(args.freshnessImpact, "freshnessImpact", 500);
    assertPhase9Text(args.operationKey, "operationKey", 240);
    if (
      args.affectedEventIds.length > 50 ||
      args.supplementalImpacts.length > 50
    )
      throw new Error("Blast radius inputs are bounded to 50 records each");
    const existing = await ctx.db
      .query("blastRadiusAssessments")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (existing) {
      const impacts = await ctx.db
        .query("blastRadiusImpacts")
        .withIndex("by_assessmentId_and_kind", (q) =>
          q.eq("assessmentId", existing._id),
        )
        .take(200);
      return { assessment: existing, impacts, duplicate: true };
    }
    const incident = await ctx.db.get("incidents", args.incidentId);
    if (!incident) throw new Error("Incident does not exist");
    const [productionBindings, regressionBindings] = await Promise.all([
      ctx.db
        .query("collectorBindings")
        .withIndex("by_collectorId_and_bindingKind", (q) =>
          q
            .eq("collectorId", incident.collectorId)
            .eq("bindingKind", "production"),
        )
        .take(20),
      ctx.db
        .query("collectorBindings")
        .withIndex("by_collectorId_and_bindingKind", (q) =>
          q
            .eq("collectorId", incident.collectorId)
            .eq("bindingKind", "regression"),
        )
        .take(20),
    ]);
    const binding = [...productionBindings, ...regressionBindings].find(
      (item) => item.lifecycleStatus === "active",
    );
    const sourceId = binding?.sourceId;
    const observations = sourceId
      ? await ctx.db
          .query("canonicalObservations")
          .withIndex("by_sourceId_and_sourceEntityKey", (q) =>
            q.eq("sourceId", sourceId),
          )
          .order("desc")
          .take(50)
      : [];
    const events = (
      await Promise.all(
        args.affectedEventIds.map((id) => ctx.db.get("changeEvents", id)),
      )
    ).filter((item): item is Doc<"changeEvents"> => item !== null);
    if (events.some((event) => event.projectId !== incident.projectId))
      throw new Error("Affected event belongs to another project");
    const fieldMap = new Map<string, Doc<"canonicalObservationFields">>();
    const entityMap = new Map<string, Id<"canonicalEntities">>();
    for (const observation of observations) {
      if (observation.resolvedEntityId)
        entityMap.set(
          observation.resolvedEntityId,
          observation.resolvedEntityId,
        );
      const fields = await ctx.db
        .query("canonicalObservationFields")
        .withIndex("by_observationId", (q) =>
          q.eq("observationId", observation._id),
        )
        .take(50);
      for (const field of fields) fieldMap.set(field.canonicalPath, field);
    }
    for (const event of events) entityMap.set(event.entityId, event.entityId);
    const facts: Doc<"currentFacts">[] = [];
    for (const entityId of entityMap.values()) {
      const rows = await ctx.db
        .query("currentFacts")
        .withIndex("by_entityId", (q) => q.eq("entityId", entityId))
        .take(50);
      facts.push(...rows);
    }
    const predicates = new Set([
      ...fieldMap.keys(),
      ...events.flatMap((event) => (event.predicate ? [event.predicate] : [])),
      ...facts.map((fact) => fact.predicate),
    ]);
    const consumers: Doc<"downstreamConsumers">[] = [];
    for (const predicate of predicates) {
      const rows = await ctx.db
        .query("downstreamConsumers")
        .withIndex("by_projectId_and_predicate_and_status", (q) =>
          q
            .eq("projectId", incident.projectId)
            .eq("predicate", predicate)
            .eq("status", "active"),
        )
        .take(50);
      consumers.push(...rows);
    }
    const impacts: (typeof args.supplementalImpacts)[number][] = [
      ...(sourceId
        ? [
            {
              kind: "source" as const,
              targetId: sourceId,
              label: "Affected collector source",
              state: "affected" as const,
              details: { collectorId: incident.collectorId },
            },
          ]
        : []),
      ...[...fieldMap.entries()].map(([path, field]) => ({
        kind: "canonical_field" as const,
        targetId: String(field._id),
        label: path,
        state:
          field.state === "verified"
            ? ("affected" as const)
            : ("at_risk" as const),
        details: { observationId: field.observationId },
      })),
      ...[...entityMap.values()].map((entityId) => ({
        kind: "entity" as const,
        targetId: String(entityId),
        label: "Affected canonical entity",
        state: "affected" as const,
        details: {},
      })),
      ...facts.map((fact) => ({
        kind: "current_fact" as const,
        targetId: String(fact._id),
        label: fact.predicate,
        state:
          fact.servingLabel === "last_known_good"
            ? ("last_known_good" as const)
            : ("at_risk" as const),
        details: { factVersionId: fact.factVersionId },
      })),
      ...events.map((event) => ({
        kind: "change_event" as const,
        targetId: String(event._id),
        label: event.eventId,
        state:
          event.state === "withheld"
            ? ("withheld" as const)
            : ("at_risk" as const),
        details: { eventType: event.eventType },
      })),
      ...consumers.map((consumer) => ({
        kind:
          consumer.kind === "subscriber"
            ? ("subscriber" as const)
            : ("downstream_consumer" as const),
        targetId: String(consumer._id),
        label: consumer.name,
        state: "at_risk" as const,
        details: { predicate: consumer.predicate, kind: consumer.kind },
      })),
      ...args.supplementalImpacts,
    ];
    const unique = new Map<string, (typeof impacts)[number]>();
    for (const impact of impacts) {
      assertPhase9Text(impact.targetId, "impact.targetId", 500);
      assertPhase9Text(impact.label, "impact.label", 300);
      unique.set(`${impact.kind}:${impact.targetId}`, impact);
    }
    const values = [...unique.values()];
    const count = (kind: (typeof values)[number]["kind"]) =>
      values.filter((impact) => impact.kind === kind).length;
    const now = Date.now();
    const assessmentId = await ctx.db.insert("blastRadiusAssessments", {
      projectId: incident.projectId,
      incidentId: incident._id,
      ...(sourceId ? { sourceId } : {}),
      ...(binding ? { collectorBindingId: binding._id } : {}),
      affectedFieldCount: count("canonical_field"),
      affectedEntityCount: count("entity"),
      affectedFactCount: count("current_fact"),
      affectedEventCount: count("change_event"),
      affectedSubscriberCount: count("subscriber"),
      affectedDownstreamCount: count("downstream_consumer"),
      freshnessImpact: args.freshnessImpact,
      lastKnownGoodAvailable: values.some(
        (impact) => impact.state === "last_known_good",
      ),
      alternateSourceCoverage: values.some(
        (impact) => impact.state === "covered",
      ),
      estimatedFalseEventBlastRadius:
        count("change_event") + count("subscriber"),
      operationKey: args.operationKey,
      createdAt: now,
    });
    const impactIds: Id<"blastRadiusImpacts">[] = [];
    for (let index = 0; index < values.length; index += 1) {
      const impact = values[index];
      impactIds.push(
        await ctx.db.insert("blastRadiusImpacts", {
          assessmentId,
          projectId: incident.projectId,
          ...impact,
          operationKey: `${args.operationKey}:impact:${impact.kind}:${index}`,
          createdAt: now + index,
        }),
      );
    }
    const assessment = await ctx.db.get("blastRadiusAssessments", assessmentId);
    const inserted = (
      await Promise.all(
        impactIds.map((id) => ctx.db.get("blastRadiusImpacts", id)),
      )
    ).filter((item): item is Doc<"blastRadiusImpacts"> => item !== null);
    if (!assessment) throw new Error("Blast radius insert failed");
    return { assessment, impacts: inserted, duplicate: false };
  },
});

export const recordTribunalContext = mutation({
  args: {
    ingestKey: v.string(),
    incidentId: v.id("incidents"),
    healAttemptId: v.id("healAttempts"),
    blastRadiusAssessmentId: v.id("blastRadiusAssessments"),
    summary: v.string(),
    operationKey: v.string(),
  },
  returns: v.object({
    context: schema.doc("repairTribunalContexts"),
    items: v.array(schema.doc("repairTribunalContextItems")),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase9Text(args.summary, "summary", 1_000);
    assertPhase9Text(args.operationKey, "operationKey", 240);
    const existing = await ctx.db
      .query("repairTribunalContexts")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (existing) {
      const items = await ctx.db
        .query("repairTribunalContextItems")
        .withIndex("by_contextId_and_kind", (q) =>
          q.eq("contextId", existing._id),
        )
        .take(200);
      return { context: existing, items, duplicate: true };
    }
    const [incident, healAttempt, assessment] = await Promise.all([
      ctx.db.get("incidents", args.incidentId),
      ctx.db.get("healAttempts", args.healAttemptId),
      ctx.db.get("blastRadiusAssessments", args.blastRadiusAssessmentId),
    ]);
    if (!incident || !healAttempt || !assessment)
      throw new Error("Tribunal context roots are missing");
    if (
      healAttempt.incidentId !== incident._id ||
      assessment.incidentId !== incident._id
    )
      throw new Error("Tribunal context roots belong to different incidents");
    const impacts = await ctx.db
      .query("blastRadiusImpacts")
      .withIndex("by_assessmentId_and_kind", (q) =>
        q.eq("assessmentId", assessment._id),
      )
      .take(200);
    const conflicts: Doc<"sourceConflicts">[] = [];
    for (const impact of impacts) {
      if (impact.kind !== "entity") continue;
      const entityId = ctx.db.normalizeId("canonicalEntities", impact.targetId);
      if (!entityId) continue;
      const rows = await ctx.db
        .query("sourceConflicts")
        .withIndex("by_entityId_and_predicate_and_openedAt", (q) =>
          q.eq("entityId", entityId),
        )
        .order("desc")
        .take(20);
      conflicts.push(...rows.filter((row) => row.status === "open"));
    }
    const fieldCount = impacts.filter(
      (impact) => impact.kind === "canonical_field",
    ).length;
    const factCount = impacts.filter(
      (impact) => impact.kind === "current_fact",
    ).length;
    const independentSupportAvailable =
      assessment.alternateSourceCoverage ||
      conflicts.some((conflict) => conflict.independentGroupCount > 1);
    const identityChangeRisk = impacts.some(
      (impact) =>
        impact.kind === "entity" &&
        typeof impact.details === "object" &&
        impact.details !== null &&
        "identityRisk" in impact.details &&
        impact.details.identityRisk === true,
    );
    const now = Date.now();
    const contextId = await ctx.db.insert("repairTribunalContexts", {
      projectId: incident.projectId,
      incidentId: incident._id,
      healAttemptId: healAttempt._id,
      blastRadiusAssessmentId: assessment._id,
      sourceMappingCount: fieldCount,
      canonicalFieldCount: fieldCount,
      currentFactCount: factCount,
      openConflictCount: conflicts.length,
      estimatedEventBlastRadius: assessment.estimatedFalseEventBlastRadius,
      independentSupportAvailable,
      identityChangeRisk,
      summary: args.summary,
      operationKey: args.operationKey,
      createdAt: now,
    });
    const inputs = [
      ...impacts.map((impact) => ({
        kind:
          impact.kind === "canonical_field"
            ? ("canonical_field" as const)
            : impact.kind === "current_fact"
              ? ("current_fact" as const)
              : impact.kind === "change_event"
                ? ("event_blast" as const)
                : impact.kind === "source"
                  ? ("source_mapping" as const)
                  : ("identity_risk" as const),
        targetId: impact.targetId,
        label: impact.label,
        details: impact.details,
      })),
      ...conflicts.map((conflict) => ({
        kind: "source_conflict" as const,
        targetId: String(conflict._id),
        label: conflict.reason,
        details: { independentGroupCount: conflict.independentGroupCount },
      })),
      ...(independentSupportAvailable
        ? [
            {
              kind: "independent_support" as const,
              targetId: String(assessment._id),
              label: "Independent source support is available",
              details: {},
            },
          ]
        : []),
    ].slice(0, 200);
    const ids: Id<"repairTribunalContextItems">[] = [];
    for (let index = 0; index < inputs.length; index += 1)
      ids.push(
        await ctx.db.insert("repairTribunalContextItems", {
          contextId,
          ...inputs[index],
          operationKey: `${args.operationKey}:item:${index}`,
          createdAt: now + index,
        }),
      );
    const context = await ctx.db.get("repairTribunalContexts", contextId);
    const items = (
      await Promise.all(
        ids.map((id) => ctx.db.get("repairTribunalContextItems", id)),
      )
    ).filter(
      (item): item is Doc<"repairTribunalContextItems"> => item !== null,
    );
    if (!context) throw new Error("Tribunal context insert failed");
    return { context, items, duplicate: false };
  },
});

export const startCanary = mutation({
  args: {
    ingestKey: v.string(),
    incidentId: v.id("incidents"),
    healAttemptId: v.id("healAttempts"),
    bindingId: v.optional(v.id("collectorBindings")),
    candidateVersion: v.string(),
    priorActiveVersion: v.optional(v.string()),
    thresholds: canaryThresholdsValidator,
    operationKey: v.string(),
  },
  returns: v.object({
    candidate: schema.doc("repairCandidateVersions"),
    canary: schema.doc("repairCanaryRuns"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase9Text(args.candidateVersion, "candidateVersion", 200);
    assertPhase9Text(args.operationKey, "operationKey", 240);
    if (
      args.thresholds.minimumPassRate < 0 ||
      args.thresholds.minimumPassRate > 1 ||
      !Number.isSafeInteger(args.thresholds.maximumCriticalFailures) ||
      args.thresholds.maximumCriticalFailures < 0 ||
      !Number.isSafeInteger(args.thresholds.maximumFalseEvents) ||
      args.thresholds.maximumFalseEvents < 0
    )
      throw new Error("Invalid canary thresholds");
    const duplicate = await ctx.db
      .query("repairCanaryRuns")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", `${args.operationKey}:canary`),
      )
      .unique();
    if (duplicate) {
      const candidate = await ctx.db.get(
        "repairCandidateVersions",
        duplicate.candidateVersionId,
      );
      if (!candidate) throw new Error("Canary candidate is missing");
      return { candidate, canary: duplicate, duplicate: true };
    }
    const [incident, healAttempt] = await Promise.all([
      ctx.db.get("incidents", args.incidentId),
      ctx.db.get("healAttempts", args.healAttemptId),
    ]);
    if (!incident || !healAttempt || healAttempt.incidentId !== incident._id)
      throw new Error("Canary roots are invalid");
    const approvals = await ctx.db
      .query("repairDecisions")
      .withIndex("by_healAttemptId_and_createdAt", (q) =>
        q.eq("healAttemptId", healAttempt._id),
      )
      .order("desc")
      .take(20);
    if (!approvals.some((decision) => decision.decision === "approved"))
      throw new Error("Human repair approval is required before canary");
    if (args.bindingId) {
      const binding = await ctx.db.get("collectorBindings", args.bindingId);
      if (!binding || binding.collectorId !== incident.collectorId)
        throw new Error("Canary binding does not match the incident collector");
    }
    const now = Date.now();
    const candidateId = await ctx.db.insert("repairCandidateVersions", {
      projectId: incident.projectId,
      incidentId: incident._id,
      healAttemptId: healAttempt._id,
      collectorId: incident.collectorId,
      ...(args.bindingId ? { bindingId: args.bindingId } : {}),
      candidateVersion: args.candidateVersion,
      ...(args.priorActiveVersion
        ? { priorActiveVersion: args.priorActiveVersion }
        : {}),
      status: "canary",
      operationKey: `${args.operationKey}:candidate`,
      createdAt: now,
      updatedAt: now,
    });
    const canaryId = await ctx.db.insert("repairCanaryRuns", {
      projectId: incident.projectId,
      incidentId: incident._id,
      healAttemptId: healAttempt._id,
      candidateVersionId: candidateId,
      status: "running",
      currentStage: "trigger_url",
      thresholds: args.thresholds,
      totalChecks: 0,
      passedChecks: 0,
      criticalFailures: 0,
      falseEventCount: 0,
      operationKey: `${args.operationKey}:canary`,
      startedAt: now,
      updatedAt: now,
    });
    const [candidate, canary] = await Promise.all([
      ctx.db.get("repairCandidateVersions", candidateId),
      ctx.db.get("repairCanaryRuns", canaryId),
    ]);
    if (!candidate || !canary) throw new Error("Canary start failed");
    return { candidate, canary, duplicate: false };
  },
});

export const recordCanaryStage = mutation({
  args: {
    ingestKey: v.string(),
    canaryRunId: v.id("repairCanaryRuns"),
    stage: canaryStageValidator,
    outcome: verificationOutcomeValidator,
    totalCases: v.number(),
    passedCases: v.number(),
    criticalFailures: v.number(),
    falseEventCount: v.number(),
    extractionAssertionsPassed: v.boolean(),
    eventAssertionsPassed: v.boolean(),
    identityStable: v.boolean(),
    schemaCompatible: v.boolean(),
    mappingCompatible: v.boolean(),
    evidenceDigest: v.string(),
    affectedEventIds: v.array(v.id("changeEvents")),
    operationKey: v.string(),
  },
  returns: v.object({
    canary: schema.doc("repairCanaryRuns"),
    stageResult: schema.doc("canaryStageResults"),
    eventHolds: v.array(schema.doc("repairEventHolds")),
    automaticStop: v.boolean(),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase9Text(args.evidenceDigest, "evidenceDigest", 300);
    assertPhase9Text(args.operationKey, "operationKey", 240);
    if (args.affectedEventIds.length > 50)
      throw new Error("affectedEventIds is bounded to 50");
    for (const [name, value] of [
      ["totalCases", args.totalCases],
      ["passedCases", args.passedCases],
      ["criticalFailures", args.criticalFailures],
      ["falseEventCount", args.falseEventCount],
    ] as const)
      if (!Number.isSafeInteger(value) || value < 0)
        throw new Error(`${name} must be a non-negative integer`);
    if (args.passedCases > args.totalCases)
      throw new Error("passedCases cannot exceed totalCases");
    const duplicate = await ctx.db
      .query("canaryStageResults")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (duplicate) {
      const canary = await ctx.db.get(
        "repairCanaryRuns",
        duplicate.canaryRunId,
      );
      if (!canary) throw new Error("Duplicate stage lost its canary");
      const eventHolds = await ctx.db
        .query("repairEventHolds")
        .withIndex("by_canaryRunId_and_createdAt", (q) =>
          q.eq("canaryRunId", canary._id),
        )
        .take(50);
      return {
        canary,
        stageResult: duplicate,
        eventHolds,
        automaticStop:
          canary.status === "stopped" || canary.status === "rolled_back",
        duplicate: true,
      };
    }
    const canary = await ctx.db.get("repairCanaryRuns", args.canaryRunId);
    if (!canary) throw new Error("Canary does not exist");
    if (canary.status !== "running")
      throw new Error("Only a running canary accepts stage results");
    const prior = await ctx.db
      .query("canaryStageResults")
      .withIndex("by_canaryRunId_and_stage", (q) =>
        q.eq("canaryRunId", canary._id),
      )
      .take(10);
    const stageIndex = CANARY_STAGE_ORDER.indexOf(args.stage);
    if (stageIndex < 0) throw new Error("Unknown canary stage");
    const expectedIndex = prior.length;
    if (stageIndex !== expectedIndex)
      throw new Error(
        "Canary stages must be recorded in order without skipping",
      );
    const passes =
      args.outcome === "pass" &&
      canaryStagePasses({
        ...args,
        thresholds: canary.thresholds,
      });
    const now = Date.now();
    const stageId = await ctx.db.insert("canaryStageResults", {
      canaryRunId: canary._id,
      stage: args.stage,
      outcome: passes ? "pass" : "fail",
      totalCases: args.totalCases,
      passedCases: args.passedCases,
      criticalFailures: args.criticalFailures,
      falseEventCount: args.falseEventCount,
      extractionAssertionsPassed: args.extractionAssertionsPassed,
      eventAssertionsPassed: args.eventAssertionsPassed,
      identityStable: args.identityStable,
      schemaCompatible: args.schemaCompatible,
      mappingCompatible: args.mappingCompatible,
      evidenceDigest: args.evidenceDigest,
      operationKey: args.operationKey,
      createdAt: now,
    });
    const eventHoldIds: Id<"repairEventHolds">[] = [];
    if (!passes) {
      const reason = `automatic_stop:${args.stage}`;
      await ctx.db.patch("repairCanaryRuns", canary._id, {
        status: "stopped",
        currentStage: args.stage,
        totalChecks: canary.totalChecks + args.totalCases,
        passedChecks: canary.passedChecks + args.passedCases,
        criticalFailures: canary.criticalFailures + args.criticalFailures,
        falseEventCount: canary.falseEventCount + args.falseEventCount,
        automaticStopReason: reason,
        updatedAt: now,
        completedAt: now,
      });
      await ctx.db.patch("repairCandidateVersions", canary.candidateVersionId, {
        status: "rolled_back",
        updatedAt: now,
      });
      for (let index = 0; index < args.affectedEventIds.length; index += 1) {
        const event = await ctx.db.get(
          "changeEvents",
          args.affectedEventIds[index],
        );
        if (!event || event.projectId !== canary.projectId)
          throw new Error("Affected event is invalid for this canary");
        const holdKey = `${args.operationKey}:hold:${event._id}`;
        const holdId = await ctx.db.insert("repairEventHolds", {
          projectId: canary.projectId,
          incidentId: canary.incidentId,
          canaryRunId: canary._id,
          eventId: event._id,
          reason,
          operationKey: holdKey,
          createdAt: now + index,
        });
        eventHoldIds.push(holdId);
        if (event.state !== "withheld" && event.state !== "retracted") {
          const fromState = event.state;
          await ctx.db.patch("changeEvents", event._id, { state: "withheld" });
          await ctx.db.insert("changeEventTransitions", {
            eventId: event._id,
            fromState,
            toState: "withheld",
            reason,
            operationKey: `${holdKey}:transition`,
            createdAt: now + index,
          });
        }
      }
    } else {
      const nextStage = CANARY_STAGE_ORDER[stageIndex + 1] ?? args.stage;
      await ctx.db.patch("repairCanaryRuns", canary._id, {
        status: args.stage === "shadow_production" ? "passed" : "running",
        currentStage: nextStage,
        totalChecks: canary.totalChecks + args.totalCases,
        passedChecks: canary.passedChecks + args.passedCases,
        criticalFailures: canary.criticalFailures + args.criticalFailures,
        falseEventCount: canary.falseEventCount + args.falseEventCount,
        updatedAt: now,
        ...(args.stage === "shadow_production" ? { completedAt: now } : {}),
      });
    }
    const [updated, stageResult] = await Promise.all([
      ctx.db.get("repairCanaryRuns", canary._id),
      ctx.db.get("canaryStageResults", stageId),
    ]);
    const eventHolds = (
      await Promise.all(
        eventHoldIds.map((id) => ctx.db.get("repairEventHolds", id)),
      )
    ).filter((item): item is Doc<"repairEventHolds"> => item !== null);
    if (!updated || !stageResult) throw new Error("Canary stage write failed");
    return {
      canary: updated,
      stageResult,
      eventHolds,
      automaticStop: !passes,
      duplicate: false,
    };
  },
});

export const certifyAndRelease = mutation({
  args: {
    ingestKey: v.string(),
    canaryRunId: v.id("repairCanaryRuns"),
    gauntletRunId: v.id("fleetGauntletRuns"),
    evidenceBundleId: v.id("evidenceBundles"),
    operationKey: v.string(),
  },
  returns: v.object({
    certificate: schema.doc("extendedRepairCertificates"),
    canary: schema.doc("repairCanaryRuns"),
    candidate: schema.doc("repairCandidateVersions"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase9Text(args.operationKey, "operationKey", 240);
    const duplicate = await ctx.db
      .query("extendedRepairCertificates")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (duplicate) {
      const canary = await ctx.db.get(
        "repairCanaryRuns",
        duplicate.canaryRunId,
      );
      if (!canary)
        throw new Error("Duplicate certificate lost its canary state");
      const candidate = await ctx.db.get(
        "repairCandidateVersions",
        canary.candidateVersionId,
      );
      if (!candidate)
        throw new Error("Duplicate certificate lost its candidate state");
      return { certificate: duplicate, canary, candidate, duplicate: true };
    }
    const [canary, gauntlet, bundle] = await Promise.all([
      ctx.db.get("repairCanaryRuns", args.canaryRunId),
      ctx.db.get("fleetGauntletRuns", args.gauntletRunId),
      ctx.db.get("evidenceBundles", args.evidenceBundleId),
    ]);
    if (!canary || !gauntlet || !bundle)
      throw new Error("Certification roots are missing");
    if (
      gauntlet.canaryRunId !== canary._id ||
      bundle.incidentId !== canary.incidentId
    )
      throw new Error("Certification roots belong to different repairs");
    const [stages, approvals, metrics, candidate, blast, coreCertificates] =
      await Promise.all([
        ctx.db
          .query("canaryStageResults")
          .withIndex("by_canaryRunId_and_stage", (q) =>
            q.eq("canaryRunId", canary._id),
          )
          .take(10),
        ctx.db
          .query("repairDecisions")
          .withIndex("by_healAttemptId_and_createdAt", (q) =>
            q.eq("healAttemptId", canary.healAttemptId),
          )
          .order("desc")
          .take(20),
        ctx.db
          .query("fleetBenchmarkMetrics")
          .withIndex("by_gauntletRunId", (q) =>
            q.eq("gauntletRunId", gauntlet._id),
          )
          .unique(),
        ctx.db.get("repairCandidateVersions", canary.candidateVersionId),
        ctx.db
          .query("blastRadiusAssessments")
          .withIndex("by_incidentId_and_createdAt", (q) =>
            q.eq("incidentId", canary.incidentId),
          )
          .order("desc")
          .first(),
        ctx.db
          .query("certificates")
          .withIndex("by_healAttemptId_and_createdAt", (q) =>
            q.eq("healAttemptId", canary.healAttemptId),
          )
          .order("desc")
          .take(20),
      ]);
    if (!candidate || !metrics || !blast)
      throw new Error("Certification evidence is incomplete");
    const approved = approvals.some(
      (decision) => decision.decision === "approved",
    );
    if (!isFullReleaseEligible({ stages, gauntlet, approved, bundle }))
      throw new Error("Full release prerequisites are not satisfied");
    const impacts = await ctx.db
      .query("blastRadiusImpacts")
      .withIndex("by_assessmentId_and_kind", (q) =>
        q.eq("assessmentId", blast._id),
      )
      .take(200);
    const fields = [
      ...new Set(
        impacts
          .filter((impact) => impact.kind === "canonical_field")
          .map((impact) => impact.label),
      ),
    ];
    const stage = (name: Doc<"canaryStageResults">["stage"]) =>
      stages.find((item) => item.stage === name);
    const ratio = (item: Doc<"canaryStageResults"> | undefined) =>
      item ? `${item.passedCases}/${item.totalCases}` : "0/0";
    const coreCertificate = coreCertificates.find(
      (certificate) => certificate.status === "certified",
    );
    const results = await ctx.db
      .query("fleetGauntletResults")
      .withIndex("by_gauntletRunId_and_caseId", (q) =>
        q.eq("gauntletRunId", gauntlet._id),
      )
      .take(200);
    const now = Date.now();
    const payload = {
      certificate_version: "2.0" as const,
      incident_id: String(canary.incidentId),
      core_certificate_id: coreCertificate ? String(coreCertificate._id) : null,
      affected_canonical_fields: fields,
      affected_entity_count: blast.affectedEntityCount,
      canary: {
        stored_fixtures: ratio(stage("stored_fixtures")),
        held_out_cases: ratio(stage("held_out_mutations")),
        live_shadow_runs: ratio(stage("shadow_production")),
      },
      semantic_event_check: {
        false_events: metrics.falseEventCount,
        expected_events: results.reduce(
          (sum, result) => sum + result.emittedEventTypes.length,
          0,
        ),
      },
      schema_compatibility: "pass" as const,
      mapping_compatibility: "pass" as const,
      evidence_bundle_digest: bundle.digest,
      integrity_manifest_digest: bundle.manifestDigest,
      released_collector_version: candidate.candidateVersion,
      issued_at: new Date(now).toISOString(),
    };
    const digest = integrityDigest(payload);
    const certificateId = await ctx.db.insert("extendedRepairCertificates", {
      projectId: canary.projectId,
      incidentId: canary.incidentId,
      healAttemptId: canary.healAttemptId,
      canaryRunId: canary._id,
      gauntletRunId: gauntlet._id,
      evidenceBundleId: bundle._id,
      ...(coreCertificate ? { coreCertificateId: coreCertificate._id } : {}),
      status: "certified",
      payload,
      digest,
      operationKey: args.operationKey,
      createdAt: now,
    });
    await ctx.db.patch("repairCanaryRuns", canary._id, {
      status: "fully_released",
      currentStage: "active_production",
      updatedAt: now,
      completedAt: now,
    });
    await ctx.db.patch("repairCandidateVersions", candidate._id, {
      status: "active",
      updatedAt: now,
    });
    await ctx.db.insert("canaryStageResults", {
      canaryRunId: canary._id,
      stage: "active_production",
      outcome: "pass",
      totalCases: 1,
      passedCases: 1,
      criticalFailures: 0,
      falseEventCount: 0,
      extractionAssertionsPassed: true,
      eventAssertionsPassed: true,
      identityStable: true,
      schemaCompatible: true,
      mappingCompatible: true,
      evidenceDigest: digest,
      operationKey: `${args.operationKey}:active-production`,
      createdAt: now,
    });
    const [certificate, updatedCanary, updatedCandidate] = await Promise.all([
      ctx.db.get("extendedRepairCertificates", certificateId),
      ctx.db.get("repairCanaryRuns", canary._id),
      ctx.db.get("repairCandidateVersions", candidate._id),
    ]);
    if (!certificate || !updatedCanary || !updatedCandidate)
      throw new Error("Certification commit failed");
    return {
      certificate,
      canary: updatedCanary,
      candidate: updatedCandidate,
      duplicate: false,
    };
  },
});
