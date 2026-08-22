import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { BrightDataRuntime } from "../packages/brightdata-runtime/src/index";
import { sha256 } from "../packages/hashing/src/index";
import { collectorProductSchema } from "../packages/shared-types/src/index";

async function main() {
  const required = [
    "BRIGHT_DATA_API_KEY",
    "BRIGHT_DATA_COLLECTOR_ID",
    "CONVEX_URL",
    "KEVLAR_BASELINE_INGEST_KEY",
    "FIXTURE_BASE_URL",
  ] as const;

  for (const key of required) {
    if (!process.env[key])
      throw new Error(`Missing required environment variable: ${key}`);
  }

  const fixtureUrl = new URL(
    "/product-pricing/nova",
    process.env.FIXTURE_BASE_URL,
  ).toString();
  const runtime = new BrightDataRuntime({
    apiKey: process.env.BRIGHT_DATA_API_KEY!,
    collectorId: process.env.BRIGHT_DATA_COLLECTOR_ID!,
  });

  console.log("Triggering the custom Nova collector...");
  const { snapshotId } = await runtime.trigger({ url: fixtureUrl });
  console.log(`Collection accepted: ${snapshotId}`);

  let rows: unknown[] | null = null;
  for (let attempt = 0; attempt < 36; attempt += 1) {
    const result = await runtime.poll(snapshotId);
    if (result.state === "ready") {
      rows = result.rows;
      break;
    }
    console.log(`Collection status: ${result.status}`);
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }

  if (!rows)
    throw new Error(
      "Bright Data collection did not finish within three minutes",
    );
  if (rows.length !== 1)
    throw new Error(`Expected one collector row, received ${rows.length}`);

  const baseline = collectorProductSchema.parse(rows[0]);
  const capturedAt = Date.parse(baseline.captured_at);
  const evidence = [
    {
      kind: "visible_context" as const,
      sourceUrl: baseline.source_url,
      contentHash: sha256(baseline.evidence.purchase_context),
      metadata: { context: baseline.evidence.purchase_context },
      capturedAt,
    },
    {
      kind: "jsonld" as const,
      sourceUrl: baseline.source_url,
      contentHash: sha256(baseline.independent_sources.jsonld_price),
      metadata: { value: baseline.independent_sources.jsonld_price },
      capturedAt,
    },
    {
      kind: "network_response" as const,
      sourceUrl: new URL(
        "/api/public-product/nova",
        process.env.FIXTURE_BASE_URL,
      ).toString(),
      contentHash: sha256(baseline.independent_sources.public_api_price),
      metadata: { value: baseline.independent_sources.public_api_price },
      capturedAt,
    },
    {
      kind: "screenshot" as const,
      sourceUrl: baseline.source_url,
      contentHash: sha256(baseline.evidence.screenshot_ref),
      metadata: { ref: baseline.evidence.screenshot_ref },
      capturedAt,
    },
  ];

  const ingestBaseline = makeFunctionReference<
    "mutation",
    {
      ingestKey: string;
      collectorPlatformId: string;
      targetUrl: string;
      brightDataJobId: string;
      rawPayload: unknown;
      outputHash: string;
      recordHash: string;
      evidence: typeof evidence;
    },
    { runId: string; duplicate: boolean }
  >("runs:ingestBaseline");

  const convex = new ConvexHttpClient(process.env.CONVEX_URL!);
  const result = await convex.mutation(ingestBaseline, {
    ingestKey: process.env.KEVLAR_BASELINE_INGEST_KEY!,
    collectorPlatformId: process.env.BRIGHT_DATA_COLLECTOR_ID!,
    targetUrl: fixtureUrl,
    brightDataJobId: snapshotId,
    rawPayload: baseline,
    outputHash: sha256(rows),
    recordHash: sha256(baseline),
    evidence,
  });

  console.log(
    result.duplicate
      ? `Baseline already persisted: ${result.runId}`
      : `Baseline persisted: ${result.runId}`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
