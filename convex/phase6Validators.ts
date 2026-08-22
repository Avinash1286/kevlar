import { v } from "convex/values";

export const canonicalSchemaStateValidator = v.union(
  v.literal("draft"),
  v.literal("canary"),
  v.literal("active"),
  v.literal("retired"),
);

export const schemaCompatibilityValidator = v.union(
  v.literal("backward_compatible"),
  v.literal("breaking"),
  v.literal("policy_migration"),
);

export const mappingLifecycleValidator = v.union(
  v.literal("draft"),
  v.literal("shadow"),
  v.literal("canary"),
  v.literal("active"),
  v.literal("rolled_back"),
);

export const mappingApprovalValidator = v.union(
  v.literal("approved"),
  v.literal("rejected"),
);

export const canonicalObservationTrustValidator = v.union(
  v.literal("verified"),
  v.literal("partially_verified"),
  v.literal("quarantined"),
  v.literal("needs_review"),
);

export const canonicalFieldStateValidator = v.union(
  v.literal("verified"),
  v.literal("quarantined"),
  v.literal("last_known_good"),
  v.literal("stale"),
  v.literal("needs_review"),
);

export const canonicalEntityStatusValidator = v.union(
  v.literal("active"),
  v.literal("deprecated"),
  v.literal("removed"),
  v.literal("merged"),
  v.literal("split"),
);

export const canonicalAliasTypeValidator = v.union(
  v.literal("display_name"),
  v.literal("external_id"),
  v.literal("provider_id"),
  v.literal("legacy_id"),
);

export const canonicalIdentityStatusValidator = v.union(
  v.literal("active"),
  v.literal("retired"),
);

export const entityLineageRelationshipValidator = v.union(
  v.literal("ALIAS_OF"),
  v.literal("VERSION_OF"),
  v.literal("SUCCESSOR_OF"),
  v.literal("PREDECESSOR_OF"),
  v.literal("RENAMED_TO"),
  v.literal("REPLACES"),
);

export const entityLineageStatusValidator = v.union(
  v.literal("active"),
  v.literal("reversed"),
);

export const identityRecommendationValidator = v.union(
  v.literal("auto_link"),
  v.literal("review"),
  v.literal("reject"),
  v.literal("create"),
);

export const identityGeneratorValidator = v.union(
  v.literal("deterministic"),
  v.literal("ai_suggestion"),
);

export const identityFeatureValidator = v.object({
  name: v.string(),
  matched: v.boolean(),
  weight: v.number(),
  explanation: v.string(),
});

export const identityReviewDecisionValidator = v.union(
  v.literal("link"),
  v.literal("create"),
  v.literal("reject"),
  v.literal("merge"),
);

export const entityOperationKindValidator = v.union(
  v.literal("merge"),
  v.literal("split"),
  v.literal("reverse_merge"),
  v.literal("reverse_split"),
);
