import { randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { NextResponse, type NextRequest } from "next/server";

type ExternalResponse = {
  apiVersion: "v1";
  rateLimit: { limit: number; remaining: number; resetAt: number };
  data: unknown;
};
type Page = { page: unknown[]; continueCursor: string; isDone: boolean };
type FactItem = { current?: Record<string, unknown>; version: Record<string, unknown>; trust: Record<string, unknown> };

const refs = {
  entities: makeFunctionReference<"action", Record<string, unknown>, ExternalResponse>("phase10External:entities"),
  facts: makeFunctionReference<"action", Record<string, unknown>, ExternalResponse>("phase10External:currentFacts"),
  history: makeFunctionReference<"action", Record<string, unknown>, ExternalResponse>("phase10External:factHistory"),
  events: makeFunctionReference<"action", Record<string, unknown>, ExternalResponse>("phase10External:events"),
  conflicts: makeFunctionReference<"action", Record<string, unknown>, ExternalResponse>("phase10External:conflicts"),
  sources: makeFunctionReference<"action", Record<string, unknown>, ExternalResponse>("phase10External:sourceHealth"),
  verification: makeFunctionReference<"action", Record<string, unknown>, ExternalResponse>("phase10External:verification"),
  certificate: makeFunctionReference<"action", Record<string, unknown>, ExternalResponse>("phase10External:certificate"),
};

function error(status: number, code: string, message: string, requestId: string, details?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, request_id: requestId, ...(details ? { details } : {}) } }, { status, headers: { "x-request-id": requestId, "cache-control": "no-store" } });
}

function rawApiKey(request: NextRequest) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : null;
}

function pagination(url: URL) {
  const parsed = Number(url.searchParams.get("limit") ?? "25");
  const numItems = Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), 50) : 25;
  return { numItems, cursor: url.searchParams.get("cursor") };
}

function trust(item: FactItem) {
  const version = item.version;
  const metadata = item.trust;
  return {
    state: metadata.state,
    freshness: metadata.stale ? "stale" : "fresh",
    source_ids: [],
    supporting_source_count: metadata.supportingSourceCount ?? 0,
    evidence_refs: (version.evidenceRefs as unknown[] ?? []).map(String),
    certificate_ref: metadata.certificateId ? String(metadata.certificateId) : null,
    observed_at: Number(metadata.verifiedAt ?? version.transactionFrom),
  };
}

function fact(item: FactItem) {
  const version = item.version;
  return {
    id: String(version._id), entity_id: String(version.entityId), predicate: String(version.predicate),
    value: version.value, value_hash: String(version.valueHash),
    valid_from: typeof version.validFrom === "number" ? version.validFrom : null,
    transaction_from: Number(version.transactionFrom), trust: trust(item),
  };
}

function response(data: unknown, result: ExternalResponse, requestId: string, status = 200) {
  return NextResponse.json(data, { status, headers: {
    "x-request-id": requestId,
    "x-ratelimit-limit": String(result.rateLimit.limit),
    "x-ratelimit-remaining": String(result.rateLimit.remaining),
    "x-ratelimit-reset": String(result.rateLimit.resetAt),
    "cache-control": "private, max-age=30",
    vary: "Authorization",
  } });
}

function envelope<T>(page: Page, requestId: string, limit: number, map: (item: T) => unknown) {
  return { api_version: "v1", data: (page.page as T[]).map(map), pagination: { next_cursor: page.isDone ? null : page.continueCursor, limit }, request_id: requestId };
}

export async function GET(request: NextRequest, context: { params: Promise<{ resource: string[] }> }) {
  const requestId = `req_${randomUUID().replaceAll("-", "")}`;
  const key = rawApiKey(request);
  if (!key) return error(401, "UNAUTHORIZED", "A bearer API key is required.", requestId);
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return error(503, "BACKEND_UNAVAILABLE", "The intelligence backend is unavailable.", requestId);
  const { resource } = await context.params;
  const url = new URL(request.url);
  const paginationOpts = pagination(url);
  const client = new ConvexHttpClient(convexUrl);
  const base = { rawApiKey: key, requestId };

  try {
    if (resource[0] === "entities") {
      const result = await client.action(refs.entities, { ...base, ...(url.searchParams.get("status") ? { status: url.searchParams.get("status") } : {}), paginationOpts });
      const page = result.data as Page;
      const entityMap = (row: { entity: Record<string, unknown>; aliases: Array<Record<string, unknown>> }) => ({
        id: String(row.entity._id), canonical_key: String(row.entity.canonicalKey), entity_type: String(row.entity.entityType),
        display_name: String(row.entity.displayName), status: String(row.entity.status),
        aliases: row.aliases.map((alias) => String(alias.value)),
      });
      if (resource[1]) {
        const found = page.page.map((item) => entityMap(item as never)).find((item) => item.id === resource[1]);
        return found ? response({ api_version: "v1", data: found, request_id: requestId }, result, requestId) : error(404, "ENTITY_NOT_FOUND", "Entity not found.", requestId);
      }
      return response(envelope(page, requestId, paginationOpts.numItems, entityMap), result, requestId);
    }

    if (resource[0] === "facts" && resource[2] === "verification") {
      const result = await client.action(refs.verification, { ...base, factVersionId: resource[1] });
      return result.data ? response({ api_version: "v1", data: result.data, request_id: requestId }, result, requestId) : error(404, "FACT_NOT_FOUND", "Released fact not found.", requestId);
    }

    if (resource[0] === "facts") {
      const entityId = url.searchParams.get("entity_id");
      if (!entityId) return error(400, "INVALID_REQUEST", "entity_id is required.", requestId);
      const result = await client.action(refs.facts, { ...base, entityId, paginationOpts });
      return response(envelope(result.data as Page, requestId, paginationOpts.numItems, fact), result, requestId);
    }

    if (resource[0] === "history") {
      const entityId = url.searchParams.get("entity_id"); const predicate = url.searchParams.get("predicate");
      if (!entityId || !predicate) return error(400, "INVALID_REQUEST", "entity_id and predicate are required.", requestId);
      const result = await client.action(refs.history, { ...base, entityId, predicate, paginationOpts });
      return response(envelope(result.data as Page, requestId, paginationOpts.numItems, fact), result, requestId);
    }

    if (resource[0] === "events") {
      const result = await client.action(refs.events, { ...base, paginationOpts }); const page = result.data as Page;
      const eventMap = (row: { event: Record<string, unknown>; evidenceCount: number }) => ({
        id: String(row.event.eventId ?? row.event._id), event_type: String(row.event.eventType), entity_id: String(row.event.entityId),
        predicate: row.event.predicate ? String(row.event.predicate) : null, state: "released", observed_at: Number(row.event.observedAt),
        event_hash: String(row.event.eventHash), trust: { state: "released", freshness: "fresh", source_ids: [], supporting_source_count: 0,
          evidence_refs: (row.event.evidenceRefs as unknown[] ?? []).map(String), certificate_ref: row.event.certificateId ? String(row.event.certificateId) : null, observed_at: Number(row.event.observedAt) },
      });
      const mapped = page.page.map((item) => eventMap(item as never));
      if (resource[1]) {
        const found = mapped.find((item) => item.id === resource[1]);
        return found ? response({ api_version: "v1", data: found, request_id: requestId }, result, requestId) : error(404, "EVENT_NOT_FOUND", "Released event not found.", requestId);
      }
      return response({ api_version: "v1", data: mapped, pagination: { next_cursor: page.isDone ? null : page.continueCursor, limit: paginationOpts.numItems }, request_id: requestId }, result, requestId);
    }

    if (resource[0] === "conflicts") {
      const result = await client.action(refs.conflicts, { ...base, ...(url.searchParams.get("status") ? { status: url.searchParams.get("status") } : {}), paginationOpts });
      const map = (row: Record<string, unknown>) => ({ id: String(row._id), entity_id: String(row.entityId), predicate: String(row.predicate), status: String(row.status), reason: String(row.reason), candidate_observation_ids: (row.candidateObservationIds as unknown[]).map(String), released_fact_version_id: row.releasedFactVersionId ? String(row.releasedFactVersionId) : null, opened_at: Number(row.openedAt) });
      return response(envelope(result.data as Page, requestId, paginationOpts.numItems, map), result, requestId);
    }

    if (resource[0] === "sources") {
      const result = await client.action(refs.sources, { ...base, ...(url.searchParams.get("status") ? { state: url.searchParams.get("status") } : {}), paginationOpts });
      const map = (row: { source: Record<string, unknown>; health: Record<string, unknown> | null }) => ({ id: String(row.source._id), name: String(row.source.name), status: String(row.health?.state ?? row.source.lifecycleStatus), source_type: String(row.source.sourceType), last_verified_at: typeof row.health?.lastSuccessAt === "number" ? row.health.lastSuccessAt : null, freshness: !row.health?.lastSuccessAt ? "unknown" : Date.now() - Number(row.health.lastSuccessAt) > 21_600_000 ? "stale" : "fresh" });
      return response(envelope(result.data as Page, requestId, paginationOpts.numItems, map), result, requestId);
    }

    if (resource[0] === "certificates" && resource[1]) {
      const result = await client.action(refs.certificate, { ...base, certificateId: resource[1] });
      const cert = result.data as Record<string, unknown> | null;
      if (!cert) return error(404, "CERTIFICATE_NOT_FOUND", "Released certificate not found.", requestId);
      return response({ api_version: "v1", data: { id: String(cert._id), status: String(cert.status), content_digest: String(cert.digest), issued_at: Number(cert.createdAt), evidence_refs: [] }, request_id: requestId }, result, requestId);
    }

    if (resource[0] === "evidence" && resource[1] === "fact" && resource[2]) {
      const result = await client.action(refs.verification, { ...base, factVersionId: resource[2] });
      return result.data ? response({ api_version: "v1", data: result.data, request_id: requestId }, result, requestId) : error(404, "EVIDENCE_NOT_FOUND", "Released evidence not found.", requestId);
    }
    return error(404, "ROUTE_NOT_FOUND", "Unknown API v1 resource.", requestId, { resource });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Request failed.";
    const status = message.includes("rate_limit") ? 429 : message.includes("missing_scope") ? 403 : message.includes("denied") ? 401 : 400;
    return error(status, status === 429 ? "RATE_LIMITED" : status === 403 ? "FORBIDDEN" : status === 401 ? "UNAUTHORIZED" : "INVALID_REQUEST", message.replace(/kv_(live|test)_[A-Za-z0-9_-]+/g, "[REDACTED]"), requestId);
  }
}
