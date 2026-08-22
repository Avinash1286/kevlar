import { v } from "convex/values";

export const incidentStateValidator = v.union(
  v.literal("detected"),
  v.literal("triaging"),
  v.literal("retrying"),
  v.literal("quarantined"),
  v.literal("diagnosing"),
  v.literal("healing"),
  v.literal("awaiting_preview"),
  v.literal("awaiting_human"),
  v.literal("approved"),
  v.literal("certifying"),
  v.literal("resolved"),
  v.literal("failed"),
);

export const triageClassificationValidator = v.union(
  v.literal("structural_drift"),
  v.literal("semantic_swap"),
  v.literal("render_timing"),
  v.literal("transport_failure"),
  v.literal("soft_block"),
  v.literal("legitimate_empty"),
  v.literal("dead_page"),
  v.literal("ab_variant"),
  v.literal("unknown"),
);

export const triageActionValidator = v.union(
  v.literal("heal"),
  v.literal("retry"),
  v.literal("quarantine"),
  v.literal("do_not_heal"),
  v.literal("gather_evidence"),
  v.literal("mark_dead"),
  v.literal("human_review"),
);

export const confidenceSourceValidator = v.union(
  v.literal("deterministic_evidence"),
  v.literal("ai_residue"),
  v.literal("human_review"),
);

export const workflowKindValidator = v.union(
  v.literal("incident_triage"),
  v.literal("repeated_fetch"),
  v.literal("provider_fallback"),
  v.literal("repair"),
  v.literal("certification"),
);

export const workflowStatusValidator = v.union(
  v.literal("running"),
  v.literal("awaiting_retry"),
  v.literal("awaiting_human"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("canceled"),
);

export const workflowEventTypeValidator = v.union(
  v.literal("started"),
  v.literal("step_started"),
  v.literal("poll_pending"),
  v.literal("retry_scheduled"),
  v.literal("resumed"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("human_review_requested"),
  v.literal("canceled"),
);

export const idempotencyScopeValidator = v.union(
  v.literal("incident"),
  v.literal("workflow"),
  v.literal("model_call"),
  v.literal("human_review"),
  v.literal("external_call"),
);

export const idempotencyStatusValidator = v.union(
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("failed"),
);

export const modelTaskValidator = v.union(
  v.literal("incident.classify_residue"),
  v.literal("heal.compose_prompt"),
  v.literal("incident.explain"),
  v.literal("tribunal.vision_evidence"),
);

export const modelCallStatusValidator = v.union(
  v.literal("started"),
  v.literal("success"),
  v.literal("cached"),
  v.literal("timeout"),
  v.literal("rate_limited"),
  v.literal("provider_error"),
  v.literal("invalid_schema"),
  v.literal("configuration_error"),
  v.literal("budget_exhausted"),
  v.literal("circuit_open"),
);

export const circuitStateValidator = v.union(
  v.literal("closed"),
  v.literal("open"),
  v.literal("half_open"),
);

export const humanReviewReasonValidator = v.union(
  v.literal("all_providers_failed"),
  v.literal("ambiguous_evidence"),
  v.literal("provider_budget_exhausted"),
  v.literal("provider_circuit_open"),
  v.literal("unknown_classification"),
);

export const humanReviewStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("canceled"),
);

export const diagnosisActionValidator = v.union(
  v.literal("heal"),
  v.literal("retry"),
  v.literal("quarantine"),
  v.literal("do_not_heal"),
  v.literal("human_review"),
);

export const modelOutputValidator = v.union(
  v.object({
    kind: v.literal("diagnosis"),
    failureType: triageClassificationValidator,
    recommendedAction: diagnosisActionValidator,
    explanation: v.string(),
    healPrompt: v.optional(v.string()),
    evidenceUsed: v.array(v.string()),
  }),
  v.object({
    kind: v.literal("text"),
    text: v.string(),
  }),
);

export const actorTypeValidator = v.union(
  v.literal("user"),
  v.literal("system"),
  v.literal("provider"),
);
