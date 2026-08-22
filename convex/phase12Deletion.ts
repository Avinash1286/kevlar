import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import schema from "./schema";
import { requireProjectRole, redactSecurityPayload } from "./phase11Auth";
import { stableHash } from "./phase6Support";

const processBatchRef = makeFunctionReference<"mutation">("phase12Deletion:processBatch");

export const request = mutation({
  args: {
    projectId: v.id("projects"),
    backupRestoreManifestId: v.id("backupRestoreManifests"),
    reason: v.string(),
    operationKey: v.string(),
  },
  returns: v.object({ tombstone: schema.doc("projectDeletionTombstones"), duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const auth = await requireProjectRole(ctx, args.projectId, ["owner", "admin"]);
    if (args.reason.length < 8 || args.reason.length > 1_000)
      throw new Error("Deletion reason must contain 8-1000 characters");
    if (args.operationKey.length < 1 || args.operationKey.length > 240)
      throw new Error("operationKey must contain 1-240 characters");
    const duplicate = await ctx.db.query("projectDeletionTombstones").withIndex("by_operationKey", (q) => q.eq("operationKey", args.operationKey)).unique();
    if (duplicate) {
      if (duplicate.projectId !== args.projectId) throw new Error("operationKey belongs to another deletion request");
      return { tombstone: duplicate, duplicate: true };
    }
    const existing = await ctx.db.query("projectDeletionTombstones").withIndex("by_projectId", (q) => q.eq("projectId", args.projectId)).unique();
    if (existing) return { tombstone: existing, duplicate: true };
    const [project, manifest] = await Promise.all([
      ctx.db.get("projects", args.projectId),
      ctx.db.get("backupRestoreManifests", args.backupRestoreManifestId),
    ]);
    if (!project) throw new Error("Project not found");
    if (!manifest || manifest.projectId !== project._id || manifest.status !== "verified")
      throw new Error("A verified same-project backup/restore manifest is required before deletion");
    const now = Date.now();
    const tombstoneId = await ctx.db.insert("projectDeletionTombstones", {
      organizationId: auth.tenancy.organizationId,
      projectId: project._id,
      projectSlug: project.slug,
      backupRestoreManifestId: manifest._id,
      state: "requested",
      stage: "evidence",
      reason: args.reason,
      requestedByUserId: auth.user._id,
      evidenceRedacted: 0,
      rowsRedacted: 0,
      observationFieldsRedacted: 0,
      deliveriesRedacted: 0,
      credentialsRevoked: 0,
      operationKey: args.operationKey,
      requestedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch("projects", project._id, { status: "paused", deletionState: "deleting", updatedAt: now });
    await ctx.db.insert("securityAuditEvents", {
      organizationId: auth.tenancy.organizationId,
      projectId: project._id,
      actorUserId: auth.user._id,
      action: "phase12.project_deletion.requested",
      targetType: "project",
      targetId: String(project._id),
      decision: "allowed",
      reason: args.reason,
      redactedPayload: redactSecurityPayload({ manifestId: manifest._id, projectSlug: project.slug }),
      operationKey: `${args.operationKey}:audit:requested`,
      createdAt: now,
    });
    await ctx.scheduler.runAfter(0, processBatchRef, { tombstoneId });
    return { tombstone: (await ctx.db.get("projectDeletionTombstones", tombstoneId))!, duplicate: false };
  },
});

export const processBatch = internalMutation({
  args: { tombstoneId: v.id("projectDeletionTombstones") },
  returns: v.object({ state: v.string(), stage: v.string(), processed: v.number() }),
  handler: async (ctx, args) => {
    const tombstone = await ctx.db.get("projectDeletionTombstones", args.tombstoneId);
    if (!tombstone) throw new Error("Deletion tombstone not found");
    if (tombstone.state === "deleted") return { state: tombstone.state, stage: tombstone.stage, processed: 0 };
    const now = Date.now();
    const schedule = async () => {
      await ctx.scheduler.runAfter(0, processBatchRef, { tombstoneId: tombstone._id });
    };

    if (tombstone.stage === "evidence") {
      const rows = await ctx.db.query("evidence").withIndex("by_projectId_and_deletedAt_and_capturedAt", (q) => q.eq("projectId", tombstone.projectId).eq("deletedAt", undefined)).take(25);
      for (const evidence of rows) {
        if (evidence.storageId) await ctx.storage.delete(evidence.storageId);
        await ctx.db.patch("evidence", evidence._id, { sourceUrl: "[DELETED_WITH_PROJECT]", storageId: undefined, metadata: { deleted: true, tombstoneId: String(tombstone._id) }, deletedAt: now });
      }
      await ctx.db.patch("projectDeletionTombstones", tombstone._id, { state: "deleting", stage: rows.length === 25 ? "evidence" : "run_rows", evidenceRedacted: tombstone.evidenceRedacted + rows.length, updatedAt: now });
      await schedule();
      return { state: "deleting", stage: rows.length === 25 ? "evidence" : "run_rows", processed: rows.length };
    }

    if (tombstone.stage === "run_rows") {
      const run = await ctx.db.query("runs").withIndex("by_projectId_and_payloadDeletionCompletedAt_and_startedAt", (q) => q.eq("projectId", tombstone.projectId).eq("payloadDeletionCompletedAt", undefined)).first();
      if (!run) {
        await ctx.db.patch("projectDeletionTombstones", tombstone._id, { stage: "observation_fields", updatedAt: now });
        await schedule();
        return { state: "deleting", stage: "observation_fields", processed: 0 };
      }
      const rows = await ctx.db.query("rows").withIndex("by_runId_and_deletedAt", (q) => q.eq("runId", run._id).eq("deletedAt", undefined)).take(25);
      for (const row of rows)
        await ctx.db.patch("rows", row._id, { rawPayload: { deleted: true }, normalizedPayload: { deleted: true }, fieldTrust: { deleted: true }, deletedAt: now });
      if (rows.length < 25) await ctx.db.patch("runs", run._id, { payloadDeletionCompletedAt: now });
      await ctx.db.patch("projectDeletionTombstones", tombstone._id, { rowsRedacted: tombstone.rowsRedacted + rows.length, updatedAt: now });
      await schedule();
      return { state: "deleting", stage: "run_rows", processed: rows.length };
    }

    if (tombstone.stage === "observation_fields") {
      const fields = await ctx.db.query("canonicalObservationFields").withIndex("by_projectId_and_deletedAt_and_createdAt", (q) => q.eq("projectId", tombstone.projectId).eq("deletedAt", undefined)).take(25);
      for (const field of fields)
        await ctx.db.patch("canonicalObservationFields", field._id, { rawValue: { deleted: true }, normalizedValue: { deleted: true }, sourcePaths: [], evidenceRefs: [], transform: { ...field.transform, input: { deleted: true } }, deletedAt: now });
      await ctx.db.patch("projectDeletionTombstones", tombstone._id, { stage: fields.length === 25 ? "observation_fields" : "delivery_payloads", observationFieldsRedacted: tombstone.observationFieldsRedacted + fields.length, updatedAt: now });
      await schedule();
      return { state: "deleting", stage: fields.length === 25 ? "observation_fields" : "delivery_payloads", processed: fields.length };
    }

    if (tombstone.stage === "delivery_payloads") {
      const deliveries = await ctx.db.query("webhookDeliveries").withIndex("by_projectId_and_payloadDeletedAt_and_createdAt", (q) => q.eq("projectId", tombstone.projectId).eq("payloadDeletedAt", undefined)).take(25);
      for (const delivery of deliveries)
        await ctx.db.patch("webhookDeliveries", delivery._id, { payload: { deleted: true }, payloadDeletedAt: now });
      await ctx.db.patch("projectDeletionTombstones", tombstone._id, { stage: deliveries.length === 25 ? "delivery_payloads" : "credentials", deliveriesRedacted: tombstone.deliveriesRedacted + deliveries.length, updatedAt: now });
      await schedule();
      return { state: "deleting", stage: deliveries.length === 25 ? "delivery_payloads" : "credentials", processed: deliveries.length };
    }

    if (tombstone.stage === "credentials") {
      const keys = await ctx.db.query("apiKeys").withIndex("by_projectId_and_deletedAt_and_createdAt", (q) => q.eq("projectId", tombstone.projectId).eq("deletedAt", undefined)).take(25);
      for (const key of keys)
        await ctx.db.patch("apiKeys", key._id, { prefix: "deleted", secretHash: `deleted:${String(key._id)}`, status: "revoked", revokedAt: now, deletedAt: now });
      if (keys.length > 0) {
        await ctx.db.patch("projectDeletionTombstones", tombstone._id, { credentialsRevoked: tombstone.credentialsRevoked + keys.length, updatedAt: now });
        await schedule();
        return { state: "deleting", stage: "credentials", processed: keys.length };
      }
      const endpoint = await ctx.db.query("webhookEndpoints").withIndex("by_projectId_and_deletedAt_and_createdAt", (q) => q.eq("projectId", tombstone.projectId).eq("deletedAt", undefined)).first();
      if (endpoint) {
        const secrets = await ctx.db.query("webhookSecretVersions").withIndex("by_endpointId_and_deletedAt_and_version", (q) => q.eq("endpointId", endpoint._id).eq("deletedAt", undefined)).take(25);
        for (const secret of secrets)
          await ctx.db.patch("webhookSecretVersions", secret._id, { secretHash: `deleted:${String(secret._id)}`, secretRef: "[DELETED_WITH_PROJECT]", status: "retired", retiredAt: now, deletedAt: now });
        if (secrets.length < 25)
          await ctx.db.patch("webhookEndpoints", endpoint._id, { name: "Deleted endpoint", url: "https://deleted.invalid", status: "disabled", activeSecretVersionId: undefined, deletedAt: now, updatedAt: now });
        await ctx.db.patch("projectDeletionTombstones", tombstone._id, { credentialsRevoked: tombstone.credentialsRevoked + secrets.length, updatedAt: now });
        await schedule();
        return { state: "deleting", stage: "credentials", processed: secrets.length };
      }
      await ctx.db.patch("projectDeletionTombstones", tombstone._id, { stage: "finalize", updatedAt: now });
      await schedule();
      return { state: "deleting", stage: "finalize", processed: 0 };
    }

    const digest = stableHash({ projectId: tombstone.projectId, evidenceRedacted: tombstone.evidenceRedacted, rowsRedacted: tombstone.rowsRedacted, observationFieldsRedacted: tombstone.observationFieldsRedacted, deliveriesRedacted: tombstone.deliveriesRedacted, credentialsRevoked: tombstone.credentialsRevoked, completedAt: now });
    await ctx.db.patch("projects", tombstone.projectId, { status: "paused", deletionState: "deleted", deletedAt: now, updatedAt: now });
    await ctx.db.patch("projectDeletionTombstones", tombstone._id, { state: "deleted", stage: "completed", retainedAuditDigest: digest, updatedAt: now, completedAt: now });
    await ctx.db.insert("securityAuditEvents", {
      organizationId: tombstone.organizationId,
      projectId: tombstone.projectId,
      actorUserId: tombstone.requestedByUserId,
      action: "phase12.project_deletion.completed",
      targetType: "project_deletion_tombstone",
      targetId: String(tombstone._id),
      decision: "allowed",
      reason: "Privacy-bearing payloads deleted; immutable hashes and audit retained",
      redactedPayload: { digest, evidenceRedacted: tombstone.evidenceRedacted, rowsRedacted: tombstone.rowsRedacted, observationFieldsRedacted: tombstone.observationFieldsRedacted, deliveriesRedacted: tombstone.deliveriesRedacted, credentialsRevoked: tombstone.credentialsRevoked },
      operationKey: `${tombstone.operationKey}:audit:completed`,
      createdAt: now,
    });
    return { state: "deleted", stage: "completed", processed: 0 };
  },
});
