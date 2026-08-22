import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import schema from "./schema";
import { PHASE10_PROOF_KEY } from "./phase10Support";

export const persistProof = internalMutation({
  args: {
    apiKeyHash: v.string(),
    webhookSecretHash: v.string(),
    payloadHash: v.string(),
    signatureTimestamp: v.number(),
    signatureInput: v.string(),
    signature: v.string(),
  },
  returns: v.object({
    proof: schema.doc("phase10Proofs"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("phase10Proofs")
      .withIndex("by_key", (q) => q.eq("key", PHASE10_PROOF_KEY))
      .unique();
    if (existing) return { proof: existing, duplicate: true };
    const phase7 = await ctx.db
      .query("phase7Proofs")
      .withIndex("by_key", (q) => q.eq("key", "phase7:bitemporal-proof:v1"))
      .unique();
    if (!phase7) throw new Error("Seed Phase 7 proof before Phase 10");
    const releasedFact = (
      await Promise.all(
        phase7.factVersionIds
          .slice(0, 20)
          .map((id) => ctx.db.get("factVersions", id)),
      )
    ).find(
      (item) => item?.state === "released" && item.evidenceRefs.length > 0,
    );
    if (!releasedFact)
      throw new Error("Phase 7 proof has no released evidence-aware fact");
    const releasedEvent = await ctx.db
      .query("changeEvents")
      .withIndex("by_state_and_createdAt", (q) => q.eq("state", "released"))
      .order("desc")
      .first();
    if (!releasedEvent || releasedEvent.projectId !== phase7.projectId)
      throw new Error("A released same-project change event is required");
    const now = Date.now();
    const apiKeyId = await ctx.db.insert("apiKeys", {
      projectId: phase7.projectId,
      name: "Phase 10 proof client",
      prefix: "kv_dev_phase",
      secretHash: args.apiKeyHash,
      scopes: [
        "facts:read",
        "events:read",
        "evidence:read",
        "sources:read",
        "mcp:read",
      ],
      status: "active",
      rateLimitPerMinute: 120,
      operationKey: `${PHASE10_PROOF_KEY}:api-key`,
      createdAt: now,
    });
    const endpointId = await ctx.db.insert("webhookEndpoints", {
      projectId: phase7.projectId,
      name: "Phase 10 proof webhook",
      url: "https://example.test/kevlar-webhook",
      status: "active",
      operationKey: `${PHASE10_PROOF_KEY}:endpoint`,
      createdAt: now,
      updatedAt: now,
    });
    const secretVersionId = await ctx.db.insert("webhookSecretVersions", {
      endpointId,
      version: 1,
      secretHash: args.webhookSecretHash,
      secretRef: "vault://kevlar/dev/phase10/webhook/v1",
      status: "active",
      operationKey: `${PHASE10_PROOF_KEY}:secret:v1`,
      createdAt: now,
    });
    await ctx.db.patch("webhookEndpoints", endpointId, {
      activeSecretVersionId: secretVersionId,
    });
    const subscriptionId = await ctx.db.insert("filteredSubscriptions", {
      projectId: phase7.projectId,
      name: "Released fact changes",
      channel: "webhook",
      filters: {
        eventTypes: [],
        entityTypes: [],
        predicates: [],
        includeCorrections: true,
      },
      webhookEndpointId: endpointId,
      status: "active",
      operationKey: `${PHASE10_PROOF_KEY}:subscription`,
      createdAt: now,
      updatedAt: now,
    });
    const contractIds = [];
    for (const [identifier, kind, schemaHash] of [
      [
        "kevlar.rest.v1",
        "rest",
        "sha256:5dc3d349fe35a76451ecb77afca684d6c115fc902c87818fc11f443885605ec8",
      ],
      [
        "@kevlar/sdk.v1",
        "sdk",
        "sha256:4300ccb77666ed71682497633900258161e1749b1f51e273bfe3be3f393222ca",
      ],
      [
        "kevlar.mcp.v1",
        "mcp",
        "sha256:e997009214e259554bec100eec7b3755864c874f28e92c1e4216445109b91300",
      ],
      [
        "kevlar.webhook.v1",
        "webhook",
        "sha256:1b00557ffdb7b9fb84b6304310464cd0c6f31b67a9d40cd0ff2361967027445f",
      ],
    ] as const) {
      contractIds.push(
        await ctx.db.insert("apiContracts", {
          identifier,
          version: "1.0.0",
          kind,
          schemaHash,
          status: "active",
          operationKey: `${PHASE10_PROOF_KEY}:contract:${kind}`,
          createdAt: now,
        }),
      );
    }
    const idempotencyKey = `deliver:${subscriptionId}:${releasedEvent.eventId}:live`;
    const sourceDeliveryId = await ctx.db.insert("webhookDeliveries", {
      projectId: phase7.projectId,
      subscriptionId,
      endpointId,
      eventId: releasedEvent._id,
      eventExternalId: releasedEvent.eventId,
      mode: "live",
      payload: {
        id: releasedEvent.eventId,
        type: releasedEvent.eventType,
        project_id: String(phase7.projectId),
        test: false,
      },
      payloadHash: args.payloadHash,
      idempotencyKey,
      status: "dead_letter",
      attemptCount: 1,
      maxAttempts: 1,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    });
    await ctx.db.insert("webhookDeliveryAttempts", {
      deliveryId: sourceDeliveryId,
      attempt: 1,
      requestId: "phase10-proof-failed-attempt",
      outcome: "permanent_failure",
      responseStatus: 500,
      responseSnippet: "synthetic failure",
      errorCode: "PROOF_FAILURE",
      latencyMs: 12,
      secretVersionId,
      signatureTimestamp: args.signatureTimestamp,
      signatureInput: args.signatureInput,
      signature: args.signature,
      bodyHash: args.payloadHash,
      createdAt: now,
    });
    const replayDeliveryId = await ctx.db.insert("webhookDeliveries", {
      projectId: phase7.projectId,
      subscriptionId,
      endpointId,
      eventId: releasedEvent._id,
      eventExternalId: releasedEvent.eventId,
      mode: "replay",
      payload: {
        id: releasedEvent.eventId,
        type: releasedEvent.eventType,
        project_id: String(phase7.projectId),
        replay: true,
      },
      payloadHash: args.payloadHash,
      idempotencyKey: `replay:${subscriptionId}:${releasedEvent.eventId}:phase10-proof`,
      status: "delivered",
      attemptCount: 1,
      maxAttempts: 6,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    });
    await ctx.db.insert("webhookDeliveryAttempts", {
      deliveryId: replayDeliveryId,
      attempt: 1,
      requestId: "phase10-proof-replay-success",
      outcome: "success",
      responseStatus: 204,
      latencyMs: 9,
      secretVersionId,
      signatureTimestamp: args.signatureTimestamp,
      signatureInput: args.signatureInput,
      signature: args.signature,
      bodyHash: args.payloadHash,
      createdAt: now,
    });
    await ctx.db.insert("webhookReplayRequests", {
      projectId: phase7.projectId,
      deliveryId: sourceDeliveryId,
      replayDeliveryId,
      reason: "Phase 10 DLQ replay proof",
      operationKey: `${PHASE10_PROOF_KEY}:replay`,
      createdAt: now,
    });
    const proofId = await ctx.db.insert("phase10Proofs", {
      key: PHASE10_PROOF_KEY,
      projectId: phase7.projectId,
      apiKeyId,
      subscriptionId,
      endpointId,
      secretVersionIds: [secretVersionId],
      sourceDeliveryId,
      replayDeliveryId,
      contractIds,
      releasedFactVersionId: releasedFact._id,
      createdAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: phase7.projectId,
      actorType: "system",
      action: "phase10.proof.seeded",
      targetType: "phase10_proof",
      targetId: String(proofId),
      payload: {
        sourceDeliveryId,
        replayDeliveryId,
        releasedFactVersionId: releasedFact._id,
      },
      createdAt: now,
    });
    return {
      proof: (await ctx.db.get("phase10Proofs", proofId))!,
      duplicate: false,
    };
  },
});
