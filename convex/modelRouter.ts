import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { performIncidentTransition } from "./incidentStateMachine";
import {
  humanReviewReasonValidator,
  modelCallStatusValidator,
  modelOutputValidator,
  modelTaskValidator,
} from "./phase3Validators";

const prepareResultValidator = v.union(
  v.object({
    decision: v.literal("call_provider"),
    modelCallId: v.id("modelCalls"),
    duplicate: v.boolean(),
  }),
  v.object({
    decision: v.literal("use_cache"),
    modelCallId: v.id("modelCalls"),
    cachedFromCallId: v.id("modelCalls"),
    duplicate: v.boolean(),
  }),
  v.object({
    decision: v.union(
      v.literal("skip_circuit_open"),
      v.literal("skip_budget_exhausted"),
    ),
    modelCallId: v.id("modelCalls"),
    duplicate: v.boolean(),
  }),
);

export const prepareAttempt = internalMutation({
  args: {
    projectId: v.id("projects"),
    incidentId: v.optional(v.id("incidents")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    task: modelTaskValidator,
    provider: v.string(),
    model: v.string(),
    fallbackIndex: v.number(),
    inputHash: v.string(),
    cacheKey: v.string(),
    budgetDate: v.string(),
    requestedUnits: v.number(),
    dailyLimitUnits: v.number(),
    reservedDemoUnits: v.number(),
    isDemoCall: v.boolean(),
    failureThreshold: v.number(),
    cooldownMs: v.number(),
    modelRegistryRevision: v.string(),
    promptTemplateRevision: v.string(),
    promptIsolationApplied: v.boolean(),
    operationKey: v.string(),
    requestHash: v.string(),
  },
  returns: prepareResultValidator,
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.fallbackIndex) || args.fallbackIndex < 0)
      throw new Error("fallbackIndex must be a non-negative integer");
    if (
      args.requestedUnits < 0 ||
      args.dailyLimitUnits <= 0 ||
      args.reservedDemoUnits < 0 ||
      args.reservedDemoUnits > args.dailyLimitUnits ||
      args.reservedDemoUnits < args.dailyLimitUnits * 0.3
    )
      throw new Error("Invalid model budget policy");
    if (
      !Number.isInteger(args.failureThreshold) ||
      args.failureThreshold < 1 ||
      args.failureThreshold > 20 ||
      args.cooldownMs < 1_000 ||
      args.cooldownMs > 86_400_000
    )
      throw new Error("Invalid circuit-breaker policy");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.budgetDate))
      throw new Error("budgetDate must use YYYY-MM-DD");
    if (!args.promptIsolationApplied)
      throw new Error("Webpage evidence requires prompt isolation");

    const existing = await ctx.db
      .query("modelCalls")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (existing) {
      const existingOperation = await ctx.db
        .query("idempotencyRecords")
        .withIndex("by_operationKey", (q) =>
          q.eq("operationKey", args.operationKey),
        )
        .unique();
      if (
        existing.inputHash !== args.inputHash ||
        (existingOperation &&
          existingOperation.requestHash !== args.requestHash)
      )
        throw new Error(
          "Idempotency key was already used for another model input",
        );
      if (existing.status === "cached" && existing.cachedFromCallId)
        return {
          decision: "use_cache" as const,
          modelCallId: existing._id,
          cachedFromCallId: existing.cachedFromCallId,
          duplicate: true,
        };
      if (existing.status === "circuit_open")
        return {
          decision: "skip_circuit_open" as const,
          modelCallId: existing._id,
          duplicate: true,
        };
      if (existing.status === "budget_exhausted")
        return {
          decision: "skip_budget_exhausted" as const,
          modelCallId: existing._id,
          duplicate: true,
        };
      return {
        decision: "call_provider" as const,
        modelCallId: existing._id,
        duplicate: true,
      };
    }

    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Project not found");
    if (args.incidentId) {
      const incident = await ctx.db.get("incidents", args.incidentId);
      if (!incident || incident.projectId !== project._id)
        throw new Error("Model call incident does not belong to the project");
    }

    const now = Date.now();
    const cached = await ctx.db
      .query("modelCalls")
      .withIndex("by_task_and_cacheKey_and_completedAt", (q) =>
        q.eq("task", args.task).eq("cacheKey", args.cacheKey),
      )
      .order("desc")
      .first();
    if (
      cached &&
      cached.status === "success" &&
      cached.outputSchemaValid === true &&
      cached.output
    ) {
      const modelCallId = await ctx.db.insert("modelCalls", {
        projectId: project._id,
        ...(args.incidentId ? { incidentId: args.incidentId } : {}),
        ...(args.workflowRunId ? { workflowRunId: args.workflowRunId } : {}),
        task: args.task,
        provider: cached.provider,
        model: cached.model,
        fallbackIndex: args.fallbackIndex,
        status: "cached",
        latencyMs: 0,
        inputHash: args.inputHash,
        cacheKey: args.cacheKey,
        outputSchemaValid: true,
        output: cached.output,
        costUnits: 0,
        modelRegistryRevision: args.modelRegistryRevision,
        promptTemplateRevision: args.promptTemplateRevision,
        promptIsolationApplied: true,
        affectedProductionConfig: false,
        operationKey: args.operationKey,
        cachedFromCallId: cached._id,
        startedAt: now,
        completedAt: now,
      });
      await ctx.db.insert("idempotencyRecords", {
        projectId: project._id,
        ...(args.incidentId ? { incidentId: args.incidentId } : {}),
        operationKey: args.operationKey,
        scope: "model_call",
        status: "completed",
        requestHash: args.requestHash,
        result: { modelCallId, cachedFromCallId: cached._id },
        attempts: 1,
        createdAt: now,
        updatedAt: now,
      });
      return {
        decision: "use_cache" as const,
        modelCallId,
        cachedFromCallId: cached._id,
        duplicate: false,
      };
    }

    let circuit = await ctx.db
      .query("modelProviderCircuits")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .unique();
    if (!circuit) {
      const circuitId = await ctx.db.insert("modelProviderCircuits", {
        provider: args.provider,
        state: "closed",
        consecutiveFailures: 0,
        probeInFlight: false,
        failureThreshold: args.failureThreshold,
        cooldownMs: args.cooldownMs,
        updatedAt: now,
      });
      circuit = await ctx.db.get("modelProviderCircuits", circuitId);
    }
    if (!circuit) throw new Error("Unable to initialize provider circuit");

    let blockedByCircuit = false;
    if (circuit.state === "open") {
      if ((circuit.cooldownUntil ?? Number.POSITIVE_INFINITY) > now) {
        blockedByCircuit = true;
      } else {
        await ctx.db.patch("modelProviderCircuits", circuit._id, {
          state: "half_open",
          probeInFlight: true,
          failureThreshold: args.failureThreshold,
          cooldownMs: args.cooldownMs,
          updatedAt: now,
        });
      }
    } else if (circuit.state === "half_open") {
      if (circuit.probeInFlight) blockedByCircuit = true;
      else
        await ctx.db.patch("modelProviderCircuits", circuit._id, {
          probeInFlight: true,
          updatedAt: now,
        });
    }

    let budget = await ctx.db
      .query("modelProviderBudgets")
      .withIndex("by_provider_and_budgetDate", (q) =>
        q.eq("provider", args.provider).eq("budgetDate", args.budgetDate),
      )
      .unique();
    if (!budget) {
      const budgetId = await ctx.db.insert("modelProviderBudgets", {
        provider: args.provider,
        budgetDate: args.budgetDate,
        dailyLimitUnits: args.dailyLimitUnits,
        reservedDemoUnits: args.reservedDemoUnits,
        usedUnits: 0,
        updatedAt: now,
      });
      budget = await ctx.db.get("modelProviderBudgets", budgetId);
    }
    if (!budget) throw new Error("Unable to initialize provider budget");
    const usableLimit = args.isDemoCall
      ? budget.dailyLimitUnits
      : budget.dailyLimitUnits - budget.reservedDemoUnits;
    const budgetExhausted =
      budget.usedUnits + args.requestedUnits > usableLimit;

    const skippedStatus = blockedByCircuit
      ? ("circuit_open" as const)
      : budgetExhausted
        ? ("budget_exhausted" as const)
        : null;
    const modelCallId = await ctx.db.insert("modelCalls", {
      projectId: project._id,
      ...(args.incidentId ? { incidentId: args.incidentId } : {}),
      ...(args.workflowRunId ? { workflowRunId: args.workflowRunId } : {}),
      task: args.task,
      provider: args.provider,
      model: args.model,
      fallbackIndex: args.fallbackIndex,
      status: skippedStatus ?? "started",
      ...(skippedStatus ? { latencyMs: 0 } : {}),
      inputHash: args.inputHash,
      cacheKey: args.cacheKey,
      ...(skippedStatus ? { errorCode: skippedStatus } : {}),
      costUnits: skippedStatus ? 0 : args.requestedUnits,
      modelRegistryRevision: args.modelRegistryRevision,
      promptTemplateRevision: args.promptTemplateRevision,
      promptIsolationApplied: true,
      affectedProductionConfig: false,
      operationKey: args.operationKey,
      startedAt: now,
      ...(skippedStatus ? { completedAt: now } : {}),
    });
    if (!skippedStatus) {
      await ctx.db.patch("modelProviderBudgets", budget._id, {
        dailyLimitUnits: args.dailyLimitUnits,
        reservedDemoUnits: args.reservedDemoUnits,
        usedUnits: budget.usedUnits + args.requestedUnits,
        updatedAt: now,
      });
    } else if (budgetExhausted && circuit.state !== "closed") {
      await ctx.db.patch("modelProviderCircuits", circuit._id, {
        probeInFlight: false,
        updatedAt: now,
      });
    }
    await ctx.db.insert("idempotencyRecords", {
      projectId: project._id,
      ...(args.incidentId ? { incidentId: args.incidentId } : {}),
      operationKey: args.operationKey,
      scope: "model_call",
      status: skippedStatus ? "completed" : "in_progress",
      requestHash: args.requestHash,
      result: { modelCallId, status: skippedStatus ?? "started" },
      attempts: 1,
      createdAt: now,
      updatedAt: now,
    });
    if (blockedByCircuit)
      return {
        decision: "skip_circuit_open" as const,
        modelCallId,
        duplicate: false,
      };
    if (budgetExhausted)
      return {
        decision: "skip_budget_exhausted" as const,
        modelCallId,
        duplicate: false,
      };
    return {
      decision: "call_provider" as const,
      modelCallId,
      duplicate: false,
    };
  },
});

export const completeAttempt = internalMutation({
  args: {
    modelCallId: v.id("modelCalls"),
    status: modelCallStatusValidator,
    latencyMs: v.number(),
    outputSchemaValid: v.boolean(),
    output: v.optional(modelOutputValidator),
    errorCode: v.optional(v.string()),
    affectedProductionConfig: v.boolean(),
    humanDecision: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      args.status === "started" ||
      args.status === "cached" ||
      args.status === "budget_exhausted" ||
      args.status === "circuit_open"
    )
      throw new Error("Invalid terminal provider status");
    if (args.latencyMs < 0) throw new Error("latencyMs cannot be negative");
    if (args.status === "success" && (!args.outputSchemaValid || !args.output))
      throw new Error("A successful model call requires schema-valid output");
    if (args.output?.kind === "diagnosis") {
      if (args.output.explanation.length > 600)
        throw new Error("Diagnosis explanation exceeds 600 characters");
      if ((args.output.healPrompt?.length ?? 0) > 900)
        throw new Error("Heal prompt exceeds 900 characters");
      if (args.output.evidenceUsed.length > 10)
        throw new Error("Diagnosis cites more than 10 evidence items");
    }
    if (args.output?.kind === "text" && args.output.text.length > 2_000)
      throw new Error("Text model output exceeds 2000 characters");

    const call = await ctx.db.get("modelCalls", args.modelCallId);
    if (!call) throw new Error("Model call not found");
    if (call.status !== "started") return null;
    const now = Date.now();
    await ctx.db.patch("modelCalls", call._id, {
      status: args.status,
      latencyMs: args.latencyMs,
      outputSchemaValid: args.outputSchemaValid,
      ...(args.output ? { output: args.output } : {}),
      ...(args.errorCode ? { errorCode: args.errorCode } : {}),
      affectedProductionConfig: args.affectedProductionConfig,
      ...(args.humanDecision ? { humanDecision: args.humanDecision } : {}),
      completedAt: now,
    });
    const operation = await ctx.db
      .query("idempotencyRecords")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", call.operationKey),
      )
      .unique();
    if (operation)
      await ctx.db.patch("idempotencyRecords", operation._id, {
        status: args.status === "success" ? "completed" : "failed",
        result: { modelCallId: call._id, status: args.status },
        updatedAt: now,
      });

    const circuit = await ctx.db
      .query("modelProviderCircuits")
      .withIndex("by_provider", (q) => q.eq("provider", call.provider))
      .unique();
    if (circuit) {
      if (args.status === "success") {
        await ctx.db.patch("modelProviderCircuits", circuit._id, {
          state: "closed",
          consecutiveFailures: 0,
          openedAt: undefined,
          cooldownUntil: undefined,
          probeInFlight: false,
          lastFailureCode: undefined,
          updatedAt: now,
        });
      } else {
        const failures = circuit.consecutiveFailures + 1;
        const shouldOpen =
          args.status === "configuration_error" ||
          circuit.state === "half_open" ||
          failures >= circuit.failureThreshold;
        await ctx.db.patch("modelProviderCircuits", circuit._id, {
          state: shouldOpen ? "open" : "closed",
          consecutiveFailures: failures,
          ...(shouldOpen
            ? { openedAt: now, cooldownUntil: now + circuit.cooldownMs }
            : {}),
          probeInFlight: false,
          lastFailureCode: args.errorCode ?? args.status,
          updatedAt: now,
        });
      }
    }
    await ctx.db.insert("auditEvents", {
      projectId: call.projectId,
      actorType: "provider",
      actorId: call.provider,
      action: "model_call.completed",
      targetType: "model_call",
      targetId: String(call._id),
      payload: {
        incidentId: call.incidentId ?? null,
        task: call.task,
        model: call.model,
        fallbackIndex: call.fallbackIndex,
        status: args.status,
        outputSchemaValid: args.outputSchemaValid,
        latencyMs: args.latencyMs,
      },
      createdAt: now,
    });
    return null;
  },
});

export const requestHumanReview = internalMutation({
  args: {
    incidentId: v.id("incidents"),
    workflowRunId: v.optional(v.id("workflowRuns")),
    reason: humanReviewReasonValidator,
    summary: v.string(),
    idempotencyKey: v.string(),
    requestHash: v.string(),
  },
  returns: v.object({
    reviewId: v.id("humanReviews"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (args.summary.length === 0 || args.summary.length > 1_000)
      throw new Error("summary must contain 1-1000 characters");
    const existing = await ctx.db
      .query("humanReviews")
      .withIndex("by_idempotencyKey", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();
    if (existing) return { reviewId: existing._id, duplicate: true };

    const incident = await ctx.db.get("incidents", args.incidentId);
    if (!incident) throw new Error("Incident not found");
    const now = Date.now();
    const reviewId = await ctx.db.insert("humanReviews", {
      projectId: incident.projectId,
      incidentId: incident._id,
      ...(args.workflowRunId ? { workflowRunId: args.workflowRunId } : {}),
      reason: args.reason,
      status: "pending",
      summary: args.summary,
      idempotencyKey: args.idempotencyKey,
      requestedAt: now,
    });
    await ctx.db.insert("idempotencyRecords", {
      projectId: incident.projectId,
      incidentId: incident._id,
      operationKey: args.idempotencyKey,
      scope: "human_review",
      status: "completed",
      requestHash: args.requestHash,
      result: { reviewId },
      attempts: 1,
      createdAt: now,
      updatedAt: now,
    });
    if (incident.state !== "awaiting_human")
      await performIncidentTransition(ctx, {
        incidentId: incident._id,
        toState: "awaiting_human",
        reason: "Sequential provider fallback exhausted",
        actorType: "system",
        idempotencyKey: `${args.idempotencyKey}:incident`,
        requestHash: args.requestHash,
        details: { reviewId, reason: args.reason },
        now,
      });
    await ctx.db.patch("incidents", incident._id, {
      reviewReason: args.summary,
      currentWorkflowStep: "human_review.pending",
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: incident.projectId,
      actorType: "system",
      action: "human_review.requested",
      targetType: "incident",
      targetId: String(incident._id),
      payload: { reviewId, reason: args.reason },
      createdAt: now,
    });
    return { reviewId, duplicate: false };
  },
});
