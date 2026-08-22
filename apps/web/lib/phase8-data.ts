import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

type BaseDoc = { _id: string; createdAt?: number };

export type ChangeEventDoc = BaseDoc & {
  projectId: string;
  eventId: string;
  eventType: string;
  state: string;
  businessEvent?: boolean;
  entityId: string;
  predicate?: string;
  previousFactVersionId?: string;
  nextFactVersionId?: string;
  validFrom?: number;
  observedAt: number;
  releasedAt?: number;
  evidenceRefs: string[];
  certificateId?: string;
  correctionOfEventId?: string;
  eventHash: string;
  reasonCodes?: string[];
  releaseDecisionId?: string;
};

export type SourceConflictDoc = BaseDoc & {
  projectId: string;
  entityId: string;
  predicate: string;
  status: string;
  candidateObservationIds: string[];
  releasedFactVersionId?: string;
  reason: string;
  openedAt: number;
  resolvedAt?: number;
  resolution?: unknown;
};

type PolicyDoc = BaseDoc & {
  name?: string;
  predicate?: string;
  strategy?: string;
  revision?: number;
  status?: string;
  hash?: string;
  rules?: unknown;
};
type DecisionDoc = BaseDoc & {
  outcome?: string;
  reasonCodes?: string[];
  candidateObservationIds?: string[];
  details?: unknown;
};
type ObservationDoc = BaseDoc & {
  sourceEntityKey?: string;
  trustState?: string;
  observedAt?: number;
  sourceId?: string;
};
type FieldDoc = BaseDoc & {
  observationId?: string;
  canonicalPath?: string;
  normalizedValue?: unknown;
  state?: string;
  sourcePaths?: string[];
};
type FactDoc = BaseDoc & {
  predicate?: string;
  value?: unknown;
  changeKind?: string;
  transactionFrom?: number;
};

export type Phase8ProofData = {
  proof: { _id: string };
  events: Array<{
    _id: string;
    eventId: string;
    eventType: string;
    state: string;
    businessEvent: boolean;
    predicate?: string;
    observedAt: number;
  }>;
  conflicts: Array<{
    _id: string;
    entityId: string;
    predicate: string;
    status: string;
    candidateObservationIds: Array<"redacted">;
    releasedFactVersionId?: string;
    reason: string;
    openedAt: number;
  }>;
  businessEventCount: number;
  layoutBusinessEventCount: number;
  verifiedPriceEventCount: number;
  quarantinedEventCount: number;
  stableEventIds: boolean;
};

export type CourtroomData = {
  event: ChangeEventDoc | null;
  conflict: SourceConflictDoc | null;
  releaseDecision?: DecisionDoc | null;
  releasePolicy?: PolicyDoc | null;
  decision?: DecisionDoc | null;
  policy?: PolicyDoc | null;
  observations: ObservationDoc[];
  fields: FieldDoc[];
  evidence: BaseDoc[];
  factVersions?: FactDoc[];
  facts?: FactDoc[];
  relatedEvents?: ChangeEventDoc[];
};

const eventsQuery = makeFunctionReference<
  "query",
  {
    projectId?: string;
    entityId?: string;
    eventType?: string;
    state?: string;
    limit?: number;
  },
  ChangeEventDoc[]
>("phase8Queries:events");

const conflictsQuery = makeFunctionReference<
  "query",
  { projectId?: string; entityId?: string; status?: string; limit?: number },
  SourceConflictDoc[]
>("phase8Queries:conflicts");

const courtroomQuery = makeFunctionReference<
  "query",
  { eventId?: string; conflictId?: string },
  CourtroomData | null
>("phase8Queries:courtroom");

const proofQuery = makeFunctionReference<
  "query",
  { key?: string },
  Phase8ProofData | null
>("phase8Queries:proof");

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

export const loadPhase8Proof = () =>
  safeQuery((convex) => convex.query(proofQuery, {}));

export const loadEvents = (
  filters: {
    entityId?: string;
    eventType?: string;
    state?: string;
  } = {},
) =>
  safeQuery((convex) => convex.query(eventsQuery, { ...filters, limit: 100 }));

export const loadConflicts = (
  filters: {
    entityId?: string;
    status?: string;
  } = {},
) =>
  safeQuery((convex) =>
    convex.query(conflictsQuery, { ...filters, limit: 100 }),
  );

export const loadEventCourtroom = (eventId: string) =>
  safeQuery((convex) => convex.query(courtroomQuery, { eventId }));

export const loadConflictCourtroom = (conflictId: string) =>
  safeQuery((convex) => convex.query(courtroomQuery, { conflictId }));
