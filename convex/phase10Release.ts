import {
  type GenericQueryCtx,
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { DataModel } from "./_generated/dataModel";
import schema from "./schema";
import { canonicalEntityStatusValidator } from "./phase6Validators";
import { sourceConflictStatusValidator } from "./phase8Validators";
import { sourceHealthStateValidator } from "./phase5Validators";
import { trustMetadataValidator } from "./phase10Validators";

export const entityItemValidator = v.object({
  entity: schema.doc("canonicalEntities"),
  aliases: v.array(schema.doc("canonicalEntityAliases")),
});

export const factItemValidator = v.object({
  current: schema.doc("currentFacts"),
  version: schema.doc("factVersions"),
  trust: trustMetadataValidator,
});

export const historyItemValidator = v.object({
  version: schema.doc("factVersions"),
  trust: trustMetadataValidator,
});

export const eventItemValidator = v.object({
  event: schema.doc("changeEvents"),
  entity: schema.doc("canonicalEntities"),
  evidenceCount: v.number(),
});

export const sourceHealthItemValidator = v.object({
  source: schema.doc("sources"),
  health: v.union(schema.doc("sourceHealth"), v.null()),
});

async function trustFor(
  ctx: GenericQueryCtx<DataModel>,
  current: Doc<"currentFacts">,
  version: Doc<"factVersions">,
) {
  const observations = (
    await Promise.all(
      version.sourceObservationIds
        .slice(0, 20)
        .map((id) => ctx.db.get("canonicalObservations", id)),
    )
  ).filter((item): item is Doc<"canonicalObservations"> => item !== null);
  return {
    state:
      current.state === "released"
        ? ("released" as const)
        : current.state === "stale"
          ? ("stale" as const)
          : ("last_known_good" as const),
    servingLabel:
      current.servingLabel === "verified"
        ? ("verified" as const)
        : ("last_known_good" as const),
    verifiedAt: current.lastVerifiedAt,
    freshnessDeadline: current.freshnessDeadline,
    stale: current.state === "stale",
    supportingSourceCount: new Set(
      observations.map((item) => String(item.sourceId)),
    ).size,
    evidenceCount: version.evidenceRefs.length,
    certificateId: version.certificateId ?? null,
    uncertainty: version.evidenceRefs.length === 0 ? "missing_evidence" : null,
  };
}

export const entities = internalQuery({
  args: {
    projectId: v.id("projects"),
    status: v.optional(canonicalEntityStatusValidator),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(entityItemValidator),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("canonicalEntities")
      .withIndex("by_projectId_and_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", args.status ?? "active"),
      )
      .order("asc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (entity) => ({
          entity,
          aliases: await ctx.db
            .query("canonicalEntityAliases")
            .withIndex("by_entityId_and_status", (q) =>
              q.eq("entityId", entity._id).eq("status", "active"),
            )
            .take(20),
        })),
      ),
    };
  },
});

export const currentFacts = internalQuery({
  args: {
    projectId: v.id("projects"),
    entityId: v.id("canonicalEntities"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(factItemValidator),
  handler: async (ctx, args) => {
    const entity = await ctx.db.get("canonicalEntities", args.entityId);
    if (!entity || entity.projectId !== args.projectId)
      throw new Error("Entity not found in API-key project");
    const result = await ctx.db
      .query("currentFacts")
      .withIndex("by_entityId", (q) => q.eq("entityId", args.entityId))
      .paginate(args.paginationOpts);
    const page = [];
    for (const current of result.page) {
      if (
        current.servingLabel === "unavailable" ||
        current.state === "conflicted" ||
        current.state === "retracted"
      )
        continue;
      const version = await ctx.db.get("factVersions", current.factVersionId);
      if (
        !version ||
        version.projectId !== args.projectId ||
        version.state !== "released"
      )
        continue;
      page.push({
        current,
        version,
        trust: await trustFor(ctx, current, version),
      });
    }
    return { ...result, page };
  },
});

export const factHistory = internalQuery({
  args: {
    projectId: v.id("projects"),
    entityId: v.id("canonicalEntities"),
    predicate: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(historyItemValidator),
  handler: async (ctx, args) => {
    const entity = await ctx.db.get("canonicalEntities", args.entityId);
    if (!entity || entity.projectId !== args.projectId)
      throw new Error("Entity not found in API-key project");
    const result = await ctx.db
      .query("factVersions")
      .withIndex("by_entityId_and_predicate_and_transactionFrom", (q) =>
        q.eq("entityId", args.entityId).eq("predicate", args.predicate),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const current = await ctx.db
      .query("currentFacts")
      .withIndex("by_entityId_and_predicate", (q) =>
        q.eq("entityId", args.entityId).eq("predicate", args.predicate),
      )
      .unique();
    const page = [];
    for (const version of result.page) {
      if (version.state !== "released" && version.state !== "retracted")
        continue;
      const projection = current ?? {
        state: "stale" as const,
        servingLabel: "last_known_good" as const,
        lastVerifiedAt: version.transactionFrom,
        freshnessDeadline: version.transactionFrom,
      };
      page.push({
        version,
        trust: await trustFor(ctx, projection as Doc<"currentFacts">, version),
      });
    }
    return { ...result, page };
  },
});

export const events = internalQuery({
  args: {
    projectId: v.id("projects"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(eventItemValidator),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("changeEvents")
      .withIndex("by_projectId_and_createdAt", (q) =>
        q.eq("projectId", args.projectId),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const page = [];
    for (const event of result.page) {
      if (event.state !== "released") continue;
      const entity = await ctx.db.get("canonicalEntities", event.entityId);
      if (entity)
        page.push({ event, entity, evidenceCount: event.evidenceRefs.length });
    }
    return { ...result, page };
  },
});

export const conflicts = internalQuery({
  args: {
    projectId: v.id("projects"),
    status: v.optional(sourceConflictStatusValidator),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(schema.doc("sourceConflicts")),
  handler: async (ctx, args) =>
    ctx.db
      .query("sourceConflicts")
      .withIndex("by_projectId_and_status_and_openedAt", (q) =>
        q.eq("projectId", args.projectId).eq("status", args.status ?? "open"),
      )
      .order("desc")
      .paginate(args.paginationOpts),
});

export const sourceHealth = internalQuery({
  args: {
    projectId: v.id("projects"),
    state: v.optional(sourceHealthStateValidator),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(sourceHealthItemValidator),
  handler: async (ctx, args) => {
    void args.projectId;
    const result = await ctx.db
      .query("sources")
      .withIndex("by_approvalStatus_and_lifecycleStatus", (q) =>
        q.eq("approvalStatus", "approved").eq("lifecycleStatus", "active"),
      )
      .paginate(args.paginationOpts);
    const page = [];
    for (const source of result.page) {
      const health = await ctx.db
        .query("sourceHealth")
        .withIndex("by_sourceId", (q) => q.eq("sourceId", source._id))
        .unique();
      if (!args.state || health?.state === args.state)
        page.push({ source, health });
    }
    return { ...result, page };
  },
});

export const verification = internalQuery({
  args: {
    projectId: v.id("projects"),
    factVersionId: v.id("factVersions"),
  },
  returns: v.union(
    v.object({
      fact: schema.doc("factVersions"),
      evidence: v.array(schema.doc("evidence")),
      observations: v.array(schema.doc("canonicalObservations")),
      certificate: v.union(schema.doc("certificates"), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const fact = await ctx.db.get("factVersions", args.factVersionId);
    if (
      !fact ||
      fact.projectId !== args.projectId ||
      (fact.state !== "released" && fact.state !== "retracted")
    )
      return null;
    const evidence = (
      await Promise.all(
        fact.evidenceRefs.slice(0, 100).map((id) => ctx.db.get("evidence", id)),
      )
    ).filter((item): item is Doc<"evidence"> => item !== null);
    const observations = (
      await Promise.all(
        fact.sourceObservationIds
          .slice(0, 50)
          .map((id) => ctx.db.get("canonicalObservations", id)),
      )
    ).filter(
      (item): item is Doc<"canonicalObservations"> =>
        item !== null && item.trustState === "verified",
    );
    const certificate = fact.certificateId
      ? await ctx.db.get("certificates", fact.certificateId)
      : null;
    return { fact, evidence, observations, certificate };
  },
});

export const certificate = internalQuery({
  args: { projectId: v.id("projects"), certificateId: v.id("certificates") },
  returns: v.union(schema.doc("certificates"), v.null()),
  handler: async (ctx, args) => {
    const certificate = await ctx.db.get("certificates", args.certificateId);
    return certificate?.projectId === args.projectId &&
      certificate.status === "certified"
      ? certificate
      : null;
  },
});

export const mcpReleasedFacts = internalQuery({
  args: {
    projectId: v.id("projects"),
    entityId: v.id("canonicalEntities"),
    predicates: v.array(v.string()),
  },
  returns: v.array(factItemValidator),
  handler: async (ctx, args) => {
    if (args.predicates.length > 50)
      throw new Error("At most 50 predicates are supported");
    const entity = await ctx.db.get("canonicalEntities", args.entityId);
    if (!entity || entity.projectId !== args.projectId) return [];
    const rows = await ctx.db
      .query("currentFacts")
      .withIndex("by_entityId", (q) => q.eq("entityId", args.entityId))
      .take(100);
    const result = [];
    for (const current of rows) {
      if (
        args.predicates.length > 0 &&
        !args.predicates.includes(current.predicate)
      )
        continue;
      if (current.state !== "released" || current.servingLabel !== "verified")
        continue;
      const version = await ctx.db.get("factVersions", current.factVersionId);
      if (
        !version ||
        version.state !== "released" ||
        version.evidenceRefs.length === 0
      )
        continue;
      const trust = await trustFor(ctx, current, version);
      if (trust.supportingSourceCount < 1) continue;
      result.push({ current, version, trust });
    }
    return result.slice(0, 50);
  },
});
