import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import {
  retentionActionValidator,
  retentionKindValidator,
  retentionScopeValidator,
} from "./phase12Validators";
import { requireProjectRole, redactSecurityPayload } from "./phase11Auth";

const DAY_MS = 86_400_000;
const evidenceKinds = new Set<Doc<"evidence">["kind"]>([
  "html",
  "screenshot",
  "jsonld",
  "network_response",
  "visible_context",
  "warc",
  "code_diff",
  "audit",
]);
const artifactKinds = new Set<Doc<"evidenceBundleArtifacts">["kind"]>([
  "event",
  "fact_before",
  "fact_after",
  "source_observation",
  "contract_result",
  "mapping",
  "collector_metadata",
  "repair_certificate",
  "screenshot",
  "warc_reference",
  "visible_context",
  "integrity_manifest",
]);

function assertPolicy(
  scope: "evidence" | "bundle_artifact",
  kind: string,
  retentionDays: number,
): void {
  if (
    !Number.isSafeInteger(retentionDays) ||
    retentionDays < 1 ||
    retentionDays > 3_650
  )
    throw new Error("retentionDays must be an integer from 1-3650");
  if (
    scope === "evidence" &&
    !evidenceKinds.has(kind as Doc<"evidence">["kind"])
  )
    throw new Error("Evidence retention policy has an incompatible kind");
  if (
    scope === "bundle_artifact" &&
    !artifactKinds.has(kind as Doc<"evidenceBundleArtifacts">["kind"])
  )
    throw new Error(
      "Bundle artifact retention policy has an incompatible kind",
    );
}

export const upsertPolicy = mutation({
  args: {
    projectId: v.id("projects"),
    scope: retentionScopeValidator,
    kind: retentionKindValidator,
    retentionDays: v.number(),
    action: retentionActionValidator,
    preserveCertified: v.boolean(),
    enabled: v.boolean(),
    operationKey: v.string(),
  },
  returns: v.object({
    policy: schema.doc("evidenceRetentionPolicies"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const auth = await requireProjectRole(ctx, args.projectId, [
      "owner",
      "admin",
    ]);
    assertPolicy(args.scope, args.kind, args.retentionDays);
    if (args.operationKey.length < 1 || args.operationKey.length > 240)
      throw new Error("operationKey must contain 1-240 characters");
    const duplicate = await ctx.db
      .query("evidenceRetentionPolicies")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (duplicate) {
      if (
        duplicate.projectId !== args.projectId ||
        duplicate.scope !== args.scope ||
        duplicate.kind !== args.kind
      )
        throw new Error("operationKey belongs to another retention policy");
      return { policy: duplicate, duplicate: true };
    }
    const existing = await ctx.db
      .query("evidenceRetentionPolicies")
      .withIndex("by_projectId_and_scope_and_kind", (q) =>
        q
          .eq("projectId", args.projectId)
          .eq("scope", args.scope)
          .eq("kind", args.kind),
      )
      .unique();
    const now = Date.now();
    const values = {
      retentionDays: args.retentionDays,
      action: args.action,
      preserveCertified: args.preserveCertified,
      status: args.enabled ? ("active" as const) : ("disabled" as const),
      createdByUserId: auth.user._id,
      operationKey: args.operationKey,
      updatedAt: now,
    };
    const policyId =
      existing?._id ??
      (await ctx.db.insert("evidenceRetentionPolicies", {
        projectId: args.projectId,
        scope: args.scope,
        kind: args.kind,
        ...values,
        createdAt: now,
      }));
    if (existing)
      await ctx.db.patch("evidenceRetentionPolicies", existing._id, values);
    await ctx.db.insert("securityAuditEvents", {
      organizationId: auth.tenancy.organizationId,
      projectId: args.projectId,
      actorUserId: auth.user._id,
      action: "phase12.retention_policy.upserted",
      targetType: "evidence_retention_policy",
      targetId: String(policyId),
      decision: "allowed",
      reason: "Project owner or administrator configured evidence retention",
      redactedPayload: redactSecurityPayload({
        scope: args.scope,
        kind: args.kind,
        retentionDays: args.retentionDays,
        action: args.action,
        preserveCertified: args.preserveCertified,
      }),
      operationKey: `${args.operationKey}:audit`,
      createdAt: now,
    });
    return {
      policy: (await ctx.db.get("evidenceRetentionPolicies", policyId))!,
      duplicate: false,
    };
  },
});

export const run = mutation({
  args: {
    policyId: v.id("evidenceRetentionPolicies"),
    asOf: v.number(),
    limit: v.optional(v.number()),
    operationKey: v.string(),
  },
  returns: v.object({
    run: schema.doc("evidenceRetentionRuns"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const policy = await ctx.db.get("evidenceRetentionPolicies", args.policyId);
    if (!policy) throw new Error("Retention policy not found");
    const auth = await requireProjectRole(ctx, policy.projectId, [
      "owner",
      "admin",
    ]);
    const duplicate = await ctx.db
      .query("evidenceRetentionRuns")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (duplicate) {
      if (duplicate.policyId !== policy._id)
        throw new Error("operationKey belongs to another retention run");
      return { run: duplicate, duplicate: true };
    }
    if (policy.status !== "active")
      throw new Error("Retention policy is disabled");
    if (!Number.isFinite(args.asOf) || args.asOf < 0)
      throw new Error("asOf must be a finite timestamp");
    const limit = args.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new Error("limit must be an integer from 1-100");
    const cutoffAt = args.asOf - policy.retentionDays * DAY_MS;
    let scanned = 0;
    let eligible = 0;
    let redacted = 0;
    let storageDeleted = 0;
    let preserved = 0;
    let hasMore = false;

    if (policy.scope === "evidence") {
      const kind = policy.kind as Doc<"evidence">["kind"];
      const rows = await ctx.db
        .query("evidence")
        .withIndex(
          "by_projectId_and_kind_and_retentionProcessedAt_and_capturedAt",
          (q) =>
            q
              .eq("projectId", policy.projectId)
              .eq("kind", kind)
              .eq("retentionProcessedAt", undefined)
              .lte("capturedAt", cutoffAt),
        )
        .take(limit + 1);
      hasMore = rows.length > limit;
      for (const evidence of rows.slice(0, limit)) {
        scanned += 1;
        const [certificateLink, bundleArtifact] = await Promise.all([
          ctx.db
            .query("phase4EvidenceLinks")
            .withIndex("by_evidenceId", (q) => q.eq("evidenceId", evidence._id))
            .first(),
          ctx.db
            .query("evidenceBundleArtifacts")
            .withIndex("by_evidenceId", (q) => q.eq("evidenceId", evidence._id))
            .first(),
        ]);
        const bundle = bundleArtifact
          ? await ctx.db.get("evidenceBundles", bundleArtifact.bundleId)
          : null;
        const certified =
          certificateLink?.certificateId !== undefined ||
          bundle?.coreCertificateId !== undefined;
        if (
          policy.action === "retain" ||
          (policy.preserveCertified && certified)
        ) {
          preserved += 1;
          await ctx.db.patch("evidence", evidence._id, {
            retentionProcessedAt: args.asOf,
            retentionPolicyId: policy._id,
          });
          continue;
        }
        eligible += 1;
        if (evidence.storageId) {
          await ctx.storage.delete(evidence.storageId);
          storageDeleted += 1;
        }
        await ctx.db.patch("evidence", evidence._id, {
          sourceUrl: "[REDACTED_BY_RETENTION]",
          storageId: undefined,
          metadata: {
            redacted: true,
            reason: "retention_policy",
            policyId: String(policy._id),
          },
          retentionProcessedAt: args.asOf,
          retentionPolicyId: policy._id,
          deletedAt: args.asOf,
        });
        redacted += 1;
      }
    } else {
      const oldBundles = await ctx.db
        .query("evidenceBundles")
        .withIndex("by_projectId_and_artifactBackfillAt_and_createdAt", (q) =>
          q
            .eq("projectId", policy.projectId)
            .eq("artifactBackfillAt", undefined)
            .lte("createdAt", cutoffAt),
        )
        .take(20);
      for (const bundle of oldBundles) {
        const artifacts = await ctx.db
          .query("evidenceBundleArtifacts")
          .withIndex("by_bundleId_and_createdAt", (q) =>
            q.eq("bundleId", bundle._id),
          )
          .take(100);
        for (const artifact of artifacts)
          if (!artifact.projectId)
            await ctx.db.patch("evidenceBundleArtifacts", artifact._id, {
              projectId: policy.projectId,
            });
        if (artifacts.length === bundle.artifactCount)
          await ctx.db.patch("evidenceBundles", bundle._id, {
            artifactBackfillAt: args.asOf,
          });
      }
      const kind = policy.kind as Doc<"evidenceBundleArtifacts">["kind"];
      const rows = await ctx.db
        .query("evidenceBundleArtifacts")
        .withIndex(
          "by_projectId_and_kind_and_retentionProcessedAt_and_createdAt",
          (q) =>
            q
              .eq("projectId", policy.projectId)
              .eq("kind", kind)
              .eq("retentionProcessedAt", undefined)
              .lte("createdAt", cutoffAt),
        )
        .take(limit + 1);
      hasMore = rows.length > limit;
      for (const artifact of rows.slice(0, limit)) {
        scanned += 1;
        const bundle = await ctx.db.get("evidenceBundles", artifact.bundleId);
        const certified =
          bundle?.coreCertificateId !== undefined ||
          artifact.kind === "repair_certificate" ||
          artifact.kind === "integrity_manifest";
        if (
          policy.action === "retain" ||
          (policy.preserveCertified && certified)
        ) {
          preserved += 1;
          await ctx.db.patch("evidenceBundleArtifacts", artifact._id, {
            retentionProcessedAt: args.asOf,
            retentionPolicyId: policy._id,
          });
          continue;
        }
        eligible += 1;
        if (artifact.storageId) {
          await ctx.storage.delete(artifact.storageId);
          storageDeleted += 1;
        }
        await ctx.db.patch("evidenceBundleArtifacts", artifact._id, {
          storageId: undefined,
          reference: artifact.reference ? "[REDACTED_BY_RETENTION]" : undefined,
          metadata: {
            redacted: true,
            reason: "retention_policy",
            policyId: String(policy._id),
          },
          retentionProcessedAt: args.asOf,
          retentionPolicyId: policy._id,
          deletedAt: args.asOf,
        });
        redacted += 1;
      }
    }
    const now = Date.now();
    const runId = await ctx.db.insert("evidenceRetentionRuns", {
      projectId: policy.projectId,
      policyId: policy._id,
      cutoffAt,
      status: hasMore ? "partial" : "completed",
      scanned,
      eligible,
      redacted,
      storageDeleted,
      preserved,
      hasMore,
      operationKey: args.operationKey,
      executedByUserId: auth.user._id,
      createdAt: now,
      completedAt: now,
    });
    await ctx.db.insert("securityAuditEvents", {
      organizationId: auth.tenancy.organizationId,
      projectId: policy.projectId,
      actorUserId: auth.user._id,
      action: "phase12.retention.executed",
      targetType: "evidence_retention_run",
      targetId: String(runId),
      decision: "allowed",
      reason: "Authorized bounded retention execution",
      redactedPayload: {
        policyId: policy._id,
        cutoffAt,
        scanned,
        eligible,
        redacted,
        storageDeleted,
        preserved,
        hasMore,
      },
      operationKey: `${args.operationKey}:audit`,
      createdAt: now,
    });
    return {
      run: (await ctx.db.get("evidenceRetentionRuns", runId))!,
      duplicate: false,
    };
  },
});
