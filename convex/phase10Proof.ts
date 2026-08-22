import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import {
  PHASE10_PROOF_KEY,
  assertPhase10Text,
  hmacSha256,
  requirePhase10IngestKey,
  sha256,
  signatureInput,
} from "./phase10Support";

const persistProofRef = makeFunctionReference<"mutation">("phase10ProofSupport:persistProof");

export const seed = action({
  args: {
    ingestKey: v.string(),
    rawApiKey: v.string(),
    rawWebhookSecret: v.string(),
  },
  returns: v.object({
    proof: schema.doc("phase10Proofs"),
    duplicate: v.boolean(),
    apiKeyOnce: v.union(v.string(), v.null()),
    webhookSecretOnce: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    requirePhase10IngestKey(args.ingestKey);
    assertPhase10Text(args.rawApiKey, "rawApiKey", 256);
    assertPhase10Text(args.rawWebhookSecret, "rawWebhookSecret", 256);
    if (args.rawApiKey.length < 24 || /\s/.test(args.rawApiKey))
      throw new Error("rawApiKey must contain 24-256 non-whitespace characters");
    if (args.rawWebhookSecret.length < 24 || /\s/.test(args.rawWebhookSecret))
      throw new Error(
        "rawWebhookSecret must contain 24-256 non-whitespace characters",
      );
    const rawBody = JSON.stringify({ id: "evt_phase10_proof", type: "fact.updated" });
    const timestamp = 1_787_352_000;
    const input = signatureInput(timestamp, rawBody);
    const result = await ctx.runMutation(persistProofRef, {
      apiKeyHash: await sha256(args.rawApiKey),
      webhookSecretHash: await sha256(args.rawWebhookSecret),
      payloadHash: await sha256(rawBody),
      signatureTimestamp: timestamp,
      signatureInput: input,
      signature: await hmacSha256(args.rawWebhookSecret, input),
    });
    return {
      ...result,
      apiKeyOnce: result.duplicate ? null : args.rawApiKey,
      webhookSecretOnce: result.duplicate ? null : args.rawWebhookSecret,
    };
  },
});

const proofApiKeyValidator = v.object({
  id: v.id("apiKeys"),
  projectId: v.id("projects"),
  name: v.string(),
  prefix: v.string(),
  scopes: v.array(v.string()),
  status: v.string(),
  rateLimitPerMinute: v.number(),
});

export const proof = query({
  args: { key: v.optional(v.string()) },
  returns: v.union(v.object({
    proof: schema.doc("phase10Proofs"),
    apiKey: proofApiKeyValidator,
    subscription: schema.doc("filteredSubscriptions"),
    endpoint: schema.doc("webhookEndpoints"),
    secretVersions: v.array(v.object({ id: v.id("webhookSecretVersions"), version: v.number(), status: v.string(), createdAt: v.number() })),
    sourceDelivery: schema.doc("webhookDeliveries"),
    sourceAttempts: v.array(schema.doc("webhookDeliveryAttempts")),
    replayDelivery: schema.doc("webhookDeliveries"),
    replayAttempts: v.array(schema.doc("webhookDeliveryAttempts")),
    contracts: v.array(schema.doc("apiContracts")),
    releasedFact: schema.doc("factVersions"),
    duplicateDeliveryCount: v.number(),
    duplicateSafe: v.boolean(),
    dlqReplaySucceeded: v.boolean(),
    hmacVerificationInputValid: v.boolean(),
    schemaContractIdentifiers: v.array(v.string()),
    mcpReleasedEvidenceAware: v.boolean(),
  }), v.null()),
  handler: async (ctx, args) => {
    const proof = await ctx.db.query("phase10Proofs").withIndex("by_key", (q) => q.eq("key", args.key ?? PHASE10_PROOF_KEY)).unique();
    if (!proof) return null;
    const [key, subscription, endpoint, sourceDelivery, replayDelivery, releasedFact] = await Promise.all([
      ctx.db.get("apiKeys", proof.apiKeyId),
      ctx.db.get("filteredSubscriptions", proof.subscriptionId),
      ctx.db.get("webhookEndpoints", proof.endpointId),
      ctx.db.get("webhookDeliveries", proof.sourceDeliveryId),
      ctx.db.get("webhookDeliveries", proof.replayDeliveryId),
      ctx.db.get("factVersions", proof.releasedFactVersionId),
    ]);
    if (!key || !subscription || !endpoint || !sourceDelivery || !replayDelivery || !releasedFact) return null;
    const [secretVersionsRaw, sourceAttempts, replayAttempts, contracts, duplicateDeliveries] = await Promise.all([
      Promise.all(proof.secretVersionIds.slice(0, 10).map((id) => ctx.db.get("webhookSecretVersions", id))),
      ctx.db.query("webhookDeliveryAttempts").withIndex("by_deliveryId_and_attempt", (q) => q.eq("deliveryId", sourceDelivery._id)).take(10),
      ctx.db.query("webhookDeliveryAttempts").withIndex("by_deliveryId_and_attempt", (q) => q.eq("deliveryId", replayDelivery._id)).take(10),
      Promise.all(proof.contractIds.slice(0, 10).map((id) => ctx.db.get("apiContracts", id))),
      ctx.db.query("webhookDeliveries").withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", sourceDelivery.idempotencyKey)).take(3),
    ]);
    const secretVersions = secretVersionsRaw.filter((item): item is Doc<"webhookSecretVersions"> => item !== null).map((item) => ({ id: item._id, version: item.version, status: item.status, createdAt: item.createdAt }));
    const contractDocs = contracts.filter((item): item is Doc<"apiContracts"> => item !== null);
    return {
      proof,
      apiKey: { id: key._id, projectId: key.projectId, name: key.name, prefix: key.prefix, scopes: key.scopes, status: key.status, rateLimitPerMinute: key.rateLimitPerMinute },
      subscription,
      endpoint,
      secretVersions,
      sourceDelivery,
      sourceAttempts,
      replayDelivery,
      replayAttempts,
      contracts: contractDocs,
      releasedFact,
      duplicateDeliveryCount: duplicateDeliveries.length,
      duplicateSafe: duplicateDeliveries.length === 1,
      dlqReplaySucceeded: sourceDelivery.status === "dead_letter" && replayDelivery.status === "delivered",
      hmacVerificationInputValid: sourceAttempts.length === 1 && sourceAttempts[0].signatureInput.startsWith(`${sourceAttempts[0].signatureTimestamp}.`) && /^v1=[a-f0-9]{64}$/.test(sourceAttempts[0].signature),
      schemaContractIdentifiers: contractDocs.map((item) => item.identifier),
      mcpReleasedEvidenceAware: releasedFact.state === "released" && releasedFact.evidenceRefs.length > 0 && releasedFact.sourceObservationIds.length > 0,
    };
  },
});
