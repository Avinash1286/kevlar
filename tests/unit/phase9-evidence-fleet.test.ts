import { describe, expect, it } from "vitest";
import {
  activateRepairCanary,
  addProvenanceEdge,
  addProvenanceNode,
  beginRepairCanary,
  buildEvidenceBundle,
  calculateBlastRadius,
  extendRepairCertificate,
  findEvidencePath,
  recordCanaryResult,
  runFleetGauntlet,
  verifyEvidenceBundle,
  type CanaryResult,
  type EvidenceGraph,
  type FleetMutationCase,
  type ProvenanceNodeType,
  type ProvenanceRelationship,
} from "../../domains/ai-infrastructure/src/index";

const now = Date.UTC(2026, 7, 22, 12);
const projectId = "project:kevlar";

function graphProof() {
  let graph: EvidenceGraph = { nodes: [], edges: [] };
  const refs: Array<[ProvenanceNodeType, string]> = [
    ["ChangeEvent", "evt_price_changed"],
    ["FactVersion", "fact_price_4"],
    ["Observation", "obs_openai_price_4"],
    ["Run", "run_openai_pricing"],
    ["Source", "source_openai_pricing"],
    ["RepairCertificate", "cert_openai_pricing"],
  ];
  const nodes = new Map<string, string>();
  for (const [nodeType, refId] of refs) {
    const added = addProvenanceNode(graph, {
      projectId,
      nodeType,
      refId,
      label: refId,
      metadata: {},
      payload: { refId, verified: true },
      createdAt: now,
    });
    graph = added.graph;
    nodes.set(refId, added.node.id);
  }
  const links: Array<[string, ProvenanceRelationship, string]> = [
    ["evt_price_changed", "TRIGGERED", "fact_price_4"],
    ["fact_price_4", "SUPPORTED_BY", "obs_openai_price_4"],
    ["obs_openai_price_4", "PRODUCED_BY", "run_openai_pricing"],
    ["run_openai_pricing", "COLLECTED_FROM", "source_openai_pricing"],
    ["fact_price_4", "CERTIFIED_BY", "cert_openai_pricing"],
  ];
  for (const [from, relationship, to] of links) {
    graph = addProvenanceEdge(graph, {
      projectId,
      fromNodeId: nodes.get(from)!,
      relationship,
      toNodeId: nodes.get(to)!,
      metadata: {},
      createdAt: now,
    }).graph;
  }
  return { graph, eventNodeId: nodes.get("evt_price_changed")! };
}

const passingResult = (
  stage: CanaryResult["stage"],
  overrides: Partial<Omit<CanaryResult, "digest">> = {},
): Omit<CanaryResult, "digest"> => ({
  stage,
  passed: true,
  criticalFailures: 0,
  extractionAssertions: 4,
  eventAssertions: 4,
  falseEvents: 0,
  heldOutCases: stage === "held_out" ? 2 : 0,
  recordedAt: now,
  ...overrides,
});

const cases: FleetMutationCase[] = [
  {
    id: "structural-wrapper",
    sourceArchetype: "product_pricing",
    mutationKind: "structural",
    heldOut: false,
    expectedExtraction: "same",
    expectedBusinessEvents: 0,
    regressionSuite: "product_pricing",
  },
  {
    id: "financing-decoy",
    sourceArchetype: "product_pricing",
    mutationKind: "semantic_decoy",
    heldOut: true,
    expectedExtraction: "same",
    expectedBusinessEvents: 0,
  },
  {
    id: "delayed-render",
    sourceArchetype: "official_pricing",
    mutationKind: "rendering",
    heldOut: true,
    expectedExtraction: "same",
    expectedBusinessEvents: 0,
  },
  {
    id: "model-id-swap",
    sourceArchetype: "model_catalog",
    mutationKind: "identity",
    heldOut: false,
    expectedExtraction: "quarantined",
    expectedBusinessEvents: 0,
  },
  {
    id: "token-unit-shift",
    sourceArchetype: "official_pricing",
    mutationKind: "unit",
    heldOut: false,
    expectedExtraction: "changed",
    expectedBusinessEvents: 1,
  },
];

function passingGauntlet() {
  return runFleetGauntlet(cases, (testCase) => ({
    extractionPassed: true,
    observedBusinessEvents: testCase.expectedBusinessEvents,
    durationMs: 100,
  }));
}

function activeCanary() {
  let canary = beginRepairCanary({
    repairId: "repair:nova-price",
    startedAt: now,
    affectedEventIds: ["evt_withheld"],
  });
  for (const stage of [
    "trigger",
    "source_fixtures",
    "held_out",
    "live_subset",
    "shadow",
  ] as const) {
    canary = recordCanaryResult(canary, passingResult(stage)).canary;
  }
  return activateRepairCanary(canary, now + 1_000);
}

describe("Phase 9 evidence graph and fleet repair", () => {
  it("provides a navigable evidence path for a released event", () => {
    const { graph, eventNodeId } = graphProof();
    const paths = findEvidencePath(graph, eventNodeId);
    expect(paths.Observation).toHaveLength(3);
    expect(paths.Run).toHaveLength(4);
    expect(paths.Source).toHaveLength(5);
    expect(paths.RepairCertificate).toHaveLength(3);
  });

  it("builds a deterministic evidence bundle and detects tampering", () => {
    const bundle = buildEvidenceBundle({
      projectId,
      subjectType: "event",
      subjectId: "evt_price_changed",
      artifacts: [
        { name: "event.json", mediaType: "application/json", payload: { after: 4 } },
        { name: "fact-before.json", mediaType: "application/json", payload: { value: 5 } },
        { name: "fact-after.json", mediaType: "application/json", payload: { value: 4 } },
      ],
      archiveRefs: [
        { kind: "screenshot", ref: "nova_page.png", digest: "sha256:screenshot" },
        { kind: "warc", ref: "warc://run_openai_pricing", digest: "sha256:warc" },
      ],
      createdAt: now,
    });
    expect(verifyEvidenceBundle(bundle)).toBe(true);
    const tampered = structuredClone(bundle);
    tampered.artifacts[0]!.payload = { after: 400 };
    expect(verifyEvidenceBundle(tampered)).toBe(false);
  });

  it("calculates a stable deduplicated incident blast radius", () => {
    const radius = calculateBlastRadius({
      incidentId: "incident:nova",
      fields: ["product.purchase_price.amount", "product.purchase_price.amount"],
      entities: ["nova-headphones"],
      facts: ["fact:129"],
      events: ["evt:price"],
      subscribers: ["sub:alerts"],
      downstreamConsumers: ["router:pricing"],
      withheldEventIds: ["evt:price"],
    });
    expect(radius.fields).toEqual(["product.purchase_price.amount"]);
    expect(radius.digest).toMatch(/^sha256:/);
  });

  it("always begins repair activation as a canary", () => {
    const canary = beginRepairCanary({
      repairId: "repair:nova",
      startedAt: now,
      affectedEventIds: ["evt:withheld"],
    });
    expect(canary).toMatchObject({ status: "canary", currentStage: "trigger" });
    expect(canary.withheldEventIds).toEqual(["evt:withheld"]);
  });

  it("cannot activate after only the trigger page passes", () => {
    const started = beginRepairCanary({ repairId: "repair:nova", startedAt: now, affectedEventIds: [] });
    const triggerPassed = recordCanaryResult(started, passingResult("trigger")).canary;
    expect(triggerPassed.currentStage).toBe("source_fixtures");
    expect(() => activateRepairCanary(triggerPassed, now + 1)).toThrow(
      "including held-out tests",
    );
  });

  it("requires held-out fleet tests before full release", () => {
    const canary = activeCanary();
    expect(canary.status).toBe("active");
    expect(canary.results.some((result) => result.stage === "held_out")).toBe(true);
    expect(canary.withheldEventIds).toEqual([]);
  });

  it("automatically rolls back a failed repair and keeps events withheld", () => {
    const started = beginRepairCanary({
      repairId: "repair:nova",
      startedAt: now,
      affectedEventIds: ["evt:unsafe"],
    });
    const failed = recordCanaryResult(
      started,
      passingResult("trigger", { passed: false, criticalFailures: 1 }),
    ).canary;
    expect(failed.status).toBe("rolled_back");
    expect(failed.automaticStopReason).toBe("trigger_activation_threshold_failed");
    expect(failed.withheldEventIds).toEqual(["evt:unsafe"]);
  });

  it("passes every fleet mutation class and the product-pricing regression", () => {
    const gauntlet = passingGauntlet();
    expect(gauntlet.passed).toBe(true);
    expect(gauntlet.heldOutPassed).toBe(true);
    expect(gauntlet.productPricingRegressionPassed).toBe(true);
    expect(gauntlet.benchmark).toMatchObject({ cases: 5, passed: 5, falseEvents: 0 });
  });

  it("fails certification when emitted-event behavior is wrong", () => {
    const gauntlet = runFleetGauntlet(cases, (testCase) => ({
      extractionPassed: true,
      observedBusinessEvents:
        testCase.id === "financing-decoy" ? 1 : testCase.expectedBusinessEvents,
      durationMs: 100,
    }));
    expect(gauntlet.passed).toBe(false);
    expect(gauntlet.benchmark.falseEvents).toBe(1);
  });

  it("extends a certificate only after bundle, gauntlet, and canary verification", () => {
    const bundle = buildEvidenceBundle({
      projectId,
      subjectType: "repair",
      subjectId: "repair:nova",
      artifacts: [{ name: "repair-certificate.json", mediaType: "application/json", payload: { status: "certified" } }],
      createdAt: now,
    });
    const certificate = extendRepairCertificate({
      certificate: { certificate_id: "mrc_nova" },
      affectedCanonicalFields: ["product.purchase_price.amount"],
      affectedEntityIds: ["nova-headphones"],
      evidenceBundle: bundle,
      gauntlet: passingGauntlet(),
      canary: activeCanary(),
    });
    expect(certificate.fleet_extension).toMatchObject({
      affected_entity_count: 1,
      evidence_bundle_id: bundle.bundleId,
    });
    expect(certificate.digest).toMatch(/^sha256:/);
  });
});
