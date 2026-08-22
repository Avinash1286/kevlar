import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

export type SemanticStatus = {
  project: { _id: string; name: string; slug: string };
  contract?: { key: string; version: string; active: boolean } | null;
  release: {
    status: "verified" | "quarantined" | "needs_review" | "invalid" | "stale";
    observedValue: number;
    releasedValue: number | null;
    lastKnownGoodValue?: number;
    currency: string;
    updatedAt: number;
    proof: {
      evidence?: {
        visibleContext?: string;
        jsonLdPrice?: number;
        publicApiPrice?: number;
      };
    };
  } | null;
  run?: { _id: string; status: string; brightDataJobId?: string } | null;
  violations?: Array<{
    _id: string;
    code: string;
    severity: string;
    message: string;
  }>;
  alert?: { status: string; reason: string } | null;
  row?: { recordHash: string; rawPayload: unknown } | null;
};

const feed = makeFunctionReference<
  "query",
  Record<string, never>,
  SemanticStatus | null
>("semanticGate:feed");

const projectStatus = makeFunctionReference<
  "query",
  { slug: string },
  SemanticStatus | null
>("semanticGate:projectStatus");

function client() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  return convexUrl ? new ConvexHttpClient(convexUrl) : null;
}

export async function loadFeed() {
  const convex = client();
  if (!convex) return null;
  try {
    return await convex.query(feed, {});
  } catch {
    return null;
  }
}

export async function loadProject(slug: string) {
  const convex = client();
  if (!convex) return null;
  try {
    return await convex.query(projectStatus, { slug });
  } catch {
    return null;
  }
}
