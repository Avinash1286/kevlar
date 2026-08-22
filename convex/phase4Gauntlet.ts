import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { assertOperationText, requirePhase4IngestKey } from "./phase4Auth";
import {
  benchmarkBaselineValidator,
  expectedRelationValidator,
  mutationCodeValidator,
} from "./phase4Validators";

const catalog = [
  {
    code: "M1",
    name: "Class rename",
    visibility: "visible",
    transform: "Rename all CSS classes",
    expectedRelation: "same_value",
    promptVisible: true,
  },
  {
    code: "M2",
    name: "Wrapper insertion",
    visibility: "visible",
    transform: "Insert two containers around price",
    expectedRelation: "same_value",
    promptVisible: true,
  },
  {
    code: "M3",
    name: "Section reorder",
    visibility: "visible",
    transform: "Move financing above checkout",
    expectedRelation: "same_semantic_value",
    promptVisible: true,
  },
  {
    code: "M4",
    name: "Financing decoy",
    visibility: "visible",
    transform: "Make monthly financing visually prominent",
    expectedRelation: "same_semantic_value",
    promptVisible: true,
  },
  {
    code: "H1",
    name: "Label split",
    visibility: "held_out",
    transform: "Move label and value to different DOM branches",
    expectedRelation: "same_semantic_value",
    promptVisible: false,
  },
  {
    code: "H2",
    name: "Delayed rendering",
    visibility: "held_out",
    transform: "Render one-time price after page load",
    expectedRelation: "same_semantic_value",
    promptVisible: false,
  },
  {
    code: "N1",
    name: "Soft block",
    visibility: "negative_control",
    transform: "Return challenge-style HTTP 200 page",
    expectedRelation: "quarantine",
    promptVisible: false,
  },
  {
    code: "N2",
    name: "Legitimate empty",
    visibility: "negative_control",
    transform: "Mark product unavailable with optional stock detail absent",
    expectedRelation: "do_not_heal",
    promptVisible: false,
  },
] as const;

export const seedCatalog = mutation({
  args: { ingestKey: v.string() },
  returns: v.object({ inserted: v.number(), existing: v.number() }),
  handler: async (ctx, args) => {
    requirePhase4IngestKey(args.ingestKey);
    const now = Date.now();
    let inserted = 0;
    let existing = 0;
    for (const item of catalog) {
      const prior = await ctx.db
        .query("repairMutations")
        .withIndex("by_code", (q) => q.eq("code", item.code))
        .unique();
      if (prior) {
        existing += 1;
        continue;
      }
      await ctx.db.insert("repairMutations", {
        ...item,
        criticalFields: ["product.purchase_price.amount"],
        enabled: true,
        catalogVersion: "core-v1",
        updatedAt: now,
      });
      inserted += 1;
    }
    return { inserted, existing };
  },
});

export const startBenchmark = mutation({
  args: {
    ingestKey: v.string(),
    healAttemptId: v.id("healAttempts"),
    suiteRevision: v.string(),
    baseline: benchmarkBaselineValidator,
    operationKey: v.string(),
  },
  returns: v.object({
    benchmarkRunId: v.id("benchmarkRuns"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase4IngestKey(args.ingestKey);
    assertOperationText(args.operationKey, "operationKey");
    assertOperationText(args.suiteRevision, "suiteRevision");
    const prior = await ctx.db
      .query("benchmarkRuns")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (prior) return { benchmarkRunId: prior._id, duplicate: true };
    const attempt = await ctx.db.get("healAttempts", args.healAttemptId);
    if (!attempt || attempt.status !== "approved")
      throw new Error("Benchmark requires a human-approved repair attempt");
    const now = Date.now();
    const benchmarkRunId = await ctx.db.insert("benchmarkRuns", {
      projectId: attempt.projectId,
      incidentId: attempt.incidentId,
      healAttemptId: attempt._id,
      suiteRevision: args.suiteRevision,
      baseline: args.baseline,
      status: "running",
      totalCases: 0,
      passedCases: 0,
      criticalFailures: 0,
      falseHealCount: 0,
      falseReleaseCount: 0,
      operationKey: args.operationKey,
      startedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: attempt.projectId,
      actorType: "system",
      action: "gauntlet.started",
      targetType: "benchmark_run",
      targetId: String(benchmarkRunId),
      payload: { healAttemptId: attempt._id, baseline: args.baseline },
      createdAt: now,
    });
    return { benchmarkRunId, duplicate: false };
  },
});

export const recordCaseResult = mutation({
  args: {
    ingestKey: v.string(),
    benchmarkRunId: v.id("benchmarkRuns"),
    caseId: mutationCodeValidator,
    outcome: v.union(v.literal("pass"), v.literal("fail")),
    observedRelation: v.optional(expectedRelationValidator),
    observedValue: v.union(v.number(), v.null()),
    releasedValue: v.union(v.number(), v.null()),
    detectionMs: v.number(),
    recoveryMs: v.optional(v.number()),
    falseHeal: v.boolean(),
    falseRelease: v.boolean(),
    critical: v.optional(v.boolean()),
    evidenceHash: v.string(),
    reason: v.string(),
    runId: v.optional(v.id("runs")),
    evidenceIds: v.array(v.id("evidence")),
    operationKey: v.string(),
  },
  returns: v.object({
    caseResultId: v.id("benchmarkCaseResults"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase4IngestKey(args.ingestKey);
    assertOperationText(args.operationKey, "operationKey");
    if (args.evidenceIds.length > 12)
      throw new Error("A benchmark case may link at most 12 evidence items");
    const byOperation = await ctx.db
      .query("benchmarkCaseResults")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (byOperation) return { caseResultId: byOperation._id, duplicate: true };
    const benchmark = await ctx.db.get("benchmarkRuns", args.benchmarkRunId);
    if (!benchmark || benchmark.status !== "running")
      throw new Error("Benchmark run is not accepting results");
    const mutation = await ctx.db
      .query("repairMutations")
      .withIndex("by_code", (q) => q.eq("code", args.caseId))
      .unique();
    if (!mutation || !mutation.enabled)
      throw new Error("Mutation is not in the enabled catalog");
    const existing = await ctx.db
      .query("benchmarkCaseResults")
      .withIndex("by_benchmarkRunId_and_caseId", (q) =>
        q.eq("benchmarkRunId", benchmark._id).eq("caseId", args.caseId),
      )
      .unique();
    if (existing) return { caseResultId: existing._id, duplicate: true };
    if (args.reason.length === 0 || args.reason.length > 1_000)
      throw new Error("reason must contain 1-1000 characters");
    if (
      args.detectionMs < 0 ||
      (args.recoveryMs !== undefined && args.recoveryMs < 0) ||
      !/^sha256:[0-9a-f]{64}$/i.test(args.evidenceHash)
    )
      throw new Error("Benchmark timings or evidenceHash are invalid");
    if (
      args.outcome === "pass" &&
      args.observedRelation !== mutation.expectedRelation
    )
      throw new Error("A passing case must satisfy its expected relation");
    if (args.runId) {
      const measuredRun = await ctx.db.get("runs", args.runId);
      if (!measuredRun || measuredRun.projectId !== benchmark.projectId)
        throw new Error(
          "Measured run does not belong to the benchmark project",
        );
    }
    const now = Date.now();
    const caseResultId = await ctx.db.insert("benchmarkCaseResults", {
      projectId: benchmark.projectId,
      incidentId: benchmark.incidentId,
      benchmarkRunId: benchmark._id,
      mutationId: mutation._id,
      caseId: mutation.code,
      visibility: mutation.visibility,
      expectedRelation: mutation.expectedRelation,
      ...(args.observedRelation
        ? { observedRelation: args.observedRelation }
        : {}),
      outcome: args.outcome,
      observedValue: args.observedValue,
      releasedValue: args.releasedValue,
      detectionMs: args.detectionMs,
      recoveryMs: args.recoveryMs ?? null,
      falseHeal: args.falseHeal,
      falseRelease: args.falseRelease,
      critical: args.critical ?? args.outcome !== "pass",
      evidenceHash: args.evidenceHash,
      reason: args.reason,
      ...(args.runId ? { runId: args.runId } : {}),
      operationKey: args.operationKey,
      createdAt: now,
    });
    for (const evidenceId of args.evidenceIds) {
      const evidence = await ctx.db.get("evidence", evidenceId);
      if (!evidence || evidence.projectId !== benchmark.projectId)
        throw new Error("Benchmark evidence does not belong to the project");
      await ctx.db.insert("phase4EvidenceLinks", {
        projectId: benchmark.projectId,
        incidentId: benchmark.incidentId,
        healAttemptId: benchmark.healAttemptId,
        benchmarkRunId: benchmark._id,
        evidenceId,
        relation: "benchmark",
        operationKey: `${args.operationKey}:evidence:${evidenceId}`,
        createdAt: now,
      });
    }
    return { caseResultId, duplicate: false };
  },
});

export const completeBenchmark = mutation({
  args: {
    ingestKey: v.string(),
    benchmarkRunId: v.id("benchmarkRuns"),
    lastKnownGoodPreserved: v.boolean(),
  },
  returns: v.object({
    status: v.union(v.literal("completed"), v.literal("failed")),
    totalCases: v.number(),
    passedCases: v.number(),
    criticalFailures: v.number(),
  }),
  handler: async (ctx, args) => {
    requirePhase4IngestKey(args.ingestKey);
    const benchmark = await ctx.db.get("benchmarkRuns", args.benchmarkRunId);
    if (!benchmark) throw new Error("Benchmark run not found");
    if (benchmark.status === "completed" || benchmark.status === "failed")
      return {
        status: benchmark.status,
        totalCases: benchmark.totalCases,
        passedCases: benchmark.passedCases,
        criticalFailures: benchmark.criticalFailures,
      };
    const results = await ctx.db
      .query("benchmarkCaseResults")
      .withIndex("by_benchmarkRunId_and_createdAt", (q) =>
        q.eq("benchmarkRunId", benchmark._id),
      )
      .take(16);
    if (
      results.length !== 8 ||
      new Set(results.map((item) => item.caseId)).size !== 8
    )
      throw new Error(
        "All eight unique Gauntlet cases must be measured before completion",
      );
    const passedCases = results.filter(
      (item) => item.outcome === "pass",
    ).length;
    const criticalFailures = results.filter(
      (item) => item.critical && item.outcome !== "pass",
    ).length;
    const falseHealCount = results.filter((item) => item.falseHeal).length;
    const falseReleaseCount = results.filter(
      (item) => item.falseRelease,
    ).length;
    const status =
      passedCases === 8 &&
      criticalFailures === 0 &&
      falseHealCount === 0 &&
      falseReleaseCount === 0 &&
      args.lastKnownGoodPreserved
        ? ("completed" as const)
        : ("failed" as const);
    const now = Date.now();
    await ctx.db.patch("benchmarkRuns", benchmark._id, {
      status,
      totalCases: 8,
      passedCases,
      criticalFailures,
      falseHealCount,
      falseReleaseCount,
      lastKnownGoodPreserved: args.lastKnownGoodPreserved,
      completedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: benchmark.projectId,
      actorType: "system",
      action: `gauntlet.${status}`,
      targetType: "benchmark_run",
      targetId: String(benchmark._id),
      payload: {
        passedCases,
        criticalFailures,
        falseHealCount,
        falseReleaseCount,
      },
      createdAt: now,
    });
    return { status, totalCases: 8, passedCases, criticalFailures };
  },
});
