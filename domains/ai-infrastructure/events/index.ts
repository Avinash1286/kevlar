import { sha256 } from "@kevlar/hashing";

export type SemanticChangeClass =
  | "fact_created"
  | "fact_updated"
  | "fact_removed"
  | "fact_corrected"
  | "entity_renamed"
  | "entity_merged"
  | "entity_split"
  | "entity_deprecated"
  | "entity_reactivated"
  | "source_conflict_started"
  | "source_conflict_resolved"
  | "presentation_drift"
  | "collector_repaired"
  | "temporary_unavailability"
  | "unknown";

export type EventState =
  | "pending"
  | "verified"
  | "released"
  | "withheld"
  | "superseded"
  | "retracted";

export type CandidateTrustState =
  | "verified"
  | "quarantined"
  | "needs_review";

export type ReconciliationStrategy =
  | "authoritative"
  | "quorum"
  | "ordered_fallback"
  | "human_review";

export type FieldEquivalenceRule =
  | {
      kind: "numeric";
      tolerancePercent?: number;
      toleranceAbsolute?: number;
    }
  | {
      kind: "text" | "identifier";
      collapseWhitespace?: boolean;
      caseInsensitive?: boolean;
      aliases?: Record<string, string>;
    }
  | { kind: "set"; caseInsensitive?: boolean }
  | { kind: "exact" };

export type ReconciliationCandidate = {
  observationId: string;
  observationFieldId: string;
  sourceId: string;
  sourceType: string;
  organizationId: string;
  endpointId?: string;
  evidenceHash: string;
  evidenceRefs: string[];
  predicate: string;
  value: unknown;
  trustState: CandidateTrustState;
  observedAt: number;
  validFrom?: number;
  fresh: boolean;
  explicitRemoval?: boolean;
};

export type SourcePolicyRule = {
  sourceId?: string;
  sourceType?: string;
  organizationId?: string;
  priority: number;
};

export type ReleasePolicy = {
  id: string;
  predicate: string;
  strategy: ReconciliationStrategy;
  sources: SourcePolicyRule[];
  quorum?: number;
  fieldRule: FieldEquivalenceRule;
  continueLastKnownGood: boolean;
  openConflictOnDisagreement: boolean;
  removal: {
    requireExplicitStatement: boolean;
    minimumIndependentAbsences: number;
    humanApprovalRequired: boolean;
  };
};

export type ReconciliationConflict = {
  id: string;
  entityId: string;
  predicate: string;
  status: "open" | "resolved" | "ignored";
  candidateObservationIds: string[];
  values: unknown[];
  reason: string;
  openedAt: number;
};

export type ReconciliationDecision = {
  outcome:
    | "release"
    | "no_change"
    | "withhold"
    | "conflict"
    | "continue_last_known_good";
  selected: ReconciliationCandidate | null;
  supporting: ReconciliationCandidate[];
  rejected: ReconciliationCandidate[];
  conflict: ReconciliationConflict | null;
  reasonCodes: string[];
};

export type ReleasedFact = {
  id: string;
  projectId: string;
  entityId: string;
  predicate: string;
  value: unknown;
  valueHash: string;
  validFrom?: number;
};

export type ChangeEvent = {
  id: string;
  eventId: string;
  eventHash: string;
  projectId: string;
  entityId: string;
  predicate?: string;
  eventType: SemanticChangeClass;
  state: EventState;
  businessEvent: boolean;
  previousFactVersionId?: string;
  nextFactVersionId?: string;
  previousValueHash?: string;
  nextValueHash?: string;
  before?: unknown;
  after?: unknown;
  validFrom?: number;
  observedAt: number;
  releasedAt?: number;
  sourceObservationIds: string[];
  evidenceRefs: string[];
  releasePolicyId: string;
  reasonCodes: string[];
  correctionOfEventId?: string;
  retractionOfEventId?: string;
  createdAt: number;
};

export type ChangeEventStore = {
  events: ChangeEvent[];
  conflicts: ReconciliationConflict[];
};

export type ChangeIntent =
  | "automatic"
  | "correction"
  | "rename"
  | "deprecation"
  | "reactivation"
  | "removal";

export type DetectChangeInput = {
  projectId: string;
  entityId: string;
  predicate: string;
  previousFact?: ReleasedFact;
  nextFactVersionId?: string;
  candidates: ReconciliationCandidate[];
  policy: ReleasePolicy;
  observedAt: number;
  validFrom?: number;
  intent?: ChangeIntent;
  humanRemovalApproved?: boolean;
  previousPresentationHash?: string;
  nextPresentationHash?: string;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function valueHash(value: unknown) {
  return sha256(stableValue(value));
}

function normalizeText(value: unknown, rule: Extract<FieldEquivalenceRule, { kind: "text" | "identifier" }>) {
  if (typeof value !== "string") return value;
  let normalized = rule.collapseWhitespace
    ? value.trim().replace(/\s+/g, " ")
    : value;
  if (rule.caseInsensitive) normalized = normalized.toLowerCase();
  const aliases = rule.aliases ?? {};
  return aliases[normalized] ?? normalized;
}

export function valuesEquivalent(
  left: unknown,
  right: unknown,
  rule: FieldEquivalenceRule,
) {
  if (rule.kind === "exact") return valueHash(left) === valueHash(right);
  if (rule.kind === "numeric") {
    if (typeof left !== "number" || typeof right !== "number") return false;
    const absoluteDifference = Math.abs(left - right);
    if (absoluteDifference <= (rule.toleranceAbsolute ?? 0)) return true;
    const scale = Math.max(Math.abs(left), Math.abs(right), Number.EPSILON);
    return (absoluteDifference / scale) * 100 <= (rule.tolerancePercent ?? 0);
  }
  if (rule.kind === "set") {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    const normalize = (item: unknown) =>
      rule.caseInsensitive && typeof item === "string"
        ? item.toLowerCase()
        : JSON.stringify(stableValue(item));
    const leftSet = [...new Set(left.map(normalize))].sort();
    const rightSet = [...new Set(right.map(normalize))].sort();
    return valueHash(leftSet) === valueHash(rightSet);
  }
  return normalizeText(left, rule) === normalizeText(right, rule);
}

function sourcePriority(candidate: ReconciliationCandidate, policy: ReleasePolicy) {
  const match = policy.sources.find(
    (rule) =>
      (!rule.sourceId || rule.sourceId === candidate.sourceId) &&
      (!rule.sourceType || rule.sourceType === candidate.sourceType) &&
      (!rule.organizationId || rule.organizationId === candidate.organizationId),
  );
  return match?.priority ?? Number.MAX_SAFE_INTEGER;
}

export function independentCandidates(candidates: ReconciliationCandidate[]) {
  const organizationsAndTypes = new Set<string>();
  const endpoints = new Set<string>();
  const evidencePayloads = new Set<string>();
  return candidates.filter((candidate) => {
    const organizationAndType = `${candidate.organizationId}:${candidate.sourceType}`;
    const sharesOrganizationAndType = organizationsAndTypes.has(organizationAndType);
    const sharesEndpoint = candidate.endpointId
      ? endpoints.has(candidate.endpointId)
      : false;
    const sharesEvidence = evidencePayloads.has(candidate.evidenceHash);
    if (sharesOrganizationAndType || sharesEndpoint || sharesEvidence)
      return false;
    organizationsAndTypes.add(organizationAndType);
    if (candidate.endpointId) endpoints.add(candidate.endpointId);
    evidencePayloads.add(candidate.evidenceHash);
    return true;
  });
}

function equivalenceGroups(
  candidates: ReconciliationCandidate[],
  rule: FieldEquivalenceRule,
) {
  const groups: ReconciliationCandidate[][] = [];
  for (const candidate of candidates) {
    const group = groups.find((items) =>
      valuesEquivalent(items[0]?.value, candidate.value, rule),
    );
    if (group) group.push(candidate);
    else groups.push([candidate]);
  }
  return groups;
}

function createConflict(
  entityId: string,
  predicate: string,
  candidates: ReconciliationCandidate[],
  reason: string,
) {
  const openedAt = Math.max(...candidates.map((item) => item.observedAt));
  return {
    id: sha256([
      "source-conflict",
      entityId,
      predicate,
      candidates.map((item) => item.observationId).sort(),
    ]),
    entityId,
    predicate,
    status: "open" as const,
    candidateObservationIds: candidates
      .map((item) => item.observationId)
      .sort(),
    values: candidates.map((item) => structuredClone(item.value)),
    reason,
    openedAt,
  };
}

export function reconcileCandidates(input: {
  entityId: string;
  candidates: ReconciliationCandidate[];
  policy: ReleasePolicy;
}) : ReconciliationDecision {
  if (input.policy.predicate !== input.candidates[0]?.predicate && input.candidates.length > 0) {
    throw new Error("Release policy must match the reconciled predicate.");
  }
  const eligible = independentCandidates(
    input.candidates.filter(
      (item) => item.trustState === "verified" && item.fresh,
    ),
  ).sort(
    (left, right) =>
      sourcePriority(left, input.policy) - sourcePriority(right, input.policy) ||
      right.observedAt - left.observedAt,
  );
  const rejected = input.candidates.filter((item) => !eligible.includes(item));
  if (eligible.length === 0) {
    return {
      outcome: input.policy.continueLastKnownGood
        ? "continue_last_known_good"
        : "withhold",
      selected: null,
      supporting: [],
      rejected,
      conflict: null,
      reasonCodes: ["no_fresh_verified_candidate"],
    };
  }
  const groups = equivalenceGroups(eligible, input.policy.fieldRule);
  if (input.policy.strategy === "human_review") {
    const conflict = createConflict(
      input.entityId,
      input.policy.predicate,
      eligible,
      "Predicate requires human review before release.",
    );
    return {
      outcome: groups.length > 1 ? "conflict" : "withhold",
      selected: null,
      supporting: [],
      rejected,
      conflict,
      reasonCodes: ["human_review_required"],
    };
  }
  if (groups.length > 1 && input.policy.openConflictOnDisagreement) {
    const conflict = createConflict(
      input.entityId,
      input.policy.predicate,
      eligible,
      "Fresh independent verified sources disagree beyond field tolerance.",
    );
    return {
      outcome: "conflict",
      selected: null,
      supporting: [],
      rejected,
      conflict,
      reasonCodes: [
        "verified_source_disagreement",
        ...(input.policy.continueLastKnownGood
          ? ["continue_last_known_good"]
          : []),
      ],
    };
  }
  if (input.policy.strategy === "quorum") {
    const quorum = input.policy.quorum ?? 2;
    const winner = groups
      .filter((group) => group.length >= quorum)
      .sort((left, right) => right.length - left.length)[0];
    if (!winner) {
      return {
        outcome: input.policy.continueLastKnownGood
          ? "continue_last_known_good"
          : "withhold",
        selected: null,
        supporting: [],
        rejected,
        conflict: groups.length > 1
          ? createConflict(
              input.entityId,
              input.policy.predicate,
              eligible,
              "No semantically equivalent independent source quorum exists.",
            )
          : null,
        reasonCodes: ["independent_quorum_not_met"],
      };
    }
    return {
      outcome: "release",
      selected: winner[0]!,
      supporting: winner,
      rejected,
      conflict: null,
      reasonCodes: ["independent_quorum_met"],
    };
  }
  const selected = eligible[0]!;
  const supporting = eligible.filter((item) =>
    valuesEquivalent(item.value, selected.value, input.policy.fieldRule),
  );
  return {
    outcome: "release",
    selected,
    supporting,
    rejected,
    conflict: null,
    reasonCodes: [
      input.policy.strategy === "authoritative"
        ? "highest_authority_verified_source"
        : "ordered_fallback_selected",
    ],
  };
}

function normalizedValidFrom(value: number | undefined) {
  return value === undefined ? "unknown" : Math.trunc(value);
}

export function deterministicEventId(input: {
  projectId: string;
  entityId: string;
  predicate?: string;
  previousValueHash?: string;
  nextValueHash?: string;
  validFrom?: number;
  eventType: SemanticChangeClass;
}) {
  return sha256([
    input.projectId,
    input.entityId,
    input.predicate ?? "entity",
    input.previousValueHash ?? "none",
    input.nextValueHash ?? "none",
    normalizedValidFrom(input.validFrom),
    input.eventType,
  ]);
}

function classifyEvent(
  input: DetectChangeInput,
  selected: ReconciliationCandidate,
) : SemanticChangeClass {
  if (!input.previousFact) return "fact_created";
  if (input.intent === "correction") return "fact_corrected";
  if (input.intent === "rename") return "entity_renamed";
  if (input.intent === "deprecation") return "entity_deprecated";
  if (input.intent === "reactivation") return "entity_reactivated";
  if (input.intent === "removal" || selected.explicitRemoval)
    return "fact_removed";
  return "fact_updated";
}

function buildEvent(input: {
  source: DetectChangeInput;
  eventType: SemanticChangeClass;
  state: EventState;
  businessEvent: boolean;
  candidate?: ReconciliationCandidate;
  reasonCodes: string[];
  sourceObservationIds?: string[];
  evidenceRefs?: string[];
  nextValueOverride?: unknown;
}) {
  const nextValue = input.nextValueOverride ?? input.candidate?.value;
  const nextHash = nextValue === undefined ? undefined : valueHash(nextValue);
  const validFrom = input.source.validFrom ?? input.candidate?.validFrom;
  const eventId = deterministicEventId({
    projectId: input.source.projectId,
    entityId: input.source.entityId,
    predicate: input.source.predicate,
    previousValueHash: input.source.previousFact?.valueHash,
    nextValueHash: nextHash,
    validFrom,
    eventType: input.eventType,
  });
  const payload = {
    eventId,
    eventType: input.eventType,
    projectId: input.source.projectId,
    entityId: input.source.entityId,
    predicate: input.source.predicate,
    previousValueHash: input.source.previousFact?.valueHash,
    nextValueHash: nextHash,
    validFrom,
    sourceObservationIds:
      input.sourceObservationIds ??
      (input.candidate ? [input.candidate.observationId] : []),
  };
  return {
    id: eventId,
    eventId,
    eventHash: sha256(payload),
    projectId: input.source.projectId,
    entityId: input.source.entityId,
    predicate: input.source.predicate,
    eventType: input.eventType,
    state: input.state,
    businessEvent: input.businessEvent,
    previousFactVersionId: input.source.previousFact?.id,
    nextFactVersionId: input.source.nextFactVersionId,
    previousValueHash: input.source.previousFact?.valueHash,
    nextValueHash: nextHash,
    before: structuredClone(input.source.previousFact?.value),
    after: structuredClone(nextValue),
    validFrom,
    observedAt: input.source.observedAt,
    releasedAt: input.state === "released" ? input.source.observedAt : undefined,
    sourceObservationIds: payload.sourceObservationIds,
    evidenceRefs:
      input.evidenceRefs ?? input.candidate?.evidenceRefs ?? [],
    releasePolicyId: input.source.policy.id,
    reasonCodes: input.reasonCodes,
    createdAt: input.source.observedAt,
  } satisfies ChangeEvent;
}

export function detectSemanticChange(input: DetectChangeInput) {
  const reconciliation = reconcileCandidates({
    entityId: input.entityId,
    candidates: input.candidates,
    policy: input.policy,
  });
  if (reconciliation.conflict) {
    const event = buildEvent({
      source: input,
      eventType: "source_conflict_started",
      state: "verified",
      businessEvent: true,
      reasonCodes: reconciliation.reasonCodes,
      sourceObservationIds: reconciliation.conflict.candidateObservationIds,
      evidenceRefs: input.candidates
        .filter((item) => item.trustState === "verified")
        .flatMap((item) => item.evidenceRefs),
      nextValueOverride: {
        conflictingValueHashes: input.candidates
          .filter((item) => item.trustState === "verified")
          .map((item) => valueHash(item.value))
          .sort(),
      },
    });
    return { reconciliation, event, suppressed: false };
  }
  const selected = reconciliation.selected;
  if (!selected) return { reconciliation, event: null, suppressed: true };
  if (
    input.previousFact &&
    valuesEquivalent(
      input.previousFact.value,
      selected.value,
      input.policy.fieldRule,
    )
  ) {
    const presentationChanged =
      input.previousPresentationHash !== undefined &&
      input.nextPresentationHash !== undefined &&
      input.previousPresentationHash !== input.nextPresentationHash;
    if (!presentationChanged)
      return {
        reconciliation: { ...reconciliation, outcome: "no_change" as const },
        event: null,
        suppressed: true,
      };
    return {
      reconciliation: { ...reconciliation, outcome: "no_change" as const },
      event: buildEvent({
        source: input,
        eventType: "presentation_drift",
        state: "verified",
        businessEvent: false,
        candidate: selected,
        reasonCodes: ["verified_fact_semantically_unchanged"],
      }),
      suppressed: true,
    };
  }
  if (input.intent === "removal" || selected.explicitRemoval) {
    const independentAbsences = independentCandidates(
      reconciliation.supporting.filter((item) => item.explicitRemoval),
    ).length;
    const removalAllowed =
      (!input.policy.removal.requireExplicitStatement ||
        selected.explicitRemoval === true) &&
      independentAbsences >=
        input.policy.removal.minimumIndependentAbsences &&
      (!input.policy.removal.humanApprovalRequired ||
        input.humanRemovalApproved === true);
    if (!removalAllowed)
      return {
        reconciliation: {
          ...reconciliation,
          outcome: input.policy.continueLastKnownGood
            ? ("continue_last_known_good" as const)
            : ("withhold" as const),
          reasonCodes: ["removal_policy_not_satisfied"],
        },
        event: null,
        suppressed: true,
      };
  }
  const eventType = classifyEvent(input, selected);
  return {
    reconciliation,
    event: buildEvent({
      source: input,
      eventType,
      state: "released",
      businessEvent: true,
      candidate: selected,
      reasonCodes: reconciliation.reasonCodes,
    }),
    suppressed: false,
  };
}

export function appendChangeEvent(store: ChangeEventStore, event: ChangeEvent) {
  const existing = store.events.find((item) => item.eventId === event.eventId);
  if (existing) return { store, event: existing, duplicate: true };
  return {
    store: { ...store, events: [...store.events, structuredClone(event)] },
    event,
    duplicate: false,
  };
}

export function appendConflict(
  store: ChangeEventStore,
  conflict: ReconciliationConflict,
) {
  if (store.conflicts.some((item) => item.id === conflict.id)) return store;
  return {
    ...store,
    conflicts: [...store.conflicts, structuredClone(conflict)],
  };
}

export function retractAndCorrectEvent(
  store: ChangeEventStore,
  input: {
    eventId: string;
    correctedEvent: ChangeEvent;
    reason: string;
    transactionAt: number;
  },
) {
  const original = store.events.find((item) => item.eventId === input.eventId);
  if (!original) throw new Error("Cannot retract an unknown event.");
  const alreadyCorrected = store.events.find(
    (item) => item.correctionOfEventId === original.eventId,
  );
  if (alreadyCorrected)
    return { store, original, correction: alreadyCorrected, duplicate: true };
  const retracted = {
    ...original,
    state: "retracted" as const,
    reasonCodes: [...original.reasonCodes, input.reason],
  };
  const correction: ChangeEvent = {
    ...input.correctedEvent,
    correctionOfEventId: original.eventId,
    reasonCodes: [...input.correctedEvent.reasonCodes, input.reason],
    observedAt: input.transactionAt,
    createdAt: input.transactionAt,
  };
  return {
    store: {
      ...store,
      events: [
        ...store.events.filter((item) => item.eventId !== original.eventId),
        retracted,
        correction,
      ],
    },
    original: retracted,
    correction,
    duplicate: false,
  };
}

export const PHASE8_FIELD_RULES: Record<string, FieldEquivalenceRule> = {
  "model.context_window_tokens": { kind: "numeric", toleranceAbsolute: 0 },
  "model.input_price_usd_per_million_tokens": {
    kind: "numeric",
    tolerancePercent: 0.001,
  },
  "model.display_name": {
    kind: "text",
    collapseWhitespace: true,
    caseInsensitive: false,
  },
  "model.status": {
    kind: "text",
    collapseWhitespace: true,
    caseInsensitive: true,
    aliases: { "generally available": "active", ga: "active" },
  },
  "model.regions": { kind: "set", caseInsensitive: true },
};
