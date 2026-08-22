import { v } from "convex/values";
import { mutation } from "./_generated/server";
import schema from "./schema";
import { requirePhase5IngestKey } from "./phase5Auth";
import {
  canonicalSchemaStateValidator,
  schemaCompatibilityValidator,
} from "./phase6Validators";
import { assertPhase6Text, stableHash } from "./phase6Support";

export const createRevision = mutation({
  args: {
    ingestKey: v.string(),
    domainPackId: v.id("domainPacks"),
    domain: v.string(),
    revision: v.number(),
    definition: v.any(),
    createdBy: v.string(),
    operationKey: v.string(),
  },
  returns: v.object({
    schemaRevisionId: v.id("canonicalSchemaRevisions"),
    definitionHash: v.string(),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase6Text(args.domain, "domain", 120);
    assertPhase6Text(args.createdBy, "createdBy", 240);
    assertPhase6Text(args.operationKey, "operationKey", 240);
    if (!Number.isInteger(args.revision) || args.revision < 1)
      throw new Error("revision must be a positive integer");
    const definitionHash = stableHash(args.definition);
    const byOperation = await ctx.db
      .query("canonicalSchemaRevisions")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (byOperation) {
      if (
        byOperation.domainPackId !== args.domainPackId ||
        byOperation.revision !== args.revision ||
        byOperation.definitionHash !== definitionHash
      )
        throw new Error("operationKey belongs to another schema revision");
      return {
        schemaRevisionId: byOperation._id,
        definitionHash,
        duplicate: true,
      };
    }
    const existing = await ctx.db
      .query("canonicalSchemaRevisions")
      .withIndex("by_domainPackId_and_revision", (q) =>
        q.eq("domainPackId", args.domainPackId).eq("revision", args.revision),
      )
      .unique();
    if (existing) {
      if (
        existing.definitionHash !== definitionHash ||
        existing.domain !== args.domain
      )
        throw new Error(
          "Immutable schema revision already has another definition",
        );
      return {
        schemaRevisionId: existing._id,
        definitionHash,
        duplicate: true,
      };
    }
    if (!(await ctx.db.get("domainPacks", args.domainPackId)))
      throw new Error("Domain pack not found");
    const now = Date.now();
    const schemaRevisionId = await ctx.db.insert("canonicalSchemaRevisions", {
      domainPackId: args.domainPackId,
      domain: args.domain,
      revision: args.revision,
      definition: args.definition,
      definitionHash,
      createdBy: args.createdBy,
      operationKey: args.operationKey,
      createdAt: now,
    });
    await ctx.db.insert("canonicalSchemaRevisionStates", {
      domainPackId: args.domainPackId,
      schemaRevisionId,
      fromStatus: null,
      toStatus: "draft",
      actor: args.createdBy,
      reason: "Immutable schema revision created",
      operationKey: `${args.operationKey}:draft`,
      createdAt: now,
    });
    return { schemaRevisionId, definitionHash, duplicate: false };
  },
});

export const recordCompatibility = mutation({
  args: {
    ingestKey: v.string(),
    fromRevisionId: v.id("canonicalSchemaRevisions"),
    toRevisionId: v.id("canonicalSchemaRevisions"),
    classification: schemaCompatibilityValidator,
    reasons: v.array(v.string()),
    migration: v.optional(v.any()),
    operationKey: v.string(),
  },
  returns: v.object({
    compatibilityId: v.id("canonicalSchemaCompatibility"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase6Text(args.operationKey, "operationKey", 240);
    if (args.reasons.length < 1 || args.reasons.length > 20)
      throw new Error("Compatibility requires 1-20 reasons");
    for (const reason of args.reasons)
      assertPhase6Text(reason, "compatibility reason", 500);
    const prior = await ctx.db
      .query("canonicalSchemaCompatibility")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (prior) {
      if (
        prior.fromRevisionId !== args.fromRevisionId ||
        prior.toRevisionId !== args.toRevisionId
      )
        throw new Error("operationKey belongs to another compatibility record");
      return { compatibilityId: prior._id, duplicate: true };
    }
    const [from, to] = await Promise.all([
      ctx.db.get("canonicalSchemaRevisions", args.fromRevisionId),
      ctx.db.get("canonicalSchemaRevisions", args.toRevisionId),
    ]);
    if (!from || !to || from.domainPackId !== to.domainPackId)
      throw new Error("Compatibility revisions must exist in one domain pack");
    const existing = await ctx.db
      .query("canonicalSchemaCompatibility")
      .withIndex("by_fromRevisionId_and_toRevisionId", (q) =>
        q.eq("fromRevisionId", from._id).eq("toRevisionId", to._id),
      )
      .unique();
    if (existing) return { compatibilityId: existing._id, duplicate: true };
    const compatibilityId = await ctx.db.insert(
      "canonicalSchemaCompatibility",
      {
        domainPackId: from.domainPackId,
        fromRevisionId: from._id,
        toRevisionId: to._id,
        classification: args.classification,
        reasons: args.reasons,
        ...(args.migration === undefined ? {} : { migration: args.migration }),
        operationKey: args.operationKey,
        createdAt: Date.now(),
      },
    );
    return { compatibilityId, duplicate: false };
  },
});

const schemaTransitions = {
  draft: ["canary", "retired"],
  canary: ["active", "retired"],
  active: ["retired"],
  retired: [],
} as const;

export const transitionRevision = mutation({
  args: {
    ingestKey: v.string(),
    schemaRevisionId: v.id("canonicalSchemaRevisions"),
    toStatus: canonicalSchemaStateValidator,
    actor: v.string(),
    reason: v.string(),
    operationKey: v.string(),
  },
  returns: v.object({
    stateId: v.id("canonicalSchemaRevisionStates"),
    status: canonicalSchemaStateValidator,
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase6Text(args.actor, "actor", 240);
    assertPhase6Text(args.reason, "reason", 1_000);
    assertPhase6Text(args.operationKey, "operationKey", 240);
    const prior = await ctx.db
      .query("canonicalSchemaRevisionStates")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (prior) {
      if (prior.schemaRevisionId !== args.schemaRevisionId)
        throw new Error("operationKey belongs to another schema transition");
      return { stateId: prior._id, status: prior.toStatus, duplicate: true };
    }
    const revision = await ctx.db.get(
      "canonicalSchemaRevisions",
      args.schemaRevisionId,
    );
    if (!revision) throw new Error("Schema revision not found");
    const current = await ctx.db
      .query("canonicalSchemaRevisionStates")
      .withIndex("by_schemaRevisionId_and_createdAt", (q) =>
        q.eq("schemaRevisionId", revision._id),
      )
      .order("desc")
      .first();
    if (!current) throw new Error("Schema revision has no lifecycle state");
    const allowed = schemaTransitions[current.toStatus] as readonly string[];
    if (!allowed.includes(args.toStatus))
      throw new Error(
        `Invalid schema transition ${current.toStatus} -> ${args.toStatus}`,
      );
    if (args.toStatus === "active") {
      const historicalActive = await ctx.db
        .query("canonicalSchemaRevisionStates")
        .withIndex("by_domainPackId_and_toStatus_and_createdAt", (q) =>
          q.eq("domainPackId", revision.domainPackId).eq("toStatus", "active"),
        )
        .order("desc")
        .take(50);
      for (const event of historicalActive) {
        if (event.schemaRevisionId === revision._id) continue;
        const latest = await ctx.db
          .query("canonicalSchemaRevisionStates")
          .withIndex("by_schemaRevisionId_and_createdAt", (q) =>
            q.eq("schemaRevisionId", event.schemaRevisionId),
          )
          .order("desc")
          .first();
        if (latest?.toStatus !== "active") continue;
        const compatibility = await ctx.db
          .query("canonicalSchemaCompatibility")
          .withIndex("by_fromRevisionId_and_toRevisionId", (q) =>
            q
              .eq("fromRevisionId", event.schemaRevisionId)
              .eq("toRevisionId", revision._id),
          )
          .unique();
        if (!compatibility)
          throw new Error(
            "Schema activation requires compatibility classification",
          );
        await ctx.db.insert("canonicalSchemaRevisionStates", {
          domainPackId: revision.domainPackId,
          schemaRevisionId: event.schemaRevisionId,
          fromStatus: "active",
          toStatus: "retired",
          actor: args.actor,
          reason: `Superseded by schema revision ${revision.revision}`,
          operationKey: `${args.operationKey}:retire:${event.schemaRevisionId}`,
          createdAt: Date.now(),
        });
      }
    }
    const stateId = await ctx.db.insert("canonicalSchemaRevisionStates", {
      domainPackId: revision.domainPackId,
      schemaRevisionId: revision._id,
      fromStatus: current.toStatus,
      toStatus: args.toStatus,
      actor: args.actor,
      reason: args.reason,
      operationKey: args.operationKey,
      createdAt: Date.now(),
    });
    return { stateId, status: args.toStatus, duplicate: false };
  },
});
