import { sha256 } from "@kevlar/hashing";

export type ProvenanceNodeType =
  | "Source"
  | "Endpoint"
  | "Collector"
  | "CollectorVersion"
  | "Run"
  | "RawRecord"
  | "SourceField"
  | "Violation"
  | "Observation"
  | "CanonicalField"
  | "Entity"
  | "FactVersion"
  | "ChangeEvent"
  | "HealAttempt"
  | "TribunalCheck"
  | "MutationRun"
  | "RepairCertificate"
  | "HumanDecision"
  | "Delivery";

export type ProvenanceRelationship =
  | "COLLECTED_FROM"
  | "PRODUCED_BY"
  | "NORMALIZED_FROM"
  | "MAPPED_FROM"
  | "SUPPORTED_BY"
  | "CONTRADICTED_BY"
  | "RESOLVED_TO"
  | "SUPERSEDES"
  | "CORRECTS"
  | "TRIGGERED"
  | "CERTIFIED_BY"
  | "DELIVERED_TO"
  | "RETRACTS";

export type ProvenanceNode = {
  id: string;
  projectId: string;
  nodeType: ProvenanceNodeType;
  refId: string;
  label: string;
  integrityDigest: string;
  metadata: Record<string, unknown>;
  createdAt: number;
};

export type ProvenanceEdge = {
  id: string;
  projectId: string;
  fromNodeId: string;
  relationship: ProvenanceRelationship;
  toNodeId: string;
  metadata: Record<string, unknown>;
  createdAt: number;
};

export type EvidenceGraph = {
  nodes: ProvenanceNode[];
  edges: ProvenanceEdge[];
};

export function addProvenanceNode(
  graph: EvidenceGraph,
  input: Omit<ProvenanceNode, "id" | "integrityDigest"> & {
    payload: unknown;
  },
) {
  const existing = graph.nodes.find(
    (node) =>
      node.projectId === input.projectId &&
      node.nodeType === input.nodeType &&
      node.refId === input.refId,
  );
  if (existing) return { graph, node: existing, duplicate: true };
  const node: ProvenanceNode = {
    id: sha256(["provenance-node", input.projectId, input.nodeType, input.refId]),
    projectId: input.projectId,
    nodeType: input.nodeType,
    refId: input.refId,
    label: input.label,
    integrityDigest: sha256(input.payload),
    metadata: structuredClone(input.metadata),
    createdAt: input.createdAt,
  };
  return {
    graph: { ...graph, nodes: [...graph.nodes, node] },
    node,
    duplicate: false,
  };
}

export function addProvenanceEdge(
  graph: EvidenceGraph,
  input: Omit<ProvenanceEdge, "id">,
) {
  if (!graph.nodes.some((node) => node.id === input.fromNodeId))
    throw new Error("Provenance edge source node is missing.");
  if (!graph.nodes.some((node) => node.id === input.toNodeId))
    throw new Error("Provenance edge target node is missing.");
  const id = sha256([
    "provenance-edge",
    input.projectId,
    input.fromNodeId,
    input.relationship,
    input.toNodeId,
  ]);
  const existing = graph.edges.find((edge) => edge.id === id);
  if (existing) return { graph, edge: existing, duplicate: true };
  const edge: ProvenanceEdge = { ...structuredClone(input), id };
  return {
    graph: { ...graph, edges: [...graph.edges, edge] },
    edge,
    duplicate: false,
  };
}

export function findEvidencePath(
  graph: EvidenceGraph,
  fromNodeId: string,
  targetTypes: ProvenanceNodeType[] = [
    "Observation",
    "Run",
    "Source",
    "RepairCertificate",
  ],
) {
  const queue: Array<{ nodeId: string; path: string[] }> = [
    { nodeId: fromNodeId, path: [fromNodeId] },
  ];
  const visited = new Set<string>();
  const found = new Map<ProvenanceNodeType, string[]>();
  while (queue.length > 0 && found.size < targetTypes.length) {
    const current = queue.shift()!;
    if (visited.has(current.nodeId)) continue;
    visited.add(current.nodeId);
    const node = graph.nodes.find((item) => item.id === current.nodeId);
    if (!node) continue;
    if (targetTypes.includes(node.nodeType) && !found.has(node.nodeType))
      found.set(node.nodeType, current.path);
    const connected = graph.edges
      .filter((edge) => edge.fromNodeId === current.nodeId)
      .map((edge) => edge.toNodeId);
    for (const next of connected)
      queue.push({ nodeId: next, path: [...current.path, next] });
  }
  return Object.fromEntries(found);
}

export type EvidenceBundleArtifact = {
  name: string;
  mediaType: string;
  payload: unknown;
  digest: string;
};

export type EvidenceBundle = {
  schemaVersion: "kevlar.evidence-bundle.v1";
  bundleId: string;
  projectId: string;
  subjectType: "fact" | "event" | "repair";
  subjectId: string;
  artifacts: EvidenceBundleArtifact[];
  archiveRefs: Array<{
    kind: "screenshot" | "warc";
    ref: string;
    digest: string;
  }>;
  manifestDigest: string;
  createdAt: number;
};

export function buildEvidenceBundle(input: {
  projectId: string;
  subjectType: EvidenceBundle["subjectType"];
  subjectId: string;
  artifacts: Array<Omit<EvidenceBundleArtifact, "digest">>;
  archiveRefs?: EvidenceBundle["archiveRefs"];
  createdAt: number;
}) {
  const names = input.artifacts.map((artifact) => artifact.name);
  if (new Set(names).size !== names.length)
    throw new Error("Evidence bundle artifact names must be unique.");
  const artifacts = input.artifacts
    .map((artifact) => ({ ...structuredClone(artifact), digest: sha256(artifact.payload) }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const archiveRefs = [...(input.archiveRefs ?? [])].sort((left, right) =>
    left.ref.localeCompare(right.ref),
  );
  const manifest = {
    schemaVersion: "kevlar.evidence-bundle.v1" as const,
    projectId: input.projectId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    artifacts: artifacts.map(({ name, mediaType, digest }) => ({ name, mediaType, digest })),
    archiveRefs,
  };
  const manifestDigest = sha256(manifest);
  return {
    ...manifest,
    bundleId: sha256(["evidence-bundle", input.projectId, input.subjectType, input.subjectId, manifestDigest]),
    artifacts,
    manifestDigest,
    createdAt: input.createdAt,
  } satisfies EvidenceBundle;
}

export function verifyEvidenceBundle(bundle: EvidenceBundle) {
  const artifactsValid = bundle.artifacts.every(
    (artifact) => artifact.digest === sha256(artifact.payload),
  );
  const manifestDigest = sha256({
    schemaVersion: bundle.schemaVersion,
    projectId: bundle.projectId,
    subjectType: bundle.subjectType,
    subjectId: bundle.subjectId,
    artifacts: bundle.artifacts
      .map(({ name, mediaType, digest }) => ({ name, mediaType, digest }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    archiveRefs: [...bundle.archiveRefs].sort((left, right) =>
      left.ref.localeCompare(right.ref),
    ),
  });
  return artifactsValid && manifestDigest === bundle.manifestDigest;
}

export type BlastRadius = {
  incidentId: string;
  fields: string[];
  entities: string[];
  facts: string[];
  events: string[];
  subscribers: string[];
  downstreamConsumers: string[];
  withheldEventIds: string[];
  digest: string;
};

export function calculateBlastRadius(input: Omit<BlastRadius, "digest">) {
  const normalized = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...new Set(value)].sort() : value,
    ]),
  ) as Omit<BlastRadius, "digest">;
  return { ...normalized, digest: sha256(normalized) } satisfies BlastRadius;
}

export type CanaryStage =
  | "trigger"
  | "source_fixtures"
  | "held_out"
  | "live_subset"
  | "shadow"
  | "active";

export type CanaryResult = {
  stage: Exclude<CanaryStage, "active">;
  passed: boolean;
  criticalFailures: number;
  extractionAssertions: number;
  eventAssertions: number;
  falseEvents: number;
  heldOutCases: number;
  digest: string;
  recordedAt: number;
};

export type RepairCanary = {
  id: string;
  repairId: string;
  status: "canary" | "stopped" | "rolled_back" | "active";
  currentStage: CanaryStage;
  results: CanaryResult[];
  automaticStopReason?: string;
  withheldEventIds: string[];
  startedAt: number;
  activatedAt?: number;
};

const canaryStages: Exclude<CanaryStage, "active">[] = [
  "trigger",
  "source_fixtures",
  "held_out",
  "live_subset",
  "shadow",
];

export function beginRepairCanary(input: {
  repairId: string;
  startedAt: number;
  affectedEventIds: string[];
}) : RepairCanary {
  return {
    id: sha256(["repair-canary", input.repairId]),
    repairId: input.repairId,
    status: "canary",
    currentStage: "trigger",
    results: [],
    withheldEventIds: [...new Set(input.affectedEventIds)].sort(),
    startedAt: input.startedAt,
  };
}

export function recordCanaryResult(
  canary: RepairCanary,
  input: Omit<CanaryResult, "digest">,
) {
  if (canary.status !== "canary")
    throw new Error("Only a running canary can accept results.");
  if (input.stage !== canary.currentStage)
    throw new Error(`Expected ${canary.currentStage} canary result.`);
  const digest = sha256(input);
  const existing = canary.results.find(
    (result) => result.stage === input.stage && result.digest === digest,
  );
  if (existing) return { canary, result: existing, duplicate: true };
  const result = { ...input, digest };
  const failed =
    !input.passed ||
    input.criticalFailures > 0 ||
    input.falseEvents > 0 ||
    input.extractionAssertions === 0 ||
    input.eventAssertions === 0 ||
    (input.stage === "held_out" && input.heldOutCases === 0);
  if (failed) {
    return {
      canary: {
        ...canary,
        status: "rolled_back" as const,
        results: [...canary.results, result],
        automaticStopReason: `${input.stage}_activation_threshold_failed`,
      },
      result,
      duplicate: false,
    };
  }
  const index = canaryStages.indexOf(input.stage);
  const nextStage = canaryStages[index + 1] ?? "active";
  return {
    canary: {
      ...canary,
      currentStage: nextStage,
      results: [...canary.results, result],
    },
    result,
    duplicate: false,
  };
}

export function activateRepairCanary(canary: RepairCanary, activatedAt: number) {
  const passedStages = new Set(
    canary.results.filter((result) => result.passed).map((result) => result.stage),
  );
  if (
    canary.status !== "canary" ||
    canary.currentStage !== "active" ||
    !canaryStages.every((stage) => passedStages.has(stage))
  )
    throw new Error("All canary stages, including held-out tests, must pass before activation.");
  return {
    ...canary,
    status: "active" as const,
    withheldEventIds: [],
    activatedAt,
  };
}

export type FleetMutationKind =
  | "structural"
  | "semantic_decoy"
  | "rendering"
  | "identity"
  | "unit";

export type FleetMutationCase = {
  id: string;
  sourceArchetype: string;
  mutationKind: FleetMutationKind;
  heldOut: boolean;
  expectedExtraction: "same" | "changed" | "quarantined";
  expectedBusinessEvents: number;
  regressionSuite?: "product_pricing";
};

export type FleetMutationResult = FleetMutationCase & {
  extractionPassed: boolean;
  eventAssertionPassed: boolean;
  observedBusinessEvents: number;
  durationMs: number;
  passed: boolean;
  digest: string;
};

export function runFleetGauntlet(
  cases: FleetMutationCase[],
  evaluate: (testCase: FleetMutationCase) => {
    extractionPassed: boolean;
    observedBusinessEvents: number;
    durationMs: number;
  },
) {
  const requiredKinds: FleetMutationKind[] = [
    "structural",
    "semantic_decoy",
    "rendering",
    "identity",
    "unit",
  ];
  if (!requiredKinds.every((kind) => cases.some((item) => item.mutationKind === kind)))
    throw new Error("Fleet Gauntlet must cover every required mutation kind.");
  const results = cases.map((testCase) => {
    const observed = evaluate(testCase);
    const eventAssertionPassed =
      observed.observedBusinessEvents === testCase.expectedBusinessEvents;
    const passed = observed.extractionPassed && eventAssertionPassed;
    const base = { ...testCase, ...observed, eventAssertionPassed, passed };
    return { ...base, digest: sha256(base) } satisfies FleetMutationResult;
  });
  const heldOutPassed =
    results.some((result) => result.heldOut) &&
    results.filter((result) => result.heldOut).every((result) => result.passed);
  const productPricingRegressionPassed = results.some(
    (result) => result.regressionSuite === "product_pricing" && result.passed,
  );
  const passed =
    results.every((result) => result.passed) &&
    heldOutPassed &&
    productPricingRegressionPassed;
  const totalDurationMs = results.reduce((sum, result) => sum + result.durationMs, 0);
  return {
    results,
    passed,
    heldOutPassed,
    productPricingRegressionPassed,
    benchmark: {
      cases: results.length,
      passed: results.filter((result) => result.passed).length,
      falseEvents: results.filter((result) => !result.eventAssertionPassed).length,
      meanDurationMs: results.length === 0 ? 0 : totalDurationMs / results.length,
      digest: sha256(results.map((result) => result.digest)),
    },
  };
}

export function extendRepairCertificate(input: {
  certificate: Record<string, unknown>;
  affectedCanonicalFields: string[];
  affectedEntityIds: string[];
  evidenceBundle: EvidenceBundle;
  gauntlet: ReturnType<typeof runFleetGauntlet>;
  canary: RepairCanary;
}) {
  if (!verifyEvidenceBundle(input.evidenceBundle))
    throw new Error("Extended certificate requires a valid evidence bundle.");
  if (!input.gauntlet.passed || input.canary.status !== "active")
    throw new Error("Extended certificate requires a passing fleet gauntlet and active canary.");
  const extension = {
    affected_canonical_fields: [...new Set(input.affectedCanonicalFields)].sort(),
    affected_entity_count: new Set(input.affectedEntityIds).size,
    evidence_bundle_id: input.evidenceBundle.bundleId,
    evidence_manifest_digest: input.evidenceBundle.manifestDigest,
    fleet_gauntlet_digest: input.gauntlet.benchmark.digest,
    canary_id: input.canary.id,
  };
  return { ...structuredClone(input.certificate), fleet_extension: extension, digest: sha256(extension) };
}
