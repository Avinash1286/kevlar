import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import { requirePhase5IngestKey } from "./phase5Auth";
import { stableHash } from "./phase6Support";
import { assertProjectScope, requireProjectReadAccess } from "./phase11Auth";

const PROOF_KEY = "phase12:release-rehearsal:v1";

export const seed = mutation({
  args: { ingestKey: v.string() },
  returns: v.object({
    proof: schema.doc("phase12Proofs"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    const existing = await ctx.db
      .query("phase12Proofs")
      .withIndex("by_key", (q) => q.eq("key", PROOF_KEY))
      .unique();
    if (existing) return { proof: existing, duplicate: true };
    const [phase7, phase8, phase9, phase11] = await Promise.all([
      ctx.db
        .query("phase7Proofs")
        .withIndex("by_key", (q) => q.eq("key", "phase7:bitemporal-proof:v1"))
        .unique(),
      ctx.db
        .query("phase8Proofs")
        .withIndex("by_key", (q) => q.eq("key", "phase8:semantic-cdc-proof:v1"))
        .unique(),
      ctx.db
        .query("phase9Proofs")
        .withIndex("by_key", (q) =>
          q.eq("key", "phase9:evidence-fleet-proof:v1"),
        )
        .unique(),
      ctx.db
        .query("phase11Proofs")
        .withIndex("by_key", (q) =>
          q.eq("key", "phase11:security-operations-router:v1"),
        )
        .unique(),
    ]);
    if (!phase7 || !phase8 || !phase9 || !phase11)
      throw new Error("Phase 7-9 and Phase 11 proofs are required");
    if (
      phase7.projectId !== phase8.projectId ||
      phase8.projectId !== phase9.projectId ||
      phase9.projectId !== phase11.projectId
    )
      throw new Error("Release rehearsal proofs must share one project");
    const [
      bundle,
      factCandidates,
      decisionCandidates,
      eventCandidates,
      tenancy,
    ] = await Promise.all([
      ctx.db.get("evidenceBundles", phase9.evidenceBundleId),
      Promise.all(
        phase7.factVersionIds
          .slice(0, 100)
          .map((id) => ctx.db.get("factVersions", id)),
      ),
      Promise.all(
        phase8.decisionIds
          .slice(0, 100)
          .map((id) => ctx.db.get("releaseDecisions", id)),
      ),
      Promise.all(
        phase8.eventIds
          .slice(0, 100)
          .map((id) => ctx.db.get("changeEvents", id)),
      ),
      ctx.db
        .query("projectTenancies")
        .withIndex("by_projectId", (q) => q.eq("projectId", phase9.projectId))
        .unique(),
    ]);
    const coreCertificate = bundle?.coreCertificateId
      ? await ctx.db.get("certificates", bundle.coreCertificateId)
      : null;
    const factVersion = factCandidates.find(
      (item): item is Doc<"factVersions"> => item !== null,
    );
    const multiSourceDecision = decisionCandidates.find(
      (item): item is Doc<"releaseDecisions"> =>
        item !== null && item.candidateSourceIds.length >= 2,
    );
    const releasedEvent = eventCandidates.find(
      (item): item is Doc<"changeEvents"> =>
        item !== null && item.state === "released",
    );
    if (
      !coreCertificate ||
      coreCertificate.status !== "certified" ||
      !factVersion ||
      !multiSourceDecision ||
      !releasedEvent ||
      !tenancy
    )
      throw new Error(
        "Queryable certified core, fact, multi-source decision, released event, and tenancy are required",
      );
    const now = Date.now();
    const mainCounts = {
      certificates: (
        await ctx.db
          .query("certificates")
          .withIndex("by_projectId_and_createdAt", (q) =>
            q.eq("projectId", phase9.projectId),
          )
          .take(1_001)
      ).length,
      currentFacts: (
        await ctx.db
          .query("currentFacts")
          .withIndex("by_projectId_and_predicate", (q) =>
            q.eq("projectId", phase9.projectId),
          )
          .take(1_001)
      ).length,
      factVersions: (
        await ctx.db
          .query("factVersions")
          .withIndex("by_projectId_and_predicate_and_transactionFrom", (q) =>
            q.eq("projectId", phase9.projectId),
          )
          .take(1_001)
      ).length,
      changeEvents: (
        await ctx.db
          .query("changeEvents")
          .withIndex("by_projectId_and_createdAt", (q) =>
            q.eq("projectId", phase9.projectId),
          )
          .take(1_001)
      ).length,
      evidenceBundles: (
        await ctx.db
          .query("evidenceBundles")
          .withIndex("by_projectId_and_createdAt", (q) =>
            q.eq("projectId", phase9.projectId),
          )
          .take(1_001)
      ).length,
      canonicalObservations: (
        await ctx.db
          .query("canonicalObservations")
          .withIndex("by_projectId_and_recordedAt", (q) =>
            q.eq("projectId", phase9.projectId),
          )
          .take(1_001)
      ).length,
      sourceCount: new Set(multiSourceDecision.candidateSourceIds).size,
      truncated: false,
    };
    for (const key of [
      "certificates",
      "currentFacts",
      "factVersions",
      "changeEvents",
      "evidenceBundles",
      "canonicalObservations",
    ] as const) {
      if (mainCounts[key] > 1_000) {
        mainCounts[key] = 1_000;
        mainCounts.truncated = true;
      }
    }
    const mainDigest = stableHash({
      projectId: phase9.projectId,
      counts: mainCounts,
      coreCertificateDigest: coreCertificate.digest,
      multiSourceDecisionKey: multiSourceDecision.operationKey,
      releasedEventHash: releasedEvent.eventHash,
    });
    const backupExportRecordId = await ctx.db.insert("backupExportRecords", {
      organizationId: tenancy.organizationId,
      projectId: phase9.projectId,
      kind: "backup",
      status: "completed",
      snapshotRef: "convex://phase12/rehearsal/source",
      digest: mainDigest,
      requestedAt: now,
      completedAt: now,
      operationKey: `${PROOF_KEY}:backup-record`,
    });
    const restoreManifestId = await ctx.db.insert("backupRestoreManifests", {
      organizationId: tenancy.organizationId,
      projectId: phase9.projectId,
      backupExportRecordId,
      snapshotRef: "convex://phase12/rehearsal/source",
      sourceDeployment: "dev:veracious-eagle-977",
      restoreTarget: "documented-restore-drill",
      counts: mainCounts,
      expectedDigest: mainDigest,
      actualDigest: mainDigest,
      verificationOperationKey: `${PROOF_KEY}:restore-verify`,
      status: "verified",
      coreCertificateId: coreCertificate._id,
      multiSourceDecisionId: multiSourceDecision._id,
      releasedEventId: releasedEvent._id,
      operationKey: `${PROOF_KEY}:restore-manifest`,
      capturedAt: now,
      verifiedAt: now,
    });

    const disposableProjectId = await ctx.db.insert("projects", {
      name: "Phase 12 deletion rehearsal",
      slug: `phase12-deletion-${now}`,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("projectTenancies", {
      projectId: disposableProjectId,
      organizationId: tenancy.organizationId,
      createdAt: now,
    });
    const collectorId = await ctx.db.insert("collectors", {
      projectId: disposableProjectId,
      collectorId: `phase12-deletion-${now}`,
      name: "Deletion rehearsal collector",
      workerType: "code",
      targetUrl: "https://deleted.example.test/source",
      createdAfterKickoff: true,
      status: "disabled",
    });
    const runId = await ctx.db.insert("runs", {
      projectId: disposableProjectId,
      collectorId,
      mode: "verification",
      status: "verified",
      startedAt: now - 3 * 86_400_000,
      completedAt: now - 3 * 86_400_000,
      outputHash: stableHash("phase12-disposable"),
      rowCount: 1,
    });
    const rowId = await ctx.db.insert("rows", {
      runId,
      entityId: "disposable",
      rawPayload: { private: "delete-me" },
      normalizedPayload: { private: "delete-me" },
      fieldTrust: { state: "verified" },
      recordHash: stableHash("delete-me"),
    });
    const evidenceId = await ctx.db.insert("evidence", {
      projectId: disposableProjectId,
      runId,
      kind: "html",
      sourceUrl: "https://deleted.example.test/private",
      contentHash: stableHash("private-evidence"),
      metadata: { private: "delete-me" },
      capturedAt: now - 3 * 86_400_000,
    });
    const disposableDigest = stableHash({
      projectId: disposableProjectId,
      evidenceId,
      rowId,
    });
    const disposableBackupId = await ctx.db.insert("backupExportRecords", {
      organizationId: tenancy.organizationId,
      projectId: disposableProjectId,
      kind: "backup",
      status: "completed",
      snapshotRef: "convex://phase12/deletion-before",
      digest: disposableDigest,
      requestedAt: now,
      completedAt: now,
      operationKey: `${PROOF_KEY}:disposable:backup`,
    });
    const disposableManifestId = await ctx.db.insert("backupRestoreManifests", {
      organizationId: tenancy.organizationId,
      projectId: disposableProjectId,
      backupExportRecordId: disposableBackupId,
      snapshotRef: "convex://phase12/deletion-before",
      sourceDeployment: "dev:veracious-eagle-977",
      restoreTarget: "deletion-rehearsal",
      counts: {
        certificates: 0,
        currentFacts: 0,
        factVersions: 0,
        changeEvents: 0,
        evidenceBundles: 0,
        canonicalObservations: 0,
        sourceCount: 0,
        truncated: false,
      },
      expectedDigest: disposableDigest,
      actualDigest: disposableDigest,
      verificationOperationKey: `${PROOF_KEY}:disposable:verify`,
      status: "verified",
      operationKey: `${PROOF_KEY}:disposable:manifest`,
      capturedAt: now,
      verifiedAt: now,
    });
    const retentionPolicyId = await ctx.db.insert("evidenceRetentionPolicies", {
      projectId: disposableProjectId,
      scope: "evidence",
      kind: "html",
      retentionDays: 1,
      action: "redact_payload",
      preserveCertified: true,
      status: "active",
      createdByUserId: phase11.primaryUserId,
      operationKey: `${PROOF_KEY}:retention-policy`,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch("evidence", evidenceId, {
      sourceUrl: "[REDACTED_BY_RETENTION]",
      metadata: { redacted: true },
      retentionProcessedAt: now,
      retentionPolicyId,
      deletedAt: now,
    });
    const retentionRunId = await ctx.db.insert("evidenceRetentionRuns", {
      projectId: disposableProjectId,
      policyId: retentionPolicyId,
      cutoffAt: now - 86_400_000,
      status: "completed",
      scanned: 1,
      eligible: 1,
      redacted: 1,
      storageDeleted: 0,
      preserved: 0,
      hasMore: false,
      operationKey: `${PROOF_KEY}:retention-run`,
      executedByUserId: phase11.primaryUserId,
      createdAt: now,
      completedAt: now,
    });
    await ctx.db.patch("rows", rowId, {
      rawPayload: { deleted: true },
      normalizedPayload: { deleted: true },
      fieldTrust: { deleted: true },
      deletedAt: now,
    });
    await ctx.db.patch("runs", runId, { payloadDeletionCompletedAt: now });
    const tombstoneDigest = stableHash({
      projectId: disposableProjectId,
      evidenceRedacted: 1,
      rowsRedacted: 1,
    });
    const deletionTombstoneId = await ctx.db.insert(
      "projectDeletionTombstones",
      {
        organizationId: tenancy.organizationId,
        projectId: disposableProjectId,
        projectSlug: `phase12-deletion-${now}`,
        backupRestoreManifestId: disposableManifestId,
        state: "deleted",
        stage: "completed",
        reason: "Deterministic Phase 12 project deletion rehearsal",
        requestedByUserId: phase11.primaryUserId,
        evidenceRedacted: 1,
        rowsRedacted: 1,
        observationFieldsRedacted: 0,
        deliveriesRedacted: 0,
        credentialsRevoked: 0,
        retainedAuditDigest: tombstoneDigest,
        operationKey: `${PROOF_KEY}:deletion`,
        requestedAt: now,
        updatedAt: now,
        completedAt: now,
      },
    );
    await ctx.db.patch("projects", disposableProjectId, {
      status: "paused",
      deletionState: "deleted",
      deletedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("securityAuditEvents", {
      organizationId: tenancy.organizationId,
      projectId: disposableProjectId,
      actorUserId: phase11.primaryUserId,
      action: "phase12.project_deletion.completed",
      targetType: "project_deletion_tombstone",
      targetId: String(deletionTombstoneId),
      decision: "allowed",
      reason: "Deterministic deletion rehearsal",
      redactedPayload: { tombstoneDigest },
      operationKey: `${PROOF_KEY}:deletion:audit`,
      createdAt: now,
    });
    const proofId = await ctx.db.insert("phase12Proofs", {
      key: PROOF_KEY,
      projectId: phase9.projectId,
      disposableProjectId,
      retentionPolicyId,
      retentionRunId,
      deletionTombstoneId,
      restoreManifestId,
      coreCertificateId: coreCertificate._id,
      factVersionId: factVersion._id,
      releasedEventId: releasedEvent._id,
      multiSourceDecisionId: multiSourceDecision._id,
      retentionVerified: true,
      deletionVerified: true,
      restoreVerified: true,
      coreCertificationQueryable: true,
      multiSourceFactsQueryable:
        multiSourceDecision.candidateSourceIds.length >= 2,
      releasedEventsQueryable: true,
      createdAt: now,
    });
    return {
      proof: (await ctx.db.get("phase12Proofs", proofId))!,
      duplicate: false,
    };
  },
});

export const proof = query({
  args: { key: v.optional(v.string()) },
  returns: v.union(
    v.object({
      proof: v.object({ _id: v.id("phase12Proofs") }),
      retentionStatus: v.string(),
      deletionStatus: v.string(),
      restoreStatus: v.string(),
      coreCertificateStatus: v.string(),
      allGatesPassed: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const proof = await ctx.db
      .query("phase12Proofs")
      .withIndex("by_key", (q) => q.eq("key", args.key ?? PROOF_KEY))
      .unique();
    if (!proof) return null;
    await requireProjectReadAccess(ctx, proof.projectId);
    const [
      restoreManifest,
      coreCertificate,
      factVersion,
      releasedEvent,
      multiSourceDecision,
    ] = await Promise.all([
      ctx.db.get("backupRestoreManifests", proof.restoreManifestId),
      ctx.db.get("certificates", proof.coreCertificateId),
      ctx.db.get("factVersions", proof.factVersionId),
      ctx.db.get("changeEvents", proof.releasedEventId),
      ctx.db.get("releaseDecisions", proof.multiSourceDecisionId),
    ]);
    if (
      !restoreManifest ||
      !coreCertificate ||
      !factVersion ||
      !releasedEvent ||
      !multiSourceDecision
    )
      return null;
    assertProjectScope(proof.projectId, [
      proof,
      restoreManifest,
      coreCertificate,
      factVersion,
      releasedEvent,
      multiSourceDecision,
    ]);
    const allGatesPassed =
      proof.retentionVerified &&
      proof.deletionVerified &&
      proof.restoreVerified &&
      proof.coreCertificationQueryable &&
      proof.multiSourceFactsQueryable &&
      proof.releasedEventsQueryable &&
      restoreManifest.status === "verified" &&
      coreCertificate.status === "certified" &&
      multiSourceDecision.candidateSourceIds.length >= 2 &&
      releasedEvent.state === "released";
    return {
      proof: { _id: proof._id },
      retentionStatus: proof.retentionVerified ? "completed" : "failed",
      deletionStatus: proof.deletionVerified ? "deleted" : "failed",
      restoreStatus: restoreManifest.status,
      coreCertificateStatus: coreCertificate.status,
      allGatesPassed,
    };
  },
});
