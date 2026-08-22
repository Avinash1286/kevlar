import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { vWorkflowId } from "@convex-dev/workflow";
import {
  actorTypeValidator,
  circuitStateValidator,
  confidenceSourceValidator,
  humanReviewReasonValidator,
  humanReviewStatusValidator,
  idempotencyScopeValidator,
  idempotencyStatusValidator,
  incidentStateValidator,
  modelCallStatusValidator,
  modelOutputValidator,
  modelTaskValidator,
  triageActionValidator,
  triageClassificationValidator,
  workflowEventTypeValidator,
  workflowKindValidator,
  workflowStatusValidator,
} from "./phase3Validators";
import {
  benchmarkBaselineValidator,
  benchmarkStatusValidator,
  certificatePayloadValidator,
  certificateStatusValidator,
  expectedRelationValidator,
  healAttemptStatusValidator,
  mutationCodeValidator,
  mutationVisibilityValidator,
  phase4EvidenceKindValidator,
  tribunalCheckKindValidator,
  tribunalStatusValidator,
} from "./phase4Validators";
import {
  aiInfrastructureObservationValidator,
  aiInfrastructureViolationValidator,
  bindingLifecycleValidator,
  fleetOutcomeValidator,
  leaseStatusValidator,
  onboardingStatusValidator,
  queueStateValidator,
  sourceApprovalValidator,
  sourceHealthStateValidator,
  sourceLifecycleValidator,
  sourceTypeValidator,
} from "./phase5Validators";

const schema = defineSchema({
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
    runId: v.optional(v.id("runs")),
    kind: phase4EvidenceKindValidator,
    sourceUrl: v.string(),
    storageId: v.optional(v.id("_storage")),
    contentHash: v.string(),
    metadata: v.any(),
    phase4OperationKey: v.optional(v.string()),
    capturedAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_project_captured", ["projectId", "capturedAt"])
    .index("by_phase4OperationKey", ["phase4OperationKey"]),

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
    certificateId: v.optional(v.id("certificates")),
    certifiedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_runId", ["runId"])
    .index("by_certificateId", ["certificateId"])
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

  incidents: defineTable({
    projectId: v.id("projects"),
    failingRunId: v.id("runs"),
    collectorId: v.id("collectors"),
    state: incidentStateValidator,
    classification: v.optional(triageClassificationValidator),
    recommendedAction: v.optional(triageActionValidator),
    failureSummary: v.string(),
    currentWorkflowStep: v.optional(v.string()),
    reviewReason: v.optional(v.string()),
    transitionSequence: v.number(),
    openedAt: v.number(),
    updatedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_failingRunId", ["failingRunId"])
    .index("by_projectId_and_openedAt", ["projectId", "openedAt"])
    .index("by_collectorId_and_openedAt", ["collectorId", "openedAt"])
    .index("by_state_and_updatedAt", ["state", "updatedAt"]),

  incidentTransitions: defineTable({
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    sequence: v.number(),
    fromState: v.union(incidentStateValidator, v.null()),
    toState: incidentStateValidator,
    reason: v.string(),
    actorType: actorTypeValidator,
    actorId: v.optional(v.string()),
    idempotencyKey: v.string(),
    details: v.any(),
    createdAt: v.number(),
  })
    .index("by_incidentId_and_sequence", ["incidentId", "sequence"])
    .index("by_incidentId_and_createdAt", ["incidentId", "createdAt"])
    .index("by_idempotencyKey", ["idempotencyKey"]),

  triageRecords: defineTable({
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    runId: v.id("runs"),
    classification: triageClassificationValidator,
    recommendedAction: triageActionValidator,
    confidenceSource: confidenceSourceValidator,
    signals: v.array(v.string()),
    repeatedFetchRequired: v.boolean(),
    algorithmVersion: v.string(),
    idempotencyKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_incidentId_and_createdAt", ["incidentId", "createdAt"])
    .index("by_runId", ["runId"])
    .index("by_idempotencyKey", ["idempotencyKey"]),

  incidentEvidenceLinks: defineTable({
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    runId: v.id("runs"),
    kind: v.union(v.literal("triggering"), v.literal("repeated_fetch")),
    domFingerprint: v.optional(v.string()),
    note: v.string(),
    idempotencyKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_incidentId_and_createdAt", ["incidentId", "createdAt"])
    .index("by_idempotencyKey", ["idempotencyKey"]),

  workflowRuns: defineTable({
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    kind: workflowKindValidator,
    status: workflowStatusValidator,
    currentStep: v.string(),
    attempt: v.number(),
    maxAttempts: v.number(),
    baseRetryDelayMs: v.number(),
    maxRetryDelayMs: v.number(),
    deadlineAt: v.number(),
    nextResumeAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    durableWorkflowId: v.optional(vWorkflowId),
    idempotencyKey: v.string(),
    eventSequence: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_durableWorkflowId", ["durableWorkflowId"])
    .index("by_incidentId_and_createdAt", ["incidentId", "createdAt"])
    .index("by_status_and_nextResumeAt", ["status", "nextResumeAt"])
    .index("by_status_and_updatedAt", ["status", "updatedAt"]),

  workflowEvents: defineTable({
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    workflowRunId: v.id("workflowRuns"),
    sequence: v.number(),
    eventType: workflowEventTypeValidator,
    step: v.string(),
    fromStatus: v.union(workflowStatusValidator, v.null()),
    toStatus: workflowStatusValidator,
    details: v.any(),
    createdAt: v.number(),
  })
    .index("by_workflowRunId_and_sequence", ["workflowRunId", "sequence"])
    .index("by_incidentId_and_createdAt", ["incidentId", "createdAt"]),

  idempotencyRecords: defineTable({
    projectId: v.optional(v.id("projects")),
    incidentId: v.optional(v.id("incidents")),
    operationKey: v.string(),
    scope: idempotencyScopeValidator,
    status: idempotencyStatusValidator,
    requestHash: v.string(),
    result: v.optional(v.any()),
    externalCallRef: v.optional(v.string()),
    attempts: v.number(),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_operationKey", ["operationKey"])
    .index("by_incidentId_and_createdAt", ["incidentId", "createdAt"])
    .index("by_status_and_updatedAt", ["status", "updatedAt"]),

  modelCalls: defineTable({
    projectId: v.id("projects"),
    incidentId: v.optional(v.id("incidents")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    task: modelTaskValidator,
    provider: v.string(),
    model: v.string(),
    fallbackIndex: v.number(),
    status: modelCallStatusValidator,
    latencyMs: v.optional(v.number()),
    inputHash: v.string(),
    cacheKey: v.string(),
    outputSchemaValid: v.optional(v.boolean()),
    output: v.optional(modelOutputValidator),
    errorCode: v.optional(v.string()),
    costUnits: v.number(),
    modelRegistryRevision: v.string(),
    promptTemplateRevision: v.string(),
    promptIsolationApplied: v.boolean(),
    affectedProductionConfig: v.boolean(),
    operationKey: v.string(),
    cachedFromCallId: v.optional(v.id("modelCalls")),
    humanDecision: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_task_and_cacheKey_and_completedAt", [
      "task",
      "cacheKey",
      "completedAt",
    ])
    .index("by_incidentId_and_startedAt", ["incidentId", "startedAt"])
    .index("by_provider_and_startedAt", ["provider", "startedAt"])
    .index("by_operationKey", ["operationKey"]),

  modelProviderBudgets: defineTable({
    provider: v.string(),
    budgetDate: v.string(),
    dailyLimitUnits: v.number(),
    reservedDemoUnits: v.number(),
    usedUnits: v.number(),
    updatedAt: v.number(),
  }).index("by_provider_and_budgetDate", ["provider", "budgetDate"]),

  modelProviderCircuits: defineTable({
    provider: v.string(),
    state: circuitStateValidator,
    consecutiveFailures: v.number(),
    openedAt: v.optional(v.number()),
    cooldownUntil: v.optional(v.number()),
    probeInFlight: v.boolean(),
    failureThreshold: v.number(),
    cooldownMs: v.number(),
    lastFailureCode: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_provider", ["provider"]),

  humanReviews: defineTable({
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    workflowRunId: v.optional(v.id("workflowRuns")),
    reason: humanReviewReasonValidator,
    status: humanReviewStatusValidator,
    summary: v.string(),
    idempotencyKey: v.string(),
    requestedAt: v.number(),
    resolvedAt: v.optional(v.number()),
    resolutionNote: v.optional(v.string()),
  })
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_incidentId_and_requestedAt", ["incidentId", "requestedAt"])
    .index("by_status_and_requestedAt", ["status", "requestedAt"]),

  healAttempts: defineTable({
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    collectorId: v.id("collectors"),
    attempt: v.number(),
    prompt: v.string(),
    promptHash: v.string(),
    status: healAttemptStatusValidator,
    brightDataJobRef: v.optional(v.string()),
    previewResult: v.optional(v.any()),
    previewRunId: v.optional(v.id("runs")),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_incidentId_and_attempt", ["incidentId", "attempt"])
    .index("by_incidentId_and_createdAt", ["incidentId", "createdAt"])
    .index("by_status_and_updatedAt", ["status", "updatedAt"])
    .index("by_brightDataJobRef", ["brightDataJobRef"]),

  healAttemptEvents: defineTable({
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    healAttemptId: v.id("healAttempts"),
    fromStatus: v.union(healAttemptStatusValidator, v.null()),
    toStatus: healAttemptStatusValidator,
    operationKey: v.string(),
    requestHash: v.string(),
    details: v.any(),
    createdAt: v.number(),
  })
    .index("by_healAttemptId_and_createdAt", ["healAttemptId", "createdAt"])
    .index("by_incidentId_and_createdAt", ["incidentId", "createdAt"])
    .index("by_operationKey", ["operationKey"]),

  repairDecisions: defineTable({
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    healAttemptId: v.id("healAttempts"),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    reason: v.string(),
    actorId: v.string(),
    operationKey: v.string(),
    requestHash: v.string(),
    providerApprovalRef: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_healAttemptId_and_createdAt", ["healAttemptId", "createdAt"])
    .index("by_incidentId_and_createdAt", ["incidentId", "createdAt"])
    .index("by_operationKey", ["operationKey"]),

  tribunalChecks: defineTable({
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    healAttemptId: v.id("healAttempts"),
    check: tribunalCheckKindValidator,
    status: tribunalStatusValidator,
    summary: v.string(),
    details: v.any(),
    operationKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_healAttemptId_and_check", ["healAttemptId", "check"])
    .index("by_incidentId_and_createdAt", ["incidentId", "createdAt"])
    .index("by_operationKey", ["operationKey"]),

  phase4EvidenceLinks: defineTable({
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    healAttemptId: v.optional(v.id("healAttempts")),
    tribunalCheckId: v.optional(v.id("tribunalChecks")),
    benchmarkRunId: v.optional(v.id("benchmarkRuns")),
    certificateId: v.optional(v.id("certificates")),
    evidenceId: v.id("evidence"),
    relation: v.union(
      v.literal("preview"),
      v.literal("support"),
      v.literal("selector"),
      v.literal("human_review"),
      v.literal("benchmark"),
      v.literal("certificate"),
    ),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_incidentId_and_createdAt", ["incidentId", "createdAt"])
    .index("by_healAttemptId_and_createdAt", ["healAttemptId", "createdAt"])
    .index("by_certificateId_and_createdAt", ["certificateId", "createdAt"])
    .index("by_operationKey", ["operationKey"]),

  repairMutations: defineTable({
    code: mutationCodeValidator,
    name: v.string(),
    visibility: mutationVisibilityValidator,
    transform: v.string(),
    expectedRelation: expectedRelationValidator,
    criticalFields: v.array(v.string()),
    promptVisible: v.boolean(),
    enabled: v.boolean(),
    catalogVersion: v.string(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_catalogVersion_and_code", ["catalogVersion", "code"])
    .index("by_visibility_and_code", ["visibility", "code"]),

  benchmarkRuns: defineTable({
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    healAttemptId: v.id("healAttempts"),
    suiteRevision: v.string(),
    baseline: benchmarkBaselineValidator,
    status: benchmarkStatusValidator,
    totalCases: v.number(),
    passedCases: v.number(),
    criticalFailures: v.number(),
    falseHealCount: v.number(),
    falseReleaseCount: v.number(),
    lastKnownGoodPreserved: v.optional(v.boolean()),
    operationKey: v.string(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_startedAt", ["startedAt"])
    .index("by_incidentId_and_startedAt", ["incidentId", "startedAt"])
    .index("by_healAttemptId_and_startedAt", ["healAttemptId", "startedAt"])
    .index("by_operationKey", ["operationKey"]),

  benchmarkCaseResults: defineTable({
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    benchmarkRunId: v.id("benchmarkRuns"),
    mutationId: v.id("repairMutations"),
    caseId: mutationCodeValidator,
    visibility: mutationVisibilityValidator,
    expectedRelation: expectedRelationValidator,
    observedRelation: v.optional(expectedRelationValidator),
    outcome: v.union(v.literal("pass"), v.literal("fail")),
    observedValue: v.union(v.number(), v.null()),
    releasedValue: v.union(v.number(), v.null()),
    detectionMs: v.number(),
    recoveryMs: v.union(v.number(), v.null()),
    falseHeal: v.boolean(),
    falseRelease: v.boolean(),
    critical: v.boolean(),
    evidenceHash: v.string(),
    reason: v.string(),
    runId: v.optional(v.id("runs")),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_benchmarkRunId_and_caseId", ["benchmarkRunId", "caseId"])
    .index("by_benchmarkRunId_and_createdAt", ["benchmarkRunId", "createdAt"])
    .index("by_operationKey", ["operationKey"]),

  certificates: defineTable({
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    healAttemptId: v.id("healAttempts"),
    benchmarkRunId: v.id("benchmarkRuns"),
    collectorId: v.id("collectors"),
    status: certificateStatusValidator,
    payload: certificatePayloadValidator,
    digest: v.string(),
    publicSlug: v.string(),
    releasedRunId: v.optional(v.id("runs")),
    operationKey: v.string(),
    requestHash: v.string(),
    createdAt: v.number(),
  })
    .index("by_publicSlug", ["publicSlug"])
    .index("by_incidentId_and_createdAt", ["incidentId", "createdAt"])
    .index("by_healAttemptId_and_createdAt", ["healAttemptId", "createdAt"])
    .index("by_operationKey", ["operationKey"]),

  domainPacks: defineTable({
    key: v.string(),
    name: v.string(),
    version: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("paused"),
      v.literal("retired"),
    ),
    coreRequired: v.literal(true),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  sources: defineTable({
    domainPackId: v.id("domainPacks"),
    key: v.string(),
    name: v.string(),
    providerKey: v.string(),
    sourceType: sourceTypeValidator,
    official: v.boolean(),
    visibility: v.union(
      v.literal("public"),
      v.literal("authenticated"),
      v.literal("private"),
    ),
    approvalStatus: sourceApprovalValidator,
    lifecycleStatus: sourceLifecycleValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_domainPackId_and_lifecycleStatus", [
      "domainPackId",
      "lifecycleStatus",
    ])
    .index("by_approvalStatus_and_lifecycleStatus", [
      "approvalStatus",
      "lifecycleStatus",
    ]),

  sourceEndpoints: defineTable({
    sourceId: v.id("sources"),
    url: v.string(),
    host: v.string(),
    pathPrefix: v.string(),
    public: v.boolean(),
    approvalStatus: sourceApprovalValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_sourceId_and_url", ["sourceId", "url"])
    .index("by_sourceId_and_approvalStatus", ["sourceId", "approvalStatus"])
    .index("by_host_and_pathPrefix", ["host", "pathPrefix"]),

  sourceReviews: defineTable({
    sourceId: v.id("sources"),
    decision: sourceApprovalValidator,
    summary: v.string(),
    reviewerId: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_sourceId_and_createdAt", ["sourceId", "createdAt"])
    .index("by_operationKey", ["operationKey"]),

  sourceAuthorities: defineTable({
    sourceId: v.id("sources"),
    predicate: v.string(),
    authority: v.union(
      v.literal("authoritative"),
      v.literal("supporting"),
      v.literal("forbidden"),
    ),
    rationale: v.string(),
    active: v.boolean(),
    operationKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_sourceId_and_predicate", ["sourceId", "predicate"])
    .index("by_sourceId_and_active", ["sourceId", "active"])
    .index("by_operationKey", ["operationKey"]),

  sourceCertifications: defineTable({
    sourceId: v.id("sources"),
    endpointId: v.id("sourceEndpoints"),
    collectorId: v.id("collectors"),
    status: v.union(v.literal("certified"), v.literal("rejected")),
    contractVersion: v.string(),
    snapshotId: v.string(),
    brightDataJobId: v.string(),
    outputHash: v.string(),
    evidenceHash: v.string(),
    violations: v.array(aiInfrastructureViolationValidator),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_operationKey", ["operationKey"])
    .index("by_brightDataJobId", ["brightDataJobId"])
    .index("by_sourceId_and_createdAt", ["sourceId", "createdAt"])
    .index("by_sourceId_and_status", ["sourceId", "status"])
    .index("by_collectorId_and_status", ["collectorId", "status"]),

  collectorBindings: defineTable({
    sourceId: v.optional(v.id("sources")),
    endpointId: v.optional(v.id("sourceEndpoints")),
    collectorId: v.id("collectors"),
    bindingKind: v.union(v.literal("production"), v.literal("regression")),
    lifecycleStatus: bindingLifecycleValidator,
    coreGateStatus: v.union(
      v.literal("pending"),
      v.literal("certified"),
      v.literal("regression_only"),
    ),
    sourceCertificationId: v.optional(v.id("sourceCertifications")),
    bypassCore: v.literal(false),
    operationKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_sourceId_and_lifecycleStatus", ["sourceId", "lifecycleStatus"])
    .index("by_collectorId_and_bindingKind", ["collectorId", "bindingKind"])
    .index("by_sourceId_and_collectorId", ["sourceId", "collectorId"])
    .index("by_bindingKind_and_updatedAt", ["bindingKind", "updatedAt"])
    .index("by_operationKey", ["operationKey"]),

  schedulePolicies: defineTable({
    bindingId: v.id("collectorBindings"),
    intervalMs: v.number(),
    jitterMs: v.number(),
    maxConcurrency: v.number(),
    dailyQuota: v.number(),
    weight: v.number(),
    baseBackoffMs: v.number(),
    maxBackoffMs: v.number(),
    failureThreshold: v.number(),
    enabled: v.boolean(),
    operationKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_bindingId", ["bindingId"])
    .index("by_operationKey", ["operationKey"]),

  sourceOnboardingRuns: defineTable({
    sourceId: v.id("sources"),
    status: onboardingStatusValidator,
    currentStep: v.string(),
    operationKey: v.string(),
    eventSequence: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_sourceId_and_createdAt", ["sourceId", "createdAt"])
    .index("by_operationKey", ["operationKey"]),

  sourceOnboardingEvents: defineTable({
    sourceId: v.id("sources"),
    onboardingRunId: v.id("sourceOnboardingRuns"),
    sequence: v.number(),
    fromStatus: v.union(onboardingStatusValidator, v.null()),
    toStatus: onboardingStatusValidator,
    details: v.any(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_onboardingRunId_and_sequence", ["onboardingRunId", "sequence"])
    .index("by_operationKey", ["operationKey"]),

  sourceHealth: defineTable({
    sourceId: v.id("sources"),
    state: sourceHealthStateValidator,
    consecutiveFailures: v.number(),
    cooldownUntil: v.optional(v.number()),
    quotaDate: v.string(),
    quotaUsed: v.number(),
    lastClaimedAt: v.optional(v.number()),
    totalClaims: v.number(),
    lastSuccessAt: v.optional(v.number()),
    lastFailureAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_sourceId", ["sourceId"])
    .index("by_state_and_cooldownUntil", ["state", "cooldownUntil"]),

  fleetQueueItems: defineTable({
    sourceId: v.id("sources"),
    bindingId: v.id("collectorBindings"),
    schedulePolicyId: v.id("schedulePolicies"),
    state: queueStateValidator,
    dueAt: v.number(),
    virtualFinish: v.number(),
    attempt: v.number(),
    currentLeaseId: v.optional(v.id("fleetLeases")),
    lastOutcome: v.optional(fleetOutcomeValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_state_and_dueAt", ["state", "dueAt"])
    .index("by_sourceId_and_state_and_dueAt", ["sourceId", "state", "dueAt"])
    .index("by_schedulePolicyId", ["schedulePolicyId"]),

  fleetLeases: defineTable({
    queueItemId: v.id("fleetQueueItems"),
    sourceId: v.id("sources"),
    bindingId: v.id("collectorBindings"),
    leaseToken: v.string(),
    workerId: v.string(),
    status: leaseStatusValidator,
    operationKey: v.string(),
    outcomeOperationKey: v.optional(v.string()),
    claimedAt: v.number(),
    expiresAt: v.number(),
    releasedAt: v.optional(v.number()),
  })
    .index("by_operationKey", ["operationKey"])
    .index("by_outcomeOperationKey", ["outcomeOperationKey"])
    .index("by_bindingId_and_status", ["bindingId", "status"])
    .index("by_status_and_expiresAt", ["status", "expiresAt"]),

  aiInfrastructureObservations: defineTable({
    sourceId: v.id("sources"),
    bindingId: v.id("collectorBindings"),
    runId: v.id("runs"),
    sourceType: sourceTypeValidator,
    sourceUrl: v.string(),
    providerId: v.optional(v.string()),
    providerName: v.optional(v.string()),
    raw: v.any(),
    normalized: v.optional(aiInfrastructureObservationValidator),
    trust: v.union(v.literal("verified"), v.literal("quarantined")),
    evidenceHash: v.string(),
    violations: v.array(aiInfrastructureViolationValidator),
    authorityPredicates: v.array(v.string()),
    operationKey: v.string(),
    capturedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_operationKey", ["operationKey"])
    .index("by_runId", ["runId"])
    .index("by_sourceId_and_capturedAt", ["sourceId", "capturedAt"])
    .index("by_trust_and_createdAt", ["trust", "createdAt"]),

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

export default schema;
