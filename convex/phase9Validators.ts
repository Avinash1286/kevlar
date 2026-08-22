import { v } from "convex/values";

export const provenanceNodeTypeValidator = v.union(
  v.literal("source"),
  v.literal("endpoint"),
  v.literal("collector"),
  v.literal("collector_version"),
  v.literal("run"),
  v.literal("raw_record"),
  v.literal("source_field"),
  v.literal("violation"),
  v.literal("observation"),
  v.literal("canonical_field"),
  v.literal("entity"),
  v.literal("fact_version"),
  v.literal("change_event"),
  v.literal("heal_attempt"),
  v.literal("tribunal_check"),
  v.literal("mutation_run"),
  v.literal("repair_certificate"),
  v.literal("human_decision"),
  v.literal("delivery"),
  v.literal("evidence"),
);

export const provenanceRelationshipValidator = v.union(
  v.literal("collected_from"),
  v.literal("produced_by"),
  v.literal("normalized_from"),
  v.literal("mapped_from"),
  v.literal("supported_by"),
  v.literal("contradicted_by"),
  v.literal("resolved_to"),
  v.literal("supersedes"),
  v.literal("corrects"),
  v.literal("triggered"),
  v.literal("certified_by"),
  v.literal("delivered_to"),
  v.literal("retracts"),
);

export const evidenceBundleStatusValidator = v.union(
  v.literal("building"),
  v.literal("sealed"),
  v.literal("invalid"),
);

export const evidenceArtifactKindValidator = v.union(
  v.literal("event"),
  v.literal("fact_before"),
  v.literal("fact_after"),
  v.literal("source_observation"),
  v.literal("contract_result"),
  v.literal("mapping"),
  v.literal("collector_metadata"),
  v.literal("repair_certificate"),
  v.literal("screenshot"),
  v.literal("warc_reference"),
  v.literal("visible_context"),
  v.literal("integrity_manifest"),
);

export const blastImpactKindValidator = v.union(
  v.literal("source"),
  v.literal("canonical_field"),
  v.literal("entity"),
  v.literal("current_fact"),
  v.literal("change_event"),
  v.literal("subscriber"),
  v.literal("downstream_consumer"),
);

export const blastImpactStateValidator = v.union(
  v.literal("affected"),
  v.literal("withheld"),
  v.literal("covered"),
  v.literal("last_known_good"),
  v.literal("at_risk"),
);

export const tribunalContextItemKindValidator = v.union(
  v.literal("source_mapping"),
  v.literal("canonical_field"),
  v.literal("current_fact"),
  v.literal("source_conflict"),
  v.literal("event_blast"),
  v.literal("independent_support"),
  v.literal("identity_risk"),
);

export const downstreamConsumerKindValidator = v.union(
  v.literal("subscriber"),
  v.literal("automation"),
  v.literal("internal"),
  v.literal("dashboard"),
);

export const downstreamConsumerStatusValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("disabled"),
);

export const repairCandidateStatusValidator = v.union(
  v.literal("proposed"),
  v.literal("canary"),
  v.literal("active"),
  v.literal("stopped"),
  v.literal("rolled_back"),
  v.literal("disabled"),
);

export const canaryStatusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("stopped"),
  v.literal("passed"),
  v.literal("fully_released"),
  v.literal("rolled_back"),
);

export const canaryStageValidator = v.union(
  v.literal("trigger_url"),
  v.literal("stored_fixtures"),
  v.literal("held_out_mutations"),
  v.literal("live_endpoint_subset"),
  v.literal("shadow_production"),
  v.literal("active_production"),
);

export const verificationOutcomeValidator = v.union(
  v.literal("pending"),
  v.literal("pass"),
  v.literal("fail"),
  v.literal("not_run"),
);

export const gauntletRunStatusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("passed"),
  v.literal("failed"),
  v.literal("stopped"),
);

export const mutationCategoryValidator = v.union(
  v.literal("structural"),
  v.literal("semantic_decoy"),
  v.literal("rendering"),
  v.literal("identity"),
  v.literal("unit"),
);

export const sourceArchetypeValidator = v.union(
  v.literal("common"),
  v.literal("pricing_table"),
  v.literal("model_catalog"),
  v.literal("documentation"),
  v.literal("product_pricing_fixture"),
);

export const fleetCaseVisibilityValidator = v.union(
  v.literal("visible"),
  v.literal("held_out"),
  v.literal("negative_control"),
);

export const fleetExpectedRelationValidator = v.union(
  v.literal("same_value"),
  v.literal("equivalent_value"),
  v.literal("expected_change"),
  v.literal("quarantine"),
  v.literal("retry"),
  v.literal("do_not_heal"),
);

export const extendedCertificateStatusValidator = v.union(
  v.literal("certified"),
  v.literal("rejected"),
);

export const compatibilityCheckValidator = v.union(
  v.literal("pass"),
  v.literal("fail"),
);

export const canaryThresholdsValidator = v.object({
  minimumPassRate: v.number(),
  maximumCriticalFailures: v.number(),
  maximumFalseEvents: v.number(),
  requireHeldOutPass: v.boolean(),
  requireIdentityStable: v.boolean(),
});

export const extendedCertificatePayloadValidator = v.object({
  certificate_version: v.literal("2.0"),
  incident_id: v.string(),
  core_certificate_id: v.union(v.string(), v.null()),
  affected_canonical_fields: v.array(v.string()),
  affected_entity_count: v.number(),
  canary: v.object({
    stored_fixtures: v.string(),
    held_out_cases: v.string(),
    live_shadow_runs: v.string(),
  }),
  semantic_event_check: v.object({
    false_events: v.number(),
    expected_events: v.number(),
  }),
  schema_compatibility: compatibilityCheckValidator,
  mapping_compatibility: compatibilityCheckValidator,
  evidence_bundle_digest: v.string(),
  integrity_manifest_digest: v.string(),
  released_collector_version: v.string(),
  issued_at: v.string(),
});
