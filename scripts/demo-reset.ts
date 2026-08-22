import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const setNova = makeFunctionReference<
  "mutation",
  { ingestKey: string; version: "v1" | "v2" },
  { version: "v1" | "v2"; updatedAt: number | null }
>("fixtureState:setNova");

async function main() {
  const convexUrl = process.env.CONVEX_URL;
  const ingestKey = process.env.KEVLAR_BASELINE_INGEST_KEY;
  if (!convexUrl || !ingestKey) {
    throw new Error(
      "CONVEX_URL and KEVLAR_BASELINE_INGEST_KEY are required for demo reset",
    );
  }
  const result = await new ConvexHttpClient(convexUrl).mutation(setNova, {
    ingestKey,
    version: "v1",
  });
  console.log(`Demo fixture reset to ${result.version.toUpperCase()}.`);
  console.log("Run `pnpm semantic-swap:run` to replay the release gate.");
  console.log("Run `pnpm phase4:run prepare` only for a new repair attempt.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
