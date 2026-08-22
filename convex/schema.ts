import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { vWorkflowId } from "@convex-dev/workflow";
import { authTables } from "@convex-dev/auth/server";
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
import {
  canonicalAliasTypeValidator,
  canonicalEntityStatusValidator,
  canonicalFieldStateValidator,
  canonicalIdentityStatusValidator,
  canonicalObservationTrustValidator,
  canonicalSchemaStateValidator,
  entityLineageRelationshipValidator,
  entityLineageStatusValidator,
  entityOperationKindValidator,
  identityFeatureValidator,
  identityGeneratorValidator,
  identityRecommendationValidator,
  identityReviewDecisionValidator,
  mappingApprovalValidator,
  mappingLifecycleValidator,
  schemaCompatibilityValidator,
} from "./phase6Validators";
import {
  currentFactServingLabelValidator,
  currentFactStateValidator,
  factChangeKindValidator,
  factFreshnessPolicyStatusValidator,
  factReleaseOutcomeValidator,
  factValidTimeSourceValidator,
  factVersionRelationKindValidator,
  factVersionStateValidator,
} from "./phase7Validators";
import {
  changeEventRelationKindValidator,
  changeEventStateValidator,
  equivalenceRuleValidator,
  policySourceRoleValidator,
  reconciliationStrategyValidator,
  releaseDecisionOutcomeValidator,
  releasePolicyStatusValidator,
  semanticEventTypeValidator,
  sourceConflictStatusValidator,
} from "./phase8Validators";
import {
  blastImpactKindValidator,
  blastImpactStateValidator,
  canaryStageValidator,
  canaryStatusValidator,
  canaryThresholdsValidator,
  downstreamConsumerKindValidator,
  downstreamConsumerStatusValidator,
  evidenceArtifactKindValidator,
  evidenceBundleStatusValidator,
  extendedCertificatePayloadValidator,
  extendedCertificateStatusValidator,
  fleetCaseVisibilityValidator,
  fleetExpectedRelationValidator,
  gauntletRunStatusValidator,
  mutationCategoryValidator,
  provenanceNodeTypeValidator,
  provenanceRelationshipValidator,
  repairCandidateStatusValidator,
  sourceArchetypeValidator,
  tribunalContextItemKindValidator,
  verificationOutcomeValidator,
} from "./phase9Validators";
import {
  apiContractKindValidator,
  apiContractStatusValidator,
  apiKeyStatusValidator,
  apiRequestOutcomeValidator,
  apiScopeValidator,
  deliveryAttemptOutcomeValidator,
  deliveryModeValidator,
  deliveryStatusValidator,
  phase10FilterValidator,
  subscriptionChannelValidator,
  subscriptionStatusValidator,
  webhookEndpointStatusValidator,
  webhookSecretStatusValidator,
} from "./phase10Validators";
import {
  alertSeverityValidator,
  alertStatusValidator,
  backupStatusValidator,
  chaosKindValidator,
  chaosOutcomeValidator,
  membershipStatusValidator,
  organizationRoleValidator,
  routerStatusValidator,
  secretStatusValidator,
  securityDecisionValidator,
} from "./phase11Validators";

const schema = defineSchema({
  ...authTables,
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

  canonicalSchemaRevisions: defineTable({
    domainPackId: v.id("domainPacks"),
    domain: v.string(),
    revision: v.number(),
    definition: v.any(),
    definitionHash: v.string(),
    createdBy: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_domainPackId_and_revision", ["domainPackId", "revision"])
    .index("by_domain_and_revision", ["domain", "revision"])
    .index("by_operationKey", ["operationKey"]),

  canonicalSchemaRevisionStates: defineTable({
    domainPackId: v.id("domainPacks"),
    schemaRevisionId: v.id("canonicalSchemaRevisions"),
    fromStatus: v.union(canonicalSchemaStateValidator, v.null()),
    toStatus: canonicalSchemaStateValidator,
    actor: v.string(),
    reason: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_schemaRevisionId_and_createdAt", [
      "schemaRevisionId",
      "createdAt",
    ])
    .index("by_toStatus_and_createdAt", ["toStatus", "createdAt"])
    .index("by_domainPackId_and_toStatus_and_createdAt", [
      "domainPackId",
      "toStatus",
      "createdAt",
    ])
    .index("by_operationKey", ["operationKey"]),

  canonicalSchemaCompatibility: defineTable({
    domainPackId: v.id("domainPacks"),
    fromRevisionId: v.id("canonicalSchemaRevisions"),
    toRevisionId: v.id("canonicalSchemaRevisions"),
    classification: schemaCompatibilityValidator,
    reasons: v.array(v.string()),
    migration: v.optional(v.any()),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_fromRevisionId_and_toRevisionId", [
      "fromRevisionId",
      "toRevisionId",
    ])
    .index("by_toRevisionId", ["toRevisionId"])
    .index("by_operationKey", ["operationKey"]),

  canonicalMappingSpecs: defineTable({
    projectId: v.id("projects"),
    sourceId: v.id("sources"),
    endpointId: v.optional(v.id("sourceEndpoints")),
    key: v.string(),
    name: v.string(),
    entityType: v.string(),
    createdBy: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_sourceId_and_key", ["sourceId", "key"])
    .index("by_projectId_and_createdAt", ["projectId", "createdAt"])
    .index("by_operationKey", ["operationKey"]),

  canonicalMappingRevisions: defineTable({
    mappingSpecId: v.id("canonicalMappingSpecs"),
    revision: v.number(),
    sourceSchemaVersion: v.string(),
    canonicalSchemaRevisionId: v.id("canonicalSchemaRevisions"),
    deterministic: v.literal(true),
    specification: v.any(),
    specificationHash: v.string(),
    createdBy: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_mappingSpecId_and_revision", ["mappingSpecId", "revision"])
    .index("by_canonicalSchemaRevisionId", ["canonicalSchemaRevisionId"])
    .index("by_operationKey", ["operationKey"]),

  canonicalMappingApprovals: defineTable({
    mappingRevisionId: v.id("canonicalMappingRevisions"),
    decision: mappingApprovalValidator,
    actor: v.string(),
    reason: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_mappingRevisionId_and_createdAt", [
      "mappingRevisionId",
      "createdAt",
    ])
    .index("by_operationKey", ["operationKey"]),

  canonicalMappingTransitions: defineTable({
    mappingSpecId: v.id("canonicalMappingSpecs"),
    mappingRevisionId: v.id("canonicalMappingRevisions"),
    fromStatus: v.union(mappingLifecycleValidator, v.null()),
    toStatus: mappingLifecycleValidator,
    actor: v.string(),
    reason: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_mappingRevisionId_and_createdAt", [
      "mappingRevisionId",
      "createdAt",
    ])
    .index("by_toStatus_and_createdAt", ["toStatus", "createdAt"])
    .index("by_mappingSpecId_and_toStatus_and_createdAt", [
      "mappingSpecId",
      "toStatus",
      "createdAt",
    ])
    .index("by_operationKey", ["operationKey"]),

  canonicalEntities: defineTable({
    projectId: v.id("projects"),
    domainPackId: v.id("domainPacks"),
    entityType: v.string(),
    canonicalKey: v.string(),
    displayName: v.string(),
    status: canonicalEntityStatusValidator,
    mergedIntoId: v.optional(v.id("canonicalEntities")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId_and_entityType_and_canonicalKey", [
      "projectId",
      "entityType",
      "canonicalKey",
    ])
    .index("by_projectId_and_status", ["projectId", "status"])
    .index("by_domainPackId_and_entityType", ["domainPackId", "entityType"]),

  canonicalExternalIds: defineTable({
    projectId: v.id("projects"),
    entityId: v.id("canonicalEntities"),
    sourceId: v.id("sources"),
    namespace: v.string(),
    externalId: v.string(),
    normalizedExternalId: v.string(),
    status: canonicalIdentityStatusValidator,
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_projectId_and_namespace_and_normalizedExternalId", [
      "projectId",
      "namespace",
      "normalizedExternalId",
    ])
    .index("by_projectId_and_sourceId_and_namespace_and_normalizedExternalId", [
      "projectId",
      "sourceId",
      "namespace",
      "normalizedExternalId",
    ])
    .index("by_entityId", ["entityId"])
    .index("by_operationKey", ["operationKey"]),

  canonicalEntityAliases: defineTable({
    projectId: v.id("projects"),
    entityId: v.id("canonicalEntities"),
    sourceId: v.optional(v.id("sources")),
    aliasType: canonicalAliasTypeValidator,
    value: v.string(),
    normalizedValue: v.string(),
    status: canonicalIdentityStatusValidator,
    approvedBy: v.optional(v.string()),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_projectId_and_normalizedValue", ["projectId", "normalizedValue"])
    .index("by_entityId_and_status", ["entityId", "status"])
    .index("by_sourceId_and_normalizedValue", ["sourceId", "normalizedValue"])
    .index("by_operationKey", ["operationKey"]),

  canonicalObservations: defineTable({
    projectId: v.id("projects"),
    sourceId: v.id("sources"),
    endpointId: v.id("sourceEndpoints"),
    collectorBindingId: v.id("collectorBindings"),
    sourceObservationId: v.optional(v.id("aiInfrastructureObservations")),
    fixtureKey: v.optional(v.string()),
    inputKind: v.union(
      v.literal("verified_source"),
      v.literal("stored_fixture"),
    ),
    mappingRevisionId: v.id("canonicalMappingRevisions"),
    canonicalSchemaRevisionId: v.id("canonicalSchemaRevisions"),
    sourceEntityKey: v.string(),
    entityType: v.string(),
    resolvedEntityId: v.optional(v.id("canonicalEntities")),
    trustState: canonicalObservationTrustValidator,
    observedAt: v.number(),
    recordedAt: v.number(),
    payloadHash: v.string(),
    operationKey: v.string(),
  })
    .index("by_operationKey", ["operationKey"])
    .index("by_sourceObservationId", ["sourceObservationId"])
    .index("by_sourceId_and_sourceEntityKey", ["sourceId", "sourceEntityKey"])
    .index("by_resolvedEntityId_and_observedAt", [
      "resolvedEntityId",
      "observedAt",
    ])
    .index("by_projectId_and_recordedAt", ["projectId", "recordedAt"]),

  canonicalObservationFields: defineTable({
    observationId: v.id("canonicalObservations"),
    projectId: v.id("projects"),
    canonicalPath: v.string(),
    rawValue: v.any(),
    normalizedValue: v.any(),
    normalizedValueHash: v.string(),
    unit: v.optional(v.string()),
    originalUnit: v.optional(v.string()),
    state: canonicalFieldStateValidator,
    sourcePaths: v.array(v.string()),
    evidenceRefs: v.array(v.id("evidence")),
    transform: v.object({
      name: v.string(),
      version: v.string(),
      input: v.any(),
    }),
    mappingRevisionId: v.id("canonicalMappingRevisions"),
    createdAt: v.number(),
  })
    .index("by_observationId", ["observationId"])
    .index("by_projectId_and_canonicalPath", ["projectId", "canonicalPath"])
    .index("by_normalizedValueHash", ["normalizedValueHash"]),

  identityCandidates: defineTable({
    projectId: v.id("projects"),
    observationId: v.id("canonicalObservations"),
    candidateEntityId: v.id("canonicalEntities"),
    score: v.number(),
    features: v.array(identityFeatureValidator),
    recommendation: identityRecommendationValidator,
    generatedBy: identityGeneratorValidator,
    explanation: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_observationId_and_score", ["observationId", "score"])
    .index("by_candidateEntityId_and_createdAt", [
      "candidateEntityId",
      "createdAt",
    ])
    .index("by_operationKey", ["operationKey"]),

  identityReviewDecisions: defineTable({
    projectId: v.id("projects"),
    candidateId: v.id("identityCandidates"),
    decision: identityReviewDecisionValidator,
    chosenEntityId: v.optional(v.id("canonicalEntities")),
    actor: v.string(),
    reason: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_candidateId_and_createdAt", ["candidateId", "createdAt"])
    .index("by_operationKey", ["operationKey"]),

  canonicalObservationResolutions: defineTable({
    projectId: v.id("projects"),
    observationId: v.id("canonicalObservations"),
    entityId: v.id("canonicalEntities"),
    method: v.union(
      v.literal("exact_external_id"),
      v.literal("approved_alias"),
      v.literal("canonical_key"),
      v.literal("created_entity"),
      v.literal("human_review"),
    ),
    candidateId: v.optional(v.id("identityCandidates")),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_observationId_and_createdAt", ["observationId", "createdAt"])
    .index("by_entityId_and_createdAt", ["entityId", "createdAt"])
    .index("by_operationKey", ["operationKey"]),

  canonicalEntityOperations: defineTable({
    projectId: v.id("projects"),
    kind: entityOperationKindValidator,
    sourceEntityIds: v.array(v.id("canonicalEntities")),
    targetEntityIds: v.array(v.id("canonicalEntities")),
    reason: v.string(),
    actor: v.string(),
    evidenceRefs: v.array(v.id("evidence")),
    reversalOfId: v.optional(v.id("canonicalEntityOperations")),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_projectId_and_createdAt", ["projectId", "createdAt"])
    .index("by_reversalOfId", ["reversalOfId"])
    .index("by_operationKey", ["operationKey"]),

  canonicalEntityLineage: defineTable({
    projectId: v.id("projects"),
    fromEntityId: v.id("canonicalEntities"),
    toEntityId: v.id("canonicalEntities"),
    relationship: entityLineageRelationshipValidator,
    status: entityLineageStatusValidator,
    operationId: v.id("canonicalEntityOperations"),
    reversedByOperationId: v.optional(v.id("canonicalEntityOperations")),
    reason: v.string(),
    createdAt: v.number(),
    reversedAt: v.optional(v.number()),
  })
    .index("by_fromEntityId_and_status", ["fromEntityId", "status"])
    .index("by_toEntityId_and_status", ["toEntityId", "status"])
    .index("by_operationId", ["operationId"]),

  phase6Proofs: defineTable({
    key: v.string(),
    projectId: v.id("projects"),
    schemaRevisionId: v.id("canonicalSchemaRevisions"),
    draftSchemaRevisionId: v.optional(v.id("canonicalSchemaRevisions")),
    compatibilityId: v.optional(v.id("canonicalSchemaCompatibility")),
    mappingRevisionIds: v.array(v.id("canonicalMappingRevisions")),
    observationIds: v.array(v.id("canonicalObservations")),
    resolvedEntityId: v.id("canonicalEntities"),
    ambiguousCandidateIds: v.array(v.id("identityCandidates")),
    entityOperationIds: v.array(v.id("canonicalEntityOperations")),
    createdAt: v.number(),
  }).index("by_key", ["key"]),

  factFreshnessPolicies: defineTable({
    projectId: v.id("projects"),
    entityType: v.optional(v.string()),
    predicate: v.string(),
    maxAgeMs: v.number(),
    allowLastKnownGood: v.boolean(),
    status: factFreshnessPolicyStatusValidator,
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_projectId_and_predicate_and_status", [
      "projectId",
      "predicate",
      "status",
    ])
    .index("by_operationKey", ["operationKey"]),

  factReleaseDecisions: defineTable({
    projectId: v.id("projects"),
    entityId: v.id("canonicalEntities"),
    predicate: v.string(),
    policyId: v.id("factFreshnessPolicies"),
    candidateObservationIds: v.array(v.id("canonicalObservations")),
    previousFactVersionId: v.optional(v.id("factVersions")),
    outcome: factReleaseOutcomeValidator,
    reasonCodes: v.array(v.string()),
    details: v.any(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_entityId_and_predicate_and_createdAt", [
      "entityId",
      "predicate",
      "createdAt",
    ])
    .index("by_operationKey", ["operationKey"]),

  factVersions: defineTable({
    projectId: v.id("projects"),
    entityId: v.id("canonicalEntities"),
    predicate: v.string(),
    value: v.any(),
    valueHash: v.string(),
    unit: v.optional(v.string()),
    validFrom: v.optional(v.number()),
    validTo: v.optional(v.number()),
    validTimeSource: factValidTimeSourceValidator,
    transactionFrom: v.number(),
    state: factVersionStateValidator,
    changeKind: factChangeKindValidator,
    releaseDecisionId: v.id("factReleaseDecisions"),
    sourceObservationIds: v.array(v.id("canonicalObservations")),
    evidenceRefs: v.array(v.id("evidence")),
    mappingRevisionId: v.id("canonicalMappingRevisions"),
    collectorBindingId: v.id("collectorBindings"),
    runId: v.optional(v.id("runs")),
    certificateId: v.optional(v.id("certificates")),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_entityId_and_transactionFrom", ["entityId", "transactionFrom"])
    .index("by_entityId_and_predicate_and_transactionFrom", [
      "entityId",
      "predicate",
      "transactionFrom",
    ])
    .index("by_projectId_and_predicate_and_transactionFrom", [
      "projectId",
      "predicate",
      "transactionFrom",
    ])
    .index("by_state_and_transactionFrom", ["state", "transactionFrom"])
    .index("by_operationKey", ["operationKey"]),

  factVersionRelations: defineTable({
    projectId: v.id("projects"),
    entityId: v.id("canonicalEntities"),
    predicate: v.string(),
    fromFactVersionId: v.id("factVersions"),
    toFactVersionId: v.id("factVersions"),
    kind: factVersionRelationKindValidator,
    reason: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_fromFactVersionId_and_createdAt", [
      "fromFactVersionId",
      "createdAt",
    ])
    .index("by_toFactVersionId_and_createdAt", ["toFactVersionId", "createdAt"])
    .index("by_entityId_and_predicate_and_createdAt", [
      "entityId",
      "predicate",
      "createdAt",
    ])
    .index("by_operationKey", ["operationKey"]),

  currentFacts: defineTable({
    projectId: v.id("projects"),
    entityId: v.id("canonicalEntities"),
    predicate: v.string(),
    factVersionId: v.id("factVersions"),
    releaseDecisionId: v.id("factReleaseDecisions"),
    policyId: v.id("factFreshnessPolicies"),
    valueHash: v.string(),
    state: currentFactStateValidator,
    servingLabel: currentFactServingLabelValidator,
    lastVerifiedAt: v.number(),
    freshnessDeadline: v.number(),
    updatedAt: v.number(),
  })
    .index("by_entityId", ["entityId"])
    .index("by_entityId_and_predicate", ["entityId", "predicate"])
    .index("by_projectId_and_predicate", ["projectId", "predicate"])
    .index("by_freshnessDeadline", ["freshnessDeadline"]),

  phase7Proofs: defineTable({
    key: v.string(),
    projectId: v.id("projects"),
    aiModelEntityId: v.id("canonicalEntities"),
    productEntityId: v.id("canonicalEntities"),
    policyIds: v.array(v.id("factFreshnessPolicies")),
    factVersionIds: v.array(v.id("factVersions")),
    relationIds: v.array(v.id("factVersionRelations")),
    currentFactIds: v.array(v.id("currentFacts")),
    createdAt: v.number(),
  }).index("by_key", ["key"]),

  releasePolicies: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    predicate: v.string(),
    revision: v.number(),
    status: releasePolicyStatusValidator,
    strategy: reconciliationStrategyValidator,
    equivalenceRule: equivalenceRuleValidator,
    numericTolerancePercent: v.optional(v.number()),
    quorum: v.optional(v.number()),
    continueLastKnownGood: v.boolean(),
    explicitRemovalRequired: v.boolean(),
    repeatedAbsenceMinimum: v.number(),
    policyHash: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_projectId_and_predicate_and_revision", [
      "projectId",
      "predicate",
      "revision",
    ])
    .index("by_projectId_and_status_and_createdAt", [
      "projectId",
      "status",
      "createdAt",
    ])
    .index("by_operationKey", ["operationKey"]),

  releasePolicySources: defineTable({
    policyId: v.id("releasePolicies"),
    sourceId: v.id("sources"),
    priority: v.number(),
    role: policySourceRoleValidator,
    independenceGroup: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_policyId_and_priority", ["policyId", "priority"])
    .index("by_policyId_and_sourceId", ["policyId", "sourceId"])
    .index("by_operationKey", ["operationKey"]),

  releaseDecisions: defineTable({
    projectId: v.id("projects"),
    entityId: v.id("canonicalEntities"),
    predicate: v.string(),
    policyId: v.id("releasePolicies"),
    strategy: reconciliationStrategyValidator,
    candidateObservationIds: v.array(v.id("canonicalObservations")),
    candidateSourceIds: v.array(v.id("sources")),
    candidateValueHashes: v.array(v.string()),
    selectedObservationIds: v.array(v.id("canonicalObservations")),
    selectedValueHash: v.optional(v.string()),
    previousFactVersionId: v.optional(v.id("factVersions")),
    nextFactVersionId: v.optional(v.id("factVersions")),
    outcome: releaseDecisionOutcomeValidator,
    independentGroupCount: v.number(),
    reasonCodes: v.array(v.string()),
    details: v.any(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_entityId_and_predicate_and_createdAt", [
      "entityId",
      "predicate",
      "createdAt",
    ])
    .index("by_policyId_and_createdAt", ["policyId", "createdAt"])
    .index("by_operationKey", ["operationKey"]),

  sourceConflicts: defineTable({
    projectId: v.id("projects"),
    entityId: v.id("canonicalEntities"),
    predicate: v.string(),
    policyId: v.id("releasePolicies"),
    releaseDecisionId: v.id("releaseDecisions"),
    status: sourceConflictStatusValidator,
    candidateObservationIds: v.array(v.id("canonicalObservations")),
    candidateSourceIds: v.array(v.id("sources")),
    candidateValueHashes: v.array(v.string()),
    independentGroupCount: v.number(),
    releasedFactVersionId: v.optional(v.id("factVersions")),
    reason: v.string(),
    resolution: v.optional(v.any()),
    operationKey: v.string(),
    openedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_projectId_and_status_and_openedAt", [
      "projectId",
      "status",
      "openedAt",
    ])
    .index("by_entityId_and_predicate_and_openedAt", [
      "entityId",
      "predicate",
      "openedAt",
    ])
    .index("by_releaseDecisionId", ["releaseDecisionId"])
    .index("by_operationKey", ["operationKey"]),

  changeEvents: defineTable({
    projectId: v.id("projects"),
    eventId: v.string(),
    eventType: semanticEventTypeValidator,
    state: changeEventStateValidator,
    businessEvent: v.boolean(),
    entityId: v.id("canonicalEntities"),
    predicate: v.optional(v.string()),
    releaseDecisionId: v.id("releaseDecisions"),
    conflictId: v.optional(v.id("sourceConflicts")),
    previousFactVersionId: v.optional(v.id("factVersions")),
    nextFactVersionId: v.optional(v.id("factVersions")),
    previousValueHash: v.optional(v.string()),
    nextValueHash: v.optional(v.string()),
    validFrom: v.optional(v.number()),
    observedAt: v.number(),
    releasedAt: v.optional(v.number()),
    sourceObservationIds: v.array(v.id("canonicalObservations")),
    evidenceRefs: v.array(v.id("evidence")),
    certificateId: v.optional(v.id("certificates")),
    correctionOfEventId: v.optional(v.string()),
    eventHash: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_operationKey", ["operationKey"])
    .index("by_releaseDecisionId", ["releaseDecisionId"])
    .index("by_projectId_and_createdAt", ["projectId", "createdAt"])
    .index("by_projectId_and_eventType_and_createdAt", [
      "projectId",
      "eventType",
      "createdAt",
    ])
    .index("by_entityId_and_createdAt", ["entityId", "createdAt"])
    .index("by_state_and_createdAt", ["state", "createdAt"]),

  changeEventTransitions: defineTable({
    eventId: v.id("changeEvents"),
    fromState: v.union(changeEventStateValidator, v.null()),
    toState: changeEventStateValidator,
    reason: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_eventId_and_createdAt", ["eventId", "createdAt"])
    .index("by_operationKey", ["operationKey"]),

  changeEventRelations: defineTable({
    projectId: v.id("projects"),
    fromEventId: v.id("changeEvents"),
    toEventId: v.id("changeEvents"),
    kind: changeEventRelationKindValidator,
    reason: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_fromEventId_and_createdAt", ["fromEventId", "createdAt"])
    .index("by_toEventId_and_createdAt", ["toEventId", "createdAt"])
    .index("by_operationKey", ["operationKey"]),

  phase8Proofs: defineTable({
    key: v.string(),
    projectId: v.id("projects"),
    entityId: v.id("canonicalEntities"),
    policyIds: v.array(v.id("releasePolicies")),
    decisionIds: v.array(v.id("releaseDecisions")),
    eventIds: v.array(v.id("changeEvents")),
    conflictIds: v.array(v.id("sourceConflicts")),
    blockedDecisionIds: v.array(v.id("releaseDecisions")),
    createdAt: v.number(),
  }).index("by_key", ["key"]),

  provenanceNodes: defineTable({
    projectId: v.id("projects"),
    nodeType: provenanceNodeTypeValidator,
    externalId: v.string(),
    label: v.string(),
    integrityDigest: v.optional(v.string()),
    metadata: v.any(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_operationKey", ["operationKey"])
    .index("by_nodeType_and_externalId", ["nodeType", "externalId"])
    .index("by_projectId_and_nodeType_and_createdAt", [
      "projectId",
      "nodeType",
      "createdAt",
    ]),

  provenanceEdges: defineTable({
    projectId: v.id("projects"),
    fromNodeId: v.id("provenanceNodes"),
    relationship: provenanceRelationshipValidator,
    toNodeId: v.id("provenanceNodes"),
    metadata: v.any(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_operationKey", ["operationKey"])
    .index("by_fromNodeId_and_createdAt", ["fromNodeId", "createdAt"])
    .index("by_toNodeId_and_createdAt", ["toNodeId", "createdAt"])
    .index("by_projectId_and_relationship_and_createdAt", [
      "projectId",
      "relationship",
      "createdAt",
    ]),

  evidenceBundles: defineTable({
    projectId: v.id("projects"),
    incidentId: v.optional(v.id("incidents")),
    eventId: v.optional(v.id("changeEvents")),
    factVersionId: v.optional(v.id("factVersions")),
    coreCertificateId: v.optional(v.id("certificates")),
    bundleKey: v.string(),
    status: evidenceBundleStatusValidator,
    digest: v.string(),
    manifestDigest: v.string(),
    artifactCount: v.number(),
    operationKey: v.string(),
    createdAt: v.number(),
    sealedAt: v.optional(v.number()),
  })
    .index("by_operationKey", ["operationKey"])
    .index("by_bundleKey", ["bundleKey"])
    .index("by_digest", ["digest"])
    .index("by_incidentId_and_createdAt", ["incidentId", "createdAt"])
    .index("by_eventId", ["eventId"]),

  evidenceBundleArtifacts: defineTable({
    bundleId: v.id("evidenceBundles"),
    kind: evidenceArtifactKindValidator,
    evidenceId: v.optional(v.id("evidence")),
    storageId: v.optional(v.id("_storage")),
    reference: v.optional(v.string()),
    contentDigest: v.string(),
    retainedUntil: v.optional(v.number()),
    metadata: v.any(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_bundleId_and_createdAt", ["bundleId", "createdAt"])
    .index("by_operationKey", ["operationKey"]),

  downstreamConsumers: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    kind: downstreamConsumerKindValidator,
    predicate: v.string(),
    status: downstreamConsumerStatusValidator,
    operationKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_operationKey", ["operationKey"])
    .index("by_projectId_and_predicate_and_status", [
      "projectId",
      "predicate",
      "status",
    ]),

  blastRadiusAssessments: defineTable({
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    sourceId: v.optional(v.id("sources")),
    collectorBindingId: v.optional(v.id("collectorBindings")),
    affectedFieldCount: v.number(),
    affectedEntityCount: v.number(),
    affectedFactCount: v.number(),
    affectedEventCount: v.number(),
    affectedSubscriberCount: v.number(),
    affectedDownstreamCount: v.number(),
    freshnessImpact: v.string(),
    lastKnownGoodAvailable: v.boolean(),
    alternateSourceCoverage: v.boolean(),
    estimatedFalseEventBlastRadius: v.number(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_operationKey", ["operationKey"])
    .index("by_incidentId_and_createdAt", ["incidentId", "createdAt"]),

  blastRadiusImpacts: defineTable({
    assessmentId: v.id("blastRadiusAssessments"),
    projectId: v.id("projects"),
    kind: blastImpactKindValidator,
    targetId: v.string(),
    label: v.string(),
    state: blastImpactStateValidator,
    details: v.any(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_assessmentId_and_kind", ["assessmentId", "kind"])
    .index("by_operationKey", ["operationKey"]),

  repairTribunalContexts: defineTable({
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    healAttemptId: v.id("healAttempts"),
    blastRadiusAssessmentId: v.id("blastRadiusAssessments"),
    sourceMappingCount: v.number(),
    canonicalFieldCount: v.number(),
    currentFactCount: v.number(),
    openConflictCount: v.number(),
    estimatedEventBlastRadius: v.number(),
    independentSupportAvailable: v.boolean(),
    identityChangeRisk: v.boolean(),
    summary: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_operationKey", ["operationKey"])
    .index("by_incidentId_and_createdAt", ["incidentId", "createdAt"])
    .index("by_healAttemptId", ["healAttemptId"]),

  repairTribunalContextItems: defineTable({
    contextId: v.id("repairTribunalContexts"),
    kind: tribunalContextItemKindValidator,
    targetId: v.string(),
    label: v.string(),
    details: v.any(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_contextId_and_kind", ["contextId", "kind"])
    .index("by_operationKey", ["operationKey"]),

  repairCandidateVersions: defineTable({
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    healAttemptId: v.id("healAttempts"),
    collectorId: v.id("collectors"),
    bindingId: v.optional(v.id("collectorBindings")),
    candidateVersion: v.string(),
    priorActiveVersion: v.optional(v.string()),
    status: repairCandidateStatusValidator,
    operationKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_operationKey", ["operationKey"])
    .index("by_incidentId_and_createdAt", ["incidentId", "createdAt"])
    .index("by_collectorId_and_status", ["collectorId", "status"]),

  repairCanaryRuns: defineTable({
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    healAttemptId: v.id("healAttempts"),
    candidateVersionId: v.id("repairCandidateVersions"),
    status: canaryStatusValidator,
    currentStage: canaryStageValidator,
    thresholds: canaryThresholdsValidator,
    totalChecks: v.number(),
    passedChecks: v.number(),
    criticalFailures: v.number(),
    falseEventCount: v.number(),
    automaticStopReason: v.optional(v.string()),
    operationKey: v.string(),
    startedAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_operationKey", ["operationKey"])
    .index("by_incidentId_and_startedAt", ["incidentId", "startedAt"])
    .index("by_status_and_updatedAt", ["status", "updatedAt"]),

  canaryStageResults: defineTable({
    canaryRunId: v.id("repairCanaryRuns"),
    stage: canaryStageValidator,
    outcome: verificationOutcomeValidator,
    totalCases: v.number(),
    passedCases: v.number(),
    criticalFailures: v.number(),
    falseEventCount: v.number(),
    extractionAssertionsPassed: v.boolean(),
    eventAssertionsPassed: v.boolean(),
    identityStable: v.boolean(),
    schemaCompatible: v.boolean(),
    mappingCompatible: v.boolean(),
    evidenceDigest: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_canaryRunId_and_stage", ["canaryRunId", "stage"])
    .index("by_operationKey", ["operationKey"]),

  repairEventHolds: defineTable({
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    canaryRunId: v.id("repairCanaryRuns"),
    eventId: v.id("changeEvents"),
    reason: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_canaryRunId_and_createdAt", ["canaryRunId", "createdAt"])
    .index("by_eventId", ["eventId"])
    .index("by_operationKey", ["operationKey"]),

  fleetGauntletSuites: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    revision: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("retired"),
    ),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_operationKey", ["operationKey"])
    .index("by_projectId_and_status_and_createdAt", [
      "projectId",
      "status",
      "createdAt",
    ]),

  fleetGauntletCases: defineTable({
    suiteId: v.id("fleetGauntletSuites"),
    caseId: v.string(),
    name: v.string(),
    archetype: sourceArchetypeValidator,
    category: mutationCategoryValidator,
    visibility: fleetCaseVisibilityValidator,
    transformVersion: v.string(),
    canonicalField: v.string(),
    expectedRelation: fleetExpectedRelationValidator,
    expectedEventTypes: v.array(v.string()),
    forbiddenEventTypes: v.array(v.string()),
    critical: v.boolean(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_suiteId_and_caseId", ["suiteId", "caseId"])
    .index("by_suiteId_and_visibility", ["suiteId", "visibility"])
    .index("by_operationKey", ["operationKey"]),

  fleetGauntletRuns: defineTable({
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    healAttemptId: v.id("healAttempts"),
    canaryRunId: v.id("repairCanaryRuns"),
    suiteId: v.id("fleetGauntletSuites"),
    status: gauntletRunStatusValidator,
    totalCases: v.number(),
    passedCases: v.number(),
    heldOutTotal: v.number(),
    heldOutPassed: v.number(),
    criticalFailures: v.number(),
    falseEventCount: v.number(),
    operationKey: v.string(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_operationKey", ["operationKey"])
    .index("by_incidentId_and_startedAt", ["incidentId", "startedAt"])
    .index("by_canaryRunId", ["canaryRunId"]),

  fleetGauntletResults: defineTable({
    gauntletRunId: v.id("fleetGauntletRuns"),
    caseId: v.id("fleetGauntletCases"),
    outcome: verificationOutcomeValidator,
    observedRelation: fleetExpectedRelationValidator,
    extractedValueHash: v.optional(v.string()),
    releasedValueHash: v.optional(v.string()),
    emittedEventTypes: v.array(v.string()),
    extractionAssertionPassed: v.boolean(),
    eventAssertionPassed: v.boolean(),
    falseHeal: v.boolean(),
    falseEvent: v.boolean(),
    detectionMs: v.number(),
    recoveryMs: v.optional(v.number()),
    evidenceDigest: v.string(),
    reason: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_gauntletRunId_and_caseId", ["gauntletRunId", "caseId"])
    .index("by_operationKey", ["operationKey"]),

  fleetBenchmarkMetrics: defineTable({
    projectId: v.id("projects"),
    gauntletRunId: v.id("fleetGauntletRuns"),
    silentCorruptionCatchRate: v.number(),
    correctTriageRate: v.number(),
    falseHealRate: v.number(),
    heldOutRepairPassRate: v.number(),
    entityResolutionPrecision: v.number(),
    semanticEventPrecision: v.number(),
    semanticEventRecall: v.number(),
    falseEventCount: v.number(),
    correctionClassificationAccuracy: v.number(),
    timeToVerifiedRecoveryMs: v.number(),
    lastKnownGoodAvailability: v.number(),
    sourceFreshnessAfterIncident: v.number(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_gauntletRunId", ["gauntletRunId"])
    .index("by_projectId_and_createdAt", ["projectId", "createdAt"])
    .index("by_operationKey", ["operationKey"]),

  extendedRepairCertificates: defineTable({
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    healAttemptId: v.id("healAttempts"),
    canaryRunId: v.id("repairCanaryRuns"),
    gauntletRunId: v.id("fleetGauntletRuns"),
    evidenceBundleId: v.id("evidenceBundles"),
    coreCertificateId: v.optional(v.id("certificates")),
    status: extendedCertificateStatusValidator,
    payload: extendedCertificatePayloadValidator,
    digest: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_operationKey", ["operationKey"])
    .index("by_incidentId_and_createdAt", ["incidentId", "createdAt"])
    .index("by_digest", ["digest"]),

  phase9Proofs: defineTable({
    key: v.string(),
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    evidenceBundleId: v.id("evidenceBundles"),
    rootNodeId: v.id("provenanceNodes"),
    blastRadiusAssessmentId: v.id("blastRadiusAssessments"),
    tribunalContextId: v.id("repairTribunalContexts"),
    failedCanaryRunId: v.id("repairCanaryRuns"),
    passedCanaryRunId: v.id("repairCanaryRuns"),
    gauntletRunId: v.id("fleetGauntletRuns"),
    extendedCertificateId: v.id("extendedRepairCertificates"),
    createdAt: v.number(),
  }).index("by_key", ["key"]),

  apiKeys: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    prefix: v.string(),
    secretHash: v.string(),
    scopes: v.array(apiScopeValidator),
    status: apiKeyStatusValidator,
    rateLimitPerMinute: v.number(),
    operationKey: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_secretHash", ["secretHash"])
    .index("by_projectId_and_status_and_createdAt", [
      "projectId",
      "status",
      "createdAt",
    ])
    .index("by_operationKey", ["operationKey"]),

  apiRateLimitBuckets: defineTable({
    apiKeyId: v.id("apiKeys"),
    bucketStart: v.number(),
    requestCount: v.number(),
    updatedAt: v.number(),
  }).index("by_apiKeyId_and_bucketStart", ["apiKeyId", "bucketStart"]),

  apiRequestAudit: defineTable({
    projectId: v.optional(v.id("projects")),
    apiKeyId: v.optional(v.id("apiKeys")),
    requestId: v.string(),
    scope: apiScopeValidator,
    resource: v.string(),
    outcome: apiRequestOutcomeValidator,
    createdAt: v.number(),
  })
    .index("by_requestId", ["requestId"])
    .index("by_projectId_and_createdAt", ["projectId", "createdAt"]),

  apiContracts: defineTable({
    identifier: v.string(),
    version: v.string(),
    kind: apiContractKindValidator,
    schemaHash: v.string(),
    status: apiContractStatusValidator,
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_identifier_and_version", ["identifier", "version"])
    .index("by_operationKey", ["operationKey"]),

  filteredSubscriptions: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    channel: subscriptionChannelValidator,
    filters: phase10FilterValidator,
    webhookEndpointId: v.optional(v.id("webhookEndpoints")),
    status: subscriptionStatusValidator,
    operationKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId_and_status_and_createdAt", [
      "projectId",
      "status",
      "createdAt",
    ])
    .index("by_operationKey", ["operationKey"]),

  webhookEndpoints: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    url: v.string(),
    status: webhookEndpointStatusValidator,
    activeSecretVersionId: v.optional(v.id("webhookSecretVersions")),
    operationKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    rotatedAt: v.optional(v.number()),
  })
    .index("by_projectId_and_status_and_createdAt", [
      "projectId",
      "status",
      "createdAt",
    ])
    .index("by_operationKey", ["operationKey"]),

  webhookSecretVersions: defineTable({
    endpointId: v.id("webhookEndpoints"),
    version: v.number(),
    secretHash: v.string(),
    secretRef: v.string(),
    status: webhookSecretStatusValidator,
    rotatedFromId: v.optional(v.id("webhookSecretVersions")),
    operationKey: v.string(),
    createdAt: v.number(),
    retiredAt: v.optional(v.number()),
  })
    .index("by_endpointId_and_version", ["endpointId", "version"])
    .index("by_operationKey", ["operationKey"]),

  webhookDeliveries: defineTable({
    projectId: v.id("projects"),
    subscriptionId: v.id("filteredSubscriptions"),
    endpointId: v.id("webhookEndpoints"),
    eventId: v.optional(v.id("changeEvents")),
    eventExternalId: v.string(),
    mode: deliveryModeValidator,
    payload: v.any(),
    payloadHash: v.string(),
    idempotencyKey: v.string(),
    status: deliveryStatusValidator,
    attemptCount: v.number(),
    maxAttempts: v.number(),
    nextAttemptAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_status_and_nextAttemptAt", ["status", "nextAttemptAt"])
    .index("by_subscriptionId_and_createdAt", ["subscriptionId", "createdAt"])
    .index("by_eventExternalId", ["eventExternalId"]),

  webhookDeliveryAttempts: defineTable({
    deliveryId: v.id("webhookDeliveries"),
    attempt: v.number(),
    requestId: v.string(),
    outcome: deliveryAttemptOutcomeValidator,
    responseStatus: v.optional(v.number()),
    responseSnippet: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    latencyMs: v.number(),
    secretVersionId: v.id("webhookSecretVersions"),
    signatureTimestamp: v.number(),
    signatureInput: v.string(),
    signature: v.string(),
    bodyHash: v.string(),
    createdAt: v.number(),
  })
    .index("by_deliveryId_and_attempt", ["deliveryId", "attempt"])
    .index("by_requestId", ["requestId"]),

  webhookReplayRequests: defineTable({
    projectId: v.id("projects"),
    deliveryId: v.id("webhookDeliveries"),
    replayDeliveryId: v.id("webhookDeliveries"),
    reason: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_deliveryId_and_createdAt", ["deliveryId", "createdAt"])
    .index("by_operationKey", ["operationKey"]),

  phase10Proofs: defineTable({
    key: v.string(),
    projectId: v.id("projects"),
    apiKeyId: v.id("apiKeys"),
    subscriptionId: v.id("filteredSubscriptions"),
    endpointId: v.id("webhookEndpoints"),
    secretVersionIds: v.array(v.id("webhookSecretVersions")),
    sourceDeliveryId: v.id("webhookDeliveries"),
    replayDeliveryId: v.id("webhookDeliveries"),
    contractIds: v.array(v.id("apiContracts")),
    releasedFactVersionId: v.id("factVersions"),
    createdAt: v.number(),
  }).index("by_key", ["key"]),

  authUsers: defineTable({
    authUserId: v.optional(v.id("users")),
    tokenIdentifier: v.string(),
    subject: v.string(),
    displayName: v.string(),
    email: v.optional(v.string()),
    authMethod: v.union(v.literal("passkey"), v.literal("password")),
    status: v.union(v.literal("active"), v.literal("disabled")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_authUserId", ["authUserId"])
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_subject", ["subject"]),

  organizations: defineTable({
    slug: v.string(),
    name: v.string(),
    status: v.union(v.literal("active"), v.literal("suspended")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),

  organizationMemberships: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("authUsers"),
    role: organizationRoleValidator,
    status: membershipStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId_and_userId", ["organizationId", "userId"])
    .index("by_userId_and_status", ["userId", "status"]),

  projectTenancies: defineTable({
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    createdAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_organizationId_and_projectId", ["organizationId", "projectId"]),

  securityAuditEvents: defineTable({
    organizationId: v.optional(v.id("organizations")),
    projectId: v.optional(v.id("projects")),
    actorUserId: v.optional(v.id("authUsers")),
    action: v.string(),
    targetType: v.string(),
    targetId: v.string(),
    decision: securityDecisionValidator,
    reason: v.string(),
    redactedPayload: v.any(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_operationKey", ["operationKey"])
    .index("by_organizationId_and_createdAt", ["organizationId", "createdAt"])
    .index("by_projectId_and_createdAt", ["projectId", "createdAt"]),

  secretReferences: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    provider: v.string(),
    secretRef: v.string(),
    version: v.number(),
    status: secretStatusValidator,
    rotatedAt: v.optional(v.number()),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_organizationId_and_status", ["organizationId", "status"])
    .index("by_operationKey", ["operationKey"]),

  secretRedactionEvents: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.optional(v.id("projects")),
    sourceType: v.string(),
    sourceId: v.string(),
    detectedKinds: v.array(v.string()),
    redactedHash: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_organizationId_and_createdAt", ["organizationId", "createdAt"])
    .index("by_operationKey", ["operationKey"]),

  operationsAlerts: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.optional(v.id("projects")),
    kind: v.string(),
    severity: alertSeverityValidator,
    status: alertStatusValidator,
    summary: v.string(),
    runbookKey: v.string(),
    operationKey: v.string(),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_organizationId_and_status_and_createdAt", ["organizationId", "status", "createdAt"])
    .index("by_operationKey", ["operationKey"]),

  operationsRunbooks: defineTable({
    key: v.string(),
    title: v.string(),
    revision: v.number(),
    steps: v.array(v.string()),
    status: v.union(v.literal("active"), v.literal("retired")),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_key_and_revision", ["key", "revision"])
    .index("by_operationKey", ["operationKey"]),

  backupExportRecords: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    kind: v.union(v.literal("backup"), v.literal("export")),
    status: backupStatusValidator,
    snapshotRef: v.optional(v.string()),
    digest: v.optional(v.string()),
    requestedAt: v.number(),
    completedAt: v.optional(v.number()),
    operationKey: v.string(),
  })
    .index("by_projectId_and_requestedAt", ["projectId", "requestedAt"])
    .index("by_operationKey", ["operationKey"]),

  operationsCostSnapshots: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    period: v.string(),
    apiRequests: v.number(),
    webhookAttempts: v.number(),
    collectorRuns: v.number(),
    aiCalls: v.number(),
    estimatedUsd: v.number(),
    operationKey: v.string(),
    capturedAt: v.number(),
  })
    .index("by_projectId_and_capturedAt", ["projectId", "capturedAt"])
    .index("by_operationKey", ["operationKey"]),

  operationsFreshnessSnapshots: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    releasedFacts: v.number(),
    freshFacts: v.number(),
    staleFacts: v.number(),
    compliancePercent: v.number(),
    operationKey: v.string(),
    capturedAt: v.number(),
  })
    .index("by_projectId_and_capturedAt", ["projectId", "capturedAt"])
    .index("by_operationKey", ["operationKey"]),

  aiRouterIngestions: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    eventId: v.id("changeEvents"),
    status: routerStatusValidator,
    verifiedEventHash: v.string(),
    evidenceRefs: v.array(v.id("evidence")),
    rawPageAccepted: v.literal(false),
    promptInjectionBlocked: v.boolean(),
    proposedChange: v.any(),
    approvedByUserId: v.optional(v.id("authUsers")),
    approvedAt: v.optional(v.number()),
    consumedAt: v.optional(v.number()),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_projectId_and_status_and_createdAt", ["projectId", "status", "createdAt"])
    .index("by_operationKey", ["operationKey"]),

  chaosRuns: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    status: v.union(v.literal("running"), v.literal("passed"), v.literal("failed")),
    operationKey: v.string(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_operationKey", ["operationKey"]),

  chaosCaseResults: defineTable({
    chaosRunId: v.id("chaosRuns"),
    kind: chaosKindValidator,
    outcome: chaosOutcomeValidator,
    contained: v.boolean(),
    alertId: v.id("operationsAlerts"),
    details: v.any(),
    operationKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_chaosRunId_and_kind", ["chaosRunId", "kind"])
    .index("by_operationKey", ["operationKey"]),

  phase11Proofs: defineTable({
    key: v.string(),
    primaryOrganizationId: v.id("organizations"),
    foreignOrganizationId: v.id("organizations"),
    primaryUserId: v.id("authUsers"),
    foreignUserId: v.id("authUsers"),
    projectId: v.id("projects"),
    routerIngestionId: v.id("aiRouterIngestions"),
    promptInjectionIngestionId: v.id("aiRouterIngestions"),
    chaosRunId: v.id("chaosRuns"),
    unauthorizedApprovalDenied: v.boolean(),
    crossTenantReadDenied: v.boolean(),
    createdAt: v.number(),
  }).index("by_key", ["key"]),

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
