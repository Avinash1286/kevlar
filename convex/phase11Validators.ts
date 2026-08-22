import { v } from "convex/values";

export const organizationRoleValidator = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("operator"),
  v.literal("reviewer"),
  v.literal("developer"),
  v.literal("viewer"),
);
export const membershipStatusValidator = v.union(v.literal("active"), v.literal("suspended"));
export const securityDecisionValidator = v.union(v.literal("allowed"), v.literal("denied"));
export const secretStatusValidator = v.union(v.literal("active"), v.literal("rotating"), v.literal("retired"));
export const alertSeverityValidator = v.union(v.literal("info"), v.literal("warning"), v.literal("critical"));
export const alertStatusValidator = v.union(v.literal("open"), v.literal("acknowledged"), v.literal("resolved"));
export const backupStatusValidator = v.union(v.literal("requested"), v.literal("completed"), v.literal("failed"));
export const routerStatusValidator = v.union(v.literal("pending_approval"), v.literal("approved"), v.literal("consumed"), v.literal("rejected"));
export const chaosKindValidator = v.union(
  v.literal("provider_failure"),
  v.literal("bright_data_pending"),
  v.literal("duplicate_event"),
  v.literal("source_outage"),
  v.literal("webhook_failure"),
);
export const chaosOutcomeValidator = v.union(v.literal("pass"), v.literal("fail"));
