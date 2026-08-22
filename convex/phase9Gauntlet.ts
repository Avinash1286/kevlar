import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { requirePhase5IngestKey } from "./phase5Auth";
import {
  fleetCaseVisibilityValidator,
  fleetExpectedRelationValidator,
  mutationCategoryValidator,
  sourceArchetypeValidator,
  verificationOutcomeValidator,
} from "./phase9Validators";
import { assertPhase9Text } from "./phase9Support";

const caseInputValidator = v.object({
  caseId: v.string(),
  name: v.string(),
  archetype: sourceArchetypeValidator,
  category: mutationCategoryValidator,
  visibility: fleetCaseVisibilityValidator,
  transformVersion: v.string(),
  canonicalField: v.string(),
  expectedRelation: fleetExpectedRelationValidator,
  expectedEventTypes: v.array(v.string()),
  forbiddenEventTypes: v.array(v.string()),
  critical: v.boolean(),
});

export const upsertSuite = mutation({
  args: {
    ingestKey: v.string(),
    projectId: v.id("projects"),
    name: v.string(),
    revision: v.string(),
    cases: v.array(caseInputValidator),
    operationKey: v.string(),
  },
  returns: v.object({
    suite: schema.doc("fleetGauntletSuites"),
    cases: v.array(schema.doc("fleetGauntletCases")),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase9Text(args.name, "name", 200);
    assertPhase9Text(args.revision, "revision", 100);
    assertPhase9Text(args.operationKey, "operationKey", 240);
    if (args.cases.length < 1 || args.cases.length > 100)
      throw new Error("Gauntlet suite must contain 1-100 cases");
    const caseIds = new Set<string>();
    for (const item of args.cases) {
      assertPhase9Text(item.caseId, "caseId", 160);
      assertPhase9Text(item.name, "case.name", 240);
      assertPhase9Text(item.transformVersion, "transformVersion", 100);
      assertPhase9Text(item.canonicalField, "canonicalField", 300);
      if (caseIds.has(item.caseId))
        throw new Error("Duplicate caseId in suite");
      if (
        item.expectedEventTypes.length > 20 ||
        item.forbiddenEventTypes.length > 20
      )
        throw new Error("Event assertions are bounded to 20 types per case");
      caseIds.add(item.caseId);
    }
    const existing = await ctx.db
      .query("fleetGauntletSuites")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (existing) {
      const cases = await ctx.db
        .query("fleetGauntletCases")
        .withIndex("by_suiteId_and_caseId", (q) =>
          q.eq("suiteId", existing._id),
        )
        .take(100);
      return { suite: existing, cases, duplicate: true };
    }
    const now = Date.now();
    const suiteId = await ctx.db.insert("fleetGauntletSuites", {
      projectId: args.projectId,
      name: args.name,
      revision: args.revision,
      status: "active",
      operationKey: args.operationKey,
      createdAt: now,
    });
    const ids: Id<"fleetGauntletCases">[] = [];
    for (let index = 0; index < args.cases.length; index += 1)
      ids.push(
        await ctx.db.insert("fleetGauntletCases", {
          suiteId,
          ...args.cases[index],
          operationKey: `${args.operationKey}:case:${args.cases[index].caseId}`,
          createdAt: now + index,
        }),
      );
    const suite = await ctx.db.get("fleetGauntletSuites", suiteId);
    const cases = (
      await Promise.all(ids.map((id) => ctx.db.get("fleetGauntletCases", id)))
    ).filter((item): item is Doc<"fleetGauntletCases"> => item !== null);
    if (!suite || cases.length !== args.cases.length)
      throw new Error("Gauntlet suite insert failed");
    return { suite, cases, duplicate: false };
  },
});

export const startRun = mutation({
  args: {
    ingestKey: v.string(),
    incidentId: v.id("incidents"),
    healAttemptId: v.id("healAttempts"),
    canaryRunId: v.id("repairCanaryRuns"),
    suiteId: v.id("fleetGauntletSuites"),
    operationKey: v.string(),
  },
  returns: v.object({
    run: schema.doc("fleetGauntletRuns"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase9Text(args.operationKey, "operationKey", 240);
    const existing = await ctx.db
      .query("fleetGauntletRuns")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (existing) return { run: existing, duplicate: true };
    const [incident, healAttempt, canary, suite] = await Promise.all([
      ctx.db.get("incidents", args.incidentId),
      ctx.db.get("healAttempts", args.healAttemptId),
      ctx.db.get("repairCanaryRuns", args.canaryRunId),
      ctx.db.get("fleetGauntletSuites", args.suiteId),
    ]);
    if (!incident || !healAttempt || !canary || !suite)
      throw new Error("Gauntlet roots are missing");
    if (
      healAttempt.incidentId !== incident._id ||
      canary.incidentId !== incident._id ||
      canary.healAttemptId !== healAttempt._id ||
      suite.projectId !== incident.projectId
    )
      throw new Error("Gauntlet roots belong to different repairs");
    if (suite.status !== "active")
      throw new Error("Gauntlet suite is not active");
    const storedFixture = await ctx.db
      .query("canaryStageResults")
      .withIndex("by_canaryRunId_and_stage", (q) =>
        q.eq("canaryRunId", canary._id).eq("stage", "stored_fixtures"),
      )
      .unique();
    if (!storedFixture || storedFixture.outcome !== "pass")
      throw new Error("Trigger-page success alone cannot start fleet Gauntlet");
    const cases = await ctx.db
      .query("fleetGauntletCases")
      .withIndex("by_suiteId_and_caseId", (q) => q.eq("suiteId", suite._id))
      .take(100);
    const now = Date.now();
    const id = await ctx.db.insert("fleetGauntletRuns", {
      projectId: incident.projectId,
      incidentId: incident._id,
      healAttemptId: healAttempt._id,
      canaryRunId: canary._id,
      suiteId: suite._id,
      status: "running",
      totalCases: cases.length,
      passedCases: 0,
      heldOutTotal: cases.filter((item) => item.visibility === "held_out")
        .length,
      heldOutPassed: 0,
      criticalFailures: 0,
      falseEventCount: 0,
      operationKey: args.operationKey,
      startedAt: now,
    });
    const run = await ctx.db.get("fleetGauntletRuns", id);
    if (!run) throw new Error("Gauntlet run insert failed");
    return { run, duplicate: false };
  },
});

export const recordResult = mutation({
  args: {
    ingestKey: v.string(),
    gauntletRunId: v.id("fleetGauntletRuns"),
    caseId: v.id("fleetGauntletCases"),
    outcome: verificationOutcomeValidator,
    observedRelation: fleetExpectedRelationValidator,
    extractedValueHash: v.optional(v.string()),
    releasedValueHash: v.optional(v.string()),
    emittedEventTypes: v.array(v.string()),
    extractionAssertionPassed: v.boolean(),
    eventAssertionPassed: v.boolean(),
    falseHeal: v.boolean(),
    falseEvent: v.boolean(),
    detectionMs: v.number(),
    recoveryMs: v.optional(v.number()),
    evidenceDigest: v.string(),
    reason: v.string(),
    operationKey: v.string(),
  },
  returns: v.object({
    result: schema.doc("fleetGauntletResults"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase9Text(args.evidenceDigest, "evidenceDigest", 300);
    assertPhase9Text(args.reason, "reason", 1_000);
    assertPhase9Text(args.operationKey, "operationKey", 240);
    if (args.emittedEventTypes.length > 20)
      throw new Error("emittedEventTypes is bounded to 20");
    if (!Number.isFinite(args.detectionMs) || args.detectionMs < 0)
      throw new Error("detectionMs must be non-negative");
    if (
      args.recoveryMs !== undefined &&
      (!Number.isFinite(args.recoveryMs) || args.recoveryMs < 0)
    )
      throw new Error("recoveryMs must be non-negative");
    const existing = await ctx.db
      .query("fleetGauntletResults")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (existing) return { result: existing, duplicate: true };
    const [run, testCase] = await Promise.all([
      ctx.db.get("fleetGauntletRuns", args.gauntletRunId),
      ctx.db.get("fleetGauntletCases", args.caseId),
    ]);
    if (!run || !testCase || testCase.suiteId !== run.suiteId)
      throw new Error("Gauntlet result roots are invalid");
    if (run.status !== "running")
      throw new Error("Only running Gauntlet runs accept results");
    const eventSet = new Set(args.emittedEventTypes);
    const expectedPresent = testCase.expectedEventTypes.every((item) =>
      eventSet.has(item),
    );
    const forbiddenAbsent = testCase.forbiddenEventTypes.every(
      (item) => !eventSet.has(item),
    );
    if (args.eventAssertionPassed !== (expectedPresent && forbiddenAbsent))
      throw new Error(
        "eventAssertionPassed does not match declared assertions",
      );
    const id = await ctx.db.insert("fleetGauntletResults", {
      gauntletRunId: run._id,
      caseId: testCase._id,
      outcome: args.outcome,
      observedRelation: args.observedRelation,
      ...(args.extractedValueHash
        ? { extractedValueHash: args.extractedValueHash }
        : {}),
      ...(args.releasedValueHash
        ? { releasedValueHash: args.releasedValueHash }
        : {}),
      emittedEventTypes: args.emittedEventTypes,
      extractionAssertionPassed: args.extractionAssertionPassed,
      eventAssertionPassed: args.eventAssertionPassed,
      falseHeal: args.falseHeal,
      falseEvent: args.falseEvent,
      detectionMs: args.detectionMs,
      ...(args.recoveryMs !== undefined ? { recoveryMs: args.recoveryMs } : {}),
      evidenceDigest: args.evidenceDigest,
      reason: args.reason,
      operationKey: args.operationKey,
      createdAt: Date.now(),
    });
    const result = await ctx.db.get("fleetGauntletResults", id);
    if (!result) throw new Error("Gauntlet result insert failed");
    return { result, duplicate: false };
  },
});

function fraction(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

export const finalizeRun = mutation({
  args: {
    ingestKey: v.string(),
    gauntletRunId: v.id("fleetGauntletRuns"),
    affectedEventIds: v.array(v.id("changeEvents")),
    operationKey: v.string(),
  },
  returns: v.object({
    run: schema.doc("fleetGauntletRuns"),
    metrics: schema.doc("fleetBenchmarkMetrics"),
    eventHolds: v.array(schema.doc("repairEventHolds")),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase9Text(args.operationKey, "operationKey", 240);
    if (args.affectedEventIds.length > 50)
      throw new Error("affectedEventIds is bounded to 50");
    const duplicate = await ctx.db
      .query("fleetBenchmarkMetrics")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (duplicate) {
      const run = await ctx.db.get(
        "fleetGauntletRuns",
        duplicate.gauntletRunId,
      );
      if (!run) throw new Error("Duplicate metrics lost their run");
      const eventHolds = await ctx.db
        .query("repairEventHolds")
        .withIndex("by_canaryRunId_and_createdAt", (q) =>
          q.eq("canaryRunId", run.canaryRunId),
        )
        .take(50);
      return { run, metrics: duplicate, eventHolds, duplicate: true };
    }
    const run = await ctx.db.get("fleetGauntletRuns", args.gauntletRunId);
    if (!run) throw new Error("Gauntlet run does not exist");
    if (run.status !== "running")
      throw new Error("Only a running Gauntlet can be finalized");
    const [cases, results] = await Promise.all([
      ctx.db
        .query("fleetGauntletCases")
        .withIndex("by_suiteId_and_caseId", (q) => q.eq("suiteId", run.suiteId))
        .take(100),
      ctx.db
        .query("fleetGauntletResults")
        .withIndex("by_gauntletRunId_and_caseId", (q) =>
          q.eq("gauntletRunId", run._id),
        )
        .take(100),
    ]);
    if (results.length !== cases.length || cases.length !== run.totalCases)
      throw new Error("Every Gauntlet case must have exactly one result");
    const caseById = new Map(cases.map((item) => [item._id, item]));
    const passed = results.filter(
      (result) =>
        result.outcome === "pass" &&
        result.extractionAssertionPassed &&
        result.eventAssertionPassed &&
        !result.falseHeal &&
        !result.falseEvent,
    );
    const heldOut = results.filter(
      (result) => caseById.get(result.caseId)?.visibility === "held_out",
    );
    const critical = results.filter(
      (result) => caseById.get(result.caseId)?.critical,
    );
    const criticalFailures = critical.filter(
      (result) => !passed.includes(result),
    ).length;
    const falseEventCount = results.filter(
      (result) => result.falseEvent,
    ).length;
    const expectedEventCount = cases.reduce(
      (sum, item) => sum + item.expectedEventTypes.length,
      0,
    );
    const emittedExpectedCount = results.reduce((sum, result) => {
      const item = caseById.get(result.caseId);
      if (!item) return sum;
      const expected = new Set(item.expectedEventTypes);
      return (
        sum +
        result.emittedEventTypes.filter((event) => expected.has(event)).length
      );
    }, 0);
    const emittedCount = results.reduce(
      (sum, result) => sum + result.emittedEventTypes.length,
      0,
    );
    const triageCases = results.filter((result) => {
      const relation = caseById.get(result.caseId)?.expectedRelation;
      return (
        relation === "quarantine" ||
        relation === "retry" ||
        relation === "do_not_heal"
      );
    });
    const identityCases = results.filter(
      (result) => caseById.get(result.caseId)?.category === "identity",
    );
    const correctionCases = results.filter(
      (result) => caseById.get(result.caseId)?.category === "semantic_decoy",
    );
    const recoveries = results.flatMap((result) =>
      result.recoveryMs === undefined ? [] : [result.recoveryMs],
    );
    const runPassed =
      passed.length === results.length &&
      criticalFailures === 0 &&
      falseEventCount === 0 &&
      heldOut.every((result) => passed.includes(result));
    const now = Date.now();
    const metricId = await ctx.db.insert("fleetBenchmarkMetrics", {
      projectId: run.projectId,
      gauntletRunId: run._id,
      silentCorruptionCatchRate: fraction(
        critical.filter((result) => passed.includes(result)).length,
        critical.length,
      ),
      correctTriageRate: fraction(
        triageCases.filter((result) => passed.includes(result)).length,
        triageCases.length,
      ),
      falseHealRate: fraction(
        results.filter((result) => result.falseHeal).length,
        results.length,
      ),
      heldOutRepairPassRate: fraction(
        heldOut.filter((result) => passed.includes(result)).length,
        heldOut.length,
      ),
      entityResolutionPrecision: fraction(
        identityCases.filter((result) => passed.includes(result)).length,
        identityCases.length,
      ),
      semanticEventPrecision: fraction(emittedExpectedCount, emittedCount),
      semanticEventRecall: fraction(emittedExpectedCount, expectedEventCount),
      falseEventCount,
      correctionClassificationAccuracy: fraction(
        correctionCases.filter((result) => passed.includes(result)).length,
        correctionCases.length,
      ),
      timeToVerifiedRecoveryMs:
        recoveries.length === 0
          ? 0
          : recoveries.reduce((sum, value) => sum + value, 0) /
            recoveries.length,
      lastKnownGoodAvailability: fraction(
        results.filter((result) => !result.falseHeal).length,
        results.length,
      ),
      sourceFreshnessAfterIncident: runPassed ? 1 : 0,
      operationKey: args.operationKey,
      createdAt: now,
    });
    await ctx.db.patch("fleetGauntletRuns", run._id, {
      status: runPassed ? "passed" : "failed",
      passedCases: passed.length,
      heldOutPassed: heldOut.filter((result) => passed.includes(result)).length,
      criticalFailures,
      falseEventCount,
      completedAt: now,
    });
    const holdIds: Id<"repairEventHolds">[] = [];
    if (!runPassed) {
      const canary = await ctx.db.get("repairCanaryRuns", run.canaryRunId);
      if (!canary) throw new Error("Failed Gauntlet lost its canary");
      await ctx.db.patch("repairCanaryRuns", canary._id, {
        status: "stopped",
        automaticStopReason: "fleet_gauntlet_failed",
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
        if (!event || event.projectId !== run.projectId)
          throw new Error("Affected event is invalid for this Gauntlet");
        const operationKey = `${args.operationKey}:hold:${event._id}`;
        holdIds.push(
          await ctx.db.insert("repairEventHolds", {
            projectId: run.projectId,
            incidentId: run.incidentId,
            canaryRunId: run.canaryRunId,
            eventId: event._id,
            reason: "fleet_gauntlet_failed",
            operationKey,
            createdAt: now + index,
          }),
        );
        if (event.state !== "withheld" && event.state !== "retracted") {
          const fromState = event.state;
          await ctx.db.patch("changeEvents", event._id, { state: "withheld" });
          await ctx.db.insert("changeEventTransitions", {
            eventId: event._id,
            fromState,
            toState: "withheld",
            reason: "fleet_gauntlet_failed",
            operationKey: `${operationKey}:transition`,
            createdAt: now + index,
          });
        }
      }
    }
    const [updated, metrics] = await Promise.all([
      ctx.db.get("fleetGauntletRuns", run._id),
      ctx.db.get("fleetBenchmarkMetrics", metricId),
    ]);
    const eventHolds = (
      await Promise.all(holdIds.map((id) => ctx.db.get("repairEventHolds", id)))
    ).filter((item): item is Doc<"repairEventHolds"> => item !== null);
    if (!updated || !metrics) throw new Error("Gauntlet finalization failed");
    return { run: updated, metrics, eventHolds, duplicate: false };
  },
});
