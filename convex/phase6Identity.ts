import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requirePhase5IngestKey } from "./phase5Auth";
import {
  canonicalAliasTypeValidator,
  identityReviewDecisionValidator,
} from "./phase6Validators";
import { assertPhase6Text, normalizeIdentity } from "./phase6Support";

export const addAlias = mutation({
  args: {
    ingestKey: v.string(),
    entityId: v.id("canonicalEntities"),
    sourceId: v.optional(v.id("sources")),
    aliasType: canonicalAliasTypeValidator,
    value: v.string(),
    approvedBy: v.string(),
    operationKey: v.string(),
  },
  returns: v.object({
    aliasId: v.id("canonicalEntityAliases"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase6Text(args.value, "value", 300);
    assertPhase6Text(args.approvedBy, "approvedBy", 240);
    assertPhase6Text(args.operationKey, "operationKey", 240);
    const prior = await ctx.db
      .query("canonicalEntityAliases")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (prior) {
      if (prior.entityId !== args.entityId)
        throw new Error("operationKey belongs to another alias");
      return { aliasId: prior._id, duplicate: true };
    }
    const entity = await ctx.db.get("canonicalEntities", args.entityId);
    if (!entity) throw new Error("Canonical entity not found");
    if (args.sourceId && !(await ctx.db.get("sources", args.sourceId)))
      throw new Error("Alias source not found");
    const aliasId = await ctx.db.insert("canonicalEntityAliases", {
      projectId: entity.projectId,
      entityId: entity._id,
      ...(args.sourceId ? { sourceId: args.sourceId } : {}),
      aliasType: args.aliasType,
      value: args.value,
      normalizedValue: normalizeIdentity(args.value),
      status: "active",
      approvedBy: args.approvedBy,
      operationKey: args.operationKey,
      createdAt: Date.now(),
    });
    return { aliasId, duplicate: false };
  },
});

export const reviewCandidate = mutation({
  args: {
    ingestKey: v.string(),
    candidateId: v.id("identityCandidates"),
    decision: identityReviewDecisionValidator,
    chosenEntityId: v.optional(v.id("canonicalEntities")),
    actor: v.string(),
    reason: v.string(),
    operationKey: v.string(),
  },
  returns: v.object({
    decisionId: v.id("identityReviewDecisions"),
    resolvedEntityId: v.union(v.id("canonicalEntities"), v.null()),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase6Text(args.actor, "actor", 240);
    assertPhase6Text(args.reason, "reason", 1_000);
    assertPhase6Text(args.operationKey, "operationKey", 240);
    const prior = await ctx.db
      .query("identityReviewDecisions")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (prior) {
      if (prior.candidateId !== args.candidateId)
        throw new Error("operationKey belongs to another identity decision");
      return {
        decisionId: prior._id,
        resolvedEntityId: prior.chosenEntityId ?? null,
        duplicate: true,
      };
    }
    const candidate = await ctx.db.get("identityCandidates", args.candidateId);
    if (!candidate) throw new Error("Identity candidate not found");
    const observation = await ctx.db.get(
      "canonicalObservations",
      candidate.observationId,
    );
    if (!observation) throw new Error("Candidate observation not found");
    const resolvedEntityId =
      args.decision === "link" || args.decision === "merge"
        ? (args.chosenEntityId ?? candidate.candidateEntityId)
        : args.chosenEntityId;
    if (resolvedEntityId) {
      const entity = await ctx.db.get("canonicalEntities", resolvedEntityId);
      if (!entity || entity.projectId !== candidate.projectId)
        throw new Error("Chosen entity is outside the candidate project");
    }
    const now = Date.now();
    const decisionId = await ctx.db.insert("identityReviewDecisions", {
      projectId: candidate.projectId,
      candidateId: candidate._id,
      decision: args.decision,
      ...(resolvedEntityId ? { chosenEntityId: resolvedEntityId } : {}),
      actor: args.actor,
      reason: args.reason,
      operationKey: args.operationKey,
      createdAt: now,
    });
    if (
      resolvedEntityId &&
      (args.decision === "link" || args.decision === "merge")
    ) {
      const existingResolution = await ctx.db
        .query("canonicalObservationResolutions")
        .withIndex("by_observationId_and_createdAt", (q) =>
          q.eq("observationId", observation._id),
        )
        .order("desc")
        .first();
      if (!existingResolution)
        await ctx.db.insert("canonicalObservationResolutions", {
          projectId: candidate.projectId,
          observationId: observation._id,
          entityId: resolvedEntityId,
          method: "human_review",
          candidateId: candidate._id,
          operationKey: `${args.operationKey}:resolution`,
          createdAt: now,
        });
    }
    return {
      decisionId,
      resolvedEntityId: resolvedEntityId ?? null,
      duplicate: false,
    };
  },
});

export const mergeEntities = mutation({
  args: {
    ingestKey: v.string(),
    sourceEntityId: v.id("canonicalEntities"),
    targetEntityId: v.id("canonicalEntities"),
    reason: v.string(),
    actor: v.string(),
    evidenceRefs: v.array(v.id("evidence")),
    operationKey: v.string(),
  },
  returns: v.object({
    entityOperationId: v.id("canonicalEntityOperations"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase6Text(args.reason, "reason", 1_000);
    assertPhase6Text(args.actor, "actor", 240);
    assertPhase6Text(args.operationKey, "operationKey", 240);
    if (args.sourceEntityId === args.targetEntityId)
      throw new Error("An entity cannot merge into itself");
    if (args.evidenceRefs.length > 20)
      throw new Error("Merge supports at most 20 evidence refs");
    const prior = await ctx.db
      .query("canonicalEntityOperations")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (prior) return { entityOperationId: prior._id, duplicate: true };
    const [source, target] = await Promise.all([
      ctx.db.get("canonicalEntities", args.sourceEntityId),
      ctx.db.get("canonicalEntities", args.targetEntityId),
    ]);
    if (
      !source ||
      !target ||
      source.projectId !== target.projectId ||
      source.entityType !== target.entityType ||
      source.status !== "active" ||
      target.status !== "active"
    )
      throw new Error("Merge requires active same-project, same-type entities");
    const now = Date.now();
    const entityOperationId = await ctx.db.insert("canonicalEntityOperations", {
      projectId: source.projectId,
      kind: "merge",
      sourceEntityIds: [source._id],
      targetEntityIds: [target._id],
      reason: args.reason,
      actor: args.actor,
      evidenceRefs: args.evidenceRefs,
      operationKey: args.operationKey,
      createdAt: now,
    });
    await ctx.db.patch("canonicalEntities", source._id, {
      status: "merged",
      mergedIntoId: target._id,
      updatedAt: now,
    });
    await ctx.db.insert("canonicalEntityLineage", {
      projectId: source.projectId,
      fromEntityId: source._id,
      toEntityId: target._id,
      relationship: "ALIAS_OF",
      status: "active",
      operationId: entityOperationId,
      reason: args.reason,
      createdAt: now,
    });
    return { entityOperationId, duplicate: false };
  },
});

export const splitEntity = mutation({
  args: {
    ingestKey: v.string(),
    sourceEntityId: v.id("canonicalEntities"),
    children: v.array(
      v.object({ canonicalKey: v.string(), displayName: v.string() }),
    ),
    reason: v.string(),
    actor: v.string(),
    evidenceRefs: v.array(v.id("evidence")),
    operationKey: v.string(),
  },
  returns: v.object({
    entityOperationId: v.id("canonicalEntityOperations"),
    childEntityIds: v.array(v.id("canonicalEntities")),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase6Text(args.reason, "reason", 1_000);
    assertPhase6Text(args.actor, "actor", 240);
    assertPhase6Text(args.operationKey, "operationKey", 240);
    if (args.children.length < 1 || args.children.length > 10)
      throw new Error("Split requires 1-10 child entities");
    if (args.evidenceRefs.length > 20)
      throw new Error("Split supports at most 20 evidence refs");
    const prior = await ctx.db
      .query("canonicalEntityOperations")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (prior)
      return {
        entityOperationId: prior._id,
        childEntityIds: prior.targetEntityIds,
        duplicate: true,
      };
    const source = await ctx.db.get("canonicalEntities", args.sourceEntityId);
    if (!source || source.status !== "active")
      throw new Error("Split requires an active source entity");
    const childEntityIds = [];
    const now = Date.now();
    for (const child of args.children) {
      assertPhase6Text(child.canonicalKey, "child.canonicalKey", 300);
      assertPhase6Text(child.displayName, "child.displayName", 300);
      const existing = await ctx.db
        .query("canonicalEntities")
        .withIndex("by_projectId_and_entityType_and_canonicalKey", (q) =>
          q
            .eq("projectId", source.projectId)
            .eq("entityType", source.entityType)
            .eq("canonicalKey", child.canonicalKey),
        )
        .unique();
      if (existing)
        throw new Error(`Split child already exists: ${child.canonicalKey}`);
      childEntityIds.push(
        await ctx.db.insert("canonicalEntities", {
          projectId: source.projectId,
          domainPackId: source.domainPackId,
          entityType: source.entityType,
          canonicalKey: child.canonicalKey,
          displayName: child.displayName,
          status: "active",
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    const entityOperationId = await ctx.db.insert("canonicalEntityOperations", {
      projectId: source.projectId,
      kind: "split",
      sourceEntityIds: [source._id],
      targetEntityIds: childEntityIds,
      reason: args.reason,
      actor: args.actor,
      evidenceRefs: args.evidenceRefs,
      operationKey: args.operationKey,
      createdAt: now,
    });
    await ctx.db.patch("canonicalEntities", source._id, {
      status: "split",
      updatedAt: now,
    });
    for (const childEntityId of childEntityIds)
      await ctx.db.insert("canonicalEntityLineage", {
        projectId: source.projectId,
        fromEntityId: childEntityId,
        toEntityId: source._id,
        relationship: "VERSION_OF",
        status: "active",
        operationId: entityOperationId,
        reason: args.reason,
        createdAt: now,
      });
    return { entityOperationId, childEntityIds, duplicate: false };
  },
});

export const reverseOperation = mutation({
  args: {
    ingestKey: v.string(),
    entityOperationId: v.id("canonicalEntityOperations"),
    reason: v.string(),
    actor: v.string(),
    operationKey: v.string(),
  },
  returns: v.object({
    reversalOperationId: v.id("canonicalEntityOperations"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase6Text(args.reason, "reason", 1_000);
    assertPhase6Text(args.actor, "actor", 240);
    assertPhase6Text(args.operationKey, "operationKey", 240);
    const prior = await ctx.db
      .query("canonicalEntityOperations")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (prior) return { reversalOperationId: prior._id, duplicate: true };
    const original = await ctx.db.get(
      "canonicalEntityOperations",
      args.entityOperationId,
    );
    if (!original || (original.kind !== "merge" && original.kind !== "split"))
      throw new Error("Only merge or split operations can be reversed");
    const existingReversal = await ctx.db
      .query("canonicalEntityOperations")
      .withIndex("by_reversalOfId", (q) => q.eq("reversalOfId", original._id))
      .unique();
    if (existingReversal)
      return { reversalOperationId: existingReversal._id, duplicate: true };
    const now = Date.now();
    const reversalOperationId = await ctx.db.insert(
      "canonicalEntityOperations",
      {
        projectId: original.projectId,
        kind: original.kind === "merge" ? "reverse_merge" : "reverse_split",
        sourceEntityIds: original.targetEntityIds,
        targetEntityIds: original.sourceEntityIds,
        reason: args.reason,
        actor: args.actor,
        evidenceRefs: original.evidenceRefs,
        reversalOfId: original._id,
        operationKey: args.operationKey,
        createdAt: now,
      },
    );
    for (const sourceEntityId of original.sourceEntityIds)
      await ctx.db.patch("canonicalEntities", sourceEntityId, {
        status: "active",
        mergedIntoId: undefined,
        updatedAt: now,
      });
    if (original.kind === "split")
      for (const targetEntityId of original.targetEntityIds)
        await ctx.db.patch("canonicalEntities", targetEntityId, {
          status: "split",
          updatedAt: now,
        });
    const lineages = await ctx.db
      .query("canonicalEntityLineage")
      .withIndex("by_operationId", (q) => q.eq("operationId", original._id))
      .take(20);
    for (const lineage of lineages)
      await ctx.db.patch("canonicalEntityLineage", lineage._id, {
        status: "reversed",
        reversedByOperationId: reversalOperationId,
        reversedAt: now,
      });
    return { reversalOperationId, duplicate: false };
  },
});
