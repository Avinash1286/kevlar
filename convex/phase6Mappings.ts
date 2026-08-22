import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requirePhase5IngestKey } from "./phase5Auth";
import {
  mappingApprovalValidator,
  mappingLifecycleValidator,
} from "./phase6Validators";
import {
  assertDeterministicMapping,
  assertPhase6Text,
  stableHash,
} from "./phase6Support";

export const createSpec = mutation({
  args: {
    ingestKey: v.string(),
    projectId: v.id("projects"),
    sourceId: v.id("sources"),
    endpointId: v.optional(v.id("sourceEndpoints")),
    key: v.string(),
    name: v.string(),
    entityType: v.string(),
    createdBy: v.string(),
    operationKey: v.string(),
  },
  returns: v.object({
    mappingSpecId: v.id("canonicalMappingSpecs"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    for (const [name, value, max] of [
      ["key", args.key, 160],
      ["name", args.name, 240],
      ["entityType", args.entityType, 120],
      ["createdBy", args.createdBy, 240],
      ["operationKey", args.operationKey, 240],
    ] as const)
      assertPhase6Text(value, name, max);
    const byOperation = await ctx.db
      .query("canonicalMappingSpecs")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (byOperation) {
      if (
        byOperation.sourceId !== args.sourceId ||
        byOperation.key !== args.key
      )
        throw new Error("operationKey belongs to another mapping spec");
      return { mappingSpecId: byOperation._id, duplicate: true };
    }
    const existing = await ctx.db
      .query("canonicalMappingSpecs")
      .withIndex("by_sourceId_and_key", (q) =>
        q.eq("sourceId", args.sourceId).eq("key", args.key),
      )
      .unique();
    if (existing) return { mappingSpecId: existing._id, duplicate: true };
    const [project, source, endpoint] = await Promise.all([
      ctx.db.get("projects", args.projectId),
      ctx.db.get("sources", args.sourceId),
      args.endpointId ? ctx.db.get("sourceEndpoints", args.endpointId) : null,
    ]);
    if (
      !project ||
      !source ||
      (args.endpointId && endpoint?.sourceId !== source._id)
    )
      throw new Error("Mapping spec context is invalid");
    const mappingSpecId = await ctx.db.insert("canonicalMappingSpecs", {
      projectId: project._id,
      sourceId: source._id,
      ...(endpoint ? { endpointId: endpoint._id } : {}),
      key: args.key,
      name: args.name,
      entityType: args.entityType,
      createdBy: args.createdBy,
      operationKey: args.operationKey,
      createdAt: Date.now(),
    });
    return { mappingSpecId, duplicate: false };
  },
});

export const createRevision = mutation({
  args: {
    ingestKey: v.string(),
    mappingSpecId: v.id("canonicalMappingSpecs"),
    revision: v.number(),
    sourceSchemaVersion: v.string(),
    canonicalSchemaRevisionId: v.id("canonicalSchemaRevisions"),
    specification: v.any(),
    createdBy: v.string(),
    operationKey: v.string(),
  },
  returns: v.object({
    mappingRevisionId: v.id("canonicalMappingRevisions"),
    specificationHash: v.string(),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase6Text(args.sourceSchemaVersion, "sourceSchemaVersion", 160);
    assertPhase6Text(args.createdBy, "createdBy", 240);
    assertPhase6Text(args.operationKey, "operationKey", 240);
    if (!Number.isInteger(args.revision) || args.revision < 1)
      throw new Error("revision must be a positive integer");
    assertDeterministicMapping(args.specification);
    const specificationHash = stableHash(args.specification);
    const byOperation = await ctx.db
      .query("canonicalMappingRevisions")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (byOperation) {
      if (
        byOperation.mappingSpecId !== args.mappingSpecId ||
        byOperation.specificationHash !== specificationHash
      )
        throw new Error("operationKey belongs to another mapping revision");
      return {
        mappingRevisionId: byOperation._id,
        specificationHash,
        duplicate: true,
      };
    }
    const existing = await ctx.db
      .query("canonicalMappingRevisions")
      .withIndex("by_mappingSpecId_and_revision", (q) =>
        q.eq("mappingSpecId", args.mappingSpecId).eq("revision", args.revision),
      )
      .unique();
    if (existing) {
      if (existing.specificationHash !== specificationHash)
        throw new Error("Immutable mapping revision already has another spec");
      return {
        mappingRevisionId: existing._id,
        specificationHash,
        duplicate: true,
      };
    }
    const [spec, schemaRevision] = await Promise.all([
      ctx.db.get("canonicalMappingSpecs", args.mappingSpecId),
      ctx.db.get("canonicalSchemaRevisions", args.canonicalSchemaRevisionId),
    ]);
    if (!spec || !schemaRevision)
      throw new Error("Mapping or canonical schema revision not found");
    const now = Date.now();
    const mappingRevisionId = await ctx.db.insert("canonicalMappingRevisions", {
      mappingSpecId: spec._id,
      revision: args.revision,
      sourceSchemaVersion: args.sourceSchemaVersion,
      canonicalSchemaRevisionId: schemaRevision._id,
      deterministic: true,
      specification: args.specification,
      specificationHash,
      createdBy: args.createdBy,
      operationKey: args.operationKey,
      createdAt: now,
    });
    await ctx.db.insert("canonicalMappingTransitions", {
      mappingSpecId: spec._id,
      mappingRevisionId,
      fromStatus: null,
      toStatus: "draft",
      actor: args.createdBy,
      reason: "Deterministic mapping revision created",
      operationKey: `${args.operationKey}:draft`,
      createdAt: now,
    });
    return { mappingRevisionId, specificationHash, duplicate: false };
  },
});

export const reviewRevision = mutation({
  args: {
    ingestKey: v.string(),
    mappingRevisionId: v.id("canonicalMappingRevisions"),
    decision: mappingApprovalValidator,
    actor: v.string(),
    reason: v.string(),
    operationKey: v.string(),
  },
  returns: v.object({
    approvalId: v.id("canonicalMappingApprovals"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase6Text(args.actor, "actor", 240);
    assertPhase6Text(args.reason, "reason", 1_000);
    assertPhase6Text(args.operationKey, "operationKey", 240);
    const prior = await ctx.db
      .query("canonicalMappingApprovals")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (prior) {
      if (prior.mappingRevisionId !== args.mappingRevisionId)
        throw new Error("operationKey belongs to another mapping review");
      return { approvalId: prior._id, duplicate: true };
    }
    if (
      !(await ctx.db.get("canonicalMappingRevisions", args.mappingRevisionId))
    )
      throw new Error("Mapping revision not found");
    const approvalId = await ctx.db.insert("canonicalMappingApprovals", {
      mappingRevisionId: args.mappingRevisionId,
      decision: args.decision,
      actor: args.actor,
      reason: args.reason,
      operationKey: args.operationKey,
      createdAt: Date.now(),
    });
    return { approvalId, duplicate: false };
  },
});

const mappingTransitions = {
  draft: ["shadow", "rolled_back"],
  shadow: ["canary", "rolled_back"],
  canary: ["active", "rolled_back"],
  active: ["rolled_back"],
  rolled_back: [],
} as const;

export const transitionRevision = mutation({
  args: {
    ingestKey: v.string(),
    mappingRevisionId: v.id("canonicalMappingRevisions"),
    toStatus: mappingLifecycleValidator,
    actor: v.string(),
    reason: v.string(),
    operationKey: v.string(),
  },
  returns: v.object({
    transitionId: v.id("canonicalMappingTransitions"),
    status: mappingLifecycleValidator,
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase6Text(args.actor, "actor", 240);
    assertPhase6Text(args.reason, "reason", 1_000);
    assertPhase6Text(args.operationKey, "operationKey", 240);
    const prior = await ctx.db
      .query("canonicalMappingTransitions")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (prior) {
      if (prior.mappingRevisionId !== args.mappingRevisionId)
        throw new Error("operationKey belongs to another mapping transition");
      return {
        transitionId: prior._id,
        status: prior.toStatus,
        duplicate: true,
      };
    }
    const revision = await ctx.db.get(
      "canonicalMappingRevisions",
      args.mappingRevisionId,
    );
    if (!revision) throw new Error("Mapping revision not found");
    const current = await ctx.db
      .query("canonicalMappingTransitions")
      .withIndex("by_mappingRevisionId_and_createdAt", (q) =>
        q.eq("mappingRevisionId", revision._id),
      )
      .order("desc")
      .first();
    if (!current) throw new Error("Mapping revision has no lifecycle state");
    const allowed = mappingTransitions[current.toStatus] as readonly string[];
    if (!allowed.includes(args.toStatus))
      throw new Error(
        `Invalid mapping transition ${current.toStatus} -> ${args.toStatus}`,
      );
    if (args.toStatus === "canary" || args.toStatus === "active") {
      const approval = await ctx.db
        .query("canonicalMappingApprovals")
        .withIndex("by_mappingRevisionId_and_createdAt", (q) =>
          q.eq("mappingRevisionId", revision._id),
        )
        .order("desc")
        .first();
      if (approval?.decision !== "approved")
        throw new Error("Canary and active mappings require human approval");
    }
    if (args.toStatus === "active") {
      const priorActives = await ctx.db
        .query("canonicalMappingTransitions")
        .withIndex("by_mappingSpecId_and_toStatus_and_createdAt", (q) =>
          q
            .eq("mappingSpecId", revision.mappingSpecId)
            .eq("toStatus", "active"),
        )
        .order("desc")
        .take(20);
      for (const event of priorActives) {
        if (event.mappingRevisionId === revision._id) continue;
        const latest = await ctx.db
          .query("canonicalMappingTransitions")
          .withIndex("by_mappingRevisionId_and_createdAt", (q) =>
            q.eq("mappingRevisionId", event.mappingRevisionId),
          )
          .order("desc")
          .first();
        if (latest?.toStatus === "active")
          await ctx.db.insert("canonicalMappingTransitions", {
            mappingSpecId: revision.mappingSpecId,
            mappingRevisionId: event.mappingRevisionId,
            fromStatus: "active",
            toStatus: "rolled_back",
            actor: args.actor,
            reason: `Superseded by mapping revision ${revision.revision}`,
            operationKey: `${args.operationKey}:supersede:${event.mappingRevisionId}`,
            createdAt: Date.now(),
          });
      }
    }
    const transitionId = await ctx.db.insert("canonicalMappingTransitions", {
      mappingSpecId: revision.mappingSpecId,
      mappingRevisionId: revision._id,
      fromStatus: current.toStatus,
      toStatus: args.toStatus,
      actor: args.actor,
      reason: args.reason,
      operationKey: args.operationKey,
      createdAt: Date.now(),
    });
    return { transitionId, status: args.toStatus, duplicate: false };
  },
});

export const rollback = mutation({
  args: {
    ingestKey: v.string(),
    activeRevisionId: v.id("canonicalMappingRevisions"),
    restoreRevisionId: v.id("canonicalMappingRevisions"),
    actor: v.string(),
    reason: v.string(),
    operationKey: v.string(),
  },
  returns: v.object({
    rolledBackTransitionId: v.id("canonicalMappingTransitions"),
    restoredTransitionId: v.id("canonicalMappingTransitions"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase6Text(args.actor, "actor", 240);
    assertPhase6Text(args.reason, "reason", 1_000);
    assertPhase6Text(args.operationKey, "operationKey", 200);
    const restoredKey = `${args.operationKey}:restored`;
    const prior = await ctx.db
      .query("canonicalMappingTransitions")
      .withIndex("by_operationKey", (q) => q.eq("operationKey", restoredKey))
      .unique();
    if (prior) {
      const rolledBack = await ctx.db
        .query("canonicalMappingTransitions")
        .withIndex("by_operationKey", (q) =>
          q.eq("operationKey", `${args.operationKey}:rolled-back`),
        )
        .unique();
      if (!rolledBack) throw new Error("Rollback audit is incomplete");
      return {
        rolledBackTransitionId: rolledBack._id,
        restoredTransitionId: prior._id,
        duplicate: true,
      };
    }
    const [active, restore] = await Promise.all([
      ctx.db.get("canonicalMappingRevisions", args.activeRevisionId),
      ctx.db.get("canonicalMappingRevisions", args.restoreRevisionId),
    ]);
    if (!active || !restore || active.mappingSpecId !== restore.mappingSpecId)
      throw new Error("Rollback revisions must belong to one mapping spec");
    const [activeState, restoreState, approval] = await Promise.all([
      ctx.db
        .query("canonicalMappingTransitions")
        .withIndex("by_mappingRevisionId_and_createdAt", (q) =>
          q.eq("mappingRevisionId", active._id),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("canonicalMappingTransitions")
        .withIndex("by_mappingRevisionId_and_createdAt", (q) =>
          q.eq("mappingRevisionId", restore._id),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("canonicalMappingApprovals")
        .withIndex("by_mappingRevisionId_and_createdAt", (q) =>
          q.eq("mappingRevisionId", restore._id),
        )
        .order("desc")
        .first(),
    ]);
    if (
      activeState?.toStatus !== "active" ||
      !restoreState ||
      approval?.decision !== "approved"
    )
      throw new Error(
        "Rollback requires active current and approved restore revision",
      );
    const now = Date.now();
    const rolledBackTransitionId = await ctx.db.insert(
      "canonicalMappingTransitions",
      {
        mappingSpecId: active.mappingSpecId,
        mappingRevisionId: active._id,
        fromStatus: "active",
        toStatus: "rolled_back",
        actor: args.actor,
        reason: args.reason,
        operationKey: `${args.operationKey}:rolled-back`,
        createdAt: now,
      },
    );
    const restoredTransitionId = await ctx.db.insert(
      "canonicalMappingTransitions",
      {
        mappingSpecId: restore.mappingSpecId,
        mappingRevisionId: restore._id,
        fromStatus: restoreState.toStatus,
        toStatus: "active",
        actor: args.actor,
        reason: `Rollback restore: ${args.reason}`,
        operationKey: restoredKey,
        createdAt: now,
      },
    );
    return {
      rolledBackTransitionId,
      restoredTransitionId,
      duplicate: false,
    };
  },
});
