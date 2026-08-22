import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

type Doc = { _id: string; [key: string]: unknown };
export type EvidenceGraphData = { root: Doc | null; nodes: Doc[]; edges: Doc[] };
export type EvidenceBundleData = { bundle: Doc; artifacts: Doc[]; evidence: Doc[] };
export type BlastRadiusData = {
  assessment: Doc;
  impacts: Doc[];
  tribunalContext: Doc | null;
  tribunalItems: Doc[];
};
export type FleetData = {
  canaries: Doc[];
  stages: Doc[];
  eventHolds: Doc[];
  gauntletRuns: Doc[];
  suites: Doc[];
  cases: Doc[];
  results: Doc[];
  metrics: Doc[];
  certificates: Doc[];
};
export type Phase9ProofData = {
  proof: Doc;
  graph?: EvidenceGraphData;
  bundle?: EvidenceBundleData;
  blastRadius?: BlastRadiusData;
  fleet?: FleetData;
  allReleasedEventsNavigable?: boolean;
  everyReleasedEventHasEvidencePath?: boolean;
  repairActivationBeginsWithCanary?: boolean;
  canaryStarted?: boolean;
  triggerPassAloneCannotActivate?: boolean;
  triggerAloneBlocked?: boolean;
  heldOutTestsBeforeRelease?: boolean;
  heldOutBeforeRelease?: boolean;
  failedRepairWithholdsEvents?: boolean;
  productPricingRegressionPassed?: boolean;
  [key: string]: unknown;
};

const evidenceGraphQuery = makeFunctionReference<
  "query",
  { rootNodeId?: string; projectId?: string; limit?: number },
  EvidenceGraphData | null
>("phase9Queries:evidenceGraph");
const bundleQuery = makeFunctionReference<
  "query",
  { bundleId?: string; digest?: string },
  EvidenceBundleData | null
>("phase9Queries:evidenceBundle");
const blastQuery = makeFunctionReference<
  "query",
  { incidentId?: string; assessmentId?: string },
  BlastRadiusData | null
>("phase9Queries:blastRadius");
const fleetQuery = makeFunctionReference<
  "query",
  { incidentId?: string; canaryRunId?: string; gauntletRunId?: string; limit?: number },
  FleetData
>("phase9Queries:fleet");
const proofQuery = makeFunctionReference<"query", { key?: string }, Phase9ProofData | null>(
  "phase9Queries:proof",
);

function client() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? new ConvexHttpClient(url) : null;
}
async function safe<T>(run: (client: ConvexHttpClient) => Promise<T>) {
  const convex = client();
  if (!convex) return null;
  try { return await run(convex); } catch { return null; }
}

export const loadPhase9Proof = () => safe((convex) => convex.query(proofQuery, {}));
export const loadEvidenceGraph = (rootNodeId?: string) => safe(async (convex) => {
  const resolved = rootNodeId ?? (await convex.query(proofQuery, {}))?.rootNodeId;
  return convex.query(evidenceGraphQuery, { ...(resolved ? { rootNodeId: String(resolved) } : {}), limit: 100 });
});
export const loadEvidenceBundle = (bundleId?: string) => safe(async (convex) => {
  const resolved = bundleId ?? (await convex.query(proofQuery, {}))?.evidenceBundleId;
  if (!resolved) return null;
  return convex.query(bundleQuery, { bundleId: String(resolved) });
});
export const loadBlastRadius = (incidentId?: string) => safe(async (convex) => {
  const resolved = incidentId ?? (await convex.query(proofQuery, {}))?.incidentId;
  if (!resolved) return null;
  return convex.query(blastQuery, { incidentId: String(resolved) });
});
export const loadFleetProof = () => safe((convex) => convex.query(fleetQuery, { limit: 50 }));
