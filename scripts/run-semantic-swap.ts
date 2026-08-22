import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { BrightDataRuntime } from "../packages/brightdata-runtime/src/index";
import { sha256 } from "../packages/hashing/src/index";
import { verifyProductPrice } from "../packages/semantic-contracts/src/index";
import {
  collectorProductSchema,
  type CollectorProduct,
} from "../packages/shared-types/src/index";

type FixtureVersion = "v1" | "v2";
type IngestResult =
  | { duplicate: true; runId: string }
  | {
      duplicate: false;
      runId: string;
      decision: "verified" | "quarantined" | "needs_review" | "invalid";
      releasedValue: number | null;
      observedValue: number | null;
      alertStatus: "not_triggered" | "blocked" | "sent";
      violationCodes: string[];
    };

const setNova = makeFunctionReference<
  "mutation",
  { ingestKey: string; version: FixtureVersion },
  { version: FixtureVersion; updatedAt: number | null }
>("fixtureState:setNova");

const ingestObservation = makeFunctionReference<
  "mutation",
  {
    ingestKey: string;
    collectorPlatformId: string;
    targetUrl: string;
    brightDataJobId: string;
    rawPayload: unknown;
    outputHash: string;
    recordHash: string;
    evidence: Array<{
      kind:
        | "html"
        | "screenshot"
        | "jsonld"
        | "network_response"
        | "visible_context";
      sourceUrl: string;
      contentHash: string;
      metadata: unknown;
      capturedAt: number;
    }>;
  },
  IngestResult
>("semanticGate:ingestObservation");

function requireEnvironment() {
  const keys = [
    "BRIGHT_DATA_API_KEY",
    "BRIGHT_DATA_COLLECTOR_ID",
    "CONVEX_URL",
    "KEVLAR_BASELINE_INGEST_KEY",
    "FIXTURE_BASE_URL",
  ] as const;
  for (const key of keys) {
    if (!process.env[key])
      throw new Error(`Missing required environment variable: ${key}`);
  }
}

async function collect(
  runtime: BrightDataRuntime,
  targetUrl: string,
  version: FixtureVersion,
) {
  console.log(`${version.toUpperCase()}: triggering Bright Data collector`);
  const { snapshotId } = await runtime.trigger({ url: targetUrl });
  console.log(`${version.toUpperCase()}: collection accepted as ${snapshotId}`);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await runtime.poll(snapshotId);
    if (result.state === "ready") {
      if (result.rows.length !== 1) {
        throw new Error(
          `${version.toUpperCase()}: expected one row, received ${result.rows.length}`,
        );
      }
      return {
        snapshotId,
        record: collectorProductSchema.parse(result.rows[0]),
      };
    }
    console.log(`${version.toUpperCase()}: ${result.status}`);
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(
    `${version.toUpperCase()}: ${snapshotId} did not finish within ten minutes`,
  );
}

function evidenceFor(record: CollectorProduct, fixtureBaseUrl: string) {
  const capturedAt = Date.parse(record.captured_at);
  return [
    {
      kind: "visible_context" as const,
      sourceUrl: record.source_url,
      contentHash: sha256(record.evidence.purchase_context),
      metadata: { context: record.evidence.purchase_context },
      capturedAt,
    },
    {
      kind: "jsonld" as const,
      sourceUrl: record.source_url,
      contentHash: sha256(record.independent_sources.jsonld_price),
      metadata: { value: record.independent_sources.jsonld_price },
      capturedAt,
    },
    {
      kind: "network_response" as const,
      sourceUrl: new URL("/api/public-product/nova", fixtureBaseUrl).toString(),
      contentHash: sha256(record.independent_sources.public_api_price),
      metadata: { value: record.independent_sources.public_api_price },
      capturedAt,
    },
    {
      kind: "screenshot" as const,
      sourceUrl: record.source_url,
      contentHash: sha256(record.evidence.screenshot_ref),
      metadata: { ref: record.evidence.screenshot_ref },
      capturedAt,
    },
  ];
}

async function persist(
  convex: ConvexHttpClient,
  record: CollectorProduct,
  snapshotId: string,
  targetUrl: string,
) {
  return convex.mutation(ingestObservation, {
    ingestKey: process.env.KEVLAR_BASELINE_INGEST_KEY!,
    collectorPlatformId: process.env.BRIGHT_DATA_COLLECTOR_ID!,
    targetUrl,
    brightDataJobId: snapshotId,
    rawPayload: record,
    outputHash: sha256([record]),
    recordHash: sha256(record),
    evidence: evidenceFor(record, process.env.FIXTURE_BASE_URL!),
  });
}

async function main() {
  requireEnvironment();
  const convex = new ConvexHttpClient(process.env.CONVEX_URL!);
  const runtime = new BrightDataRuntime({
    apiKey: process.env.BRIGHT_DATA_API_KEY!,
    collectorId: process.env.BRIGHT_DATA_COLLECTOR_ID!,
  });
  const targetUrl = new URL(
    "/product-pricing/nova",
    process.env.FIXTURE_BASE_URL,
  ).toString();
  const ingestKey = process.env.KEVLAR_BASELINE_INGEST_KEY!;

  console.log("Setting the same public fixture URL to V1...");
  await convex.mutation(setNova, { ingestKey, version: "v1" });
  const v1 = await collect(runtime, targetUrl, "v1");
  const v1Local = verifyProductPrice({ raw: v1.record });
  if (v1Local.decision !== "verified") {
    throw new Error(`V1 local decision was ${v1Local.decision}`);
  }
  const v1Persisted = await persist(
    convex,
    v1.record,
    v1.snapshotId,
    targetUrl,
  );
  if (v1Persisted.duplicate || v1Persisted.decision !== "verified") {
    throw new Error("V1 was not persisted as a fresh verified observation");
  }
  console.log(`V1 verified and released: $${v1Persisted.releasedValue}`);

  console.log("Switching that same fixture URL to semantic-swap V2...");
  await convex.mutation(setNova, { ingestKey, version: "v2" });
  const v2 = await collect(runtime, targetUrl, "v2");
  const v2Local = verifyProductPrice({
    raw: v2.record,
    previousVerifiedValue: 129,
  });
  if (
    v2Local.decision !== "quarantined" ||
    v2Local.proof?.observedValue !== 10.75 ||
    v2Local.proof.value !== 129 ||
    v2Local.alert.status !== "blocked"
  ) {
    throw new Error("V2 did not produce the expected local quarantine proof");
  }
  const v2Persisted = await persist(
    convex,
    v2.record,
    v2.snapshotId,
    targetUrl,
  );
  if (
    v2Persisted.duplicate ||
    v2Persisted.decision !== "quarantined" ||
    v2Persisted.observedValue !== 10.75 ||
    v2Persisted.releasedValue !== 129 ||
    v2Persisted.alertStatus !== "blocked"
  ) {
    throw new Error("Convex did not preserve the expected quarantine decision");
  }

  console.log("Semantic-swap proof complete:");
  console.log("- observed V2 value: $10.75");
  console.log("- released last-known-good value: $129");
  console.log("- trust state: quarantined / stale");
  console.log("- false price-drop alert: blocked");
  console.log(`- Convex run: ${v2Persisted.runId}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
