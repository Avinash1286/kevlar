import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

type Doc = { _id: string; [key: string]: unknown };
export type Phase11ProofData = {
  proof: Doc & { unauthorizedApprovalDenied: boolean; crossTenantReadDenied: boolean };
  routerIngestion: Doc & { status: string; rawPageAccepted: boolean; evidenceRefs: string[]; approvedByUserId?: string };
  promptInjectionIngestion: Doc & { status: string; promptInjectionBlocked: boolean };
  chaosRun: Doc & { status: string };
  chaosCases: Array<Doc & { kind: string; outcome: string; contained: boolean }>;
  alerts: Array<Doc & { kind: string; severity: string; status: string; runbookKey: string }>;
  cost: null | (Doc & { apiRequests: number; webhookAttempts: number; collectorRuns: number; aiCalls: number; estimatedUsd: number });
  freshness: null | (Doc & { releasedFacts: number; freshFacts: number; staleFacts: number; compliancePercent: number });
  deniedAudits: Doc[];
  allChaosPassed: boolean;
  allCriticalAlertsFired: boolean;
  verifiedRouterEventOnly: boolean;
  promptInjectionBlocked: boolean;
  tenantIsolationPassed: boolean;
  secretRedactionPassed: boolean;
};
const proofRef = makeFunctionReference<"query", { key?: string }, Phase11ProofData | null>("phase11Proof:proof");
export async function loadPhase11Proof() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL; if (!url) return null;
  try { return await new ConvexHttpClient(url).query(proofRef, {}); } catch { return null; }
}
