import { v } from "convex/values";

export const factFreshnessPolicyStatusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("retired"),
);

export const factValidTimeSourceValidator = v.union(
  v.literal("observed_at"),
  v.literal("source_effective_at"),
  v.literal("inferred"),
);

export const factVersionStateValidator = v.union(
  v.literal("released"),
  v.literal("withheld"),
  v.literal("conflicted"),
  v.literal("retracted"),
);

export const factChangeKindValidator = v.union(
  v.literal("initial"),
  v.literal("external_change"),
  v.literal("correction"),
  v.literal("retraction"),
);

export const factReleaseOutcomeValidator = v.union(
  v.literal("release"),
  v.literal("withhold"),
  v.literal("conflict"),
  v.literal("continue_last_known_good"),
  v.literal("retract"),
);

export const factVersionRelationKindValidator = v.union(
  v.literal("supersedes"),
  v.literal("corrects"),
  v.literal("retracts"),
);

export const currentFactStateValidator = v.union(
  v.literal("released"),
  v.literal("last_known_good"),
  v.literal("conflicted"),
  v.literal("stale"),
  v.literal("retracted"),
);

export const currentFactServingLabelValidator = v.union(
  v.literal("verified"),
  v.literal("last_known_good"),
  v.literal("unavailable"),
);
