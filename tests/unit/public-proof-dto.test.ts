/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");
const now = 1_787_400_000;

const forbiddenKeys = new Set([
  "operationKey",
  "raw",
  "rawValue",
  "normalized",
  "normalizedValue",
  "actor",
  "reviewerId",
  "sourceUrl",
  "storageId",
  "transform",
  "input",
  "createdBy",
  "metadata",
  "details",
  "sourceId",
  "endpointId",
  "collectorBindingId",
  "mappingRevisionId",
  "sourceObservationIds",
  "evidenceRefs",
]);

function collectForbiddenKeys(value: unknown, path = "root"): string[] {
  if (Array.isArray(value))
    return value.flatMap((item, index) =>
      collectForbiddenKeys(item, `${path}[${index}]`),
    );
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) => [
      ...(forbiddenKeys.has(key) ? [`${path}.${key}`] : []),
      ...collectForbiddenKeys(child, `${path}.${key}`),
    ],
  );
}

async function proofFixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const projectId = await ctx.db.insert("projects", {
      name: "Published proof DTO",
      slug: "published-proof-dto",
      status: "active",
      publicReadStatus: "published",
      createdAt: now,
      updatedAt: now,
    });
    const domainPackId = await ctx.db.insert("domainPacks", {
      key: "proof-dto",
      name: "Proof DTO",
      version: "1.0.0",
      status: "active",
      coreRequired: true,
      createdAt: now,
      updatedAt: now,
    });
    const sourceId = await ctx.db.insert("sources", {
      domainPackId,
      key: "private-proof-source",
      name: "Private proof source",
      providerKey: "private-provider",
      sourceType: "pricing",
      official: true,
      visibility: "private",
      approvalStatus: "approved",
      lifecycleStatus: "active",
      createdAt: now,
      updatedAt: now,
    });
    const endpointId = await ctx.db.insert("sourceEndpoints", {
      sourceId,
      url: "https://private.example.test/proof",
      host: "private.example.test",
      pathPrefix: "/proof",
      public: false,
      approvalStatus: "approved",
      createdAt: now,
      updatedAt: now,
    });
    const collectorId = await ctx.db.insert("collectors", {
      projectId,
      collectorId: "proof-dto-collector",
      name: "Proof DTO collector",
      workerType: "browser",
      targetUrl: "https://private.example.test/proof",
      createdAfterKickoff: true,
      status: "published",
    });
    const bindingId = await ctx.db.insert("collectorBindings", {
      sourceId,
      endpointId,
      collectorId,
      bindingKind: "production",
      lifecycleStatus: "active",
      coreGateStatus: "certified",
      bypassCore: false,
      operationKey: "secret:binding:operation",
      createdAt: now,
      updatedAt: now,
    });
    const runId = await ctx.db.insert("runs", {
      projectId,
      collectorId,
      mode: "baseline",
      status: "verified",
      startedAt: now,
      completedAt: now,
      rowCount: 1,
    });
    const evidenceId = await ctx.db.insert("evidence", {
      projectId,
      runId,
      kind: "html",
      sourceUrl: "https://private.example.test/proof",
      metadata: { raw: "private evidence metadata" },
      contentHash: "proof-evidence-hash",
      phase4OperationKey: "secret:evidence:operation",
      capturedAt: now,
    });
    const incidentId = await ctx.db.insert("incidents", {
      projectId,
      failingRunId: runId,
      collectorId,
      state: "detected",
      failureSummary: "Proof DTO incident",
      transitionSequence: 0,
      openedAt: now,
      updatedAt: now,
    });
    const healAttemptId = await ctx.db.insert("healAttempts", {
      projectId,
      incidentId,
      collectorId,
      attempt: 1,
      prompt: "private repair prompt",
      promptHash: "private-repair-prompt-hash",
      status: "approved",
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    });
    const entityId = await ctx.db.insert("canonicalEntities", {
      projectId,
      domainPackId,
      entityType: "product",
      canonicalKey: "proof-product",
      displayName: "Proof product",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const secondEntityId = await ctx.db.insert("canonicalEntities", {
      projectId,
      domainPackId,
      entityType: "ai_model",
      canonicalKey: "proof-model",
      displayName: "Proof model",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const schemaRevisionId = await ctx.db.insert("canonicalSchemaRevisions", {
      domainPackId,
      domain: "proof",
      revision: 1,
      definition: { raw: "private schema definition" },
      definitionHash: "proof-schema-hash",
      createdBy: "private-reviewer",
      operationKey: "secret:schema:operation",
      createdAt: now,
    });
    const mappingSpecId = await ctx.db.insert("canonicalMappingSpecs", {
      projectId,
      sourceId,
      endpointId,
      key: "proof-mapping",
      name: "Proof mapping",
      entityType: "product",
      createdBy: "private-reviewer",
      operationKey: "secret:mapping-spec:operation",
      createdAt: now,
    });
    const mappingRevisionId = await ctx.db.insert("canonicalMappingRevisions", {
      mappingSpecId,
      revision: 1,
      sourceSchemaVersion: "1",
      canonicalSchemaRevisionId: schemaRevisionId,
      deterministic: true,
      specification: { raw: "private mapping specification" },
      specificationHash: "proof-mapping-hash",
      createdBy: "private-reviewer",
      operationKey: "secret:mapping-revision:operation",
      createdAt: now,
    });
    const observationId = await ctx.db.insert("canonicalObservations", {
      projectId,
      sourceId,
      endpointId,
      collectorBindingId: bindingId,
      fixtureKey: "private-fixture",
      inputKind: "stored_fixture",
      mappingRevisionId,
      canonicalSchemaRevisionId: schemaRevisionId,
      sourceEntityKey: "private-source-entity",
      entityType: "product",
      resolvedEntityId: entityId,
      trustState: "verified",
      observedAt: now,
      recordedAt: now,
      payloadHash: "private-payload-hash",
      operationKey: "secret:observation:operation",
    });
    await ctx.db.insert("canonicalObservationFields", {
      observationId,
      projectId,
      canonicalPath: "product.price",
      rawValue: { raw: "private raw value" },
      normalizedValue: 42,
      normalizedValueHash: "private-normalized-hash",
      state: "verified",
      sourcePaths: ["private.path"],
      evidenceRefs: [evidenceId],
      transform: {
        name: "private-transform",
        version: "1",
        input: { raw: "private transform input" },
      },
      mappingRevisionId,
      createdAt: now,
    });
    const phase6ProofId = await ctx.db.insert("phase6Proofs", {
      key: "phase6:ai-infrastructure:identity-proof:v1",
      projectId,
      schemaRevisionId,
      mappingRevisionIds: [mappingRevisionId],
      observationIds: [observationId],
      resolvedEntityId: entityId,
      ambiguousCandidateIds: [],
      entityOperationIds: [],
      createdAt: now,
    });

    const freshnessPolicyId = await ctx.db.insert("factFreshnessPolicies", {
      projectId,
      predicate: "product.price",
      maxAgeMs: 10_000,
      allowLastKnownGood: true,
      status: "active",
      operationKey: "secret:freshness-policy:operation",
      createdAt: now,
    });
    const factDecisionId = await ctx.db.insert("factReleaseDecisions", {
      projectId,
      entityId,
      predicate: "product.price",
      policyId: freshnessPolicyId,
      candidateObservationIds: [observationId],
      outcome: "release",
      reasonCodes: ["verified"],
      details: { raw: "private decision details" },
      operationKey: "secret:fact-decision:operation",
      createdAt: now,
    });
    const factVersionId = await ctx.db.insert("factVersions", {
      projectId,
      entityId,
      predicate: "product.price",
      value: 42,
      valueHash: "proof-value-hash",
      validFrom: now,
      validTimeSource: "observed_at",
      transactionFrom: now,
      state: "released",
      changeKind: "initial",
      releaseDecisionId: factDecisionId,
      sourceObservationIds: [observationId],
      evidenceRefs: [evidenceId],
      mappingRevisionId,
      collectorBindingId: bindingId,
      operationKey: "secret:fact-version:operation",
      createdAt: now,
    });
    const currentFactId = await ctx.db.insert("currentFacts", {
      projectId,
      entityId,
      predicate: "product.price",
      factVersionId,
      releaseDecisionId: factDecisionId,
      policyId: freshnessPolicyId,
      valueHash: "proof-value-hash",
      state: "released",
      servingLabel: "verified",
      lastVerifiedAt: now,
      freshnessDeadline: now + 10_000,
      updatedAt: now,
    });
    const phase7ProofId = await ctx.db.insert("phase7Proofs", {
      key: "phase7:bitemporal-proof:v1",
      projectId,
      aiModelEntityId: secondEntityId,
      productEntityId: entityId,
      policyIds: [freshnessPolicyId],
      factVersionIds: [factVersionId],
      relationIds: [],
      currentFactIds: [currentFactId],
      createdAt: now,
    });

    const releasePolicyId = await ctx.db.insert("releasePolicies", {
      projectId,
      name: "Proof release policy",
      predicate: "product.price",
      revision: 1,
      status: "active",
      strategy: "authoritative",
      equivalenceRule: "exact",
      continueLastKnownGood: true,
      explicitRemovalRequired: true,
      repeatedAbsenceMinimum: 2,
      policyHash: "proof-policy-hash",
      operationKey: "secret:release-policy:operation",
      createdAt: now,
    });
    await ctx.db.insert("releasePolicySources", {
      policyId: releasePolicyId,
      sourceId,
      priority: 1,
      role: "authoritative",
      independenceGroup: "private-group",
      operationKey: "secret:policy-source:operation",
      createdAt: now,
    });
    const releaseDecisionId = await ctx.db.insert("releaseDecisions", {
      projectId,
      entityId,
      predicate: "product.price",
      policyId: releasePolicyId,
      strategy: "authoritative",
      candidateObservationIds: [observationId],
      candidateSourceIds: [sourceId],
      candidateValueHashes: ["proof-value-hash"],
      selectedObservationIds: [observationId],
      selectedValueHash: "proof-value-hash",
      nextFactVersionId: factVersionId,
      outcome: "release",
      independentGroupCount: 1,
      reasonCodes: ["verified"],
      details: { raw: "private release details" },
      operationKey: "secret:release-decision:operation",
      createdAt: now,
    });
    const eventId = await ctx.db.insert("changeEvents", {
      projectId,
      eventId: "proof-event",
      eventType: "update",
      state: "released",
      businessEvent: true,
      entityId,
      predicate: "product.price",
      releaseDecisionId,
      nextFactVersionId: factVersionId,
      nextValueHash: "proof-value-hash",
      observedAt: now,
      releasedAt: now,
      sourceObservationIds: [observationId],
      evidenceRefs: [evidenceId],
      eventHash: "proof-event-hash",
      operationKey: "secret:event:operation",
      createdAt: now,
    });
    const conflictId = await ctx.db.insert("sourceConflicts", {
      projectId,
      entityId,
      predicate: "product.price",
      policyId: releasePolicyId,
      releaseDecisionId,
      status: "open",
      candidateObservationIds: [observationId],
      candidateSourceIds: [sourceId],
      candidateValueHashes: ["proof-value-hash"],
      independentGroupCount: 1,
      releasedFactVersionId: factVersionId,
      reason: "Private sources disagree",
      resolution: { raw: "private resolution" },
      operationKey: "secret:conflict:operation",
      openedAt: now,
    });
    const phase8ProofId = await ctx.db.insert("phase8Proofs", {
      key: "phase8:semantic-cdc-proof:v1",
      projectId,
      entityId,
      policyIds: [releasePolicyId],
      decisionIds: [releaseDecisionId],
      eventIds: [eventId],
      conflictIds: [conflictId],
      blockedDecisionIds: [],
      createdAt: now,
    });

    const bundleId = await ctx.db.insert("evidenceBundles", {
      projectId,
      incidentId,
      eventId,
      factVersionId,
      bundleKey: "proof-bundle",
      status: "sealed",
      digest: "proof-bundle-digest",
      manifestDigest: "proof-manifest-digest",
      artifactCount: 0,
      operationKey: "secret:bundle:operation",
      createdAt: now,
      sealedAt: now,
    });
    const blastRadiusAssessmentId = await ctx.db.insert(
      "blastRadiusAssessments",
      {
        projectId,
        incidentId,
        sourceId,
        collectorBindingId: bindingId,
        affectedFieldCount: 1,
        affectedEntityCount: 1,
        affectedFactCount: 1,
        affectedEventCount: 1,
        affectedSubscriberCount: 0,
        affectedDownstreamCount: 0,
        freshnessImpact: "private impact",
        lastKnownGoodAvailable: true,
        alternateSourceCoverage: false,
        estimatedFalseEventBlastRadius: 1,
        operationKey: "secret:blast-radius:operation",
        createdAt: now,
      },
    );
    const tribunalContextId = await ctx.db.insert("repairTribunalContexts", {
      projectId,
      incidentId,
      healAttemptId,
      blastRadiusAssessmentId,
      sourceMappingCount: 1,
      canonicalFieldCount: 1,
      currentFactCount: 1,
      openConflictCount: 1,
      estimatedEventBlastRadius: 1,
      independentSupportAvailable: false,
      identityChangeRisk: false,
      summary: "Private tribunal summary",
      operationKey: "secret:tribunal:operation",
      createdAt: now,
    });
    const candidateVersionId = await ctx.db.insert("repairCandidateVersions", {
      projectId,
      incidentId,
      healAttemptId,
      collectorId,
      bindingId,
      candidateVersion: "proof-v2",
      status: "proposed",
      operationKey: "secret:candidate:operation",
      createdAt: now,
      updatedAt: now,
    });
    const thresholds = {
      minimumPassRate: 1,
      maximumCriticalFailures: 0,
      maximumFalseEvents: 0,
      requireHeldOutPass: true,
      requireIdentityStable: true,
    };
    const failedCanaryRunId = await ctx.db.insert("repairCanaryRuns", {
      projectId,
      incidentId,
      healAttemptId,
      candidateVersionId,
      status: "stopped",
      currentStage: "stored_fixtures",
      thresholds,
      totalChecks: 1,
      passedChecks: 0,
      criticalFailures: 1,
      falseEventCount: 1,
      automaticStopReason: "private stop reason",
      operationKey: "secret:failed-canary:operation",
      startedAt: now,
      updatedAt: now,
      completedAt: now,
    });
    const passedCanaryRunId = await ctx.db.insert("repairCanaryRuns", {
      projectId,
      incidentId,
      healAttemptId,
      candidateVersionId,
      status: "fully_released",
      currentStage: "active_production",
      thresholds,
      totalChecks: 1,
      passedChecks: 1,
      criticalFailures: 0,
      falseEventCount: 0,
      operationKey: "secret:passed-canary:operation",
      startedAt: now,
      updatedAt: now,
      completedAt: now,
    });
    const suiteId = await ctx.db.insert("fleetGauntletSuites", {
      projectId,
      name: "Proof suite",
      revision: "1",
      status: "active",
      operationKey: "secret:suite:operation",
      createdAt: now,
    });
    const gauntletRunId = await ctx.db.insert("fleetGauntletRuns", {
      projectId,
      incidentId,
      healAttemptId,
      canaryRunId: passedCanaryRunId,
      suiteId,
      status: "passed",
      totalCases: 0,
      passedCases: 0,
      heldOutTotal: 0,
      heldOutPassed: 0,
      criticalFailures: 0,
      falseEventCount: 0,
      operationKey: "secret:gauntlet:operation",
      startedAt: now,
      completedAt: now,
    });
    await ctx.db.insert("fleetBenchmarkMetrics", {
      projectId,
      gauntletRunId,
      silentCorruptionCatchRate: 1,
      correctTriageRate: 1,
      falseHealRate: 0,
      heldOutRepairPassRate: 1,
      entityResolutionPrecision: 1,
      semanticEventPrecision: 1,
      semanticEventRecall: 1,
      falseEventCount: 0,
      correctionClassificationAccuracy: 1,
      timeToVerifiedRecoveryMs: 1,
      lastKnownGoodAvailability: 1,
      sourceFreshnessAfterIncident: 1,
      operationKey: "secret:metrics:operation",
      createdAt: now,
    });
    const rootNodeId = await ctx.db.insert("provenanceNodes", {
      projectId,
      nodeType: "evidence",
      externalId: String(evidenceId),
      label: "Private evidence node",
      integrityDigest: "proof-integrity-digest",
      metadata: { raw: "private provenance metadata" },
      operationKey: "secret:provenance:operation",
      createdAt: now,
    });
    const extendedCertificateId = await ctx.db.insert(
      "extendedRepairCertificates",
      {
        projectId,
        incidentId,
        healAttemptId,
        canaryRunId: passedCanaryRunId,
        gauntletRunId,
        evidenceBundleId: bundleId,
        status: "certified",
        payload: {
          certificate_version: "2.0",
          incident_id: String(incidentId),
          core_certificate_id: null,
          affected_canonical_fields: ["product.price"],
          affected_entity_count: 1,
          canary: {
            stored_fixtures: "pass",
            held_out_cases: "pass",
            live_shadow_runs: "pass",
          },
          semantic_event_check: { false_events: 0, expected_events: 1 },
          schema_compatibility: "pass",
          mapping_compatibility: "pass",
          evidence_bundle_digest: "proof-bundle-digest",
          integrity_manifest_digest: "proof-manifest-digest",
          released_collector_version: "proof-v2",
          issued_at: new Date(now).toISOString(),
        },
        digest: "proof-certificate-digest",
        operationKey: "secret:certificate:operation",
        createdAt: now,
      },
    );
    const phase9ProofId = await ctx.db.insert("phase9Proofs", {
      key: "phase9:evidence-fleet-proof:v1",
      projectId,
      incidentId,
      evidenceBundleId: bundleId,
      rootNodeId,
      blastRadiusAssessmentId,
      tribunalContextId,
      failedCanaryRunId,
      passedCanaryRunId,
      gauntletRunId,
      extendedCertificateId,
      createdAt: now,
    });

    return {
      phase6ProofId,
      phase7ProofId,
      phase8ProofId,
      phase9ProofId,
      incidentId,
      bundleId,
      rootNodeId,
      factVersionId,
      currentFactId,
    };
  });
  return { t, ids };
}

describe("public proof DTOs", () => {
  it("returns only curated Phase 6-9 proof fields", async () => {
    const { t, ids } = await proofFixture();
    const [phase6, phase7, phase8, phase9] = await Promise.all([
      t.query(api.phase6Queries.proof, {}),
      t.query(api.phase7Queries.proof, {}),
      t.query(api.phase8Queries.proof, {}),
      t.query(api.phase9Queries.proof, {}),
    ]);

    expect(phase6).toEqual({ proof: { _id: ids.phase6ProofId } });
    expect(Object.keys(phase7 ?? {}).sort()).toEqual(
      [
        "currentFacts",
        "evidence",
        "facts",
        "observations",
        "projectionMatches",
        "proof",
      ].sort(),
    );
    expect(phase7?.proof).toEqual({ _id: ids.phase7ProofId });
    expect(phase7?.facts).toEqual([
      expect.objectContaining({
        _id: ids.factVersionId,
        predicate: "product.price",
        value: 42,
      }),
    ]);
    expect(phase7?.currentFacts).toEqual([
      expect.objectContaining({ _id: ids.currentFactId }),
    ]);
    expect(phase7?.observations).toEqual(["redacted"]);
    expect(phase7?.evidence).toEqual(["redacted"]);

    expect(Object.keys(phase8 ?? {}).sort()).toEqual(
      [
        "businessEventCount",
        "conflicts",
        "events",
        "layoutBusinessEventCount",
        "proof",
        "quarantinedEventCount",
        "stableEventIds",
        "verifiedPriceEventCount",
      ].sort(),
    );
    expect(phase8?.proof).toEqual({ _id: ids.phase8ProofId });
    expect(phase8?.events).toHaveLength(1);
    expect(phase8?.conflicts[0]?.candidateObservationIds).toEqual(["redacted"]);

    expect(phase9).toEqual({
      proof: { _id: ids.phase9ProofId },
      incidentId: ids.incidentId,
      evidenceBundleId: ids.bundleId,
      rootNodeId: ids.rootNodeId,
    });
    for (const result of [phase6, phase7, phase8, phase9])
      expect(collectForbiddenKeys(result)).toEqual([]);
  }, 20_000);
});
