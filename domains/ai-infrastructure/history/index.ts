import { sha256 } from "@kevlar/hashing";

export type FactVersionState = "released" | "withheld" | "conflicted";
export type FactFieldState = "verified" | "quarantined" | "needs_review" | "last_known_good" | "stale";
export type ValidTimeSource = "explicit" | "publication_time" | "observation_time" | "unknown";

export type FactProvenance = {
  canonicalObservationId: string;
  canonicalObservationFieldId: string;
  sourceObservationId: string;
  sourcePaths: string[];
  evidenceRefs: string[];
  semanticContractId: string;
  mappingRevisionId: string;
  collectorBindingId: string;
  collectorRunId?: string;
  certificateId?: string;
};

export type FactVersion = {
  id: string;
  operationKey: string;
  projectId: string;
  entityId: string;
  predicate: string;
  value: unknown;
  valueHash: string;
  unit?: string;
  validFrom?: number;
  validTimeSource: ValidTimeSource;
  transactionFrom: number;
  verifiedAt: number;
  state: FactVersionState;
  fieldState: FactFieldState;
  releaseDecisionId: string;
  provenance: FactProvenance;
  createdAt: number;
};

export type FactTransition = {
  id: string;
  operationKey: string;
  kind: "supersession" | "correction" | "retraction";
  previousFactVersionId: string;
  nextFactVersionId?: string;
  transactionAt: number;
  externalEffectiveAt?: number;
  reason: string;
};

export type BitemporalFactHistory = {
  versions: FactVersion[];
  transitions: FactTransition[];
};

export type CurrentFact = {
  projectId: string;
  entityId: string;
  predicate: string;
  factVersionId: string;
  valueHash: string;
  state: "released" | "last_known_good" | "stale" | "conflicted";
  stale: boolean;
  lastVerifiedAt: number;
  freshnessDeadline: number;
  lagMs: number;
  affectedSourceCount: number;
  regeneratedAt: number;
};

export type FreshnessPolicy = {
  predicate: string;
  freshnessMs: number;
  sourceHealthy: boolean;
  affectedSourceCount: number;
};

type AppendFactInput = Omit<
  FactVersion,
  "id" | "valueHash" | "createdAt" | "state"
> & {
  releaseState?: FactVersionState;
  intent: "initial" | "real_change" | "correction";
  previousFactVersionId?: string;
  reason: string;
};

function factKey(fact: Pick<FactVersion, "projectId" | "entityId" | "predicate">) {
  return `${fact.projectId}:${fact.entityId}:${fact.predicate}`;
}

function assertProvenance(provenance: FactProvenance) {
  const required = [
    provenance.canonicalObservationId,
    provenance.canonicalObservationFieldId,
    provenance.sourceObservationId,
    provenance.semanticContractId,
    provenance.mappingRevisionId,
    provenance.collectorBindingId,
  ];
  if (required.some((value) => !value)) throw new Error("Fact provenance is incomplete.");
  if (provenance.sourcePaths.length === 0 || provenance.evidenceRefs.length === 0) {
    throw new Error("Every fact requires source paths and evidence references.");
  }
}

function releasedVersionIdsAt(history: BitemporalFactHistory, transactionAt: number) {
  const released = new Set(
    history.versions
      .filter((version) => version.transactionFrom <= transactionAt && version.state === "released")
      .map((version) => version.id),
  );
  for (const transition of history.transitions
    .filter((item) => item.transactionAt <= transactionAt)
    .sort((left, right) => left.transactionAt - right.transactionAt)) {
    if (transition.kind === "correction" || transition.kind === "retraction") {
      released.delete(transition.previousFactVersionId);
    }
  }
  return released;
}

export function appendFactVersion(
  history: BitemporalFactHistory,
  input: AppendFactInput,
) {
  if (history.versions.some((version) => version.operationKey === input.operationKey)) {
    const existing = history.versions.find((version) => version.operationKey === input.operationKey)!;
    return { history, version: existing, transition: history.transitions.find((item) => item.nextFactVersionId === existing.id), duplicate: true };
  }
  assertProvenance(input.provenance);
  const canRelease = input.fieldState === "verified" || input.fieldState === "last_known_good";
  const state = canRelease ? (input.releaseState ?? "released") : "withheld";
  const valueHash = sha256(input.value);
  const id = sha256([input.operationKey, input.entityId, input.predicate, valueHash, input.transactionFrom]);
  const version: FactVersion = {
    id,
    operationKey: input.operationKey,
    projectId: input.projectId,
    entityId: input.entityId,
    predicate: input.predicate,
    value: structuredClone(input.value),
    valueHash,
    unit: input.unit,
    validFrom: input.validFrom,
    validTimeSource: input.validTimeSource,
    transactionFrom: input.transactionFrom,
    verifiedAt: input.verifiedAt,
    state,
    fieldState: input.fieldState,
    releaseDecisionId: input.releaseDecisionId,
    provenance: structuredClone(input.provenance),
    createdAt: input.transactionFrom,
  };

  const priorVersions = history.versions.filter((item) => factKey(item) === factKey(version));
  if (input.intent === "initial" && priorVersions.some((item) => item.state === "released")) {
    throw new Error("Initial fact already exists for this entity and predicate.");
  }
  if (input.intent !== "initial") {
    if (!input.previousFactVersionId) throw new Error(`${input.intent} requires a previous fact version.`);
    const previous = history.versions.find((item) => item.id === input.previousFactVersionId);
    if (!previous || factKey(previous) !== factKey(version)) throw new Error("Previous fact version is missing or belongs to another fact.");
    if (input.intent === "real_change" && input.validFrom === undefined) {
      throw new Error("A real external change requires a validFrom time.");
    }
  }

  let transition: FactTransition | undefined;
  if (input.intent !== "initial" && state === "released") {
    transition = {
      id: sha256(["fact-transition", input.operationKey]),
      operationKey: `${input.operationKey}:transition`,
      kind: input.intent === "correction" ? "correction" : "supersession",
      previousFactVersionId: input.previousFactVersionId!,
      nextFactVersionId: version.id,
      transactionAt: input.transactionFrom,
      externalEffectiveAt: input.intent === "real_change" ? input.validFrom : undefined,
      reason: input.reason,
    };
  }
  return {
    history: {
      versions: [...history.versions, version],
      transitions: transition ? [...history.transitions, transition] : [...history.transitions],
    },
    version,
    transition,
    duplicate: false,
  };
}

export function retractFactVersion(
  history: BitemporalFactHistory,
  input: { factVersionId: string; transactionAt: number; operationKey: string; reason: string },
) {
  const existing = history.transitions.find((item) => item.operationKey === input.operationKey);
  if (existing) return { history, transition: existing, duplicate: true };
  if (!history.versions.some((version) => version.id === input.factVersionId)) {
    throw new Error("Cannot retract an unknown fact version.");
  }
  const transition: FactTransition = {
    id: sha256(["fact-retraction", input.operationKey]),
    operationKey: input.operationKey,
    kind: "retraction",
    previousFactVersionId: input.factVersionId,
    transactionAt: input.transactionAt,
    reason: input.reason,
  };
  return {
    history: { versions: [...history.versions], transitions: [...history.transitions, transition] },
    transition,
    duplicate: false,
  };
}

function selectedVersionAtTransaction(
  history: BitemporalFactHistory,
  key: string,
  transactionAt: number,
) {
  const releasedIds = releasedVersionIdsAt(history, transactionAt);
  return history.versions
    .filter((version) => factKey(version) === key && releasedIds.has(version.id))
    .sort((left, right) => right.transactionFrom - left.transactionFrom)[0];
}

export function regenerateCurrentFacts(
  history: BitemporalFactHistory,
  policies: FreshnessPolicy[],
  now: number,
): CurrentFact[] {
  const keys = [...new Set(history.versions.map(factKey))];
  return keys.flatMap((key) => {
    const version = selectedVersionAtTransaction(history, key, now);
    if (!version) return [];
    const policy = policies.find((item) => item.predicate === version.predicate) ?? {
      predicate: version.predicate,
      freshnessMs: Number.MAX_SAFE_INTEGER,
      sourceHealthy: true,
      affectedSourceCount: 1,
    };
    const freshnessDeadline = version.verifiedAt + policy.freshnessMs;
    const stale = now > freshnessDeadline;
    const state = version.state === "conflicted"
      ? "conflicted"
      : stale && !policy.sourceHealthy
        ? "last_known_good"
        : stale
          ? "stale"
          : "released";
    return [{
      projectId: version.projectId,
      entityId: version.entityId,
      predicate: version.predicate,
      factVersionId: version.id,
      valueHash: version.valueHash,
      state,
      stale,
      lastVerifiedAt: version.verifiedAt,
      freshnessDeadline,
      lagMs: Math.max(0, now - version.verifiedAt),
      affectedSourceCount: policy.affectedSourceCount,
      regeneratedAt: now,
    } satisfies CurrentFact];
  });
}

export function queryBelievedAt(
  history: BitemporalFactHistory,
  input: { projectId: string; entityId: string; predicate: string; transactionAt: number },
) {
  return selectedVersionAtTransaction(
    history,
    `${input.projectId}:${input.entityId}:${input.predicate}`,
    input.transactionAt,
  ) ?? null;
}

export function queryValidAt(
  history: BitemporalFactHistory,
  input: {
    projectId: string;
    entityId: string;
    predicate: string;
    validAt: number;
    believedAtTransaction: number;
  },
) {
  const key = `${input.projectId}:${input.entityId}:${input.predicate}`;
  const releasedIds = releasedVersionIdsAt(history, input.believedAtTransaction);
  const candidates = history.versions
    .filter((version) =>
      factKey(version) === key &&
      releasedIds.has(version.id) &&
      version.transactionFrom <= input.believedAtTransaction &&
      (version.validFrom ?? version.verifiedAt) <= input.validAt,
    )
    .sort((left, right) => {
      const validDifference = (right.validFrom ?? right.verifiedAt) - (left.validFrom ?? left.verifiedAt);
      return validDifference || right.transactionFrom - left.transactionFrom;
    });
  return candidates[0] ?? null;
}

export function classifyFactTransition(transition: FactTransition) {
  if (transition.kind === "correction") return "fact.corrected" as const;
  if (transition.kind === "retraction") return "fact.retracted" as const;
  return "fact.changed" as const;
}

export function assertCurrentFactsRegenerate(
  history: BitemporalFactHistory,
  persisted: CurrentFact[],
  policies: FreshnessPolicy[],
  now: number,
) {
  const regenerated = regenerateCurrentFacts(history, policies, now);
  const comparable = (facts: CurrentFact[]) => facts
    .map(({ regeneratedAt: _regeneratedAt, ...fact }) => fact)
    .sort((left, right) => `${left.entityId}:${left.predicate}`.localeCompare(`${right.entityId}:${right.predicate}`));
  return {
    matches: sha256(comparable(regenerated)) === sha256(comparable(persisted)),
    regenerated,
  };
}
