import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { performIncidentTransition } from "./incidentStateMachine";
import {
  workflowKindValidator,
  workflowStatusValidator,
} from "./phase3Validators";

/**
 * Persistence adapter for a durable orchestrator, not a replacement job queue.
 * It performs no external I/O and schedules no work. A future
 * `@convex-dev/workflow` function should own execution and call these mutations
 * to record resumable poll/retry state and the auditable incident timeline.
 */

type WorkflowStatus = Doc<"workflowRuns">["status"];
type WorkflowEventType = Doc<"workflowEvents">["eventType"];

function retryDelay(workflow: Doc<"workflowRuns">): number {
  const exponential =
    workflow.baseRetryDelayMs * 2 ** Math.max(0, workflow.attempt - 1);
  return Math.min(exponential, workflow.maxRetryDelayMs);
}

async function appendWorkflowEvent(
  ctx: MutationCtx,
  args: {
    workflow: Doc<"workflowRuns">;
    eventType: WorkflowEventType;
    step: string;
    fromStatus: WorkflowStatus | null;
    toStatus: WorkflowStatus;
    details: unknown;
    now: number;
  },
) {
  const sequence = args.workflow.eventSequence + 1;
  await ctx.db.insert("workflowEvents", {
    projectId: args.workflow.projectId,
    incidentId: args.workflow.incidentId,
    workflowRunId: args.workflow._id,
    sequence,
    eventType: args.eventType,
    step: args.step,
    fromStatus: args.fromStatus,
    toStatus: args.toStatus,
    details: args.details,
    createdAt: args.now,
  });
  await ctx.db.patch("workflowRuns", args.workflow._id, {
    eventSequence: sequence,
  });
  await ctx.db.insert("auditEvents", {
    projectId: args.workflow.projectId,
    actorType: "system",
    action: `workflow.${args.eventType}`,
    targetType: "workflow",
    targetId: String(args.workflow._id),
    payload: {
      incidentId: args.workflow.incidentId,
      fromStatus: args.fromStatus,
      toStatus: args.toStatus,
      step: args.step,
      sequence,
      details: args.details,
    },
    createdAt: args.now,
  });
}

export const startIncidentWorkflow = internalMutation({
  args: {
    incidentId: v.id("incidents"),
    kind: workflowKindValidator,
    initialStep: v.string(),
    maxAttempts: v.number(),
    timeoutMs: v.number(),
    baseRetryDelayMs: v.number(),
    maxRetryDelayMs: v.number(),
    idempotencyKey: v.string(),
    requestHash: v.string(),
  },
  returns: v.object({
    workflowRunId: v.id("workflowRuns"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (
      !Number.isInteger(args.maxAttempts) ||
      args.maxAttempts < 1 ||
      args.maxAttempts > 20
    )
      throw new Error("maxAttempts must be an integer between 1 and 20");
    if (args.timeoutMs < 1_000 || args.timeoutMs > 86_400_000)
      throw new Error("timeoutMs must be between 1 second and 24 hours");
    if (
      args.baseRetryDelayMs < 100 ||
      args.maxRetryDelayMs < args.baseRetryDelayMs ||
      args.maxRetryDelayMs > 3_600_000
    )
      throw new Error("Invalid retry delay policy");
    if (args.initialStep.length === 0 || args.initialStep.length > 120)
      throw new Error("initialStep must contain 1-120 characters");

    const existing = await ctx.db
      .query("workflowRuns")
      .withIndex("by_idempotencyKey", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();
    if (existing) return { workflowRunId: existing._id, duplicate: true };

    const operation = await ctx.db
      .query("idempotencyRecords")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.idempotencyKey),
      )
      .unique();
    if (operation)
      throw new Error("Idempotency key was already used for another operation");
    const incident = await ctx.db.get("incidents", args.incidentId);
    if (!incident) throw new Error("Incident not found");

    const now = Date.now();
    const workflowRunId = await ctx.db.insert("workflowRuns", {
      projectId: incident.projectId,
      incidentId: incident._id,
      kind: args.kind,
      status: "running",
      currentStep: args.initialStep,
      attempt: 1,
      maxAttempts: args.maxAttempts,
      baseRetryDelayMs: args.baseRetryDelayMs,
      maxRetryDelayMs: args.maxRetryDelayMs,
      deadlineAt: now + args.timeoutMs,
      idempotencyKey: args.idempotencyKey,
      eventSequence: 0,
      createdAt: now,
      updatedAt: now,
    });
    const workflow = await ctx.db.get("workflowRuns", workflowRunId);
    if (!workflow) throw new Error("Unable to create workflow");
    await ctx.db.insert("workflowEvents", {
      projectId: incident.projectId,
      incidentId: incident._id,
      workflowRunId,
      sequence: 0,
      eventType: "started",
      step: args.initialStep,
      fromStatus: null,
      toStatus: "running",
      details: { kind: args.kind, maxAttempts: args.maxAttempts },
      createdAt: now,
    });
    await ctx.db.insert("idempotencyRecords", {
      projectId: incident.projectId,
      incidentId: incident._id,
      operationKey: args.idempotencyKey,
      scope: "workflow",
      status: "completed",
      requestHash: args.requestHash,
      result: { workflowRunId },
      attempts: 1,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch("incidents", incident._id, {
      currentWorkflowStep: args.initialStep,
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: incident.projectId,
      actorType: "system",
      action: "workflow.started",
      targetType: "workflow",
      targetId: String(workflowRunId),
      payload: {
        incidentId: incident._id,
        kind: args.kind,
        initialStep: args.initialStep,
        idempotencyKey: args.idempotencyKey,
      },
      createdAt: now,
    });
    return { workflowRunId, duplicate: false };
  },
});

const pollOutcomeValidator = v.union(
  v.literal("pending"),
  v.literal("succeeded"),
  v.literal("retryable_failure"),
  v.literal("permanent_failure"),
  v.literal("requires_human"),
);

export const recordPollOutcome = internalMutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    step: v.string(),
    outcome: pollOutcomeValidator,
    retryAfterMs: v.optional(v.number()),
    error: v.optional(v.string()),
    details: v.any(),
    idempotencyKey: v.string(),
    requestHash: v.string(),
  },
  returns: v.object({
    duplicate: v.boolean(),
    status: workflowStatusValidator,
    nextResumeAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const operation = await ctx.db
      .query("idempotencyRecords")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.idempotencyKey),
      )
      .unique();
    const workflow = await ctx.db.get("workflowRuns", args.workflowRunId);
    if (!workflow) throw new Error("Workflow not found");
    if (operation) {
      if (operation.requestHash !== args.requestHash)
        throw new Error("Idempotency key was already used for another request");
      return {
        duplicate: true,
        status: workflow.status,
        nextResumeAt: workflow.nextResumeAt ?? null,
      };
    }
    if (workflow.status !== "running")
      throw new Error(`Cannot record a poll outcome while ${workflow.status}`);
    if (args.step.length === 0 || args.step.length > 120)
      throw new Error("step must contain 1-120 characters");

    const now = Date.now();
    const exhausted =
      now >= workflow.deadlineAt || workflow.attempt >= workflow.maxAttempts;
    let status: WorkflowStatus;
    let eventType: WorkflowEventType;
    let nextResumeAt: number | null = null;
    if (args.outcome === "succeeded") {
      status = "completed";
      eventType = "completed";
    } else if (args.outcome === "requires_human") {
      status = "awaiting_human";
      eventType = "human_review_requested";
    } else if (args.outcome === "permanent_failure" || exhausted) {
      status = "failed";
      eventType = "failed";
    } else {
      const requestedDelay = args.retryAfterMs ?? retryDelay(workflow);
      const delay = Math.min(
        Math.max(requestedDelay, workflow.baseRetryDelayMs),
        workflow.maxRetryDelayMs,
      );
      nextResumeAt = now + delay;
      status = "awaiting_retry";
      eventType =
        args.outcome === "pending" ? "poll_pending" : "retry_scheduled";
    }

    await ctx.db.patch("workflowRuns", workflow._id, {
      status,
      currentStep: args.step,
      ...(nextResumeAt === null
        ? { nextResumeAt: undefined }
        : { nextResumeAt }),
      ...(args.error ? { lastError: args.error } : {}),
      updatedAt: now,
      ...(status === "completed" || status === "failed"
        ? { completedAt: now }
        : {}),
    });
    await appendWorkflowEvent(ctx, {
      workflow,
      eventType,
      step: args.step,
      fromStatus: workflow.status,
      toStatus: status,
      details: {
        outcome: args.outcome,
        error: args.error ?? null,
        nextResumeAt,
        payload: args.details,
      },
      now,
    });
    await ctx.db.insert("idempotencyRecords", {
      projectId: workflow.projectId,
      incidentId: workflow.incidentId,
      operationKey: args.idempotencyKey,
      scope: "workflow",
      status: "completed",
      requestHash: args.requestHash,
      result: { workflowRunId: workflow._id, status, nextResumeAt },
      attempts: 1,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch("incidents", workflow.incidentId, {
      currentWorkflowStep: args.step,
      updatedAt: now,
    });

    const incident = await ctx.db.get("incidents", workflow.incidentId);
    if (!incident) throw new Error("Workflow incident not found");
    if (status === "awaiting_human" && incident.state !== "awaiting_human") {
      await performIncidentTransition(ctx, {
        incidentId: incident._id,
        toState: "awaiting_human",
        reason: "Workflow requires human review",
        actorType: "system",
        idempotencyKey: `${args.idempotencyKey}:incident`,
        requestHash: args.requestHash,
        details: { workflowRunId: workflow._id },
        now,
      });
    } else if (status === "failed" && incident.state !== "failed") {
      await performIncidentTransition(ctx, {
        incidentId: incident._id,
        toState: "failed",
        reason: "Workflow retry cap or deadline was exhausted",
        actorType: "system",
        idempotencyKey: `${args.idempotencyKey}:incident`,
        requestHash: args.requestHash,
        details: { workflowRunId: workflow._id, error: args.error ?? null },
        now,
      });
    }

    return { duplicate: false, status, nextResumeAt };
  },
});

export const claimDueWorkflows = internalMutation({
  args: { now: v.number(), limit: v.number() },
  returns: v.array(
    v.object({
      workflowRunId: v.id("workflowRuns"),
      incidentId: v.id("incidents"),
      kind: workflowKindValidator,
      step: v.string(),
      attempt: v.number(),
      deadlineAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 25)
      throw new Error("limit must be an integer between 1 and 25");
    const due = await ctx.db
      .query("workflowRuns")
      .withIndex("by_status_and_nextResumeAt", (q) =>
        q.eq("status", "awaiting_retry").lte("nextResumeAt", args.now),
      )
      .take(args.limit);
    const claimed = [];
    for (const workflow of due) {
      if (
        workflow.attempt >= workflow.maxAttempts ||
        args.now >= workflow.deadlineAt
      ) {
        await ctx.db.patch("workflowRuns", workflow._id, {
          status: "failed",
          nextResumeAt: undefined,
          lastError: "retry_cap_or_deadline_exhausted",
          updatedAt: args.now,
          completedAt: args.now,
        });
        await appendWorkflowEvent(ctx, {
          workflow,
          eventType: "failed",
          step: workflow.currentStep,
          fromStatus: workflow.status,
          toStatus: "failed",
          details: { reason: "retry_cap_or_deadline_exhausted" },
          now: args.now,
        });
        continue;
      }
      const attempt = workflow.attempt + 1;
      await ctx.db.patch("workflowRuns", workflow._id, {
        status: "running",
        attempt,
        nextResumeAt: undefined,
        updatedAt: args.now,
      });
      await appendWorkflowEvent(ctx, {
        workflow,
        eventType: "resumed",
        step: workflow.currentStep,
        fromStatus: workflow.status,
        toStatus: "running",
        details: { attempt },
        now: args.now,
      });
      claimed.push({
        workflowRunId: workflow._id,
        incidentId: workflow.incidentId,
        kind: workflow.kind,
        step: workflow.currentStep,
        attempt,
        deadlineAt: workflow.deadlineAt,
      });
    }
    return claimed;
  },
});

export const recoverStuckWorkflows = internalMutation({
  args: { now: v.number(), staleBefore: v.number(), limit: v.number() },
  returns: v.object({ retried: v.number(), failed: v.number() }),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 25)
      throw new Error("limit must be an integer between 1 and 25");
    const stuck = await ctx.db
      .query("workflowRuns")
      .withIndex("by_status_and_updatedAt", (q) =>
        q.eq("status", "running").lte("updatedAt", args.staleBefore),
      )
      .take(args.limit);
    let retried = 0;
    let failed = 0;
    for (const workflow of stuck) {
      const exhausted =
        workflow.attempt >= workflow.maxAttempts ||
        args.now >= workflow.deadlineAt;
      const status: WorkflowStatus = exhausted ? "failed" : "awaiting_retry";
      const nextResumeAt = exhausted
        ? undefined
        : args.now + retryDelay(workflow);
      await ctx.db.patch("workflowRuns", workflow._id, {
        status,
        ...(nextResumeAt === undefined
          ? { nextResumeAt: undefined, completedAt: args.now }
          : { nextResumeAt }),
        lastError: "stuck_job_detected",
        updatedAt: args.now,
      });
      await appendWorkflowEvent(ctx, {
        workflow,
        eventType: exhausted ? "failed" : "retry_scheduled",
        step: workflow.currentStep,
        fromStatus: workflow.status,
        toStatus: status,
        details: {
          reason: "stuck_job_detected",
          nextResumeAt: nextResumeAt ?? null,
        },
        now: args.now,
      });
      if (exhausted) failed += 1;
      else retried += 1;
    }
    return { retried, failed };
  },
});

async function recordDurableBookkeeping(
  ctx: MutationCtx,
  args: {
    workflowRunId: Id<"workflowRuns">;
    stage: "transient_failure" | "resume_success";
  },
): Promise<{ duplicate: boolean }> {
  const operationKey = `durable:${args.workflowRunId}:${args.stage}`;
  const existing = await ctx.db
    .query("idempotencyRecords")
    .withIndex("by_operationKey", (q) => q.eq("operationKey", operationKey))
    .unique();
  if (existing) return { duplicate: true };

  const workflow = await ctx.db.get("workflowRuns", args.workflowRunId);
  if (!workflow) throw new Error("Workflow audit record not found");
  const now = Date.now();
  const sequence = workflow.eventSequence + 1;
  const resumed = args.stage === "resume_success";
  const status: WorkflowStatus = resumed ? "running" : "awaiting_retry";
  const stepName = resumed
    ? "component.transport.resume_success"
    : "component.transport.transient_failure";
  await ctx.db.patch("workflowRuns", workflow._id, {
    status,
    currentStep: stepName,
    eventSequence: sequence,
    ...(resumed
      ? { nextResumeAt: undefined }
      : { nextResumeAt: now + 100, lastError: "transient_transport_failure" }),
    updatedAt: now,
  });
  await ctx.db.insert("workflowEvents", {
    projectId: workflow.projectId,
    incidentId: workflow.incidentId,
    workflowRunId: workflow._id,
    sequence,
    eventType: resumed ? "resumed" : "retry_scheduled",
    step: stepName,
    fromStatus: workflow.status,
    toStatus: status,
    details: { durable: true, operationKey },
    createdAt: now,
  });
  await ctx.db.insert("idempotencyRecords", {
    projectId: workflow.projectId,
    incidentId: workflow.incidentId,
    operationKey,
    scope: "workflow",
    status: "completed",
    requestHash: operationKey,
    result: { workflowRunId: workflow._id, stage: args.stage },
    attempts: 1,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("auditEvents", {
    projectId: workflow.projectId,
    actorType: "system",
    action: `workflow.component.${args.stage}`,
    targetType: "workflow",
    targetId: String(workflow._id),
    payload: { operationKey, durableWorkflowId: workflow.durableWorkflowId },
    createdAt: now,
  });
  return { duplicate: false };
}

export const markDurableTransientFailure = internalMutation({
  args: { workflowRunId: v.id("workflowRuns") },
  returns: v.object({ duplicate: v.boolean() }),
  handler: async (ctx, args) =>
    await recordDurableBookkeeping(ctx, {
      workflowRunId: args.workflowRunId,
      stage: "transient_failure",
    }),
});

export const markDurableResumeSuccess = internalMutation({
  args: { workflowRunId: v.id("workflowRuns") },
  returns: v.object({ duplicate: v.boolean() }),
  handler: async (ctx, args) =>
    await recordDurableBookkeeping(ctx, {
      workflowRunId: args.workflowRunId,
      stage: "resume_success",
    }),
});
