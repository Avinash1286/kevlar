import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { requireProjectRole } from "./phase11Auth";
import { stableHash } from "./phase6Support";

const COUNT_LIMIT = 1_000;

async function manifestSnapshot(
  ctx: MutationCtx,
  projectId: Doc<"projects">["_id"],
) {
  const [
    certificates,
    currentFacts,
    factVersions,
    changeEvents,
    evidenceBundles,
    observations,
    decisions,
  ] = await Promise.all([
    ctx.db
      .query("certificates")
      .withIndex("by_projectId_and_createdAt", (q) =>
        q.eq("projectId", projectId),
      )
      .order("desc")
      .take(COUNT_LIMIT + 1),
    ctx.db
      .query("currentFacts")
      .withIndex("by_projectId_and_predicate", (q) =>
        q.eq("projectId", projectId),
      )
      .take(COUNT_LIMIT + 1),
    ctx.db
      .query("factVersions")
      .withIndex("by_projectId_and_predicate_and_transactionFrom", (q) =>
        q.eq("projectId", projectId),
      )
      .take(COUNT_LIMIT + 1),
    ctx.db
      .query("changeEvents")
      .withIndex("by_projectId_and_createdAt", (q) =>
        q.eq("projectId", projectId),
      )
      .order("desc")
      .take(COUNT_LIMIT + 1),
    ctx.db
      .query("evidenceBundles")
      .withIndex("by_projectId_and_createdAt", (q) =>
        q.eq("projectId", projectId),
      )
      .order("desc")
      .take(COUNT_LIMIT + 1),
    ctx.db
      .query("canonicalObservations")
      .withIndex("by_projectId_and_recordedAt", (q) =>
        q.eq("projectId", projectId),
      )
      .order("desc")
      .take(COUNT_LIMIT + 1),
    ctx.db
      .query("releaseDecisions")
      .withIndex("by_projectId_and_createdAt", (q) =>
        q.eq("projectId", projectId),
      )
      .order("desc")
      .take(101),
  ]);
  const counts = {
    certificates: Math.min(certificates.length, COUNT_LIMIT),
    currentFacts: Math.min(currentFacts.length, COUNT_LIMIT),
    factVersions: Math.min(factVersions.length, COUNT_LIMIT),
    changeEvents: Math.min(changeEvents.length, COUNT_LIMIT),
    evidenceBundles: Math.min(evidenceBundles.length, COUNT_LIMIT),
    canonicalObservations: Math.min(observations.length, COUNT_LIMIT),
    sourceCount: new Set(
      decisions
        .slice(0, 100)
        .flatMap((decision) => decision.candidateSourceIds),
    ).size,
    truncated:
      decisions.length > 100 ||
      [
        certificates,
        currentFacts,
        factVersions,
        changeEvents,
        evidenceBundles,
        observations,
      ].some((rows) => rows.length > COUNT_LIMIT),
  };
  const coreCertificate =
    certificates.find((item) => item.status === "certified") ?? null;
  const multiSourceDecision =
    decisions
      .slice(0, 100)
      .find((item) => item.candidateSourceIds.length >= 2) ?? null;
  const releasedEvent =
    changeEvents.find((item) => item.state === "released") ?? null;
  const digest = stableHash({
    projectId,
    counts,
    coreCertificateDigest: coreCertificate?.digest ?? null,
    multiSourceDecisionKey: multiSourceDecision?.operationKey ?? null,
    releasedEventHash: releasedEvent?.eventHash ?? null,
  });
  return {
    counts,
    coreCertificate,
    multiSourceDecision,
    releasedEvent,
    digest,
  };
}

export const captureManifest = mutation({
  args: {
    projectId: v.id("projects"),
    snapshotRef: v.string(),
    sourceDeployment: v.string(),
    restoreTarget: v.string(),
    operationKey: v.string(),
  },
  returns: v.object({
    manifest: schema.doc("backupRestoreManifests"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const auth = await requireProjectRole(ctx, args.projectId, [
      "owner",
      "admin",
    ]);
    for (const [name, value, max] of [
      ["snapshotRef", args.snapshotRef, 500],
      ["sourceDeployment", args.sourceDeployment, 120],
      ["restoreTarget", args.restoreTarget, 120],
      ["operationKey", args.operationKey, 240],
    ] as const)
      if (value.length < 1 || value.length > max)
        throw new Error(`${name} must contain 1-${max} characters`);
    const duplicate = await ctx.db
      .query("backupRestoreManifests")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (duplicate) {
      if (duplicate.projectId !== args.projectId)
        throw new Error("operationKey belongs to another restore manifest");
      return { manifest: duplicate, duplicate: true };
    }
    const snapshot = await manifestSnapshot(ctx, args.projectId);
    const now = Date.now();
    const backupExportRecordId = await ctx.db.insert("backupExportRecords", {
      organizationId: auth.tenancy.organizationId,
      projectId: args.projectId,
      kind: "backup",
      status: "completed",
      snapshotRef: args.snapshotRef,
      digest: snapshot.digest,
      requestedAt: now,
      completedAt: now,
      operationKey: `${args.operationKey}:backup-record`,
    });
    const manifestId = await ctx.db.insert("backupRestoreManifests", {
      organizationId: auth.tenancy.organizationId,
      projectId: args.projectId,
      backupExportRecordId,
      snapshotRef: args.snapshotRef,
      sourceDeployment: args.sourceDeployment,
      restoreTarget: args.restoreTarget,
      counts: snapshot.counts,
      expectedDigest: snapshot.digest,
      status: "captured",
      ...(snapshot.coreCertificate
        ? { coreCertificateId: snapshot.coreCertificate._id }
        : {}),
      ...(snapshot.multiSourceDecision
        ? { multiSourceDecisionId: snapshot.multiSourceDecision._id }
        : {}),
      ...(snapshot.releasedEvent
        ? { releasedEventId: snapshot.releasedEvent._id }
        : {}),
      operationKey: args.operationKey,
      capturedAt: now,
    });
    await ctx.db.insert("securityAuditEvents", {
      organizationId: auth.tenancy.organizationId,
      projectId: args.projectId,
      actorUserId: auth.user._id,
      action: "phase12.backup_manifest.captured",
      targetType: "backup_restore_manifest",
      targetId: String(manifestId),
      decision: "allowed",
      reason: "Authorized backup manifest capture",
      redactedPayload: {
        snapshotRef: args.snapshotRef,
        digest: snapshot.digest,
        counts: snapshot.counts,
      },
      operationKey: `${args.operationKey}:audit:capture`,
      createdAt: now,
    });
    return {
      manifest: (await ctx.db.get("backupRestoreManifests", manifestId))!,
      duplicate: false,
    };
  },
});

export const verifyRestore = mutation({
  args: {
    manifestId: v.id("backupRestoreManifests"),
    operationKey: v.string(),
  },
  returns: v.object({
    manifest: schema.doc("backupRestoreManifests"),
    verified: v.boolean(),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const manifest = await ctx.db.get(
      "backupRestoreManifests",
      args.manifestId,
    );
    if (!manifest) throw new Error("Backup/restore manifest not found");
    const auth = await requireProjectRole(ctx, manifest.projectId, [
      "owner",
      "admin",
    ]);
    if (args.operationKey.length < 1 || args.operationKey.length > 240)
      throw new Error("operationKey must contain 1-240 characters");
    if (
      manifest.verificationOperationKey === args.operationKey ||
      manifest.status === "verified"
    )
      return {
        manifest,
        verified: manifest.status === "verified",
        duplicate: true,
      };
    const snapshot = await manifestSnapshot(ctx, manifest.projectId);
    const verified =
      !manifest.counts.truncated &&
      !snapshot.counts.truncated &&
      snapshot.digest === manifest.expectedDigest;
    const now = Date.now();
    await ctx.db.patch("backupRestoreManifests", manifest._id, {
      actualDigest: snapshot.digest,
      verificationOperationKey: args.operationKey,
      status: verified ? "verified" : "mismatch",
      verifiedAt: now,
    });
    await ctx.db.insert("securityAuditEvents", {
      organizationId: auth.tenancy.organizationId,
      projectId: manifest.projectId,
      actorUserId: auth.user._id,
      action: "phase12.restore_manifest.verified",
      targetType: "backup_restore_manifest",
      targetId: String(manifest._id),
      decision: verified ? "allowed" : "denied",
      reason: verified
        ? "Restored query surface matches captured manifest"
        : manifest.counts.truncated || snapshot.counts.truncated
          ? "Restore verification requires an untruncated manifest"
          : "Restore manifest digest mismatch",
      redactedPayload: {
        expectedDigest: manifest.expectedDigest,
        actualDigest: snapshot.digest,
        operationKey: args.operationKey,
      },
      operationKey: `${args.operationKey}:audit`,
      createdAt: now,
    });
    return {
      manifest: (await ctx.db.get("backupRestoreManifests", manifest._id))!,
      verified,
      duplicate: false,
    };
  },
});
