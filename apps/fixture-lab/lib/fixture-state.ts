import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

export type NovaFixtureVersion = "v1" | "v2";

const getNova = makeFunctionReference<
  "query",
  Record<string, never>,
  { version: NovaFixtureVersion; updatedAt: number | null }
>("fixtureState:getNova");

export async function getNovaFixtureState() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return { version: "v1" as const, updatedAt: null };
  try {
    return await new ConvexHttpClient(convexUrl).query(getNova, {});
  } catch {
    return { version: "v1" as const, updatedAt: null };
  }
}
