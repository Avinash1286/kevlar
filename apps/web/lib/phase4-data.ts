import { repairCertificateSchema } from "@kevlar/certification";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

export type GauntletResult = {
  _id: string;
  caseId: string;
  visibility: "visible" | "held_out" | "negative_control";
  expectedRelation: string;
  outcome: "pass" | "fail" | "not_run";
  observedValue?: number;
  releasedValue?: number;
  falseHeal: boolean;
  falseRelease: boolean;
  detectionMs?: number;
  recoveryMs?: number;
  evidenceHash: string;
  reason: string;
};

export type GauntletData = {
  catalog: Array<{
    _id: string;
    code: string;
    name: string;
    visibility: "visible" | "held_out" | "negative_control";
    expectedRelation: string;
  }>;
  benchmarkRun: null | {
    _id: string;
    status: string;
    suiteRevision: string;
    startedAt: number;
    completedAt?: number;
    summary?: unknown;
  };
  results: GauntletResult[];
};

export type CertificateData = {
  certificate: {
    _id: string;
    status: "certified" | "rejected";
    publicSlug: string;
    digest: string;
    payload: unknown;
    createdAt: number;
  };
  incident: null | { _id: string; failureSummary: string; state: string };
  collector: null | { collectorId: string; name: string };
  healAttempt: null | {
    status: string;
    collectorPlatformId: string;
    promptHash: string;
    approvedAt?: number;
  };
  benchmarkRun: GauntletData["benchmarkRun"];
  results: GauntletResult[];
  tribunalChecks: Array<{
    _id: string;
    check: string;
    status: string;
    summary: string;
  }>;
  evidenceLinks: Array<{
    _id: string;
    kind: string;
    hash: string;
    label: string;
  }>;
};

const gauntlet = makeFunctionReference<
  "query",
  { incidentId?: string },
  GauntletData
>("phase4Queries:gauntlet");

const certificateBySlug = makeFunctionReference<
  "query",
  { publicSlug: string },
  CertificateData | null
>("phase4Queries:certificateBySlug");

function client() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? new ConvexHttpClient(url) : null;
}

export async function loadGauntlet(incidentId?: string) {
  const convex = client();
  if (!convex) return null;
  try {
    return await convex.query(gauntlet, incidentId ? { incidentId } : {});
  } catch {
    return null;
  }
}

export async function loadCertificate(publicSlug: string) {
  const convex = client();
  if (!convex) return null;
  try {
    const result = await convex.query(certificateBySlug, { publicSlug });
    if (!result) return null;
    const parsedPayload = repairCertificateSchema.safeParse(
      result.certificate.payload,
    );
    return {
      ...result,
      parsedPayload: parsedPayload.success ? parsedPayload.data : null,
    };
  } catch {
    return null;
  }
}
