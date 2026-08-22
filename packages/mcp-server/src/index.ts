import { apiFactSchema, type ApiFact } from "@kevlar/api-contracts";

export const kevlarMcpTools = [
  { name: "kevlar_current_facts", description: "Read released, evidence-backed current facts for one canonical entity.", inputSchema: { type: "object", properties: { entity_id: { type: "string" } }, required: ["entity_id"], additionalProperties: false } },
  { name: "kevlar_fact_history", description: "Read released bitemporal fact history with evidence and certificate references.", inputSchema: { type: "object", properties: { entity_id: { type: "string" }, predicate: { type: "string" }, valid_at: { type: "number" }, known_at: { type: "number" } }, required: ["entity_id", "predicate"], additionalProperties: false } },
] as const;

export type McpFactReader = { current(entityId: string): Promise<unknown[]>; history(input: { entityId: string; predicate?: string; validAt?: number; knownAt?: number }): Promise<unknown[]> };
function releasedEvidenceAware(raw: unknown[]): ApiFact[] {
  return raw.map((item) => apiFactSchema.parse(item)).filter((fact) =>
    (fact.trust.state === "released" || fact.trust.state === "last_known_good" || fact.trust.state === "stale") && fact.trust.evidence_refs.length > 0,
  );
}
export async function executeKevlarMcpTool(reader: McpFactReader, name: string, args: Record<string, unknown>) {
  if (name === "kevlar_current_facts") return { facts: releasedEvidenceAware(await reader.current(String(args.entity_id))) };
  if (name === "kevlar_fact_history") return { facts: releasedEvidenceAware(await reader.history({ entityId: String(args.entity_id), ...(args.predicate ? { predicate: String(args.predicate) } : {}), ...(typeof args.valid_at === "number" ? { validAt: args.valid_at } : {}), ...(typeof args.known_at === "number" ? { knownAt: args.known_at } : {}) })) };
  throw new Error("Unknown or write-capable MCP tool.");
}
