import { v } from "convex/values";

export const sourceTypeValidator = v.union(
  v.literal("pricing"),
  v.literal("catalog"),
  v.literal("documentation"),
  v.literal("changelog"),
);

export const sourceApprovalValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
);

export const sourceLifecycleValidator = v.union(
  v.literal("draft"),
  v.literal("onboarding"),
  v.literal("active"),
  v.literal("paused"),
  v.literal("retired"),
);

export const bindingLifecycleValidator = v.union(
  v.literal("draft"),
  v.literal("onboarding"),
  v.literal("active"),
  v.literal("cooling"),
  v.literal("failing"),
  v.literal("paused"),
  v.literal("disabled"),
);

export const onboardingStatusValidator = v.union(
  v.literal("created"),
  v.literal("policy_review"),
  v.literal("core_verification"),
  v.literal("ready_to_bind"),
  v.literal("active"),
  v.literal("rejected"),
  v.literal("failed"),
);

export const sourceHealthStateValidator = v.union(
  v.literal("healthy"),
  v.literal("cooling"),
  v.literal("failing"),
);

export const queueStateValidator = v.union(
  v.literal("due"),
  v.literal("leased"),
  v.literal("canceled"),
);

export const leaseStatusValidator = v.union(
  v.literal("active"),
  v.literal("released"),
  v.literal("expired"),
);

export const fleetOutcomeValidator = v.union(
  v.literal("success"),
  v.literal("failure"),
  v.literal("quarantined"),
);

export const tokenPriceValidator = v.object({
  amount: v.number(),
  currency: v.literal("USD"),
  denominator: v.union(
    v.literal("million_input_tokens"),
    v.literal("million_output_tokens"),
  ),
  original: v.object({ value: v.string(), unit: v.string() }),
});

export const aiInfrastructureRecordValidator = v.union(
  v.object({
    kind: v.literal("pricing"),
    provider_model_id: v.string(),
    display_name: v.string(),
    plan: v.string(),
    input_price: tokenPriceValidator,
    output_price: tokenPriceValidator,
    region: v.union(v.string(), v.null()),
  }),
  v.object({
    kind: v.literal("model"),
    provider_model_id: v.string(),
    display_name: v.string(),
    family: v.string(),
    lifecycle_status: v.union(
      v.literal("preview"),
      v.literal("active"),
      v.literal("deprecated"),
      v.literal("retired"),
      v.literal("unknown"),
    ),
    modalities: v.array(
      v.union(
        v.literal("text"),
        v.literal("image"),
        v.literal("audio"),
        v.literal("video"),
      ),
    ),
    context_window_tokens: v.union(v.number(), v.null()),
    max_output_tokens: v.union(v.number(), v.null()),
    capabilities: v.object({
      tools: v.boolean(),
      structured_output: v.boolean(),
      vision: v.boolean(),
      audio: v.boolean(),
    }),
  }),
  v.object({
    kind: v.literal("notice"),
    notice_id: v.string(),
    title: v.string(),
    notice_type: v.union(
      v.literal("launch"),
      v.literal("update"),
      v.literal("migration"),
      v.literal("deprecation"),
      v.literal("retirement"),
    ),
    published_at: v.union(v.string(), v.null()),
    effective_at: v.union(v.string(), v.null()),
    affected_models: v.array(v.string()),
    summary: v.string(),
  }),
);

export const aiInfrastructureObservationValidator = v.object({
  schema_version: v.literal("ai-infrastructure.source.v1"),
  source_type: sourceTypeValidator,
  source_url: v.string(),
  captured_at: v.string(),
  provider: v.object({ id: v.string(), name: v.string() }),
  records: v.array(aiInfrastructureRecordValidator),
  evidence: v.object({
    page_heading: v.string(),
    contexts: v.array(v.string()),
    screenshot_ref: v.union(v.string(), v.null()),
    content_hash: v.string(),
  }),
});

export const aiInfrastructureViolationValidator = v.object({
  code: v.union(
    v.literal("schema_invalid"),
    v.literal("source_policy_mismatch"),
    v.literal("record_type_mismatch"),
    v.literal("duplicate_source_key"),
    v.literal("evidence_hash_mismatch"),
  ),
  severity: v.literal("critical"),
  message: v.string(),
});
