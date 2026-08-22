import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  fixtureStates: defineTable({
    key: v.string(),
    version: v.union(v.literal("v1"), v.literal("v2")),
    updatedAt: v.number(),
    updatedBy: v.string(),
  }).index("by_key", ["key"]),

  projects: defineTable({
    name: v.string(),
    slug: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("paused"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),

  collectors: defineTable({
    projectId: v.id("projects"),
    collectorId: v.string(),
    name: v.string(),
    workerType: v.union(v.literal("browser"), v.literal("code")),
    targetUrl: v.string(),
    createdAfterKickoff: v.boolean(),
    createLogStorageId: v.optional(v.id("_storage")),
    currentVersion: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("healing"),
      v.literal("disabled"),
    ),
  })
    .index("by_project", ["projectId"])
    .index("by_platform_id", ["collectorId"]),

  runs: defineTable({
    projectId: v.id("projects"),
    collectorId: v.id("collectors"),
    mode: v.union(
      v.literal("baseline"),
      v.literal("monitor"),
      v.literal("mutation"),
      v.literal("verification"),
    ),
    mutationId: v.optional(v.string()),
    status: v.union(
      v.literal("created"),
      v.literal("triggering"),
      v.literal("collecting"),
      v.literal("normalizing"),
      v.literal("validating"),
      v.literal("verified"),
      v.literal("quarantined"),
      v.literal("failed"),
    ),
    brightDataJobId: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    outputHash: v.optional(v.string()),
    rowCount: v.optional(v.number()),
  })
    .index("by_project_started", ["projectId", "startedAt"])
    .index("by_collector_started", ["collectorId", "startedAt"])
    .index("by_mode_and_startedAt", ["mode", "startedAt"])
    .index("by_bright_data_job", ["brightDataJobId"]),

  rows: defineTable({
    runId: v.id("runs"),
    entityId: v.string(),
    rawPayload: v.any(),
    normalizedPayload: v.any(),
    fieldTrust: v.any(),
    recordHash: v.string(),
  }).index("by_run", ["runId"]),

  evidence: defineTable({
    projectId: v.id("projects"),
    runId: v.id("runs"),
    kind: v.union(
      v.literal("html"),
      v.literal("screenshot"),
      v.literal("jsonld"),
      v.literal("network_response"),
      v.literal("visible_context"),
    ),
    sourceUrl: v.string(),
    storageId: v.optional(v.id("_storage")),
    contentHash: v.string(),
    metadata: v.any(),
    capturedAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_project_captured", ["projectId", "capturedAt"]),

  contracts: defineTable({
    projectId: v.id("projects"),
    key: v.string(),
    version: v.string(),
    critical: v.boolean(),
    spec: v.any(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_projectId_and_key", ["projectId", "key"]),

  violations: defineTable({
    projectId: v.id("projects"),
    runId: v.id("runs"),
    rowId: v.id("rows"),
    code: v.union(
      v.literal("semantic_swap"),
      v.literal("independent_source_mismatch"),
      v.literal("source_disagreement"),
      v.literal("historical_delta"),
    ),
    severity: v.union(v.literal("warning"), v.literal("critical")),
    message: v.string(),
    evidence: v.any(),
    createdAt: v.number(),
  })
    .index("by_runId", ["runId"])
    .index("by_projectId_and_createdAt", ["projectId", "createdAt"]),

  fieldReleases: defineTable({
    projectId: v.id("projects"),
    entityId: v.string(),
    fieldPath: v.string(),
    status: v.union(
      v.literal("verified"),
      v.literal("quarantined"),
      v.literal("needs_review"),
      v.literal("invalid"),
      v.literal("stale"),
    ),
    observedValue: v.number(),
    releasedValue: v.union(v.number(), v.null()),
    lastKnownGoodValue: v.optional(v.number()),
    currency: v.string(),
    runId: v.id("runs"),
    proof: v.any(),
    updatedAt: v.number(),
  })
    .index("by_runId", ["runId"])
    .index("by_projectId_and_entityId_and_fieldPath_and_updatedAt", [
      "projectId",
      "entityId",
      "fieldPath",
      "updatedAt",
    ]),

  alertEvents: defineTable({
    projectId: v.id("projects"),
    runId: v.id("runs"),
    kind: v.literal("price_drop"),
    status: v.union(
      v.literal("not_triggered"),
      v.literal("blocked"),
      v.literal("sent"),
    ),
    previousValue: v.optional(v.number()),
    observedValue: v.optional(v.number()),
    reason: v.string(),
    createdAt: v.number(),
  })
    .index("by_runId", ["runId"])
    .index("by_projectId_and_createdAt", ["projectId", "createdAt"]),

  auditEvents: defineTable({
    projectId: v.optional(v.id("projects")),
    actorType: v.union(
      v.literal("user"),
      v.literal("system"),
      v.literal("provider"),
    ),
    actorId: v.optional(v.string()),
    action: v.string(),
    targetType: v.string(),
    targetId: v.string(),
    payload: v.any(),
    createdAt: v.number(),
  })
    .index("by_project_created", ["projectId", "createdAt"])
    .index("by_target", ["targetType", "targetId"]),
});
