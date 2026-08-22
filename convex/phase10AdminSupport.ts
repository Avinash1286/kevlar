import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import schema from "./schema";
import {
  apiContractKindValidator,
  apiScopeValidator,
  phase10FilterValidator,
  subscriptionChannelValidator,
} from "./phase10Validators";
import {
  assertHttpsUrl,
  assertPhase10Text,
  assertSha256,
} from "./phase10Support";
import { requireProjectRole } from "./phase11Auth";

export const persistApiKey = internalMutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    prefix: v.string(),
    secretHash: v.string(),
    scopes: v.array(apiScopeValidator),
    rateLimitPerMinute: v.number(),
    operationKey: v.string(),
  },
  returns: schema.doc("apiKeys"),
  handler: async (ctx, args) => {
    await requireProjectRole(ctx, args.projectId, ["owner", "admin"]);
    assertPhase10Text(args.name, "name", 120);
    assertPhase10Text(args.prefix, "prefix", 24);
    assertPhase10Text(args.operationKey, "operationKey", 250);
    assertSha256(args.secretHash, "secretHash");
    if (
      !Number.isSafeInteger(args.rateLimitPerMinute) ||
      args.rateLimitPerMinute < 1 ||
      args.rateLimitPerMinute > 100_000
    )
      throw new Error("rateLimitPerMinute must be an integer from 1-100000");
    if (args.scopes.length < 1 || args.scopes.length > 20)
      throw new Error("scopes must contain 1-20 entries");
    const duplicate = await ctx.db
      .query("apiKeys")
      .withIndex("by_operationKey", (q) => q.eq("operationKey", args.operationKey))
      .unique();
    if (duplicate) return duplicate;
    const hashOwner = await ctx.db
      .query("apiKeys")
      .withIndex("by_secretHash", (q) => q.eq("secretHash", args.secretHash))
      .unique();
    if (hashOwner) throw new Error("API key material is already registered");
    const createdAt = Date.now();
    const id = await ctx.db.insert("apiKeys", {
      ...args,
      scopes: [...new Set(args.scopes)],
      status: "active",
      createdAt,
    });
    await ctx.db.insert("auditEvents", {
      projectId: args.projectId,
      actorType: "system",
      action: "phase10.api_key.created",
      targetType: "api_key",
      targetId: String(id),
      payload: { prefix: args.prefix, scopes: args.scopes },
      createdAt,
    });
    return (await ctx.db.get("apiKeys", id))!;
  },
});

export const persistWebhookEndpoint = internalMutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    url: v.string(),
    secretHash: v.string(),
    secretRef: v.string(),
    operationKey: v.string(),
  },
  returns: v.object({
    endpoint: schema.doc("webhookEndpoints"),
    secretVersion: schema.doc("webhookSecretVersions"),
  }),
  handler: async (ctx, args) => {
    await requireProjectRole(ctx, args.projectId, ["owner", "admin"]);
    assertPhase10Text(args.name, "name", 120);
    assertHttpsUrl(args.url);
    assertSha256(args.secretHash, "secretHash");
    assertPhase10Text(args.secretRef, "secretRef", 250);
    const duplicate = await ctx.db
      .query("webhookEndpoints")
      .withIndex("by_operationKey", (q) => q.eq("operationKey", args.operationKey))
      .unique();
    if (duplicate) {
      if (!duplicate.activeSecretVersionId)
        throw new Error("Existing endpoint has no active secret version");
      const secretVersion = await ctx.db.get(
        "webhookSecretVersions",
        duplicate.activeSecretVersionId,
      );
      if (!secretVersion) throw new Error("Webhook secret version is missing");
      return { endpoint: duplicate, secretVersion };
    }
    const createdAt = Date.now();
    const endpointId = await ctx.db.insert("webhookEndpoints", {
      projectId: args.projectId,
      name: args.name,
      url: args.url,
      status: "active",
      operationKey: args.operationKey,
      createdAt,
      updatedAt: createdAt,
    });
    const secretVersionId = await ctx.db.insert("webhookSecretVersions", {
      endpointId,
      version: 1,
      secretHash: args.secretHash,
      secretRef: args.secretRef,
      status: "active",
      operationKey: `${args.operationKey}:secret:v1`,
      createdAt,
    });
    await ctx.db.patch("webhookEndpoints", endpointId, {
      activeSecretVersionId: secretVersionId,
    });
    await ctx.db.insert("auditEvents", {
      projectId: args.projectId,
      actorType: "system",
      action: "phase10.webhook_endpoint.created",
      targetType: "webhook_endpoint",
      targetId: String(endpointId),
      payload: { url: args.url, secretRef: args.secretRef, version: 1 },
      createdAt,
    });
    return {
      endpoint: (await ctx.db.get("webhookEndpoints", endpointId))!,
      secretVersion: (await ctx.db.get("webhookSecretVersions", secretVersionId))!,
    };
  },
});

export const persistSecretRotation = internalMutation({
  args: {
    endpointId: v.id("webhookEndpoints"),
    secretHash: v.string(),
    secretRef: v.string(),
    operationKey: v.string(),
  },
  returns: schema.doc("webhookSecretVersions"),
  handler: async (ctx, args) => {
    assertSha256(args.secretHash, "secretHash");
    const endpoint = await ctx.db.get("webhookEndpoints", args.endpointId);
    if (!endpoint) throw new Error("Webhook endpoint not found");
    await requireProjectRole(ctx, endpoint.projectId, ["owner", "admin"]);
    const duplicate = await ctx.db
      .query("webhookSecretVersions")
      .withIndex("by_operationKey", (q) => q.eq("operationKey", args.operationKey))
      .unique();
    if (duplicate) return duplicate;
    const current = endpoint.activeSecretVersionId
      ? await ctx.db.get("webhookSecretVersions", endpoint.activeSecretVersionId)
      : null;
    const now = Date.now();
    if (current)
      await ctx.db.patch("webhookSecretVersions", current._id, {
        status: "retired",
        retiredAt: now,
      });
    const id = await ctx.db.insert("webhookSecretVersions", {
      endpointId: endpoint._id,
      version: (current?.version ?? 0) + 1,
      secretHash: args.secretHash,
      secretRef: args.secretRef,
      status: "active",
      rotatedFromId: current?._id,
      operationKey: args.operationKey,
      createdAt: now,
    });
    await ctx.db.patch("webhookEndpoints", endpoint._id, {
      activeSecretVersionId: id,
      rotatedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: endpoint.projectId,
      actorType: "system",
      action: "phase10.webhook_secret.rotated",
      targetType: "webhook_endpoint",
      targetId: String(endpoint._id),
      payload: { secretRef: args.secretRef, version: (current?.version ?? 0) + 1 },
      createdAt: now,
    });
    return (await ctx.db.get("webhookSecretVersions", id))!;
  },
});

export const persistSubscription = internalMutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    channel: subscriptionChannelValidator,
    filters: phase10FilterValidator,
    webhookEndpointId: v.optional(v.id("webhookEndpoints")),
    operationKey: v.string(),
  },
  returns: schema.doc("filteredSubscriptions"),
  handler: async (ctx, args) => {
    await requireProjectRole(ctx, args.projectId, ["owner", "admin"]);
    const duplicate = await ctx.db
      .query("filteredSubscriptions")
      .withIndex("by_operationKey", (q) => q.eq("operationKey", args.operationKey))
      .unique();
    if (duplicate) return duplicate;
    if (args.channel === "webhook") {
      if (!args.webhookEndpointId)
        throw new Error("Webhook subscriptions require an endpoint");
      const endpoint = await ctx.db.get("webhookEndpoints", args.webhookEndpointId);
      if (!endpoint || endpoint.projectId !== args.projectId || endpoint.status !== "active")
        throw new Error("Active same-project webhook endpoint required");
    }
    for (const values of [
      args.filters.eventTypes,
      args.filters.entityTypes,
      args.filters.predicates,
    ]) if (values.length > 50) throw new Error("Each filter supports at most 50 values");
    const now = Date.now();
    const id = await ctx.db.insert("filteredSubscriptions", {
      ...args,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: args.projectId,
      actorType: "system",
      action: "phase10.subscription.created",
      targetType: "filtered_subscription",
      targetId: String(id),
      payload: { channel: args.channel, filters: args.filters },
      createdAt: now,
    });
    return (await ctx.db.get("filteredSubscriptions", id))!;
  },
});

export const persistContract = internalMutation({
  args: {
    identifier: v.string(),
    version: v.string(),
    kind: apiContractKindValidator,
    schemaHash: v.string(),
    operationKey: v.string(),
  },
  returns: schema.doc("apiContracts"),
  handler: async (ctx, args) => {
    const duplicate = await ctx.db
      .query("apiContracts")
      .withIndex("by_operationKey", (q) => q.eq("operationKey", args.operationKey))
      .unique();
    if (duplicate) return duplicate;
    const existing = await ctx.db
      .query("apiContracts")
      .withIndex("by_identifier_and_version", (q) =>
        q.eq("identifier", args.identifier).eq("version", args.version),
      )
      .unique();
    if (existing) return existing;
    const id = await ctx.db.insert("apiContracts", {
      ...args,
      status: "active",
      createdAt: Date.now(),
    });
    return (await ctx.db.get("apiContracts", id))!;
  },
});
