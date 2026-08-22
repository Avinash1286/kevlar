import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action, mutation } from "./_generated/server";
import schema from "./schema";
import {
  apiContractKindValidator,
  apiScopeValidator,
  phase10FilterValidator,
  subscriptionChannelValidator,
} from "./phase10Validators";
import {
  assertPhase10Text,
  requirePhase10IngestKey,
  sha256,
} from "./phase10Support";
import { requireProjectRole } from "./phase11Auth";

const persistApiKeyRef = makeFunctionReference<"mutation">("phase10AdminSupport:persistApiKey");
const persistWebhookEndpointRef = makeFunctionReference<"mutation">("phase10AdminSupport:persistWebhookEndpoint");
const persistSecretRotationRef = makeFunctionReference<"mutation">("phase10AdminSupport:persistSecretRotation");
const persistSubscriptionRef = makeFunctionReference<"mutation">("phase10AdminSupport:persistSubscription");
const persistContractRef = makeFunctionReference<"mutation">("phase10AdminSupport:persistContract");

export const createApiKey = action({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    rawKey: v.string(),
    scopes: v.array(apiScopeValidator),
    rateLimitPerMinute: v.number(),
    operationKey: v.string(),
  },
  returns: schema.doc("apiKeys"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    assertPhase10Text(args.rawKey, "rawKey", 500);
    const secretHash = await sha256(args.rawKey);
    const prefix = args.rawKey.slice(0, Math.min(12, args.rawKey.length));
    return ctx.runMutation(persistApiKeyRef, {
      projectId: args.projectId,
      name: args.name,
      prefix,
      secretHash,
      scopes: args.scopes,
      rateLimitPerMinute: args.rateLimitPerMinute,
      operationKey: args.operationKey,
    });
  },
});

export const createWebhookEndpoint = action({
  args: {
    ingestKey: v.string(),
    projectId: v.id("projects"),
    name: v.string(),
    url: v.string(),
    rawSecret: v.string(),
    secretRef: v.string(),
    operationKey: v.string(),
  },
  returns: v.object({
    endpoint: schema.doc("webhookEndpoints"),
    secretVersion: schema.doc("webhookSecretVersions"),
  }),
  handler: async (ctx, args) => {
    requirePhase10IngestKey(args.ingestKey);
    assertPhase10Text(args.rawSecret, "rawSecret", 500);
    return ctx.runMutation(persistWebhookEndpointRef, {
      projectId: args.projectId,
      name: args.name,
      url: args.url,
      secretHash: await sha256(args.rawSecret),
      secretRef: args.secretRef,
      operationKey: args.operationKey,
    });
  },
});

export const rotateWebhookSecret = action({
  args: {
    ingestKey: v.string(),
    endpointId: v.id("webhookEndpoints"),
    rawSecret: v.string(),
    secretRef: v.string(),
    operationKey: v.string(),
  },
  returns: schema.doc("webhookSecretVersions"),
  handler: async (ctx, args) => {
    requirePhase10IngestKey(args.ingestKey);
    assertPhase10Text(args.rawSecret, "rawSecret", 500);
    return ctx.runMutation(persistSecretRotationRef, {
      endpointId: args.endpointId,
      secretHash: await sha256(args.rawSecret),
      secretRef: args.secretRef,
      operationKey: args.operationKey,
    });
  },
});

export const createSubscription = action({
  args: {
    ingestKey: v.string(),
    projectId: v.id("projects"),
    name: v.string(),
    channel: subscriptionChannelValidator,
    filters: phase10FilterValidator,
    webhookEndpointId: v.optional(v.id("webhookEndpoints")),
    operationKey: v.string(),
  },
  returns: schema.doc("filteredSubscriptions"),
  handler: async (ctx, args) => {
    requirePhase10IngestKey(args.ingestKey);
    return ctx.runMutation(persistSubscriptionRef, {
      projectId: args.projectId,
      name: args.name,
      channel: args.channel,
      filters: args.filters,
      webhookEndpointId: args.webhookEndpointId,
      operationKey: args.operationKey,
    });
  },
});

export const registerContract = action({
  args: {
    ingestKey: v.string(),
    identifier: v.string(),
    version: v.string(),
    kind: apiContractKindValidator,
    schemaHash: v.string(),
    operationKey: v.string(),
  },
  returns: schema.doc("apiContracts"),
  handler: async (ctx, args) => {
    requirePhase10IngestKey(args.ingestKey);
    return ctx.runMutation(persistContractRef, {
      identifier: args.identifier,
      version: args.version,
      kind: args.kind,
      schemaHash: args.schemaHash,
      operationKey: args.operationKey,
    });
  },
});

export const revokeApiKey = mutation({
  args: {
    ingestKey: v.string(),
    apiKeyId: v.id("apiKeys"),
    operationKey: v.string(),
  },
  returns: schema.doc("apiKeys"),
  handler: async (ctx, args) => {
    requirePhase10IngestKey(args.ingestKey);
    const key = await ctx.db.get("apiKeys", args.apiKeyId);
    if (!key) throw new Error("API key not found");
    await requireProjectRole(ctx, key.projectId, ["owner", "admin"]);
    if (key.status === "active") {
      const now = Date.now();
      await ctx.db.patch("apiKeys", key._id, { status: "revoked", revokedAt: now });
      await ctx.db.insert("auditEvents", {
        projectId: key.projectId,
        actorType: "system",
        action: "phase10.api_key.revoked",
        targetType: "api_key",
        targetId: String(key._id),
        payload: { operationKey: args.operationKey },
        createdAt: now,
      });
    }
    return (await ctx.db.get("apiKeys", key._id))!;
  },
});
