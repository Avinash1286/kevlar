import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

type BaseDoc = { _id: string; _creationTime?: number; createdAt?: number };

export type RegistryData = {
  revisions: Array<BaseDoc & {
    domain: string;
    revision: number;
    definitionHash: string;
    definition: unknown;
  }>;
  states: Array<BaseDoc & {
    schemaRevisionId: string;
    fromStatus: string | null;
    toStatus: string;
    actor: string;
    reason: string;
  }>;
  compatibility: Array<BaseDoc & {
    fromRevisionId: string;
    toRevisionId: string;
    classification: string;
    reasons: string[];
  }>;
};

export type MappingData = {
  specs: Array<BaseDoc & {
    sourceId: string;
    key: string;
    name: string;
    entityType: string;
  }>;
  revisions: Array<BaseDoc & {
    mappingSpecId: string;
    revision: number;
    sourceSchemaVersion: string;
    canonicalSchemaRevisionId: string;
    deterministic: true;
    specification: unknown;
    specificationHash: string;
  }>;
  approvals: Array<BaseDoc & {
    mappingRevisionId: string;
    decision: string;
    actor: string;
    reason: string;
  }>;
  transitions: Array<BaseDoc & {
    mappingSpecId: string;
    mappingRevisionId: string;
    fromStatus: string | null;
    toStatus: string;
    actor: string;
    reason: string;
  }>;
};

export type IdentityGraphData = {
  entities: Array<BaseDoc & {
    entityType: string;
    canonicalKey: string;
    displayName: string;
    status: string;
    mergedIntoId?: string;
  }>;
  externalIds: Array<BaseDoc & {
    entityId: string;
    namespace: string;
    externalId: string;
    status: string;
  }>;
  aliases: Array<BaseDoc & {
    entityId: string;
    aliasType: string;
    value: string;
    status: string;
  }>;
  lineage: Array<BaseDoc & {
    fromEntityId: string;
    toEntityId: string;
    relationship: string;
    status: string;
    operationId: string;
  }>;
  operations: Array<BaseDoc & {
    kind: string;
    sourceEntityIds: string[];
    targetEntityIds: string[];
    reason: string;
    actor: string;
    reversalOfId?: string;
  }>;
  observations: Array<BaseDoc & {
    sourceId: string;
    sourceEntityKey: string;
    entityType: string;
    resolvedEntityId?: string;
    trustState: string;
    mappingRevisionId: string;
  }>;
  fields: Array<BaseDoc & {
    observationId: string;
    canonicalPath: string;
    normalizedValue: unknown;
    state: string;
    sourcePaths: string[];
    evidenceRefs: string[];
    transform: { name: string; version: string; input: unknown };
  }>;
  resolutions: Array<BaseDoc & Record<string, unknown>>;
  candidates: Array<BaseDoc & {
    observationId: string;
    candidateEntityId: string;
    score: number;
    recommendation: string;
    generatedBy: string;
    explanation: string;
    features: Array<{ name: string; score: number; detail: string }>;
  }>;
  decisions: Array<BaseDoc & {
    candidateId: string;
    decision: string;
    actor: string;
    reason: string;
  }>;
};

export type Phase6ProofData = {
  proof: BaseDoc & { key: string; resolvedEntityId: string };
  schemaRevision: RegistryData["revisions"][number] | null;
  mappingRevisions: MappingData["revisions"];
  observations: IdentityGraphData["observations"];
  observationFields: IdentityGraphData["fields"];
  resolvedEntity: IdentityGraphData["entities"][number] | null;
  ambiguousCandidates: IdentityGraphData["candidates"];
  decisions: IdentityGraphData["decisions"];
  operations: IdentityGraphData["operations"];
  lineage: IdentityGraphData["lineage"];
};

const registryQuery = makeFunctionReference<
  "query",
  { domain?: string },
  RegistryData
>("phase6Queries:registry");
const mappingsQuery = makeFunctionReference<"query", Record<string, never>, MappingData>(
  "phase6Queries:mappings",
);
const identityGraphQuery = makeFunctionReference<
  "query",
  Record<string, never>,
  IdentityGraphData
>("phase6Queries:identityGraph");
const proofQuery = makeFunctionReference<
  "query",
  { key?: string },
  Phase6ProofData | null
>("phase6Queries:proof");

function client() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? new ConvexHttpClient(url) : null;
}

async function safeQuery<T>(run: (convex: ConvexHttpClient) => Promise<T>) {
  const convex = client();
  if (!convex) return null;
  try {
    return await run(convex);
  } catch {
    return null;
  }
}

export const loadPhase6Registry = () =>
  safeQuery((convex) => convex.query(registryQuery, {}));

export const loadPhase6Mappings = () =>
  safeQuery((convex) => convex.query(mappingsQuery, {}));

export const loadPhase6IdentityGraph = () =>
  safeQuery((convex) => convex.query(identityGraphQuery, {}));

export const loadPhase6Proof = (key?: string) =>
  safeQuery((convex) => convex.query(proofQuery, key ? { key } : {}));
