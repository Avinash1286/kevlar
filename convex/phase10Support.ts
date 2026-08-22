import type { Doc } from "./_generated/dataModel";

export const PHASE10_PROOF_KEY = "phase10:api-sdk-mcp-proof:v1";
export const PHASE10_API_VERSION = "v1";

export function requirePhase10IngestKey(provided: string): void {
  const expected = process.env.KEVLAR_BASELINE_INGEST_KEY;
  if (!expected || provided !== expected)
    throw new Error("Unauthorized Phase 10 request");
}

export function assertPhase10Text(
  value: string,
  name: string,
  max = 1_000,
): void {
  if (value.length < 1 || value.length > max)
    throw new Error(`${name} must contain 1-${max} characters`);
}

export function assertHttpsUrl(value: string): void {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "")
    throw new Error(
      "Webhook endpoint must be an HTTPS URL without credentials",
    );
}

export function assertSha256(value: string, name: string): void {
  if (!/^sha256:[a-f0-9]{64}$/.test(value))
    throw new Error(`${name} must be a sha256:<64 lowercase hex> digest`);
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("")}`;
}

export async function hmacSha256(
  secret: string,
  value: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value),
  );
  return `v1=${Array.from(new Uint8Array(signature))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function subscriptionMatches(
  subscription: Doc<"filteredSubscriptions">,
  event: Doc<"changeEvents">,
  entityType: string,
): boolean {
  const filters = subscription.filters;
  return (
    subscription.status === "active" &&
    (filters.eventTypes.length === 0 ||
      filters.eventTypes.includes(event.eventType)) &&
    (filters.entityTypes.length === 0 ||
      filters.entityTypes.includes(entityType)) &&
    (filters.predicates.length === 0 ||
      (event.predicate !== undefined &&
        filters.predicates.includes(event.predicate))) &&
    (filters.includeCorrections || event.eventType !== "correction")
  );
}

export function deliveryIdempotencyKey(
  subscriptionId: string,
  eventExternalId: string,
  mode: "live" | "replay" | "test",
  replayBatchKey?: string,
): string {
  return mode === "replay"
    ? `replay:${subscriptionId}:${eventExternalId}:${replayBatchKey ?? "manual"}`
    : `deliver:${subscriptionId}:${eventExternalId}:${mode}`;
}

export function signatureInput(timestamp: number, rawBody: string): string {
  return `${timestamp}.${rawBody}`;
}
