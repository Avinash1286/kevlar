import { v } from "convex/values";

export const releasePolicyStatusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("retired"),
);

export const reconciliationStrategyValidator = v.union(
  v.literal("authoritative"),
  v.literal("quorum"),
  v.literal("ordered_fallback"),
  v.literal("human_review"),
);

export const equivalenceRuleValidator = v.union(
  v.literal("exact"),
  v.literal("numeric_tolerance"),
  v.literal("normalized_whitespace"),
  v.literal("unordered_set"),
);

export const policySourceRoleValidator = v.union(
  v.literal("authoritative"),
  v.literal("supporting"),
  v.literal("fallback"),
);

export const releaseDecisionOutcomeValidator = v.union(
  v.literal("release"),
  v.literal("withhold"),
  v.literal("conflict"),
  v.literal("continue_last_known_good"),
  v.literal("no_change"),
  v.literal("blocked_quarantine"),
  v.literal("blocked_absence"),
  v.literal("needs_human_review"),
);

export const sourceConflictStatusValidator = v.union(
  v.literal("open"),
  v.literal("resolved"),
  v.literal("ignored"),
);

export const semanticEventTypeValidator = v.union(
  v.literal("creation"),
  v.literal("update"),
  v.literal("removal"),
  v.literal("rename"),
  v.literal("deprecation"),
  v.literal("correction"),
  v.literal("conflict"),
  v.literal("presentation_drift"),
);

export const changeEventStateValidator = v.union(
  v.literal("pending"),
  v.literal("verified"),
  v.literal("released"),
  v.literal("withheld"),
  v.literal("superseded"),
  v.literal("retracted"),
);

export const changeEventRelationKindValidator = v.union(
  v.literal("corrects"),
  v.literal("retracts"),
  v.literal("supersedes"),
);

export const removalEvidenceValidator = v.union(
  v.literal("none"),
  v.literal("explicit_authoritative"),
  v.literal("repeated_verified_absence"),
  v.literal("human_approved"),
);
