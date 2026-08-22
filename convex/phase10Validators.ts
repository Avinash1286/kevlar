import { v } from "convex/values";

export const apiScopeValidator = v.union(
  v.literal("facts:read"),
  v.literal("events:read"),
  v.literal("evidence:read"),
  v.literal("sources:read"),
  v.literal("subscriptions:read"),
  v.literal("subscriptions:write"),
  v.literal("webhooks:write"),
  v.literal("admin:read"),
  v.literal("mcp:read"),
);

export const apiKeyStatusValidator = v.union(
  v.literal("active"),
  v.literal("revoked"),
);

export const apiContractKindValidator = v.union(
  v.literal("rest"),
  v.literal("sdk"),
  v.literal("mcp"),
  v.literal("webhook"),
);

export const apiContractStatusValidator = v.union(
  v.literal("active"),
  v.literal("retired"),
);

export const subscriptionChannelValidator = v.union(
  v.literal("webhook"),
  v.literal("internal"),
);

export const subscriptionStatusValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("disabled"),
);

export const webhookEndpointStatusValidator = subscriptionStatusValidator;

export const webhookSecretStatusValidator = v.union(
  v.literal("active"),
  v.literal("retired"),
);

export const deliveryStatusValidator = v.union(
  v.literal("queued"),
  v.literal("sending"),
  v.literal("retrying"),
  v.literal("delivered"),
  v.literal("dead_letter"),
);

export const deliveryModeValidator = v.union(
  v.literal("live"),
  v.literal("replay"),
  v.literal("test"),
);

export const deliveryAttemptOutcomeValidator = v.union(
  v.literal("success"),
  v.literal("retryable_failure"),
  v.literal("permanent_failure"),
);

export const phase10FilterValidator = v.object({
  eventTypes: v.array(v.string()),
  entityTypes: v.array(v.string()),
  predicates: v.array(v.string()),
  includeCorrections: v.boolean(),
});

export const apiRequestOutcomeValidator = v.union(
  v.literal("authorized"),
  v.literal("denied"),
  v.literal("rate_limited"),
);

export const trustMetadataValidator = v.object({
  state: v.union(
    v.literal("released"),
    v.literal("last_known_good"),
    v.literal("stale"),
  ),
  servingLabel: v.union(v.literal("verified"), v.literal("last_known_good")),
  verifiedAt: v.number(),
  freshnessDeadline: v.number(),
  stale: v.boolean(),
  supportingSourceCount: v.number(),
  evidenceCount: v.number(),
  certificateId: v.union(v.id("certificates"), v.null()),
  uncertainty: v.union(v.string(), v.null()),
});
