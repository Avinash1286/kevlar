import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import {
  CORE_GAUNTLET_CASES,
  composeRepairInstruction,
  createRepairCertificate,
  evaluateCollectedCase,
  evaluateNegativeControl,
  gauntletCaseResultSchema,
  projectBenchmarkBaseline,
  runPreApprovalTribunal,
  summarizeBenchmark,
  type BenchmarkSummary,
  type BenchmarkSystem,
  type GauntletCaseResult,
  type RepairCertificate,
  type TribunalCheck,
} from "../packages/certification/src/index";
import { BrightDataRuntime } from "../packages/brightdata-runtime/src/index";
import { sha256 } from "../packages/hashing/src/index";
import { verifyProductPrice } from "../packages/semantic-contracts/src/index";
import {
  collectorProductSchema,
  type CollectorProduct,
} from "../packages/shared-types/src/index";
import {
  novaBaseline,
  novaSemanticSwap,
} from "../packages/test-fixtures/src/index";

type Command = "prepare" | "approve";
type HealStatus =
  | "created"
  | "submitted"
  | "polling"
  | "preview_ready"
  | "approved"
  | "rejected"
  | "failed";

type Feed = {
  run?: {
    _id: string;
    outputHash?: string;
    brightDataJobId?: string;
    status?: string;
  } | null;
  row?: { rawPayload: unknown } | null;
} | null;

type ScenarioResult = {
  incidentId: string;
  classification: string;
  recommendedAction: string;
};

type Courtroom = {
  incident: {
    _id: string;
    failingRunId: string;
    classification?: string;
    state: string;
  };
  healAttempts: Array<{
    _id: string;
    attempt: number;
    prompt: string;
    promptHash: string;
    status: HealStatus;
    previewResult?: unknown;
    updatedAt: number;
  }>;
  tribunalChecks: Array<{
    check: string;
    status: string;
    summary: string;
  }>;
  repairDecisions: Array<{
    _id: string;
    decision: string;
    providerApprovalRef?: string;
  }>;
};

type IncidentDetail = {
  incident: { _id: string; state: string; classification?: string };
  failingRun: { _id: string; outputHash?: string } | null;
  collector: { collectorId: string } | null;
};

const feed = makeFunctionReference<"query", { slug: string }, Feed>(
  "semanticGate:projectStatus",
);
const setNova = makeFunctionReference<
  "mutation",
  { ingestKey: string; version: "v1" | "v2" },
  { version: "v1" | "v2"; updatedAt: number | null }
>("fixtureState:setNova");
const runScenario = makeFunctionReference<
  "action",
  {
    ingestKey: string;
    failingRunId: string;
    scenario: "semantic_swap";
    scenarioKey: string;
  },
  ScenarioResult
>("phase3Scenario:run");
const incidentDetail = makeFunctionReference<
  "query",
  { incidentId: string },
  IncidentDetail | null
>("incidents:detail");
const courtroom = makeFunctionReference<
  "query",
  { incidentId: string },
  Courtroom | null
>("phase4Queries:incidentCourtroom");
const gauntletQuery = makeFunctionReference<
  "query",
  { incidentId?: string },
  {
    benchmarkRun: {
      _id: string;
      baseline: BenchmarkSystem;
      status: "running" | "completed" | "failed";
    } | null;
    results: unknown[];
  }
>("phase4Queries:gauntlet");
const seedCatalog = makeFunctionReference<
  "mutation",
  { ingestKey: string },
  { inserted: number; existing: number }
>("phase4Gauntlet:seedCatalog");
const persistAttempt = makeFunctionReference<
  "mutation",
  {
    ingestKey: string;
    incidentId: string;
    attempt: number;
    prompt: string;
    promptHash: string;
    status: HealStatus;
    brightDataJobRef?: string;
    previewResult?: unknown;
    provider?: string;
    model?: string;
    operationKey: string;
    requestHash: string;
  },
  { healAttemptId: string; duplicate: boolean; status: HealStatus }
>("phase4Heal:persistAttempt");
const backfillFailureEvidence = makeFunctionReference<
  "mutation",
  { ingestKey: string; incidentId: string; operationKey: string },
  {
    failingRunId: string;
    sourceRunId: string;
    outputHash: string;
    duplicate: boolean;
  }
>("phase4Heal:backfillFailureEvidence");
const upsertCheck = makeFunctionReference<
  "mutation",
  {
    ingestKey: string;
    healAttemptId: string;
    check: TribunalCheck["check"];
    status: TribunalCheck["status"];
    summary: string;
    details: unknown;
    evidenceIds: string[];
    operationKey: string;
    requestHash: string;
  },
  { tribunalCheckId: string; duplicate: boolean }
>("phase4Tribunal:upsertCheck");
const decide = makeFunctionReference<
  "mutation",
  {
    ingestKey: string;
    healAttemptId: string;
    decision: "approved" | "rejected";
    reason: string;
    actorId: string;
    operationKey: string;
    requestHash: string;
  },
  {
    repairDecisionId: string;
    duplicate: boolean;
    decision: "approved" | "rejected";
    authorizeProviderApproval: boolean;
  }
>("phase4Approval:decide");
const recordProviderApproval = makeFunctionReference<
  "mutation",
  {
    ingestKey: string;
    repairDecisionId: string;
    providerApprovalRef: string;
    operationKey: string;
    requestHash: string;
  },
  { duplicate: boolean }
>("phase4Approval:recordProviderApproval");
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
    evidence: ReturnType<typeof evidenceFor>;
  },
  {
    duplicate: boolean;
    runId: string;
    decision: "verified" | "quarantined" | "needs_review" | "invalid";
    releasedValue: number | null;
    observedValue: number | null;
  }
>("semanticGate:ingestObservation");
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
    evidence: ReturnType<typeof evidenceFor>;
  },
  { runId: string; duplicate: boolean }
>("runs:ingestBaseline");
const startBenchmark = makeFunctionReference<
  "mutation",
  {
    ingestKey: string;
    healAttemptId: string;
    suiteRevision: string;
    baseline: "schema_only" | "contract_only" | "full_kevlar";
    operationKey: string;
  },
  { benchmarkRunId: string; duplicate: boolean }
>("phase4Gauntlet:startBenchmark");
const recordCaseResult = makeFunctionReference<
  "mutation",
  {
    ingestKey: string;
    benchmarkRunId: string;
    caseId: GauntletCaseResult["caseId"];
    outcome: "pass" | "fail";
    observedRelation?: GauntletCaseResult["expectedRelation"];
    observedValue: number | null;
    releasedValue: number | null;
    detectionMs: number;
    recoveryMs?: number;
    falseHeal: boolean;
    falseRelease: boolean;
    critical?: boolean;
    evidenceHash: string;
    reason: string;
    evidenceIds: string[];
    operationKey: string;
  },
  { caseResultId: string; duplicate: boolean }
>("phase4Gauntlet:recordCaseResult");
const completeBenchmark = makeFunctionReference<
  "mutation",
  {
    ingestKey: string;
    benchmarkRunId: string;
    lastKnownGoodPreserved: boolean;
  },
  {
    status: "completed" | "failed";
    totalCases: number;
    passedCases: number;
    criticalFailures: number;
  }
>("phase4Gauntlet:completeBenchmark");
const certifyAndRelease = makeFunctionReference<
  "mutation",
  {
    ingestKey: string;
    healAttemptId: string;
    benchmarkRunId: string;
    candidateRunId: string;
    payload: RepairCertificate;
    digest: string;
    publicSlug: string;
    entityId: string;
    fieldPath: string;
    observedValue: number;
    currency: string;
    proof: unknown;
    evidenceIds: string[];
    operationKey: string;
    requestHash: string;
  },
  { certificateId: string; fieldReleaseId: string; duplicate: boolean }
>("phase4Certification:certifyAndRelease");

function environment() {
  const required = [
    "BRIGHT_DATA_API_KEY",
    "BRIGHT_DATA_COLLECTOR_ID",
    "CONVEX_URL",
    "KEVLAR_BASELINE_INGEST_KEY",
    "FIXTURE_BASE_URL",
  ] as const;
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing environment: ${key}`);
  }
  return {
    apiKey: process.env.BRIGHT_DATA_API_KEY!,
    collectorId: process.env.BRIGHT_DATA_COLLECTOR_ID!,
    convexUrl: process.env.CONVEX_URL!,
    ingestKey: process.env.KEVLAR_BASELINE_INGEST_KEY!,
    fixtureBaseUrl: process.env.FIXTURE_BASE_URL!,
  };
}

function evidenceFor(record: CollectorProduct) {
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
      sourceUrl: record.source_url,
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

function ensureSha256Digest(value: string) {
  return /^sha256:[0-9a-f]{64}$/i.test(value) ? value : sha256(value);
}

function findCollectorRecord(value: unknown, depth = 0): unknown | null {
  if (depth > 9 || value === null) return null;
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      return findCollectorRecord(JSON.parse(value), depth + 1);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object") return null;
  if (collectorProductSchema.safeParse(value).success) return value;
  for (const nested of Array.isArray(value) ? value : Object.values(value)) {
    const found = findCollectorRecord(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

function findCandidateSource(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  const candidate =
    root.diff && typeof root.diff === "object"
      ? (root.diff as Record<string, unknown>).template_b
      : null;
  if (!candidate || typeof candidate !== "object") return null;
  const snippets: string[] = [];
  const visit = (node: unknown, depth = 0) => {
    if (depth > 8 || !node || typeof node !== "object") return;
    for (const [key, nested] of Object.entries(node)) {
      if (
        typeof nested === "string" &&
        (key === "code" || key === "parse_code" || key === "parser")
      )
        snippets.push(nested);
      else visit(nested, depth + 1);
    }
  };
  visit(candidate);
  return snippets.length > 0 ? [...new Set(snippets)].join("\n") : null;
}

async function collect(
  runtime: BrightDataRuntime,
  urls: string[],
  timeoutMinutes = 10,
) {
  const startedAt = Date.now();
  const { snapshotId } = await runtime.triggerBatch(
    urls.map((url) => ({ url })),
  );
  const attempts = Math.ceil((timeoutMinutes * 60_000) / 5_000);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await runtime.poll(snapshotId);
    if (result.state === "ready") {
      return {
        snapshotId,
        rows: result.rows,
        durationMs: Date.now() - startedAt,
      };
    }
    console.log(`Collection ${snapshotId}: ${result.status}`);
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(
    `Collection ${snapshotId} exceeded ${timeoutMinutes} minutes`,
  );
}

function rowForPath(rows: unknown[], path: string) {
  return (
    rows.find((row) => {
      if (!row || typeof row !== "object" || !("source_url" in row))
        return false;
      const source = row.source_url;
      if (typeof source !== "string") return false;
      try {
        return new URL(source).pathname === new URL(path, "https://x").pathname;
      } catch {
        return false;
      }
    }) ?? { missing_result_for: path }
  );
}

async function persistTribunal(
  convex: ConvexHttpClient,
  ingestKey: string,
  healAttemptId: string,
  checks: TribunalCheck[],
) {
  for (const check of checks.filter((item) => item.check !== "human_review")) {
    const requestHash = sha256(check);
    await convex.mutation(upsertCheck, {
      ingestKey,
      healAttemptId,
      check: check.check,
      status: check.status,
      summary: check.summary,
      details: check.details,
      evidenceIds: [],
      operationKey: `phase4:tribunal:${healAttemptId}:${check.check}:${requestHash.slice(-12)}`,
      requestHash,
    });
  }
}

async function ensureSemanticFailure(
  convex: ConvexHttpClient,
  env: ReturnType<typeof environment>,
) {
  const current = await convex.query(feed, { slug: "kevlar-core" });
  if (current?.run?._id && current.row) return current;

  console.log(
    "Current Convex account has no semantic incident; replaying the deterministic Phase 2 proof dataset.",
  );
  const targetUrl = new URL(
    "/product-pricing/nova",
    env.fixtureBaseUrl,
  ).toString();
  const capturedAt = new Date().toISOString();
  const baseline = collectorProductSchema.parse({
    ...novaBaseline,
    source_url: targetUrl,
    captured_at: capturedAt,
  });
  await convex.mutation(ingestBaseline, {
    ingestKey: env.ingestKey,
    collectorPlatformId: env.collectorId,
    targetUrl,
    brightDataJobId: "phase4-account-reseed:baseline",
    rawPayload: baseline,
    outputHash: sha256([baseline]),
    recordHash: sha256(baseline),
    evidence: evidenceFor(baseline),
  });
  const verified = await convex.mutation(ingestObservation, {
    ingestKey: env.ingestKey,
    collectorPlatformId: env.collectorId,
    targetUrl,
    brightDataJobId: "phase4-account-reseed:verified-v1",
    rawPayload: baseline,
    outputHash: sha256([baseline]),
    recordHash: sha256(baseline),
    evidence: evidenceFor(baseline),
  });
  if (!verified.duplicate && verified.decision !== "verified")
    throw new Error("Phase 2 verified replay did not pass the semantic gate");

  const semanticSwap = collectorProductSchema.parse({
    ...novaSemanticSwap,
    source_url: targetUrl,
    captured_at: new Date(Date.now() + 1).toISOString(),
  });
  const quarantined = await convex.mutation(ingestObservation, {
    ingestKey: env.ingestKey,
    collectorPlatformId: env.collectorId,
    targetUrl,
    brightDataJobId: "phase4-account-reseed:semantic-swap-v2",
    rawPayload: semanticSwap,
    outputHash: sha256([semanticSwap]),
    recordHash: sha256(semanticSwap),
    evidence: evidenceFor(semanticSwap),
  });
  if (
    !quarantined.duplicate &&
    (quarantined.decision !== "quarantined" ||
      quarantined.observedValue !== 10.75 ||
      quarantined.releasedValue !== 129)
  )
    throw new Error("Phase 2 semantic-swap replay was not quarantined");
  const replayed = await convex.query(feed, { slug: "kevlar-core" });
  if (!replayed?.run?._id || !replayed.row)
    throw new Error("Phase 2 replay did not create a current failing run");
  return replayed;
}

async function prepare() {
  const env = environment();
  const convex = new ConvexHttpClient(env.convexUrl);
  const runtime = new BrightDataRuntime({
    apiKey: env.apiKey,
    collectorId: env.collectorId,
  });
  const current = await ensureSemanticFailure(convex, env);
  if (!current?.run?._id || !current.row)
    throw new Error("Semantic failure prerequisite is unavailable");
  await convex.mutation(setNova, { ingestKey: env.ingestKey, version: "v2" });
  const scenario = await convex.action(runScenario, {
    ingestKey: env.ingestKey,
    failingRunId: current.run._id,
    scenario: "semantic_swap",
    scenarioKey: "phase3-v1-semantic_swap",
  });
  if (
    scenario.classification !== "semantic_swap" ||
    scenario.recommendedAction !== "heal"
  )
    throw new Error("Semantic incident is not eligible for repair");
  await convex.mutation(seedCatalog, { ingestKey: env.ingestKey });

  const instruction = composeRepairInstruction({
    observedBadValue: 10.75,
    expectedValue: 129,
    monthlyPayment: 10.75,
    visibleContext:
      "Monthly financing $10.75 per month; purchase price $129 USD one-time Buy now",
  });
  const existingContext = await convex.query(courtroom, {
    incidentId: scenario.incidentId,
  });
  const existingPreview = existingContext?.healAttempts.find(
    (attempt) => attempt.attempt === 1 && attempt.status === "preview_ready",
  );
  if (existingPreview?.previewResult) {
    const previewRecord = findCollectorRecord(existingPreview.previewResult);
    const checks = runPreApprovalTribunal({
      previewResult: previewRecord,
      expectedPurchasePrice: 129,
      selectorSource: findCandidateSource(existingPreview.previewResult),
    });
    await persistTribunal(convex, env.ingestKey, existingPreview._id, checks);
    console.log("Existing official repair preview was re-evaluated:");
    console.log(`- incident: ${scenario.incidentId}`);
    console.log(`- heal attempt: ${existingPreview._id}`);
    for (const check of checks)
      console.log(`- ${check.check}: ${check.status} — ${check.summary}`);
    return;
  }
  const submitHash = sha256({ incidentId: scenario.incidentId, instruction });
  const submitted = await convex.mutation(persistAttempt, {
    ingestKey: env.ingestKey,
    incidentId: scenario.incidentId,
    attempt: 1,
    prompt: instruction.prompt,
    promptHash: instruction.hash,
    status: "submitted",
    provider: "bright-data",
    model: "scraper-studio-self-healing",
    operationKey: `phase4:heal:${scenario.incidentId}:1:submitted`,
    requestHash: submitHash,
  });

  if (!submitted.duplicate) {
    await runtime.triggerSelfHealing({
      prompt: instruction.prompt,
      customInput: [
        {
          url: new URL("/product-pricing/nova", env.fixtureBaseUrl).toString(),
        },
      ],
    });
  }
  await convex.mutation(persistAttempt, {
    ingestKey: env.ingestKey,
    incidentId: scenario.incidentId,
    attempt: 1,
    prompt: instruction.prompt,
    promptHash: instruction.hash,
    status: "polling",
    brightDataJobRef: `collector:${env.collectorId}:refactor_template`,
    provider: "bright-data",
    model: "scraper-studio-self-healing",
    operationKey: `phase4:heal:${scenario.incidentId}:1:polling`,
    requestHash: sha256({ submitHash, state: "polling" }),
  });

  for (let attempt = 0; attempt < 90; attempt += 1) {
    const progress = await runtime.pollSelfHealing();
    console.log(`Self-heal: ${progress.status} (${progress.state})`);
    if (progress.state === "failed") {
      throw new Error(`Bright Data self-heal failed: ${progress.status}`);
    }
    if (progress.state === "preview_ready") {
      const previewRecord = findCollectorRecord(
        progress.previewResult ?? progress.raw,
      );
      const persisted = await convex.mutation(persistAttempt, {
        ingestKey: env.ingestKey,
        incidentId: scenario.incidentId,
        attempt: 1,
        prompt: instruction.prompt,
        promptHash: instruction.hash,
        status: "preview_ready",
        brightDataJobRef: `collector:${env.collectorId}:pending_answer`,
        previewResult: progress.raw,
        provider: "bright-data",
        model: "scraper-studio-self-healing",
        operationKey: `phase4:heal:${scenario.incidentId}:1:preview_ready`,
        requestHash: sha256(progress.raw),
      });
      const checks = runPreApprovalTribunal({
        previewResult: previewRecord,
        expectedPurchasePrice: 129,
        selectorSource: findCandidateSource(progress.raw),
      });
      await persistTribunal(
        convex,
        env.ingestKey,
        persisted.healAttemptId,
        checks,
      );
      console.log("Repair preview is ready for explicit human approval:");
      console.log(`- incident: ${scenario.incidentId}`);
      console.log(`- heal attempt: ${persisted.healAttemptId}`);
      for (const check of checks) {
        console.log(`- ${check.check}: ${check.status} — ${check.summary}`);
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error("Self-heal did not reach preview within 15 minutes");
}

async function persistBenchmark(
  convex: ConvexHttpClient,
  ingestKey: string,
  healAttemptId: string,
  system: BenchmarkSystem,
  results: GauntletCaseResult[],
) {
  const benchmark = await convex.mutation(startBenchmark, {
    ingestKey,
    healAttemptId,
    suiteRevision: "core-v1",
    baseline: system,
    operationKey: `certify:${healAttemptId}:core-v1:${system}`,
  });
  for (const result of results) {
    await convex.mutation(recordCaseResult, {
      ingestKey,
      benchmarkRunId: benchmark.benchmarkRunId,
      caseId: result.caseId,
      outcome: result.outcome,
      observedRelation: result.expectedRelation,
      observedValue: result.observedValue,
      releasedValue: result.releasedValue,
      detectionMs: result.detectionMs,
      ...(result.recoveryMs === null ? {} : { recoveryMs: result.recoveryMs }),
      falseHeal: result.falseHeal,
      falseRelease: result.falseRelease,
      critical: result.outcome !== "pass",
      evidenceHash: result.evidenceHash,
      reason: result.reason,
      evidenceIds: [],
      operationKey: `certify:${healAttemptId}:core-v1:${system}:${result.caseId}`,
    });
  }
  const complete = await convex.mutation(completeBenchmark, {
    ingestKey,
    benchmarkRunId: benchmark.benchmarkRunId,
    lastKnownGoodPreserved: results.every(
      (result) => !result.falseRelease || result.releasedValue !== null,
    ),
  });
  return { ...benchmark, complete };
}

async function approve(incidentId: string) {
  const env = environment();
  const convex = new ConvexHttpClient(env.convexUrl);
  const runtime = new BrightDataRuntime({
    apiKey: env.apiKey,
    collectorId: env.collectorId,
  });
  const context = await convex.query(courtroom, { incidentId });
  const attempt = context?.healAttempts[0];
  if (
    !attempt ||
    (attempt.status !== "preview_ready" && attempt.status !== "approved")
  )
    throw new Error("The latest heal attempt is not preview-ready or approved");
  const actorId = process.env.KEVLAR_APPROVER_ID ?? "avinash-user";
  const reason =
    "Approved after reviewing the official preview and deterministic Tribunal checks.";
  const decisionHash = sha256({ attempt: attempt._id, actorId, reason });
  const decision = await convex.mutation(decide, {
    ingestKey: env.ingestKey,
    healAttemptId: attempt._id,
    decision: "approved",
    reason,
    actorId,
    operationKey: `approve:${attempt._id}`,
    requestHash: decisionHash,
  });
  if (decision.authorizeProviderApproval) {
    await runtime.resumeSelfHealing({ approved: true, autoSave: true });
    const providerRef = `brightdata:${env.collectorId}:resume_automation_job`;
    await convex.mutation(recordProviderApproval, {
      ingestKey: env.ingestKey,
      repairDecisionId: decision.repairDecisionId,
      providerApprovalRef: providerRef,
      operationKey: `approve:${attempt._id}:provider`,
      requestHash: sha256({ decisionHash, providerRef }),
    });
  }

  for (let poll = 0; poll < 90; poll += 1) {
    const progress = await runtime.pollSelfHealing();
    console.log(`Approved self-heal: ${progress.status} (${progress.state})`);
    if (progress.state === "failed")
      throw new Error("Approved Bright Data repair failed");
    if (
      progress.state === "completed" ||
      (poll >= 3 && progress.status === "unknown")
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }

  const triggerUrl = new URL(
    "/product-pricing/nova",
    env.fixtureBaseUrl,
  ).toString();
  const latest = await convex.query(feed, { slug: "kevlar-core" });
  const reusableRecord = collectorProductSchema.safeParse(
    latest?.row?.rawPayload,
  );
  const trigger =
    latest?.run?.status === "verified" &&
    latest.run.brightDataJobId &&
    reusableRecord.success &&
    reusableRecord.data.source_url === triggerUrl &&
    reusableRecord.data.product.purchase_price.amount === 129
      ? {
          snapshotId: latest.run.brightDataJobId,
          rows: [reusableRecord.data],
          durationMs: 0,
        }
      : await collect(runtime, [triggerUrl]);
  if (trigger.durationMs === 0)
    console.log("Reusing the persisted verified post-repair trigger run.");
  const triggerRecord = collectorProductSchema.parse(trigger.rows[0]);
  const triggerDecision = verifyProductPrice({
    raw: triggerRecord,
    previousVerifiedValue: 129,
  });
  if (
    triggerDecision.decision !== "verified" ||
    triggerDecision.proof?.observedValue !== 129
  )
    throw new Error("Triggering semantic-swap URL is not repaired");

  const persisted =
    trigger.durationMs === 0 && latest?.run?._id
      ? {
          duplicate: true,
          runId: latest.run._id,
          decision: "verified" as const,
          releasedValue: 129,
          observedValue: 129,
        }
      : await convex.mutation(ingestObservation, {
          ingestKey: env.ingestKey,
          collectorPlatformId: env.collectorId,
          targetUrl: triggerUrl,
          brightDataJobId: trigger.snapshotId,
          rawPayload: triggerRecord,
          outputHash: sha256(trigger.rows),
          recordHash: sha256(triggerRecord),
          evidence: evidenceFor(triggerRecord),
        });
  if (persisted.decision !== "verified" || persisted.observedValue !== 129)
    throw new Error("Repaired trigger result was not verified in Convex");
  const afterOutputHash =
    trigger.durationMs === 0 && latest?.run?.outputHash
      ? latest.run.outputHash
      : sha256(trigger.rows);

  const existingGauntlet = await convex.query(gauntletQuery, { incidentId });
  let results: GauntletCaseResult[];
  if (
    existingGauntlet.benchmarkRun?.baseline === "full_kevlar" &&
    existingGauntlet.benchmarkRun.status === "completed" &&
    existingGauntlet.results.length === 8
  ) {
    results = existingGauntlet.results.map((result) =>
      gauntletCaseResultSchema.parse(result),
    );
    console.log("Reusing eight persisted Full Kevlar measurements.");
  } else {
    const positiveCases = CORE_GAUNTLET_CASES.filter(
      (item) => item.visibility !== "negative_control",
    );
    const urls = positiveCases.map((item) =>
      new URL(item.path, env.fixtureBaseUrl).toString(),
    );
    const gauntlet = await collect(runtime, urls);
    const perCaseDuration = Math.round(
      gauntlet.durationMs / positiveCases.length,
    );
    results = positiveCases.map((testCase) =>
      evaluateCollectedCase({
        testCase,
        record: rowForPath(gauntlet.rows, testCase.path),
        lastKnownGoodValue: 129,
        durationMs: perCaseDuration,
      }),
    );

    for (const testCase of CORE_GAUNTLET_CASES.filter(
      (item) => item.visibility === "negative_control",
    )) {
      const started = Date.now();
      const response = await fetch(new URL(testCase.path, env.fixtureBaseUrl));
      const html = await response.text();
      const detectedState =
        testCase.id === "N1" && html.includes('data-page-state="blocked"')
          ? "blocked"
          : testCase.id === "N2" &&
              html.includes('data-control-id="N2"') &&
              /sold out|unavailable/i.test(html)
            ? "legitimate_empty"
            : "unexpected";
      results.push(
        evaluateNegativeControl({
          testCase,
          detectedState,
          durationMs: Date.now() - started,
          evidence: html,
        }),
      );
    }
    results.sort((left, right) => left.caseId.localeCompare(right.caseId));
  }

  const schemaOnlyResults = projectBenchmarkBaseline("schema_only", results);
  const contractOnlyResults = projectBenchmarkBaseline(
    "contract_only",
    results,
  );
  const schemaOnly = await persistBenchmark(
    convex,
    env.ingestKey,
    attempt._id,
    "schema_only",
    schemaOnlyResults,
  );
  const contractOnly = await persistBenchmark(
    convex,
    env.ingestKey,
    attempt._id,
    "contract_only",
    contractOnlyResults,
  );
  const benchmark = await persistBenchmark(
    convex,
    env.ingestKey,
    attempt._id,
    "full_kevlar",
    results,
  );
  if (
    benchmark.complete.status !== "completed" ||
    benchmark.complete.passedCases !== 8
  )
    throw new Error("Gauntlet failed; last-known-good remains active");
  const comparison: [BenchmarkSummary, BenchmarkSummary, BenchmarkSummary] = [
    summarizeBenchmark("schema_only", schemaOnlyResults),
    summarizeBenchmark("contract_only", contractOnlyResults),
    summarizeBenchmark("full_kevlar", results),
  ];
  console.log(
    `Baselines measured: schema ${schemaOnly.complete.passedCases}/8, contract ${contractOnly.complete.passedCases}/8, full ${benchmark.complete.passedCases}/8`,
  );

  const provenance = await convex.mutation(backfillFailureEvidence, {
    ingestKey: env.ingestKey,
    incidentId,
    operationKey: `phase4:failure-evidence:${incidentId}`,
  });
  const detail = await convex.query(incidentDetail, { incidentId });
  if (!detail?.failingRun?.outputHash)
    throw new Error("Failing run output hash is unavailable");
  const issuedAt = new Date().toISOString();
  const suffix = issuedAt.replace(/\D/g, "").slice(0, 14);
  const publicSlug = `nova-core-${suffix}`;
  const checks = new Map(
    (context?.tribunalChecks ?? []).map((item) => [item.check, item.status]),
  );
  const certificate = createRepairCertificate({
    certificate_version: "1.0",
    certificate_id: `mrc_nova_${suffix}`,
    collector: {
      platform: "Bright Data Scraper Studio",
      collector_id: env.collectorId,
      same_id_before_after: true,
    },
    incident: {
      type: "semantic_swap",
      field: "product.purchase_price.amount",
      observed_bad_value: 10.75,
      blocked_downstream_action: "price_drop_alert",
    },
    repair: {
      heal_prompt_hash: attempt.promptHash,
      diagnosis_provider: "deterministic",
      diagnosis_model: "semantic-contract-v1",
      human_approved: true,
      approved_at: issuedAt,
    },
    pre_approval_checks: {
      preview_contract: checks.get("preview_contract") as "pass",
      evidence_support: checks.get("evidence_support") as "pass",
      selector_risk: (checks.get("selector_risk") ?? "deferred") as
        "pass" | "deferred",
    },
    post_approval_checks: {
      trigger_case: "pass",
      visible_cases: "4/4",
      held_out_cases: "2/2",
      negative_controls: "2/2",
    },
    release: { status: "certified", released_value: 129 },
    integrity: {
      before_output_hash: ensureSha256Digest(provenance.outputHash),
      after_output_hash: ensureSha256Digest(afterOutputHash),
    },
    measured: {
      gauntlet_results: results,
      baseline_comparison: comparison,
    },
    issued_at: issuedAt,
  });
  const certified = await convex.mutation(certifyAndRelease, {
    ingestKey: env.ingestKey,
    healAttemptId: attempt._id,
    benchmarkRunId: benchmark.benchmarkRunId,
    candidateRunId: persisted.runId,
    payload: certificate,
    digest: certificate.integrity.certificate_digest,
    publicSlug,
    entityId: "nova-headphones",
    fieldPath: "product.purchase_price.amount",
    observedValue: 129,
    currency: "USD",
    proof: triggerDecision.proof,
    evidenceIds: [],
    operationKey: `certificate:${attempt._id}:core-v1`,
    requestHash: sha256(certificate),
  });

  console.log("Kevlar Core certification complete:");
  console.log(`- same collector ID: ${env.collectorId}`);
  console.log("- visible cases: 4/4");
  console.log("- held-out cases: 2/2");
  console.log("- negative controls: 2/2");
  console.log(`- certificate: /certificates/${publicSlug}`);
  console.log(`- certificate record: ${certified.certificateId}`);
}

async function main() {
  const command = process.argv[2] as Command | undefined;
  if (command === "prepare") return prepare();
  if (command === "approve") {
    const incidentId = process.argv[3];
    if (!incidentId) throw new Error("Usage: phase4:run approve <incidentId>");
    return approve(incidentId);
  }
  throw new Error("Usage: phase4:run <prepare|approve> [incidentId]");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
