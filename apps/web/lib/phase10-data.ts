import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

type Doc = { _id: string; [key: string]: unknown };
export type Phase10ProofData = {
  proof: { _id: string };
  apiKey: {
    id: string;
    projectId: string;
    name: string;
    prefix: string;
    scopes: string[];
    status: string;
    rateLimitPerMinute: number;
  };
  subscription: {
    _id: string;
    name: string;
    status: string;
    filters: {
      eventTypes: string[];
      entityTypes: string[];
      predicates: string[];
    };
  };
  endpoint: { _id: string; name: string; status: string };
  secretVersions: Array<{
    id: string;
    version: number;
    status: string;
    createdAt: number;
  }>;
  sourceDelivery: { _id: string; status: string; attemptCount: number };
  replayDelivery: { _id: string; status: string; attemptCount: number };
  contracts: Array<
    Doc & {
      identifier: string;
      version: string;
      kind: string;
      schemaHash: string;
    }
  >;
  duplicateDeliveryCount: number;
  duplicateSafe: boolean;
  dlqReplaySucceeded: boolean;
  hmacVerificationInputValid: boolean;
  schemaContractIdentifiers: string[];
  mcpReleasedEvidenceAware: boolean;
};
const proofRef = makeFunctionReference<
  "query",
  { key?: string },
  Phase10ProofData | null
>("phase10Proof:proof");

export async function loadPhase10Proof() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  try {
    return await new ConvexHttpClient(url).query(proofRef, {});
  } catch {
    return null;
  }
}
