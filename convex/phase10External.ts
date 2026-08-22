import {
  makeFunctionReference,
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v, type Infer } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { canonicalEntityStatusValidator } from "./phase6Validators";
import { sourceConflictStatusValidator } from "./phase8Validators";
import { sourceHealthStateValidator } from "./phase5Validators";
import {
  entityItemValidator,
  eventItemValidator,
  factItemValidator,
  historyItemValidator,
  sourceHealthItemValidator,
} from "./phase10Release";
import { apiScopeValidator } from "./phase10Validators";
import { assertPhase10Text, sha256 } from "./phase10Support";

const authorizeRef = makeFunctionReference<"mutation">("phase10AuthSupport:authorizeAndConsume");
const entitiesRef = makeFunctionReference<"query">("phase10Release:entities");
const currentFactsRef = makeFunctionReference<"query">("phase10Release:currentFacts");
const factHistoryRef = makeFunctionReference<"query">("phase10Release:factHistory");
const eventsRef = makeFunctionReference<"query">("phase10Release:events");
const conflictsRef = makeFunctionReference<"query">("phase10Release:conflicts");
const sourceHealthRef = makeFunctionReference<"query">("phase10Release:sourceHealth");
const verificationRef = makeFunctionReference<"query">("phase10Release:verification");
const certificateRef = makeFunctionReference<"query">("phase10Release:certificate");
const mcpReleasedFactsRef = makeFunctionReference<"query">("phase10Release:mcpReleasedFacts");

const rateLimitValidator = v.object({
  limit: v.number(),
  remaining: v.number(),
  resetAt: v.number(),
});

type ApiScope = Infer<typeof apiScopeValidator>;

async function authorize(
  ctx: ActionCtx,
  rawApiKey: string,
  requestId: string,
  scope: ApiScope,
  resource: string,
): Promise<{ projectId: Id<"projects">; rateLimit: { limit: number; remaining: number; resetAt: number } }> {
  assertPhase10Text(rawApiKey, "rawApiKey", 500);
  assertPhase10Text(requestId, "requestId", 200);
  const result = await ctx.runMutation(authorizeRef, {
    secretHash: await sha256(rawApiKey),
    scope,
    requestId,
    resource,
  });
  if (!result.authorized || !result.projectId)
    throw new Error(`API request denied: ${result.reason ?? "unauthorized"}`);
  return {
    projectId: result.projectId,
    rateLimit: {
      limit: result.limit,
      remaining: result.remaining,
      resetAt: result.resetAt,
    },
  };
}

export const entities = action({
  args: {
    rawApiKey: v.string(),
    requestId: v.string(),
    status: v.optional(canonicalEntityStatusValidator),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    apiVersion: v.literal("v1"),
    rateLimit: rateLimitValidator,
    data: paginationResultValidator(entityItemValidator),
  }),
  handler: async (ctx, args) => {
    const auth = await authorize(ctx, args.rawApiKey, args.requestId, "facts:read", "entities");
    return {
      apiVersion: "v1" as const,
      rateLimit: auth.rateLimit,
      data: await ctx.runQuery(entitiesRef, {
        projectId: auth.projectId,
        status: args.status,
        paginationOpts: args.paginationOpts,
      }),
    };
  },
});

export const currentFacts = action({
  args: {
    rawApiKey: v.string(),
    requestId: v.string(),
    entityId: v.id("canonicalEntities"),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    apiVersion: v.literal("v1"),
    rateLimit: rateLimitValidator,
    data: paginationResultValidator(factItemValidator),
  }),
  handler: async (ctx, args) => {
    const auth = await authorize(ctx, args.rawApiKey, args.requestId, "facts:read", "current_facts");
    return {
      apiVersion: "v1" as const,
      rateLimit: auth.rateLimit,
      data: await ctx.runQuery(currentFactsRef, {
        projectId: auth.projectId,
        entityId: args.entityId,
        paginationOpts: args.paginationOpts,
      }),
    };
  },
});

export const factHistory = action({
  args: {
    rawApiKey: v.string(),
    requestId: v.string(),
    entityId: v.id("canonicalEntities"),
    predicate: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({ apiVersion: v.literal("v1"), rateLimit: rateLimitValidator, data: paginationResultValidator(historyItemValidator) }),
  handler: async (ctx, args) => {
    const auth = await authorize(ctx, args.rawApiKey, args.requestId, "facts:read", "fact_history");
    return {
      apiVersion: "v1" as const,
      rateLimit: auth.rateLimit,
      data: await ctx.runQuery(factHistoryRef, {
        projectId: auth.projectId,
        entityId: args.entityId,
        predicate: args.predicate,
        paginationOpts: args.paginationOpts,
      }),
    };
  },
});

export const events = action({
  args: { rawApiKey: v.string(), requestId: v.string(), paginationOpts: paginationOptsValidator },
  returns: v.object({ apiVersion: v.literal("v1"), rateLimit: rateLimitValidator, data: paginationResultValidator(eventItemValidator) }),
  handler: async (ctx, args) => {
    const auth = await authorize(ctx, args.rawApiKey, args.requestId, "events:read", "events");
    return { apiVersion: "v1" as const, rateLimit: auth.rateLimit, data: await ctx.runQuery(eventsRef, { projectId: auth.projectId, paginationOpts: args.paginationOpts }) };
  },
});

export const conflicts = action({
  args: { rawApiKey: v.string(), requestId: v.string(), status: v.optional(sourceConflictStatusValidator), paginationOpts: paginationOptsValidator },
  returns: v.object({ apiVersion: v.literal("v1"), rateLimit: rateLimitValidator, data: paginationResultValidator(schema.doc("sourceConflicts")) }),
  handler: async (ctx, args) => {
    const auth = await authorize(ctx, args.rawApiKey, args.requestId, "facts:read", "conflicts");
    return { apiVersion: "v1" as const, rateLimit: auth.rateLimit, data: await ctx.runQuery(conflictsRef, { projectId: auth.projectId, status: args.status, paginationOpts: args.paginationOpts }) };
  },
});

export const sourceHealth = action({
  args: { rawApiKey: v.string(), requestId: v.string(), state: v.optional(sourceHealthStateValidator), paginationOpts: paginationOptsValidator },
  returns: v.object({ apiVersion: v.literal("v1"), rateLimit: rateLimitValidator, data: paginationResultValidator(sourceHealthItemValidator) }),
  handler: async (ctx, args) => {
    const auth = await authorize(ctx, args.rawApiKey, args.requestId, "sources:read", "source_health");
    return { apiVersion: "v1" as const, rateLimit: auth.rateLimit, data: await ctx.runQuery(sourceHealthRef, { projectId: auth.projectId, state: args.state, paginationOpts: args.paginationOpts }) };
  },
});

export const verification = action({
  args: { rawApiKey: v.string(), requestId: v.string(), factVersionId: v.id("factVersions") },
  returns: v.object({
    apiVersion: v.literal("v1"),
    rateLimit: rateLimitValidator,
    data: v.union(v.object({
      fact: schema.doc("factVersions"),
      evidence: v.array(schema.doc("evidence")),
      observations: v.array(schema.doc("canonicalObservations")),
      certificate: v.union(schema.doc("certificates"), v.null()),
    }), v.null()),
  }),
  handler: async (ctx, args) => {
    const auth = await authorize(ctx, args.rawApiKey, args.requestId, "evidence:read", "verification");
    return { apiVersion: "v1" as const, rateLimit: auth.rateLimit, data: await ctx.runQuery(verificationRef, { projectId: auth.projectId, factVersionId: args.factVersionId }) };
  },
});

export const certificate = action({
  args: { rawApiKey: v.string(), requestId: v.string(), certificateId: v.id("certificates") },
  returns: v.object({ apiVersion: v.literal("v1"), rateLimit: rateLimitValidator, data: v.union(schema.doc("certificates"), v.null()) }),
  handler: async (ctx, args) => {
    const auth = await authorize(ctx, args.rawApiKey, args.requestId, "evidence:read", "certificate");
    return { apiVersion: "v1" as const, rateLimit: auth.rateLimit, data: await ctx.runQuery(certificateRef, { projectId: auth.projectId, certificateId: args.certificateId }) };
  },
});

export const mcpReleasedFacts = action({
  args: { rawApiKey: v.string(), requestId: v.string(), entityId: v.id("canonicalEntities"), predicates: v.array(v.string()) },
  returns: v.object({ apiVersion: v.literal("v1"), rateLimit: rateLimitValidator, data: v.array(factItemValidator) }),
  handler: async (ctx, args) => {
    const auth = await authorize(ctx, args.rawApiKey, args.requestId, "mcp:read", "mcp_released_facts");
    return { apiVersion: "v1" as const, rateLimit: auth.rateLimit, data: await ctx.runQuery(mcpReleasedFactsRef, { projectId: auth.projectId, entityId: args.entityId, predicates: args.predicates }) };
  },
});
