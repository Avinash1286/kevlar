import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

export type SourceCatalogData = {
  domainPack: null | {
    _id: string;
    key: string;
    name: string;
    version: string;
    status: string;
    coreRequired: true;
  };
  sources: Array<{
    _id: string;
    key: string;
    name: string;
    providerKey: string;
    sourceType: string;
    official: boolean;
    visibility: string;
    approvalStatus: string;
    lifecycleStatus: string;
  }>;
  endpoints: Array<{
    _id: string;
    sourceId: string;
    url: string;
    host: string;
    pathPrefix: string;
    public: boolean;
    approvalStatus: string;
  }>;
  authorities: Array<{
    _id: string;
    sourceId: string;
    predicate: string;
    authority: string;
    active: boolean;
  }>;
  reviews: Array<{
    _id: string;
    sourceId: string;
    decision: string;
    summary: string;
  }>;
  bindings: Array<{
    _id: string;
    sourceId?: string;
    bindingKind: string;
    lifecycleStatus: string;
    coreGateStatus: string;
    bypassCore: false;
  }>;
  certifications: Array<{
    _id: string;
    sourceId: string;
    bindingId?: string;
    status: string;
    evidenceHash: string;
    brightDataJobId: string;
    certifiedAt?: number;
  }>;
  schedules: Array<{
    _id: string;
    bindingId: string;
    intervalMs: number;
    maxConcurrency: number;
    dailyQuota: number;
    weight: number;
    enabled: boolean;
  }>;
};

export type FleetData = {
  due: Array<{
    _id: string;
    sourceId: string;
    bindingId: string;
    state: string;
    dueAt: number;
    attempt: number;
  }>;
  leased: Array<{
    _id: string;
    sourceId: string;
    bindingId: string;
    state: string;
    dueAt: number;
    attempt: number;
  }>;
  leases: Array<{
    _id: string;
    sourceId: string;
    bindingId: string;
    workerId: string;
    status: string;
    claimedAt: number;
    expiresAt: number;
  }>;
  health: Array<{
    _id: string;
    sourceId: string;
    state: string;
    consecutiveFailures: number;
    quotaUsed: number;
    totalClaims: number;
    lastSuccessAt?: number;
    lastError?: string;
  }>;
  observations: Array<{
    _id: string;
    sourceId: string;
    sourceType: string;
    sourceUrl: string;
    trust: string;
    evidenceHash: string;
    capturedAt: number;
  }>;
};

const catalogQuery = makeFunctionReference<
  "query",
  { domainPackKey?: string },
  SourceCatalogData
>("phase5Queries:catalog");

const fleetQuery = makeFunctionReference<"query", { now: number }, FleetData>(
  "phase5Queries:fleet",
);

function client() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? new ConvexHttpClient(url) : null;
}

export async function loadSourceCatalog() {
  const convex = client();
  if (!convex) return null;
  try {
    return await convex.query(catalogQuery, {
      domainPackKey: "ai-infrastructure",
    });
  } catch {
    return null;
  }
}

export async function loadFleet() {
  const convex = client();
  if (!convex) return null;
  try {
    return await convex.query(fleetQuery, { now: Date.now() });
  } catch {
    return null;
  }
}
