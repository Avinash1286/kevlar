import { randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { NextResponse, type NextRequest } from "next/server";
import { kevlarMcpTools } from "@kevlar/mcp-server";

type ExternalResponse = { apiVersion: "v1"; rateLimit: { limit: number; remaining: number; resetAt: number }; data: unknown };
const releasedFacts = makeFunctionReference<"action", Record<string, unknown>, ExternalResponse>("phase10External:mcpReleasedFacts");
const factHistory = makeFunctionReference<"action", Record<string, unknown>, ExternalResponse>("phase10External:factHistory");

function rpc(id: unknown, result: unknown, status = 200) {
  return NextResponse.json({ jsonrpc: "2.0", id, result }, { status, headers: { "cache-control": "no-store" } });
}
function rpcError(id: unknown, code: number, message: string, status = 400) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status, headers: { "cache-control": "no-store" } });
}
function apiKey(request: NextRequest) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : null;
}
function publicFact(row: Record<string, unknown>) {
  const version = row.version as Record<string, unknown>;
  const trust = row.trust as Record<string, unknown>;
  return {
    id: String(version._id), entity_id: String(version.entityId), predicate: String(version.predicate), value: version.value,
    value_hash: String(version.valueHash), valid_from: typeof version.validFrom === "number" ? version.validFrom : null,
    transaction_from: Number(version.transactionFrom), trust: {
      state: trust.state, freshness: trust.stale ? "stale" : "fresh", source_ids: [],
      supporting_source_count: Number(trust.supportingSourceCount), evidence_refs: (version.evidenceRefs as unknown[]).map(String),
      certificate_ref: trust.certificateId ? String(trust.certificateId) : null, observed_at: Number(trust.verifiedAt),
    },
  };
}

export async function POST(request: NextRequest) {
  let body: { id?: unknown; method?: string; params?: Record<string, unknown> };
  try { body = await request.json(); } catch { return rpcError(null, -32700, "Parse error."); }
  if (body.method === "initialize") return rpc(body.id, { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "kevlar", version: "1.0.0" } });
  if (body.method === "notifications/initialized") return new NextResponse(null, { status: 204 });
  if (body.method === "tools/list") return rpc(body.id, { tools: kevlarMcpTools });
  if (body.method !== "tools/call") return rpcError(body.id, -32601, "Method not found.", 404);

  const key = apiKey(request);
  if (!key) return rpcError(body.id, -32001, "Bearer API key required.", 401);
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return rpcError(body.id, -32003, "Backend unavailable.", 503);
  const name = String(body.params?.name ?? "");
  const args = (body.params?.arguments ?? {}) as Record<string, unknown>;
  const entityId = String(args.entity_id ?? "");
  if (!entityId) return rpcError(body.id, -32602, "entity_id is required.");
  const base = { rawApiKey: key, requestId: `mcp_${randomUUID().replaceAll("-", "")}` };

  try {
    let facts: unknown[];
    if (name === "kevlar_current_facts") {
      const result = await new ConvexHttpClient(convexUrl).action(releasedFacts, { ...base, entityId, predicates: args.predicate ? [String(args.predicate)] : [] });
      facts = (result.data as Array<Record<string, unknown>>).map(publicFact);
    } else if (name === "kevlar_fact_history") {
      if (!args.predicate) return rpcError(body.id, -32602, "predicate is required for fact history.");
      const result = await new ConvexHttpClient(convexUrl).action(factHistory, { ...base, entityId, predicate: String(args.predicate), paginationOpts: { numItems: 50, cursor: null } });
      facts = ((result.data as { page: Array<Record<string, unknown>> }).page).map(publicFact).filter((fact) => (fact as { trust: { evidence_refs: unknown[] } }).trust.evidence_refs.length > 0);
    } else return rpcError(body.id, -32601, "Unknown or write-capable tool.", 404);
    const payload = { facts, policy: { released_only: true, evidence_required: true, write_capable: false } };
    return rpc(body.id, { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Tool failed.";
    return rpcError(body.id, -32002, message.replace(/kv_(live|test)_[A-Za-z0-9_-]+/g, "[REDACTED]"), message.includes("denied") ? 401 : 400);
  }
}
