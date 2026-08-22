import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const API_VERSION = "v1" as const;
export const apiScopeSchema = z.enum([
  "facts:read",
  "events:read",
  "evidence:read",
  "sources:read",
  "subscriptions:read",
  "subscriptions:write",
  "webhooks:write",
  "admin:read",
  "mcp:read",
]);
export type ApiScope = z.infer<typeof apiScopeSchema>;

export const trustMetadataSchema = z.object({
  state: z.enum(["released", "last_known_good", "stale"]),
  freshness: z.enum(["fresh", "stale"]),
  source_ids: z.array(z.string()),
  supporting_source_count: z.number().int().nonnegative(),
  evidence_refs: z.array(z.string()).min(1),
  certificate_ref: z.string().nullable(),
  observed_at: z.number(),
});
export const apiEntitySchema = z.object({
  id: z.string(),
  canonical_key: z.string(),
  entity_type: z.string(),
  display_name: z.string(),
  status: z.string(),
});
export const apiFactSchema = z.object({
  id: z.string(),
  entity_id: z.string(),
  predicate: z.string(),
  value: z.unknown(),
  value_hash: z.string(),
  valid_from: z.number().nullable(),
  transaction_from: z.number(),
  trust: trustMetadataSchema,
});
export const apiEventSchema = z.object({
  id: z.string(),
  event_type: z.string(),
  entity_id: z.string(),
  predicate: z.string().nullable(),
  state: z.literal("released"),
  observed_at: z.number(),
  event_hash: z.string(),
  trust: trustMetadataSchema,
});
export const apiEvidenceSchema = z.object({
  bundle_id: z.string(),
  manifest_digest: z.string(),
  artifacts: z.array(
    z.object({
      kind: z.string(),
      reference: z.string(),
      content_digest: z.string(),
    }),
  ),
});
export const apiConflictSchema = z.object({
  id: z.string(),
  entity_id: z.string(),
  predicate: z.string(),
  status: z.string(),
  reason: z.string(),
  candidate_observation_ids: z.array(z.string()),
  released_fact_version_id: z.string().nullable(),
  opened_at: z.number(),
});
export const apiSourceHealthSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  source_type: z.string(),
  last_verified_at: z.number().nullable(),
  freshness: z.enum(["fresh", "stale", "unknown"]),
});
export const apiCertificateSchema = z.object({
  id: z.string(),
  status: z.string(),
  content_digest: z.string(),
  issued_at: z.number(),
  evidence_refs: z.array(z.string()),
});
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    request_id: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export const apiListEnvelopeSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    api_version: z.literal(API_VERSION),
    data: z.array(item),
    pagination: z.object({
      next_cursor: z.string().nullable(),
      limit: z.number().int().positive(),
    }),
    request_id: z.string(),
  });
export type ApiEntity = z.infer<typeof apiEntitySchema>;
export type ApiFact = z.infer<typeof apiFactSchema>;
export type ApiEvent = z.infer<typeof apiEventSchema>;
export type ApiConflict = z.infer<typeof apiConflictSchema>;
export type ApiSourceHealth = z.infer<typeof apiSourceHealthSchema>;
export type ApiCertificate = z.infer<typeof apiCertificateSchema>;

export function encodeCursor(offset: number) {
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new Error("Invalid cursor offset.");
  return Buffer.from(JSON.stringify({ v: 1, offset }), "utf8").toString(
    "base64url",
  );
}
export function decodeCursor(cursor?: string | null) {
  if (!cursor) return 0;
  try {
    const value = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { v?: unknown; offset?: unknown };
    if (
      value.v !== 1 ||
      !Number.isSafeInteger(value.offset) ||
      Number(value.offset) < 0
    )
      throw new Error();
    return Number(value.offset);
  } catch {
    throw new Error("Invalid pagination cursor.");
  }
}
export function paginate<T>(
  items: T[],
  options: { cursor?: string | null; limit?: number },
) {
  const offset = decodeCursor(options.cursor);
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 25), 1), 50);
  const data = items.slice(offset, offset + limit);
  const next = offset + data.length;
  return {
    data,
    pagination: {
      limit,
      next_cursor: next < items.length ? encodeCursor(next) : null,
    },
  };
}

export function requireScope(granted: readonly ApiScope[], required: ApiScope) {
  if (!granted.includes(required))
    throw new Error(`Missing API scope: ${required}`);
}

export function signWebhook(input: {
  payload: string;
  secret: string;
  timestamp?: number;
}) {
  if (input.secret.length < 16)
    throw new Error("Webhook secret must contain at least 16 characters.");
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1_000);
  const digest = createHmac("sha256", input.secret)
    .update(`${timestamp}.${input.payload}`)
    .digest("hex");
  return { timestamp, signature: `t=${timestamp},v1=${digest}` };
}
export function verifyWebhook(input: {
  payload: string;
  secret: string;
  signature: string;
  now?: number;
  toleranceSeconds?: number;
}) {
  const values = Object.fromEntries(
    input.signature.split(",").map((part) => part.split("=", 2)),
  ) as Record<string, string>;
  const timestamp = Number(values.t);
  const actual = values.v1;
  if (!Number.isSafeInteger(timestamp) || !actual) return false;
  const now = input.now ?? Math.floor(Date.now() / 1_000);
  if (Math.abs(now - timestamp) > (input.toleranceSeconds ?? 300)) return false;
  const expected = signWebhook({
    payload: input.payload,
    secret: input.secret,
    timestamp,
  }).signature.split("v1=")[1]!;
  const left = Buffer.from(actual, "hex");
  const right = Buffer.from(expected, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export type WebhookDelivery = {
  id: string;
  idempotencyKey: string;
  eventId: string;
  state: "pending" | "retrying" | "delivered" | "dead_letter";
  attempts: number;
  nextAttemptAt?: number;
  lastError?: string;
  replayOf?: string;
};
export function enqueueDelivery(
  store: WebhookDelivery[],
  delivery: Omit<WebhookDelivery, "state" | "attempts">,
) {
  const existing = store.find(
    (item) => item.idempotencyKey === delivery.idempotencyKey,
  );
  if (existing) return { store, delivery: existing, duplicate: true };
  const created: WebhookDelivery = {
    ...delivery,
    state: "pending",
    attempts: 0,
  };
  return { store: [...store, created], delivery: created, duplicate: false };
}
export function recordDeliveryAttempt(
  delivery: WebhookDelivery,
  result: {
    ok: boolean;
    attemptedAt: number;
    error?: string;
    maxAttempts?: number;
  },
) {
  const attempts = delivery.attempts + 1;
  if (result.ok)
    return {
      ...delivery,
      attempts,
      state: "delivered" as const,
      nextAttemptAt: undefined,
      lastError: undefined,
    };
  const dead = attempts >= (result.maxAttempts ?? 3);
  return {
    ...delivery,
    attempts,
    state: dead ? ("dead_letter" as const) : ("retrying" as const),
    nextAttemptAt: dead
      ? undefined
      : result.attemptedAt + 2 ** attempts * 1_000,
    lastError: result.error ?? "delivery_failed",
  };
}
export function replayDelivery(delivery: WebhookDelivery, replayId: string) {
  if (delivery.state !== "dead_letter")
    throw new Error("Only dead-letter deliveries can be replayed.");
  return {
    id: replayId,
    idempotencyKey: `${delivery.idempotencyKey}:replay:${replayId}`,
    eventId: delivery.eventId,
    state: "pending" as const,
    attempts: 0,
    replayOf: delivery.id,
  } satisfies WebhookDelivery;
}
