import { v } from "convex/values";

export const healAttemptStatusValidator = v.union(
  v.literal("created"),
  v.literal("submitted"),
  v.literal("polling"),
  v.literal("preview_ready"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("failed"),
);

export const tribunalCheckKindValidator = v.union(
  v.literal("preview_contract"),
  v.literal("evidence_support"),
  v.literal("selector_risk"),
  v.literal("human_review"),
);

export const tribunalStatusValidator = v.union(
  v.literal("pass"),
  v.literal("fail"),
  v.literal("deferred"),
  v.literal("needs_review"),
);

export const mutationCodeValidator = v.union(
  v.literal("M1"),
  v.literal("M2"),
  v.literal("M3"),
  v.literal("M4"),
  v.literal("H1"),
  v.literal("H2"),
  v.literal("N1"),
  v.literal("N2"),
);

export const mutationVisibilityValidator = v.union(
  v.literal("visible"),
  v.literal("held_out"),
  v.literal("negative_control"),
);

export const phase4EvidenceKindValidator = v.union(
  v.literal("html"),
  v.literal("screenshot"),
  v.literal("jsonld"),
  v.literal("network_response"),
  v.literal("visible_context"),
  v.literal("warc"),
  v.literal("code_diff"),
  v.literal("audit"),
);

export const expectedRelationValidator = v.union(
  v.literal("same_value"),
  v.literal("same_semantic_value"),
  v.literal("quarantine"),
  v.literal("retry"),
  v.literal("do_not_heal"),
);

export const benchmarkStatusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
);

export const benchmarkOutcomeValidator = v.union(
  v.literal("pass"),
  v.literal("fail"),
  v.literal("not_run"),
);

export const benchmarkBaselineValidator = v.union(
  v.literal("schema_only"),
  v.literal("contract_only"),
  v.literal("full_kevlar"),
);

export const certificateStatusValidator = v.union(
  v.literal("certified"),
  v.literal("rejected"),
);

const certificateGauntletResultValidator = v.object({
  caseId: mutationCodeValidator,
  visibility: mutationVisibilityValidator,
  expectedRelation: expectedRelationValidator,
  outcome: v.union(v.literal("pass"), v.literal("fail")),
  observedValue: v.union(v.number(), v.null()),
  releasedValue: v.union(v.number(), v.null()),
  falseHeal: v.boolean(),
  falseRelease: v.boolean(),
  detectionMs: v.number(),
  recoveryMs: v.union(v.number(), v.null()),
  evidenceHash: v.string(),
  reason: v.string(),
});

const certificateBenchmarkSummaryValidator = v.object({
  system: benchmarkBaselineValidator,
  totalCases: v.number(),
  passedCases: v.number(),
  silentCorruptionCaught: v.number(),
  falseHealRate: v.number(),
  heldOutPassRate: v.union(v.number(), v.null()),
  falseReleases: v.number(),
  lastKnownGoodAvailable: v.boolean(),
});

export const certificatePayloadValidator = v.object({
  certificate_version: v.literal("1.0"),
  certificate_id: v.string(),
  collector: v.object({
    platform: v.literal("Bright Data Scraper Studio"),
    collector_id: v.string(),
    same_id_before_after: v.literal(true),
  }),
  incident: v.object({
    type: v.literal("semantic_swap"),
    field: v.literal("product.purchase_price.amount"),
    observed_bad_value: v.number(),
    blocked_downstream_action: v.literal("price_drop_alert"),
  }),
  repair: v.object({
    heal_prompt_hash: v.string(),
    diagnosis_provider: v.string(),
    diagnosis_model: v.string(),
    human_approved: v.literal(true),
    approved_at: v.string(),
  }),
  pre_approval_checks: v.object({
    preview_contract: tribunalStatusValidator,
    evidence_support: tribunalStatusValidator,
    selector_risk: tribunalStatusValidator,
  }),
  post_approval_checks: v.object({
    trigger_case: v.literal("pass"),
    visible_cases: v.literal("4/4"),
    held_out_cases: v.literal("2/2"),
    negative_controls: v.literal("2/2"),
  }),
  release: v.object({
    status: v.literal("certified"),
    released_value: v.number(),
  }),
  integrity: v.object({
    before_output_hash: v.string(),
    after_output_hash: v.string(),
    certificate_digest: v.string(),
  }),
  measured: v.object({
    gauntlet_results: v.array(certificateGauntletResultValidator),
    baseline_comparison: v.array(certificateBenchmarkSummaryValidator),
  }),
  issued_at: v.string(),
});
