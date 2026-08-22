import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { apiScopeValidator } from "./phase10Validators";
import { assertSha256 } from "./phase10Support";

const authorizationResult = v.object({
  authorized: v.boolean(),
  reason: v.union(v.string(), v.null()),
  apiKeyId: v.union(v.id("apiKeys"), v.null()),
  projectId: v.union(v.id("projects"), v.null()),
  limit: v.number(),
  remaining: v.number(),
  resetAt: v.number(),
  duplicate: v.boolean(),
});

export const authorizeAndConsume = internalMutation({
  args: {
    secretHash: v.string(),
    scope: apiScopeValidator,
    requestId: v.string(),
    resource: v.string(),
  },
  returns: authorizationResult,
  handler: async (ctx, args) => {
    assertSha256(args.secretHash, "secretHash");
    const now = Date.now();
    const bucketStart = Math.floor(now / 60_000) * 60_000;
    const resetAt = bucketStart + 60_000;
    const priorAudit = await ctx.db
      .query("apiRequestAudit")
      .withIndex("by_requestId", (q) => q.eq("requestId", args.requestId))
      .unique();
    if (priorAudit) {
      const priorKey = priorAudit.apiKeyId
        ? await ctx.db.get("apiKeys", priorAudit.apiKeyId)
        : null;
      return {
        authorized: priorAudit.outcome === "authorized",
        reason: priorAudit.outcome === "authorized" ? null : priorAudit.outcome,
        apiKeyId: priorAudit.apiKeyId ?? null,
        projectId: priorAudit.projectId ?? null,
        limit: priorKey?.rateLimitPerMinute ?? 0,
        remaining: 0,
        resetAt,
        duplicate: true,
      };
    }
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_secretHash", (q) => q.eq("secretHash", args.secretHash))
      .unique();
    let outcome: "authorized" | "denied" | "rate_limited" = "denied";
    let reason: string | null = "invalid_or_revoked_key";
    let remaining = 0;
    if (key?.status === "active" && key.scopes.includes(args.scope)) {
      const bucket = await ctx.db
        .query("apiRateLimitBuckets")
        .withIndex("by_apiKeyId_and_bucketStart", (q) =>
          q.eq("apiKeyId", key._id).eq("bucketStart", bucketStart),
        )
        .unique();
      const used = bucket?.requestCount ?? 0;
      if (used >= key.rateLimitPerMinute) {
        outcome = "rate_limited";
        reason = "rate_limit_exceeded";
      } else {
        outcome = "authorized";
        reason = null;
        remaining = key.rateLimitPerMinute - used - 1;
        if (bucket)
          await ctx.db.patch("apiRateLimitBuckets", bucket._id, {
            requestCount: used + 1,
            updatedAt: now,
          });
        else
          await ctx.db.insert("apiRateLimitBuckets", {
            apiKeyId: key._id,
            bucketStart,
            requestCount: 1,
            updatedAt: now,
          });
        await ctx.db.patch("apiKeys", key._id, { lastUsedAt: now });
      }
    } else if (key?.status === "active") reason = "missing_scope";
    await ctx.db.insert("apiRequestAudit", {
      projectId: key?.projectId,
      apiKeyId: key?._id,
      requestId: args.requestId,
      scope: args.scope,
      resource: args.resource,
      outcome,
      createdAt: now,
    });
    return {
      authorized: outcome === "authorized",
      reason,
      apiKeyId: key?._id ?? null,
      projectId: key?.projectId ?? null,
      limit: key?.rateLimitPerMinute ?? 0,
      remaining,
      resetAt,
      duplicate: false,
    };
  },
});
