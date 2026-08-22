import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import { requirePhase5IngestKey } from "./phase5Auth";
import {
  evidenceArtifactKindValidator,
  provenanceNodeTypeValidator,
  provenanceRelationshipValidator,
} from "./phase9Validators";
import {
  assertPhase9Text,
  ensureProvenanceEdge,
  ensureProvenanceNode,
  integrityDigest,
} from "./phase9Support";

export const upsertNode = mutation({
  args: {
    ingestKey: v.string(),
    projectId: v.id("projects"),
    nodeType: provenanceNodeTypeValidator,
    externalId: v.string(),
    label: v.string(),
    integrityDigest: v.optional(v.string()),
    metadata: v.any(),
    operationKey: v.string(),
  },
  returns: v.object({
    node: schema.doc("provenanceNodes"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase9Text(args.externalId, "externalId", 500);
    assertPhase9Text(args.label, "label", 300);
    assertPhase9Text(args.operationKey, "operationKey", 240);
    const existing = await ctx.db
      .query("provenanceNodes")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (existing) return { node: existing, duplicate: true };
    const id = await ensureProvenanceNode(ctx, {
      projectId: args.projectId,
      nodeType: args.nodeType,
      externalId: args.externalId,
      label: args.label,
      ...(args.integrityDigest
        ? { integrityDigest: args.integrityDigest }
        : {}),
      metadata: args.metadata,
      operationKey: args.operationKey,
      createdAt: Date.now(),
    });
    const node = await ctx.db.get("provenanceNodes", id);
    if (!node) throw new Error("Provenance node insert failed");
    return { node, duplicate: false };
  },
});

export const linkNodes = mutation({
  args: {
    ingestKey: v.string(),
    projectId: v.id("projects"),
    fromNodeId: v.id("provenanceNodes"),
    relationship: provenanceRelationshipValidator,
    toNodeId: v.id("provenanceNodes"),
    metadata: v.any(),
    operationKey: v.string(),
  },
  returns: v.object({
    edge: schema.doc("provenanceEdges"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase9Text(args.operationKey, "operationKey", 240);
    const [from, to, duplicate] = await Promise.all([
      ctx.db.get("provenanceNodes", args.fromNodeId),
      ctx.db.get("provenanceNodes", args.toNodeId),
      ctx.db
        .query("provenanceEdges")
        .withIndex("by_operationKey", (q) =>
          q.eq("operationKey", args.operationKey),
        )
        .unique(),
    ]);
    if (!from || !to) throw new Error("Both provenance nodes must exist");
    if (from.projectId !== args.projectId || to.projectId !== args.projectId)
      throw new Error("Cannot link provenance nodes across projects");
    if (duplicate) return { edge: duplicate, duplicate: true };
    const id = await ensureProvenanceEdge(ctx, {
      projectId: args.projectId,
      fromNodeId: args.fromNodeId,
      relationship: args.relationship,
      toNodeId: args.toNodeId,
      metadata: args.metadata,
      operationKey: args.operationKey,
      createdAt: Date.now(),
    });
    const edge = await ctx.db.get("provenanceEdges", id);
    if (!edge) throw new Error("Provenance edge insert failed");
    return { edge, duplicate: false };
  },
});

const artifactInputValidator = v.object({
  kind: evidenceArtifactKindValidator,
  evidenceId: v.optional(v.id("evidence")),
  storageId: v.optional(v.id("_storage")),
  reference: v.optional(v.string()),
  retainedUntil: v.optional(v.number()),
  metadata: v.any(),
});

export const sealBundle = mutation({
  args: {
    ingestKey: v.string(),
    projectId: v.id("projects"),
    incidentId: v.optional(v.id("incidents")),
    eventId: v.optional(v.id("changeEvents")),
    factVersionId: v.optional(v.id("factVersions")),
    coreCertificateId: v.optional(v.id("certificates")),
    bundleKey: v.string(),
    artifacts: v.array(artifactInputValidator),
    operationKey: v.string(),
  },
  returns: v.object({
    bundle: schema.doc("evidenceBundles"),
    artifacts: v.array(schema.doc("evidenceBundleArtifacts")),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase9Text(args.bundleKey, "bundleKey", 240);
    assertPhase9Text(args.operationKey, "operationKey", 240);
    if (args.artifacts.length < 1 || args.artifacts.length > 100)
      throw new Error("artifacts must contain 1-100 items");
    if (
      !args.incidentId &&
      !args.eventId &&
      !args.factVersionId &&
      !args.coreCertificateId
    )
      throw new Error("Evidence bundle must anchor to a durable record");
    const duplicate = await ctx.db
      .query("evidenceBundles")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (duplicate) {
      const artifacts = await ctx.db
        .query("evidenceBundleArtifacts")
        .withIndex("by_bundleId_and_createdAt", (q) =>
          q.eq("bundleId", duplicate._id),
        )
        .take(100);
      return { bundle: duplicate, artifacts, duplicate: true };
    }
    const anchors = await Promise.all([
      args.incidentId ? ctx.db.get("incidents", args.incidentId) : null,
      args.eventId ? ctx.db.get("changeEvents", args.eventId) : null,
      args.factVersionId
        ? ctx.db.get("factVersions", args.factVersionId)
        : null,
      args.coreCertificateId
        ? ctx.db.get("certificates", args.coreCertificateId)
        : null,
    ]);
    for (const anchor of anchors)
      if (
        anchor &&
        "projectId" in anchor &&
        anchor.projectId !== args.projectId
      )
        throw new Error("Evidence bundle anchor belongs to another project");
    const resolved: Array<{
      input: (typeof args.artifacts)[number];
      evidence: Doc<"evidence"> | null;
      contentDigest: string;
    }> = [];
    for (const input of args.artifacts) {
      if (input.reference)
        assertPhase9Text(input.reference, "artifact.reference", 2_000);
      const evidence = input.evidenceId
        ? await ctx.db.get("evidence", input.evidenceId)
        : null;
      if (input.evidenceId && !evidence)
        throw new Error("Evidence artifact does not exist");
      if (evidence && evidence.projectId !== args.projectId)
        throw new Error("Evidence artifact belongs to another project");
      if (
        (input.kind === "screenshot" || input.kind === "warc_reference") &&
        !input.evidenceId &&
        !input.storageId &&
        !input.reference
      )
        throw new Error(`${input.kind} requires a selective reference`);
      const contentDigest =
        evidence?.contentHash ??
        integrityDigest({
          kind: input.kind,
          storageId: input.storageId ?? null,
          reference: input.reference ?? null,
          metadata: input.metadata,
        });
      resolved.push({ input, evidence, contentDigest });
    }
    const manifest = resolved
      .map((item) => ({ kind: item.input.kind, digest: item.contentDigest }))
      .sort((left, right) =>
        `${left.kind}:${left.digest}`.localeCompare(
          `${right.kind}:${right.digest}`,
        ),
      );
    const manifestDigest = integrityDigest(manifest);
    const digest = integrityDigest({
      projectId: args.projectId,
      bundleKey: args.bundleKey,
      incidentId: args.incidentId ?? null,
      eventId: args.eventId ?? null,
      factVersionId: args.factVersionId ?? null,
      manifestDigest,
    });
    const now = Date.now();
    const bundleId = await ctx.db.insert("evidenceBundles", {
      projectId: args.projectId,
      ...(args.incidentId ? { incidentId: args.incidentId } : {}),
      ...(args.eventId ? { eventId: args.eventId } : {}),
      ...(args.factVersionId ? { factVersionId: args.factVersionId } : {}),
      ...(args.coreCertificateId
        ? { coreCertificateId: args.coreCertificateId }
        : {}),
      bundleKey: args.bundleKey,
      status: "sealed",
      digest,
      manifestDigest,
      artifactCount: resolved.length,
      operationKey: args.operationKey,
      createdAt: now,
      sealedAt: now,
    });
    const artifactIds = [];
    for (let index = 0; index < resolved.length; index += 1) {
      const { input, contentDigest } = resolved[index];
      artifactIds.push(
        await ctx.db.insert("evidenceBundleArtifacts", {
          bundleId,
          projectId: args.projectId,
          kind: input.kind,
          ...(input.evidenceId ? { evidenceId: input.evidenceId } : {}),
          ...(input.storageId ? { storageId: input.storageId } : {}),
          ...(input.reference ? { reference: input.reference } : {}),
          ...(input.retainedUntil
            ? { retainedUntil: input.retainedUntil }
            : {}),
          contentDigest,
          metadata: input.metadata,
          operationKey: `${args.operationKey}:artifact:${index}`,
          createdAt: now + index,
        }),
      );
    }
    const bundle = await ctx.db.get("evidenceBundles", bundleId);
    const artifacts = (
      await Promise.all(
        artifactIds.map((id) => ctx.db.get("evidenceBundleArtifacts", id)),
      )
    ).filter((item): item is Doc<"evidenceBundleArtifacts"> => item !== null);
    if (!bundle || artifacts.length !== resolved.length)
      throw new Error("Evidence bundle sealing failed");
    return { bundle, artifacts, duplicate: false };
  },
});
