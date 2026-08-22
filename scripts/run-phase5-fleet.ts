import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { BrightDataRuntime } from "../packages/brightdata-runtime/src/index";

const sourceSpecs = {
  "openai-pricing": {
    collectorId: "c_mt460ht33qmbg7m8k",
    url: "https://openai.com/api/pricing/",
    intervalMs: 6 * 60 * 60_000,
    dailyQuota: 12,
  },
  "openai-models": {
    collectorId: "c_mt44w77a1irbn8ooh",
    url: "https://platform.openai.com/docs/models",
    intervalMs: 12 * 60 * 60_000,
    dailyQuota: 8,
  },
  "anthropic-release-notes": {
    collectorId: "c_mt43rdlsyxpwuqofn",
    url: "https://docs.anthropic.com/en/release-notes/overview",
    intervalMs: 6 * 60 * 60_000,
    dailyQuota: 12,
  },
  "anthropic-pricing": {
    collectorId: "c_mt4e7tgw1i46wxboqa",
    url: "https://platform.claude.com/docs/en/about-claude/pricing",
    intervalMs: 6 * 60 * 60_000,
    dailyQuota: 12,
  },
  "anthropic-models": {
    collectorId: "c_mt4e811ufis8kdvlt",
    url: "https://platform.claude.com/docs/en/about-claude/models/overview",
    intervalMs: 12 * 60 * 60_000,
    dailyQuota: 8,
  },
} as const;

type SourceKey = keyof typeof sourceSpecs;
type FleetBinding = {
  sourceId: string;
  endpointId: string;
  collectorId: string;
  bindingId: string;
  policyReady: boolean;
};

const seedCatalogMutation = makeFunctionReference<
  "mutation",
  { ingestKey: string; regressionCollectorPlatformId?: string },
  { domainPackId: string; sourceIds: string[]; regressionBound: boolean }
>("phase5Catalog:seedCatalog");
const resolveFleetBindingMutation = makeFunctionReference<
  "mutation",
  {
    ingestKey: string;
    sourceKey: SourceKey;
    collectorPlatformId: string;
  },
  FleetBinding
>("phase5Catalog:resolveFleetBinding");
const activateVerifiedAnthropicPolicyMutation = makeFunctionReference<
  "mutation",
  {
    ingestKey: string;
    sourceKey: "anthropic-pricing" | "anthropic-models";
    collectorPlatformId: string;
    verificationSnapshotId: string;
    verifiedRowCount: 1;
    operationKey: string;
  },
  { reviewId: string; authorityIds: string[]; duplicate: boolean }
>("phase5Catalog:activateVerifiedAnthropicPolicy");
const certifyAction = makeFunctionReference<
  "action",
  {
    ingestKey: string;
    sourceId: string;
    endpointId: string;
    collectorId: string;
    sourceUrl: string;
    brightDataJobId: string;
    rawObservation: unknown;
    operationKey: string;
  },
  {
    sourceCertificationId: string;
    status: "certified" | "rejected";
    outputHash: string;
    evidenceHash: string;
    duplicate: boolean;
  }
>("phase5Certification:certify");
const bindMutation = makeFunctionReference<
  "mutation",
  {
    ingestKey: string;
    sourceId: string;
    endpointId: string;
    collectorId: string;
    sourceCertificationId: string;
    activate: boolean;
    operationKey: string;
  },
  { bindingId: string; duplicate: boolean }
>("phase5Catalog:bindCollector");
const scheduleMutation = makeFunctionReference<
  "mutation",
  {
    ingestKey: string;
    bindingId: string;
    intervalMs: number;
    jitterMs: number;
    maxConcurrency: number;
    dailyQuota: number;
    weight: number;
    baseBackoffMs: number;
    maxBackoffMs: number;
    failureThreshold: number;
    enabled: boolean;
    firstDueAt: number;
    operationKey: string;
  },
  { schedulePolicyId: string; queueItemId: string }
>("phase5Catalog:upsertSchedule");
const ingestAction = makeFunctionReference<
  "action",
  {
    ingestKey: string;
    bindingId: string;
    sourceUrl: string;
    brightDataJobId: string;
    rawObservation: unknown;
    operationKey: string;
  },
  {
    observationId: string;
    runId: string;
    trust: "verified" | "quarantined";
    duplicate: boolean;
  }
>("phase5Ingest:ingest");

function isSourceKey(value: string | undefined): value is SourceKey {
  return Boolean(value && value in sourceSpecs);
}

function isAnthropicActivationSource(
  value: SourceKey,
): value is "anthropic-pricing" | "anthropic-models" {
  return value === "anthropic-pricing" || value === "anthropic-models";
}

function parseArguments() {
  const [sourceKey, ...options] = process.argv.slice(2);
  if (!isSourceKey(sourceKey)) {
    throw new Error(
      "Usage: run-phase5-fleet <source-key> [--activate-policy <verified-snapshot-id>]",
    );
  }
  if (options.length === 0)
    return { sourceKey, verificationSnapshotId: undefined };
  if (options.length !== 2 || options[0] !== "--activate-policy" || !options[1])
    throw new Error(
      "Usage: run-phase5-fleet <source-key> [--activate-policy <verified-snapshot-id>]",
    );
  return { sourceKey, verificationSnapshotId: options[1] };
}

async function collect(runtime: BrightDataRuntime, url: string) {
  const { snapshotId } = await runtime.triggerDevelopment({ url });
  console.log(JSON.stringify({ event: "triggered", snapshotId }));
  for (let attempt = 1; attempt <= 72; attempt += 1) {
    const result = await runtime.poll(snapshotId);
    if (result.state === "ready") {
      if (result.rows.length !== 1) {
        throw new Error(
          `Expected one collector envelope, received ${result.rows.length}`,
        );
      }
      return { snapshotId, rawObservation: result.rows[0] };
    }
    if (attempt === 1 || attempt % 6 === 0) {
      console.log(
        JSON.stringify({
          event: "polling",
          snapshotId,
          attempt,
          status: result.status,
        }),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`Snapshot ${snapshotId} timed out`);
}

async function main() {
  const { sourceKey: key, verificationSnapshotId } = parseArguments();
  const apiKey = process.env.BRIGHT_DATA_API_KEY;
  const convexUrl = process.env.CONVEX_URL;
  const ingestKey = process.env.KEVLAR_BASELINE_INGEST_KEY;
  if (!apiKey || !convexUrl || !ingestKey) {
    throw new Error(
      "Bright Data, Convex, and Kevlar ingest env vars are required",
    );
  }
  const spec = sourceSpecs[key];
  const runtime = new BrightDataRuntime({
    apiKey,
    collectorId: spec.collectorId,
  });
  const convex = new ConvexHttpClient(convexUrl);
  await convex.mutation(seedCatalogMutation, { ingestKey });
  let resolved = await convex.mutation(resolveFleetBindingMutation, {
    ingestKey,
    sourceKey: key,
    collectorPlatformId: spec.collectorId,
  });
  if (!resolved.policyReady) {
    if (!verificationSnapshotId) {
      throw new Error(
        `Source ${key} is still pending policy approval. First run phase5:verify, then rerun with --activate-policy <verified-snapshot-id>.`,
      );
    }
    if (!isAnthropicActivationSource(key)) {
      throw new Error(
        `Source ${key} cannot use the restricted Anthropic activation path`,
      );
    }
    const activation = await convex.mutation(
      activateVerifiedAnthropicPolicyMutation,
      {
        ingestKey,
        sourceKey: key,
        collectorPlatformId: spec.collectorId,
        verificationSnapshotId,
        verifiedRowCount: 1,
        operationKey: `phase5:${key}:policy:${verificationSnapshotId}`,
      },
    );
    console.log(JSON.stringify({ event: "policy_activated", key, activation }));
    resolved = await convex.mutation(resolveFleetBindingMutation, {
      ingestKey,
      sourceKey: key,
      collectorPlatformId: spec.collectorId,
    });
    if (!resolved.policyReady)
      throw new Error(`Source ${key} policy activation did not become ready`);
  }
  console.log(
    JSON.stringify({
      event: "binding_resolved",
      key,
      bindingId: resolved.bindingId,
      policyReady: resolved.policyReady,
    }),
  );

  const collected = await collect(runtime, spec.url);
  const operationRoot = `phase5:${key}:${collected.snapshotId}`;
  const certification = await convex.action(certifyAction, {
    ingestKey,
    sourceId: resolved.sourceId,
    endpointId: resolved.endpointId,
    collectorId: resolved.collectorId,
    sourceUrl: spec.url,
    brightDataJobId: collected.snapshotId,
    rawObservation: collected.rawObservation,
    operationKey: `${operationRoot}:certify`,
  });
  console.log(JSON.stringify({ event: "certified", key, certification }));
  if (certification.status !== "certified") {
    process.exitCode = 2;
    return;
  }
  const binding = await convex.mutation(bindMutation, {
    ingestKey,
    sourceId: resolved.sourceId,
    endpointId: resolved.endpointId,
    collectorId: resolved.collectorId,
    sourceCertificationId: certification.sourceCertificationId,
    activate: true,
    operationKey: `${operationRoot}:bind`,
  });
  const schedule = await convex.mutation(scheduleMutation, {
    ingestKey,
    bindingId: binding.bindingId,
    intervalMs: spec.intervalMs,
    jitterMs: 15 * 60_000,
    maxConcurrency: 1,
    dailyQuota: spec.dailyQuota,
    weight: 1,
    baseBackoffMs: 5 * 60_000,
    maxBackoffMs: 6 * 60 * 60_000,
    failureThreshold: 3,
    enabled: true,
    firstDueAt: Date.now() + spec.intervalMs,
    operationKey: `${operationRoot}:schedule`,
  });
  const ingestion = await convex.action(ingestAction, {
    ingestKey,
    bindingId: binding.bindingId,
    sourceUrl: spec.url,
    brightDataJobId: collected.snapshotId,
    rawObservation: collected.rawObservation,
    operationKey: `${operationRoot}:ingest`,
  });
  console.log(
    JSON.stringify({
      event: "complete",
      key,
      snapshotId: collected.snapshotId,
      binding,
      schedule,
      ingestion,
    }),
  );
  if (ingestion.trust !== "verified") process.exitCode = 2;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
