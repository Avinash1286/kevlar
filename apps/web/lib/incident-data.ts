import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

export type IncidentDetail = {
  incident: {
    _id: string;
    state: string;
    failureSummary: string;
    classification?: string;
    recommendedAction?: string;
    openedAt: number;
    updatedAt: number;
  };
  failingRun: { _id: string; status: string; brightDataJobId?: string } | null;
  collector: { name: string; collectorId: string } | null;
  latestTriage: {
    classification: string;
    recommendedAction: string;
    confidenceSource: string;
    signals: string[];
    createdAt: number;
  } | null;
  latestWorkflow: {
    status: string;
    currentStep: string;
    attempt: number;
    nextResumeAt?: number;
    durableWorkflowId?: string;
    updatedAt: number;
  } | null;
  latestReview: {
    status: string;
    reason: string;
    requestedAt: number;
  } | null;
  modelCalls: Array<{
    _id: string;
    provider: string;
    model: string;
    fallbackIndex: number;
    status: string;
    latencyMs?: number;
    startedAt: number;
  }>;
};

export type IncidentTimelineItem = {
  id: string;
  at: number;
  kind: "incident" | "triage" | "workflow" | "model" | "human_review";
  label: string;
  details: unknown;
};

const detail = makeFunctionReference<
  "query",
  { incidentId: string },
  IncidentDetail | null
>("incidents:detail");

const timeline = makeFunctionReference<
  "query",
  { incidentId: string },
  IncidentTimelineItem[]
>("incidents:timeline");

export async function loadIncident(incidentId: string) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return null;
  try {
    const convex = new ConvexHttpClient(convexUrl);
    const [incident, events] = await Promise.all([
      convex.query(detail, { incidentId }),
      convex.query(timeline, { incidentId }),
    ]);
    return incident ? { incident, events } : null;
  } catch {
    return null;
  }
}
