import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

type Doc = { _id: string; [key: string]: unknown };
export type Phase10ProofData = {
  proof: Doc;
  apiKey: Doc & { prefix: string; scopes: string[]; rateLimitPerMinute: number };
  subscription: Doc & { name: string; status: string; filters: { eventTypes: string[]; entityTypes: string[]; predicates: string[] } };
  endpoint: Doc & { name: string; url: string; status: string };
  secretVersions: Array<{ id: string; version: number; status: string; createdAt: number }>;
  sourceDelivery: Doc & { status: string; attemptCount: number; eventExternalId: string };
  replayDelivery: Doc & { status: string; attemptCount: number; eventExternalId: string };
  contracts: Array<Doc & { identifier: string; version: string; kind: string; schemaHash: string }>;
  duplicateSafe: boolean;
  dlqReplaySucceeded: boolean;
  hmacVerificationInputValid: boolean;
  mcpReleasedEvidenceAware: boolean;
};
const proofRef = makeFunctionReference<"query", { key?: string }, Phase10ProofData | null>("phase10Proof:proof");

export async function loadPhase10Proof() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL; if (!url) return null;
  try { return await new ConvexHttpClient(url).query(proofRef, {}); } catch { return null; }
}
