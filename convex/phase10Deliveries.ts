import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import {
  deliveryAttemptOutcomeValidator,
  deliveryModeValidator,
} from "./phase10Validators";
import {
  assertPhase10Text,
  assertSha256,
  deliveryIdempotencyKey,
  requirePhase10IngestKey,
  subscriptionMatches,
} from "./phase10Support";

const enqueueResultValidator = v.object({
  delivery: schema.doc("webhookDeliveries"),
  duplicate: v.boolean(),
});

export const enqueue = mutation({
  args: {
    ingestKey: v.string(),
    subscriptionId: v.id("filteredSubscriptions"),
    eventId: v.optional(v.id("changeEvents")),
    syntheticEventId: v.optional(v.string()),
    mode: deliveryModeValidator,
    replayBatchKey: v.optional(v.string()),
    payload: v.any(),
    payloadHash: v.string(),
    maxAttempts: v.optional(v.number()),
  },
  returns: enqueueResultValidator,
  handler: async (ctx, args) => {
    requirePhase10IngestKey(args.ingestKey);
    assertSha256(args.payloadHash, "payloadHash");
    const subscription = await ctx.db.get(
      "filteredSubscriptions",
      args.subscriptionId,
    );
    if (!subscription || subscription.status !== "active")
      throw new Error("Active subscription not found");
    if (!subscription.webhookEndpointId)
      throw new Error("Subscription has no webhook endpoint");
    const endpoint = await ctx.db.get(
      "webhookEndpoints",
      subscription.webhookEndpointId,
    );
    if (!endpoint || endpoint.status !== "active" || !endpoint.activeSecretVersionId)
      throw new Error("Active webhook endpoint and secret are required");
    const event = args.eventId
      ? await ctx.db.get("changeEvents", args.eventId)
      : null;
    if (args.mode !== "test") {
      if (!event || event.projectId !== subscription.projectId || event.state !== "released")
        throw new Error("Only released same-project events may be delivered");
      const entity = await ctx.db.get("canonicalEntities", event.entityId);
      if (!entity || !subscriptionMatches(subscription, event, entity.entityType))
        throw new Error("Event does not match subscription filters");
    }
    const eventExternalId = event?.eventId ?? args.syntheticEventId;
    if (!eventExternalId) throw new Error("eventId or syntheticEventId is required");
    const idempotencyKey = deliveryIdempotencyKey(
      String(subscription._id),
      eventExternalId,
      args.mode,
      args.replayBatchKey,
    );
    const duplicate = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
      .unique();
    if (duplicate) return { delivery: duplicate, duplicate: true };
    const maxAttempts = args.maxAttempts ?? 6;
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10)
      throw new Error("maxAttempts must be an integer from 1-10");
    const now = Date.now();
    const id = await ctx.db.insert("webhookDeliveries", {
      projectId: subscription.projectId,
      subscriptionId: subscription._id,
      endpointId: endpoint._id,
      eventId: event?._id,
      eventExternalId,
      mode: args.mode,
      payload: args.payload,
      payloadHash: args.payloadHash,
      idempotencyKey,
      status: "queued",
      attemptCount: 0,
      maxAttempts,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: subscription.projectId,
      actorType: "system",
      action: "phase10.webhook_delivery.enqueued",
      targetType: "webhook_delivery",
      targetId: String(id),
      payload: { eventExternalId, mode: args.mode, idempotencyKey },
      createdAt: now,
    });
    return { delivery: (await ctx.db.get("webhookDeliveries", id))!, duplicate: false };
  },
});

const attemptResultValidator = v.object({
  delivery: schema.doc("webhookDeliveries"),
  attempt: schema.doc("webhookDeliveryAttempts"),
  duplicate: v.boolean(),
});

export const recordAttempt = mutation({
  args: {
    ingestKey: v.string(),
    deliveryId: v.id("webhookDeliveries"),
    requestId: v.string(),
    outcome: deliveryAttemptOutcomeValidator,
    responseStatus: v.optional(v.number()),
    responseSnippet: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    latencyMs: v.number(),
    signatureTimestamp: v.number(),
    signatureInput: v.string(),
    signature: v.string(),
    bodyHash: v.string(),
  },
  returns: attemptResultValidator,
  handler: async (ctx, args) => {
    requirePhase10IngestKey(args.ingestKey);
    assertSha256(args.bodyHash, "bodyHash");
    assertPhase10Text(args.requestId, "requestId", 200);
    if (!args.signatureInput.startsWith(`${args.signatureTimestamp}.`))
      throw new Error("signatureInput must be timestamp.rawRequestBody");
    if (!/^v1=[a-f0-9]{64}$/.test(args.signature))
      throw new Error("signature must be a v1 HMAC-SHA256 hex value");
    const duplicateAttempt = await ctx.db
      .query("webhookDeliveryAttempts")
      .withIndex("by_requestId", (q) => q.eq("requestId", args.requestId))
      .unique();
    const delivery = await ctx.db.get("webhookDeliveries", args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");
    if (duplicateAttempt)
      return { delivery, attempt: duplicateAttempt, duplicate: true };
    const endpoint = await ctx.db.get("webhookEndpoints", delivery.endpointId);
    if (!endpoint?.activeSecretVersionId)
      throw new Error("Webhook endpoint has no active secret version");
    if (!Number.isFinite(args.latencyMs) || args.latencyMs < 0)
      throw new Error("latencyMs must be non-negative");
    const now = Date.now();
    const attemptNumber = delivery.attemptCount + 1;
    const attemptId = await ctx.db.insert("webhookDeliveryAttempts", {
      deliveryId: delivery._id,
      attempt: attemptNumber,
      requestId: args.requestId,
      outcome: args.outcome,
      responseStatus: args.responseStatus,
      responseSnippet: args.responseSnippet?.slice(0, 500),
      errorCode: args.errorCode,
      latencyMs: args.latencyMs,
      secretVersionId: endpoint.activeSecretVersionId,
      signatureTimestamp: args.signatureTimestamp,
      signatureInput: args.signatureInput,
      signature: args.signature,
      bodyHash: args.bodyHash,
      createdAt: now,
    });
    const exhausted = attemptNumber >= delivery.maxAttempts;
    const status =
      args.outcome === "success"
        ? "delivered"
        : args.outcome === "permanent_failure" || exhausted
          ? "dead_letter"
          : "retrying";
    const retryDelays = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000, 86_400_000];
    await ctx.db.patch("webhookDeliveries", delivery._id, {
      status,
      attemptCount: attemptNumber,
      nextAttemptAt:
        status === "retrying"
          ? now + retryDelays[Math.min(attemptNumber - 1, retryDelays.length - 1)]
          : undefined,
      completedAt: status === "delivered" || status === "dead_letter" ? now : undefined,
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: delivery.projectId,
      actorType: "provider",
      action: "phase10.webhook_delivery.attempted",
      targetType: "webhook_delivery",
      targetId: String(delivery._id),
      payload: { requestId: args.requestId, outcome: args.outcome, status, attempt: attemptNumber },
      createdAt: now,
    });
    return {
      delivery: (await ctx.db.get("webhookDeliveries", delivery._id))!,
      attempt: (await ctx.db.get("webhookDeliveryAttempts", attemptId))!,
      duplicate: false,
    };
  },
});

export const replay = mutation({
  args: {
    ingestKey: v.string(),
    deliveryId: v.id("webhookDeliveries"),
    replayBatchKey: v.string(),
    reason: v.string(),
    operationKey: v.string(),
  },
  returns: v.object({
    replay: schema.doc("webhookReplayRequests"),
    delivery: schema.doc("webhookDeliveries"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase10IngestKey(args.ingestKey);
    const prior = await ctx.db
      .query("webhookReplayRequests")
      .withIndex("by_operationKey", (q) => q.eq("operationKey", args.operationKey))
      .unique();
    if (prior) {
      const delivery = await ctx.db.get("webhookDeliveries", prior.replayDeliveryId);
      if (!delivery) throw new Error("Replay delivery is missing");
      return { replay: prior, delivery, duplicate: true };
    }
    const source = await ctx.db.get("webhookDeliveries", args.deliveryId);
    if (!source || source.status !== "dead_letter")
      throw new Error("Only dead-letter deliveries can be replayed");
    const idempotencyKey = deliveryIdempotencyKey(
      String(source.subscriptionId),
      source.eventExternalId,
      "replay",
      args.replayBatchKey,
    );
    const existing = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
      .unique();
    const now = Date.now();
    const replayDeliveryId = existing?._id ?? await ctx.db.insert("webhookDeliveries", {
      projectId: source.projectId,
      subscriptionId: source.subscriptionId,
      endpointId: source.endpointId,
      eventId: source.eventId,
      eventExternalId: source.eventExternalId,
      mode: "replay",
      payload: source.payload,
      payloadHash: source.payloadHash,
      idempotencyKey,
      status: "queued",
      attemptCount: 0,
      maxAttempts: source.maxAttempts,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const replayId = await ctx.db.insert("webhookReplayRequests", {
      projectId: source.projectId,
      deliveryId: source._id,
      replayDeliveryId,
      reason: args.reason,
      operationKey: args.operationKey,
      createdAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: source.projectId,
      actorType: "system",
      action: "phase10.webhook_delivery.replayed",
      targetType: "webhook_delivery",
      targetId: String(source._id),
      payload: { replayDeliveryId, replayBatchKey: args.replayBatchKey, reason: args.reason },
      createdAt: now,
    });
    return {
      replay: (await ctx.db.get("webhookReplayRequests", replayId))!,
      delivery: (await ctx.db.get("webhookDeliveries", replayDeliveryId))!,
      duplicate: existing !== null,
    };
  },
});

export const delivery = query({
  args: { deliveryId: v.id("webhookDeliveries") },
  returns: v.union(
    v.object({
      delivery: schema.doc("webhookDeliveries"),
      attempts: v.array(schema.doc("webhookDeliveryAttempts")),
      endpoint: schema.doc("webhookEndpoints"),
      subscription: schema.doc("filteredSubscriptions"),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get("webhookDeliveries", args.deliveryId);
    if (!delivery) return null;
    const [attempts, endpoint, subscription] = await Promise.all([
      ctx.db.query("webhookDeliveryAttempts").withIndex("by_deliveryId_and_attempt", (q) => q.eq("deliveryId", delivery._id)).take(10),
      ctx.db.get("webhookEndpoints", delivery.endpointId),
      ctx.db.get("filteredSubscriptions", delivery.subscriptionId),
    ]);
    if (!endpoint || !subscription) return null;
    return { delivery, attempts, endpoint, subscription };
  },
});
