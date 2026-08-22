import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

type BaseDoc = { _id: string; createdAt?: number };
export type FactVersionDoc = BaseDoc & {
  entityId: string;
  predicate: string;
  value: unknown;
  valueHash: string;
  unit?: string;
  validFrom?: number;
  validTo?: number;
  validTimeSource: string;
  transactionFrom: number;
  state: string;
  changeKind: string;
  releaseDecisionId: string;
  sourceObservationIds: string[];
  evidenceRefs: string[];
  mappingRevisionId: string;
  collectorBindingId: string;
  runId?: string;
  certificateId?: string;
};
export type CurrentFactDoc = BaseDoc & {
  entityId: string;
  predicate: string;
  factVersionId: string;
  valueHash: string;
  state: string;
  servingLabel: string;
  lastVerifiedAt: number;
  freshnessDeadline: number;
  updatedAt: number;
};
type RelationDoc = BaseDoc & {
  fromFactVersionId: string;
  toFactVersionId: string;
  kind: string;
  reason: string;
};
type EntityDoc = BaseDoc & {
  canonicalKey: string;
  displayName: string;
  entityType: string;
  status: string;
};
type DecisionDoc = BaseDoc & {
  outcome: string;
  reasonCodes: string[];
  details: unknown;
};
type ObservationDoc = BaseDoc & {
  sourceEntityKey: string;
  trustState: string;
  observedAt: number;
  mappingRevisionId: string;
};
type FieldDoc = BaseDoc & {
  canonicalPath: string;
  sourcePaths: string[];
  evidenceRefs: string[];
  state: string;
  transform: { name: string; version: string };
};

export type TimelineData = {
  entity: EntityDoc;
  currentFacts: CurrentFactDoc[];
  versions: FactVersionDoc[];
  relations: RelationDoc[];
  decisions: DecisionDoc[];
};
export type HistoryData = {
  entity: EntityDoc;
  predicate: string;
  validAt: number | null;
  believedAt: number | null;
  versions: FactVersionDoc[];
  relations: RelationDoc[];
  effectiveFactVersion: FactVersionDoc | null;
  decisionVersion: FactVersionDoc | null;
  decision: DecisionDoc | null;
  observations: ObservationDoc[];
  fields: FieldDoc[];
  evidence: BaseDoc[];
  mappingRevision: BaseDoc | null;
  collectorBinding: BaseDoc | null;
  run: BaseDoc | null;
  certificate: BaseDoc | null;
};
export type Phase7ProofData = {
  proof: { _id: string };
  facts: Array<{
    _id: string;
    entityId: string;
    predicate: string;
    value: unknown;
    validFrom?: number;
    validTimeSource: string;
    transactionFrom: number;
    changeKind: string;
  }>;
  currentFacts: Array<{
    _id: string;
    entityId: string;
    predicate: string;
    factVersionId: string;
    state: string;
    servingLabel: string;
    lastVerifiedAt: number;
    freshnessDeadline: number;
  }>;
  observations: Array<"redacted">;
  evidence: Array<"redacted">;
  projectionMatches: boolean;
};

const timelineQuery = makeFunctionReference<
  "query",
  { entityId: string; predicate?: string; limit?: number },
  TimelineData | null
>("phase7Queries:timeline");
const historyQuery = makeFunctionReference<
  "query",
  {
    entityId: string;
    predicate: string;
    validAt?: number;
    believedAt?: number;
    limit?: number;
  },
  HistoryData | null
>("phase7Queries:history");
const proofQuery = makeFunctionReference<
  "query",
  { key?: string },
  Phase7ProofData | null
>("phase7Queries:proof");

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

export const loadPhase7Proof = () =>
  safeQuery((convex) => convex.query(proofQuery, {}));
export const loadEntityTimeline = (entityId: string, predicate?: string) =>
  safeQuery((convex) =>
    convex.query(timelineQuery, {
      entityId,
      ...(predicate ? { predicate } : {}),
      limit: 100,
    }),
  );
export const loadFactHistory = (
  entityId: string,
  predicate: string,
  options: { validAt?: number; believedAt?: number } = {},
) =>
  safeQuery((convex) =>
    convex.query(historyQuery, { entityId, predicate, ...options, limit: 100 }),
  );
