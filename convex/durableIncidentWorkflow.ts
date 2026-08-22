import {
  type WorkflowId,
  WorkflowManager,
  getStatus,
  vResultValidator,
  vWorkflowId,
} from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";

export const workflowManager = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    defaultRetryBehavior: {
      maxAttempts: 3,
      initialBackoffMs: 100,
      base: 2,
    },
    retryActionsByDefault: true,
    maxParallelism: 10,
  },
});

export const transportRecovery = workflowManager
  .define({
    args: { workflowRunId: v.id("workflowRuns") },
    returns: v.object({ workflowRunId: v.id("workflowRuns") }),
  })
  .handler(
    async (
      step,
      args,
    ): Promise<{ workflowRunId: typeof args.workflowRunId }> => {
      await step.runMutation(
        internal.workflows.markDurableTransientFailure,
        { workflowRunId: args.workflowRunId },
        { name: "record-transient-failure" },
      );
      await step.sleep(100, { name: "transport-backoff" });
      await step.runMutation(
        internal.workflows.markDurableResumeSuccess,
        { workflowRunId: args.workflowRunId },
        { name: "record-resume-success" },
      );
      return { workflowRunId: args.workflowRunId };
    },
  );

export const handleComplete = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ workflowRunId: v.id("workflowRuns") }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(
      "workflowRuns",
      args.context.workflowRunId,
    );
    if (!workflow || workflow.durableWorkflowId !== args.workflowId)
      throw new Error("Durable workflow audit link mismatch");
    const now = Date.now();
    const status =
      args.result.kind === "success"
        ? ("completed" as const)
        : args.result.kind === "canceled"
          ? ("canceled" as const)
          : ("failed" as const);
    const eventSequence = workflow.eventSequence + 1;
    await ctx.db.patch("workflowRuns", workflow._id, {
      status,
      currentStep: "component.transport.complete",
      eventSequence,
      updatedAt: now,
      completedAt: now,
      ...(args.result.kind === "failed"
        ? { lastError: args.result.error }
        : {}),
    });
    await ctx.db.insert("workflowEvents", {
      projectId: workflow.projectId,
      incidentId: workflow.incidentId,
      workflowRunId: workflow._id,
      sequence: eventSequence,
      eventType:
        status === "completed"
          ? "completed"
          : status === "canceled"
            ? "canceled"
            : "failed",
      step: "component.transport.complete",
      fromStatus: workflow.status,
      toStatus: status,
      details: { durableWorkflowId: args.workflowId, result: args.result },
      createdAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: workflow.projectId,
      actorType: "system",
      action: `workflow.component.${status}`,
      targetType: "workflow",
      targetId: String(workflow._id),
      payload: { durableWorkflowId: args.workflowId, result: args.result },
      createdAt: now,
    });
    return null;
  },
});

export const startTransportRecovery = internalMutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    incidentId: v.id("incidents"),
  },
  returns: v.object({
    durableWorkflowId: vWorkflowId,
    duplicate: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    durableWorkflowId: WorkflowId;
    duplicate: boolean;
  }> => {
    const workflow = await ctx.db.get("workflowRuns", args.workflowRunId);
    if (!workflow || workflow.incidentId !== args.incidentId)
      throw new Error("Workflow audit record does not match incident");
    if (workflow.durableWorkflowId)
      return {
        durableWorkflowId: workflow.durableWorkflowId as WorkflowId,
        duplicate: true,
      };

    const durableWorkflowId = await workflowManager.start(
      ctx,
      internal.durableIncidentWorkflow.transportRecovery,
      { workflowRunId: workflow._id },
      {
        startAsync: true,
        onComplete: internal.durableIncidentWorkflow.handleComplete,
        context: { workflowRunId: workflow._id },
      },
    );
    const now = Date.now();
    const sequence = workflow.eventSequence + 1;
    await ctx.db.patch("workflowRuns", workflow._id, {
      durableWorkflowId,
      status: "running",
      currentStep: "component.transport.queued",
      eventSequence: sequence,
      nextResumeAt: undefined,
      updatedAt: now,
    });
    await ctx.db.insert("workflowEvents", {
      projectId: workflow.projectId,
      incidentId: workflow.incidentId,
      workflowRunId: workflow._id,
      sequence,
      eventType: "step_started",
      step: "component.transport.queued",
      fromStatus: workflow.status,
      toStatus: "running",
      details: { durableWorkflowId },
      createdAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: workflow.projectId,
      actorType: "system",
      action: "workflow.component.started",
      targetType: "workflow",
      targetId: String(workflow._id),
      payload: { durableWorkflowId },
      createdAt: now,
    });
    return { durableWorkflowId, duplicate: false };
  },
});

export const durableStatus = internalQuery({
  args: { durableWorkflowId: vWorkflowId },
  returns: v.object({
    type: v.union(
      v.literal("inProgress"),
      v.literal("completed"),
      v.literal("canceled"),
      v.literal("failed"),
    ),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    type: "inProgress" | "completed" | "canceled" | "failed";
  }> => {
    const status = await getStatus(
      ctx,
      components.workflow,
      args.durableWorkflowId,
    );
    return { type: status.type };
  },
});
