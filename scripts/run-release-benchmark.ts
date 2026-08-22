import { mkdir, readFile, writeFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import {
  CORE_GAUNTLET_CASES,
  evaluateCollectedCase,
  evaluateNegativeControl,
  projectBenchmarkBaseline,
  summarizeBenchmark,
  summarizeFullKevlar,
} from "../packages/certification/src/index";
import { classifyFailure, type TriageSignals } from "../packages/triage/src/index";
import { sha256 } from "../packages/hashing/src/index";
import {
  PHASE8_FIELD_RULES,
  detectSemanticChange,
  resolveIdentity,
  type CanonicalIdentity,
  type IdentityCandidateInput,
  type ReconciliationCandidate,
  type ReleasePolicy,
  type ReleasedFact,
} from "../domains/ai-infrastructure/src/index";
import { enqueueDelivery, recordDeliveryAttempt, replayDelivery } from "../packages/api-contracts/src/index";

const predicate = "model.input_price_usd_per_million_tokens";
const projectId = "benchmark:project";
const entityId = "benchmark:entity";

function timed<T>(run: () => T) {
  const started = performance.now();
  const value = run();
  return { value, latencyMs: performance.now() - started };
}

function candidate(value: unknown, overrides: Partial<ReconciliationCandidate> = {}): ReconciliationCandidate {
  return {
    observationId: `obs:${String(value)}:${overrides.sourceId ?? "pricing"}`,
    observationFieldId: `field:${String(value)}:${overrides.sourceId ?? "pricing"}`,
    sourceId: "source:pricing",
    sourceType: "official_pricing",
    organizationId: "openai",
    endpointId: "endpoint:pricing",
    evidenceHash: `evidence:${String(value)}:${overrides.sourceId ?? "pricing"}`,
    evidenceRefs: [`evidence-ref:${String(value)}`],
    predicate,
    value,
    trustState: "verified",
    observedAt: Date.UTC(2026, 7, 22, 10),
    validFrom: Date.UTC(2026, 7, 22, 9),
    fresh: true,
    ...overrides,
  };
}

function policy(): ReleasePolicy {
  return {
    id: "policy:benchmark:v1",
    predicate,
    strategy: "authoritative",
    sources: [
      { sourceType: "official_pricing", priority: 1 },
      { sourceType: "official_docs", priority: 2 },
    ],
    fieldRule: PHASE8_FIELD_RULES[predicate]!,
    continueLastKnownGood: true,
    openConflictOnDisagreement: true,
    removal: { requireExplicitStatement: true, minimumIndependentAbsences: 1, humanApprovalRequired: true },
  };
}

function previous(value = 5): ReleasedFact {
  return { id: `fact:${value}`, projectId, entityId, predicate, value, valueHash: sha256(value), validFrom: Date.UTC(2026, 7, 1) };
}

async function main() {
  const baseline = JSON.parse(await readFile("collectors/product-pricing/nova/samples/fixture-derived-baseline.json", "utf8"));
  const operationLatencies: number[] = [];
  const gauntletResults = CORE_GAUNTLET_CASES.map((testCase) => {
    const measurement = timed(() => {
      if (testCase.id === "N1") return evaluateNegativeControl({ testCase, detectedState: "blocked", durationMs: 0, evidence: { pageState: "blocked" } });
      if (testCase.id === "N2") return evaluateNegativeControl({ testCase, detectedState: "legitimate_empty", durationMs: 0, evidence: { availability: "out_of_stock" } });
      return evaluateCollectedCase({ testCase, record: { ...baseline, source_url: `https://fixture.test${testCase.path}` }, lastKnownGoodValue: 129, durationMs: 0 });
    });
    operationLatencies.push(measurement.latencyMs);
    return { ...measurement.value, detectionMs: Number(measurement.latencyMs.toFixed(4)), recoveryMs: measurement.value.recoveryMs === null ? null : Number(measurement.latencyMs.toFixed(4)) };
  });

  const triageCases: Array<{ name: string; input: TriageSignals; expected: string }> = [
    { name: "semantic swap", input: { semanticViolationCodes: ["semantic_swap"] }, expected: "semantic_swap" },
    { name: "transport failure", input: { httpStatus: 503 }, expected: "transport_failure" },
    { name: "soft block", input: { httpStatus: 403, pageState: "blocked", blockMarkers: ["challenge"] }, expected: "soft_block" },
    { name: "legitimate empty", input: { pageState: "empty", fieldMissing: true, optionalField: true, soldOut: true }, expected: "legitimate_empty" },
    { name: "dead page", input: { httpStatus: 404 }, expected: "dead_page" },
    { name: "render timing", input: { valueAppearedAfterMs: 8_000, renderDeadlineMs: 5_000 }, expected: "render_timing" },
    { name: "structural drift", input: { fieldMissing: true, selectorFailure: true, alternateEvidencePresent: true }, expected: "structural_drift" },
    { name: "A/B variant", input: { repeatedFetches: [{ domFingerprint: "a", fieldPresent: true, pageState: "ok" }, { domFingerprint: "b", fieldPresent: false, pageState: "ok" }] }, expected: "ab_variant" },
    { name: "unknown", input: {}, expected: "unknown" },
  ];
  const triageResults = triageCases.map((testCase) => {
    const measurement = timed(() => classifyFailure(testCase.input));
    operationLatencies.push(measurement.latencyMs);
    return { name: testCase.name, expected: testCase.expected, observed: measurement.value.classification, passed: measurement.value.classification === testCase.expected, latency_ms: Number(measurement.latencyMs.toFixed(4)) };
  });

  const canonical: CanonicalIdentity = { entityId: "entity:gpt-5.6-sol", entityType: "model", providerId: "openai", providerModelId: "gpt-5.6-sol", canonicalKey: "openai:gpt-5.6-sol", displayName: "GPT-5.6 Sol", family: "gpt-5.6", lifecycle: "active", externalIds: ["openai:gpt-5.6-sol"], aliases: ["gpt-5.6-sol"] };
  const identityCases: Array<{ expected: string; input: IdentityCandidateInput }> = [
    { expected: "auto_link", input: { entityType: "model", providerId: "openai", providerModelId: "gpt-5.6-sol", canonicalKey: "openai:gpt-5.6-sol", displayName: "GPT-5.6 Sol", family: "gpt-5.6", lifecycle: "active", externalIds: ["openai:gpt-5.6-sol"], candidateSource: "deterministic" } },
    { expected: "needs_review", input: { entityType: "model", providerId: "openai", canonicalKey: "openai:sol", displayName: "GPT 5.6 Sol", family: "gpt-5.6", lifecycle: "unknown", candidateSource: "deterministic" } },
    { expected: "needs_review", input: { entityType: "model", providerId: "openai", canonicalKey: "openai:sol-latest", displayName: "Sol latest", lifecycle: "unknown", candidateSource: "ai_suggestion" } },
  ];
  const identityResults = identityCases.map((testCase) => {
    const measurement = timed(() => resolveIdentity(testCase.input, [canonical]));
    operationLatencies.push(measurement.latencyMs);
    return { expected: testCase.expected, observed: measurement.value.decision, passed: measurement.value.decision === testCase.expected, latency_ms: Number(measurement.latencyMs.toFixed(4)) };
  });

  const eventCases = [
    { id: "layout-only", expected: "presentation_drift", run: () => detectSemanticChange({ projectId, entityId, predicate, previousFact: previous(), candidates: [candidate(5)], policy: policy(), observedAt: Date.UTC(2026, 7, 22, 10), previousPresentationHash: "old", nextPresentationHash: "new" }) },
    { id: "price-change", expected: "fact_updated", run: () => detectSemanticChange({ projectId, entityId, predicate, previousFact: previous(), nextFactVersionId: "fact:4", candidates: [candidate(4)], policy: policy(), observedAt: Date.UTC(2026, 7, 22, 10), validFrom: Date.UTC(2026, 7, 22, 9) }) },
    { id: "correction", expected: "fact_corrected", run: () => detectSemanticChange({ projectId, entityId, predicate, previousFact: previous(79), nextFactVersionId: "fact:129", candidates: [candidate(129)], policy: policy(), observedAt: Date.UTC(2026, 7, 22, 10), validFrom: Date.UTC(2026, 7, 20, 10), intent: "correction" }) },
    { id: "source-conflict", expected: "source_conflict_started", run: () => detectSemanticChange({ projectId, entityId, predicate, previousFact: previous(), candidates: [candidate(4), candidate(5, { sourceId: "source:docs", sourceType: "official_docs", organizationId: "openai-docs", endpointId: "endpoint:docs", evidenceHash: "evidence:docs" })], policy: policy(), observedAt: Date.UTC(2026, 7, 22, 10) }) },
  ];
  const eventResults = eventCases.map((testCase) => {
    const measurement = timed(testCase.run);
    operationLatencies.push(measurement.latencyMs);
    const observed = measurement.value.event?.eventType ?? null;
    return { id: testCase.id, expected: testCase.expected, observed, passed: observed === testCase.expected, business_event: measurement.value.event?.businessEvent ?? false, latency_ms: Number(measurement.latencyMs.toFixed(4)) };
  });

  const deliveryStarted = performance.now();
  const queued = enqueueDelivery([], { id: "delivery:release", idempotencyKey: "release:event", eventId: "event:release" });
  const delivered = recordDeliveryAttempt(queued.delivery, { ok: true, attemptedAt: 1 });
  let failed = recordDeliveryAttempt(enqueueDelivery([], { id: "delivery:failed", idempotencyKey: "release:failure", eventId: "event:failure" }).delivery, { ok: false, attemptedAt: 2, maxAttempts: 1 });
  failed = recordDeliveryAttempt(replayDelivery(failed, "delivery:replay"), { ok: true, attemptedAt: 3 });
  const deliveryLatency = performance.now() - deliveryStarted;
  operationLatencies.push(deliveryLatency);

  const sortedLatency = operationLatencies.slice().sort((a, b) => a - b);
  const percentile = (p: number) => sortedLatency[Math.min(sortedLatency.length - 1, Math.ceil(sortedLatency.length * p) - 1)]!;
  const schemaOnly = summarizeBenchmark("schema_only", projectBenchmarkBaseline("schema_only", gauntletResults));
  const contractOnly = summarizeBenchmark("contract_only", projectBenchmarkBaseline("contract_only", gauntletResults));
  const core = summarizeFullKevlar(gauntletResults);

  let measuredCostUsd: number | null = null;
  const convexUrl = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (convexUrl) {
    const proofRef = makeFunctionReference<"query", { key?: string }, { cost: null | { estimatedUsd: number } } | null>("phase11Proof:proof");
    measuredCostUsd = (await new ConvexHttpClient(convexUrl).query(proofRef, {}))?.cost?.estimatedUsd ?? null;
  }
  const semanticTruePositives = eventResults.filter((item) => item.passed && item.id !== "layout-only").length;
  const semanticPredictedPositives = eventResults.filter((item) => item.observed !== "presentation_drift" && item.observed !== null).length;
  const report = {
    schema_version: "kevlar.benchmark.v1",
    release: "v1.0.0",
    measured_at: new Date().toISOString(),
    fixture_revision: sha256(baseline),
    baselines: [
      { name: "schema_only", repair: schemaOnly },
      { name: "contract_only", repair: contractOnly },
      { name: "core_kevlar", repair: core },
      { name: "full_platform", repair: core, platform_checks: { triage: triageResults.length, identity: identityResults.length, semantic_events: eventResults.length, delivery: 2 } },
    ],
    metrics: {
      silent_corruption_catch_rate: { numerator: core.silentCorruptionCaught, denominator: 1, value: core.silentCorruptionCaught },
      correct_triage_rate: { numerator: triageResults.filter((item) => item.passed).length, denominator: triageResults.length, value: triageResults.filter((item) => item.passed).length / triageResults.length },
      false_heal_rate: { numerator: gauntletResults.filter((item) => item.falseHeal).length, denominator: gauntletResults.filter((item) => item.visibility === "negative_control").length, value: core.falseHealRate },
      held_out_pass_rate: { numerator: gauntletResults.filter((item) => item.visibility === "held_out" && item.outcome === "pass").length, denominator: gauntletResults.filter((item) => item.visibility === "held_out").length, value: core.heldOutPassRate },
      false_release_count: gauntletResults.filter((item) => item.falseRelease).length,
      semantic_event_precision: { numerator: semanticTruePositives, denominator: semanticPredictedPositives, value: semanticTruePositives / semanticPredictedPositives },
      entity_resolution_accuracy: { numerator: identityResults.filter((item) => item.passed).length, denominator: identityResults.length, value: identityResults.filter((item) => item.passed).length / identityResults.length },
      delivery_success: { first_attempt: delivered.state === "delivered", replay: failed.state === "delivered", value: delivered.state === "delivered" && failed.state === "delivered" ? 1 : 0 },
      deterministic_operation_latency_ms: { samples: sortedLatency.length, median: Number(percentile(0.5).toFixed(4)), p95: Number(percentile(0.95).toFixed(4)), max: Number(sortedLatency.at(-1)!.toFixed(4)) },
      measured_proof_cost_usd: measuredCostUsd,
    },
    cases: { gauntlet: gauntletResults, triage: triageResults, entity_resolution: identityResults, semantic_events: eventResults },
    limitations: ["The controlled benchmark is fixture-backed and contains one labeled silent-corruption case.", "Deterministic operation latency measures local Node.js execution, not browser collection or public API network latency.", "The cost value is the measured Phase 11 proof workload estimate, not a general production cost forecast."],
  };
  const failedCheckCount = gauntletResults.filter((item) => item.outcome !== "pass").length + triageResults.filter((item) => !item.passed).length + identityResults.filter((item) => !item.passed).length + eventResults.filter((item) => !item.passed).length;
  if (failedCheckCount || report.metrics.false_release_count !== 0 || report.metrics.delivery_success.value !== 1) throw new Error(`Benchmark failed ${failedCheckCount} labeled checks`);
  await mkdir("benchmarks/results", { recursive: true });
  await writeFile("benchmarks/results/v1.0.0.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Benchmark proof: ${gauntletResults.length + triageResults.length + identityResults.length + eventResults.length} labeled checks passed; false releases 0.`);
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
