import { v } from "convex/values";

export const retentionScopeValidator = v.union(
  v.literal("evidence"),
  v.literal("bundle_artifact"),
);

export const retentionKindValidator = v.union(
  v.literal("html"),
  v.literal("screenshot"),
  v.literal("jsonld"),
  v.literal("network_response"),
  v.literal("visible_context"),
  v.literal("warc"),
  v.literal("code_diff"),
  v.literal("audit"),
  v.literal("event"),
  v.literal("fact_before"),
  v.literal("fact_after"),
  v.literal("source_observation"),
  v.literal("contract_result"),
  v.literal("mapping"),
  v.literal("collector_metadata"),
  v.literal("repair_certificate"),
  v.literal("warc_reference"),
  v.literal("integrity_manifest"),
);

export const retentionActionValidator = v.union(
  v.literal("retain"),
  v.literal("redact_payload"),
);

export const retentionPolicyStatusValidator = v.union(
  v.literal("active"),
  v.literal("disabled"),
);

export const retentionRunStatusValidator = v.union(
  v.literal("completed"),
  v.literal("partial"),
  v.literal("failed"),
);

export const projectDeletionStateValidator = v.union(
  v.literal("requested"),
  v.literal("deleting"),
  v.literal("deleted"),
  v.literal("failed"),
);

export const projectDeletionStageValidator = v.union(
  v.literal("evidence"),
  v.literal("run_rows"),
  v.literal("observation_fields"),
  v.literal("delivery_payloads"),
  v.literal("credentials"),
  v.literal("finalize"),
  v.literal("completed"),
);

export const restoreManifestStatusValidator = v.union(
  v.literal("captured"),
  v.literal("verified"),
  v.literal("mismatch"),
);

export const backupManifestCountsValidator = v.object({
  certificates: v.number(),
  currentFacts: v.number(),
  factVersions: v.number(),
  changeEvents: v.number(),
  evidenceBundles: v.number(),
  canonicalObservations: v.number(),
  sourceCount: v.number(),
  truncated: v.boolean(),
});
