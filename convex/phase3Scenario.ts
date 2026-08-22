import { v } from "convex/values";
import { type WorkflowId, vWorkflowId } from "@convex-dev/workflow";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import {
  triageActionValidator,
  triageClassificationValidator,
} from "./phase3Validators";

const scenarioValidator = v.union(
  v.literal("semantic_swap"),
  v.literal("transport_failure"),
  v.literal("soft_block"),
  v.literal("legitimate_empty"),
  v.literal("all_provider_failure"),
);

const resultValidator = v.object({
  scenarioRunId: v.id("runs"),
  incidentId: v.id("incidents"),
  incidentDuplicate: v.boolean(),
  classification: triageClassificationValidator,
  recommendedAction: triageActionValidator,
  workflowRunId: v.union(v.id("workflowRuns"), v.null()),
  durableWorkflowId: v.union(vWorkflowId, v.null()),
  durableWorkflowStatus: v.union(
    v.literal("inProgress"),
    v.literal("completed"),
    v.literal("canceled"),
    v.literal("failed"),
    v.null(),
  ),
  modelCallIds: v.array(v.id("modelCalls")),
  reviewId: v.union(v.id("humanReviews"), v.null()),
});

/**
 * Bounded demonstration driver only. Production multi-step execution belongs
 * in @convex-dev/workflow; this action exercises the persistence contracts so
 * CLI/browser scenarios can prove idempotency and fallback behavior today.
 */
export const run = action({
  args: {
    ingestKey: v.string(),
    failingRunId: v.id("runs"),
    scenario: scenarioValidator,
    scenarioKey: v.string(),
  },
  returns: resultValidator,
  handler: async (ctx, args) => {
    const expectedKey = process.env.KEVLAR_BASELINE_INGEST_KEY;
    if (!expectedKey || args.ingestKey !== expectedKey)
      throw new Error("Unauthorized Phase 3 scenario");
    if (args.scenarioKey.length === 0 || args.scenarioKey.length > 120)
      throw new Error("scenarioKey must contain 1-120 characters");

    const scenarioRun: { runId: Id<"runs">; duplicate: boolean } =
      await ctx.runMutation(internal.phase3Support.ensureScenarioRun, {
        sourceRunId: args.failingRunId,
        scenarioKey: args.scenarioKey,
        scenario: args.scenario,
      });

    const incidentResult: {
      incidentId: Id<"incidents">;
      duplicate: boolean;
    } = await ctx.runMutation(internal.incidents.createIncident, {
      failingRunId: scenarioRun.runId,
      failureSummary: `Phase 3 ${args.scenario} reliability scenario`,
      operationKey: `scenario:${args.scenarioKey}:incident`,
      requestHash: `scenario:${args.scenarioKey}:${scenarioRun.runId}`,
    });

    const commonSignals = {
      incidentId: incidentResult.incidentId,
      runId: scenarioRun.runId,
      httpStatus: 200,
      pageState: "ok" as const,
      softBlockDetected: false,
      rowCount: 1,
      criticalFieldMissing: false,
      optionalFieldExpectedEmpty: false,
      fieldEqualsMonthlyPayment: false,
      independentSourcesSupportBaseline: false,
      domFingerprintChanged: false,
      delayedFieldAppeared: false,
      repeatedDomFingerprints: ["stable"],
      idempotencyKey: `scenario:${args.scenarioKey}:triage`,
      requestHash: `scenario:${args.scenarioKey}:triage:${args.scenario}`,
    };
    const scenarioSignals =
      args.scenario === "semantic_swap"
        ? {
            ...commonSignals,
            fieldEqualsMonthlyPayment: true,
            independentSourcesSupportBaseline: true,
          }
        : args.scenario === "transport_failure"
          ? {
              ...commonSignals,
              httpStatus: 503,
              transportError: "server_error" as const,
              rowCount: 0,
            }
          : args.scenario === "soft_block"
            ? {
                ...commonSignals,
                httpStatus: 403,
                pageState: "blocked" as const,
                softBlockDetected: true,
                rowCount: 0,
              }
            : args.scenario === "legitimate_empty"
              ? {
                  ...commonSignals,
                  pageState: "empty" as const,
                  rowCount: 0,
                  optionalFieldExpectedEmpty: true,
                }
              : {
                  ...commonSignals,
                  pageState: "unknown" as const,
                  criticalFieldMissing: true,
                  rowCount: 0,
                  repeatedDomFingerprints: ["unknown-a"],
                };

    const triageResult: {
      classification:
        | "structural_drift"
        | "semantic_swap"
        | "render_timing"
        | "transport_failure"
        | "soft_block"
        | "legitimate_empty"
        | "dead_page"
        | "ab_variant"
        | "unknown";
      recommendedAction:
        | "heal"
        | "retry"
        | "quarantine"
        | "do_not_heal"
        | "gather_evidence"
        | "mark_dead"
        | "human_review";
    } = await ctx.runMutation(
      internal.triage.classifyDeterministically,
      scenarioSignals,
    );

    let workflowRunId: Id<"workflowRuns"> | null = null;
    let durableWorkflowId: WorkflowId | null = null;
    let durableWorkflowStatus:
      "inProgress" | "completed" | "canceled" | "failed" | null = null;
    const modelCallIds: Id<"modelCalls">[] = [];
    let reviewId: Id<"humanReviews"> | null = null;
    if (
      args.scenario === "transport_failure" ||
      args.scenario === "all_provider_failure"
    ) {
      const workflow: { workflowRunId: Id<"workflowRuns"> } =
        await ctx.runMutation(internal.workflows.startIncidentWorkflow, {
          incidentId: incidentResult.incidentId,
          kind:
            args.scenario === "transport_failure"
              ? "incident_triage"
              : "provider_fallback",
          initialStep:
            args.scenario === "transport_failure"
              ? "collector.poll"
              : "model_router.primary",
          maxAttempts: 4,
          timeoutMs: 300_000,
          baseRetryDelayMs: 1_000,
          maxRetryDelayMs: 30_000,
          idempotencyKey: `scenario:${args.scenarioKey}:workflow`,
          requestHash: `scenario:${args.scenarioKey}:workflow:${args.scenario}`,
        });
      workflowRunId = workflow.workflowRunId;
    }

    if (args.scenario === "transport_failure" && workflowRunId) {
      const durable: {
        durableWorkflowId: WorkflowId;
        duplicate: boolean;
      } = await ctx.runMutation(
        internal.durableIncidentWorkflow.startTransportRecovery,
        {
          workflowRunId,
          incidentId: incidentResult.incidentId,
        },
      );
      durableWorkflowId = durable.durableWorkflowId;
      const status: {
        type: "inProgress" | "completed" | "canceled" | "failed";
      } = await ctx.runQuery(internal.durableIncidentWorkflow.durableStatus, {
        durableWorkflowId,
      });
      durableWorkflowStatus = status.type;
    }

    if (args.scenario === "all_provider_failure" && workflowRunId) {
      const providers = [
        ["primary", "fast-text-v1"],
        ["secondary", "reliable-text-v1"],
        ["tertiary", "fallback-text-v1"],
      ] as const;
      const budgetDate = new Date().toISOString().slice(0, 10);
      for (
        let fallbackIndex = 0;
        fallbackIndex < providers.length;
        fallbackIndex += 1
      ) {
        const [provider, model] = providers[fallbackIndex];
        const operationKey = `scenario:${args.scenarioKey}:model:${fallbackIndex}`;
        const prepared: {
          modelCallId: Id<"modelCalls">;
          decision:
            | "call_provider"
            | "use_cache"
            | "skip_circuit_open"
            | "skip_budget_exhausted";
        } = await ctx.runMutation(internal.modelRouter.prepareAttempt, {
          projectId: (await ctx.runQuery(
            internal.phase3Support.projectForIncident,
            {
              incidentId: incidentResult.incidentId,
            },
          )) as Id<"projects">,
          incidentId: incidentResult.incidentId,
          workflowRunId,
          task: "incident.classify_residue",
          provider,
          model,
          fallbackIndex,
          inputHash: `scenario:${args.scenarioKey}:evidence`,
          cacheKey: `scenario:${args.scenarioKey}:provider:${fallbackIndex}`,
          budgetDate,
          requestedUnits: 1,
          dailyLimitUnits: 100,
          reservedDemoUnits: 30,
          isDemoCall: true,
          failureThreshold: 3,
          cooldownMs: 60_000,
          modelRegistryRevision: "scenario-v1",
          promptTemplateRevision: "isolated-evidence-v1",
          promptIsolationApplied: true,
          operationKey,
          requestHash: operationKey,
        });
        modelCallIds.push(prepared.modelCallId);
        if (prepared.decision === "call_provider") {
          await ctx.runMutation(internal.modelRouter.completeAttempt, {
            modelCallId: prepared.modelCallId,
            status: "provider_error",
            latencyMs: 25,
            outputSchemaValid: false,
            errorCode: "simulated_provider_failure",
            affectedProductionConfig: false,
          });
        }
      }
      const review: { reviewId: Id<"humanReviews"> } = await ctx.runMutation(
        internal.modelRouter.requestHumanReview,
        {
          incidentId: incidentResult.incidentId,
          workflowRunId,
          reason: "all_providers_failed",
          summary:
            "All sequential model providers failed; deterministic release remains blocked.",
          idempotencyKey: `scenario:${args.scenarioKey}:human-review`,
          requestHash: `scenario:${args.scenarioKey}:human-review`,
        },
      );
      reviewId = review.reviewId;
    }

    return {
      scenarioRunId: scenarioRun.runId,
      incidentId: incidentResult.incidentId,
      incidentDuplicate: incidentResult.duplicate,
      classification: triageResult.classification,
      recommendedAction: triageResult.recommendedAction,
      workflowRunId,
      durableWorkflowId,
      durableWorkflowStatus,
      modelCallIds,
      reviewId,
    };
  },
});
