import { describe, expect, it } from "vitest";
import { sha256 } from "../../packages/hashing/src/index";
import {
  appendChangeEvent,
  detectSemanticChange,
  independentCandidates,
  PHASE8_FIELD_RULES,
  reconcileCandidates,
  retractAndCorrectEvent,
  valuesEquivalent,
  type ChangeEventStore,
  type ReconciliationCandidate,
  type ReleasePolicy,
  type ReleasedFact,
} from "../../domains/ai-infrastructure/src/index";

const projectId = "project:kevlar";
const entityId = "entity:openai:gpt-4o";
const predicate = "model.input_price_usd_per_million_tokens";

function candidate(
  value: unknown,
  overrides: Partial<ReconciliationCandidate> = {},
): ReconciliationCandidate {
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

function policy(overrides: Partial<ReleasePolicy> = {}): ReleasePolicy {
  return {
    id: "policy:official-pricing:v1",
    predicate,
    strategy: "authoritative",
    sources: [
      { sourceType: "official_pricing", priority: 1 },
      { sourceType: "official_catalog", priority: 2 },
      { sourceType: "official_docs", priority: 3 },
    ],
    fieldRule: PHASE8_FIELD_RULES[predicate]!,
    continueLastKnownGood: true,
    openConflictOnDisagreement: true,
    removal: {
      requireExplicitStatement: true,
      minimumIndependentAbsences: 1,
      humanApprovalRequired: true,
    },
    ...overrides,
  };
}

function previous(value = 5): ReleasedFact {
  return {
    id: `fact:${value}`,
    projectId,
    entityId,
    predicate,
    value,
    valueHash: sha256(value),
    validFrom: Date.UTC(2026, 7, 1),
  };
}

describe("Phase 8 semantic CDC and reconciliation", () => {
  it("applies predicate-specific equivalence instead of a global tolerance", () => {
    expect(valuesEquivalent(5, 5.00004, PHASE8_FIELD_RULES[predicate]!)).toBe(
      true,
    );
    expect(
      valuesEquivalent(
        128_000,
        128_001,
        PHASE8_FIELD_RULES["model.context_window_tokens"]!,
      ),
    ).toBe(false);
    expect(
      valuesEquivalent(
        ["US", "eu"],
        ["EU", "us"],
        PHASE8_FIELD_RULES["model.regions"]!,
      ),
    ).toBe(true);
    expect(
      valuesEquivalent(
        "Generally available",
        "active",
        PHASE8_FIELD_RULES["model.status"]!,
      ),
    ).toBe(true);
  });

  it("records layout-only drift without releasing a business event", () => {
    const result = detectSemanticChange({
      projectId,
      entityId,
      predicate,
      previousFact: previous(),
      candidates: [candidate(5)],
      policy: policy(),
      observedAt: Date.UTC(2026, 7, 22, 10),
      previousPresentationHash: "sha256:old-layout",
      nextPresentationHash: "sha256:new-layout",
    });

    expect(result.suppressed).toBe(true);
    expect(result.event).toMatchObject({
      eventType: "presentation_drift",
      businessEvent: false,
      state: "verified",
    });
  });

  it("emits exactly one stable event for a verified price change across retries", () => {
    const input = {
      projectId,
      entityId,
      predicate,
      previousFact: previous(),
      nextFactVersionId: "fact:4",
      candidates: [candidate(4)],
      policy: policy(),
      observedAt: Date.UTC(2026, 7, 22, 10),
      validFrom: Date.UTC(2026, 7, 22, 9),
    } as const;
    const first = detectSemanticChange(input);
    const retry = detectSemanticChange(input);
    expect(first.event).toMatchObject({
      eventType: "fact_updated",
      businessEvent: true,
      state: "released",
    });
    expect(retry.event?.eventId).toBe(first.event?.eventId);

    const empty: ChangeEventStore = { events: [], conflicts: [] };
    const appended = appendChangeEvent(empty, first.event!);
    const duplicated = appendChangeEvent(appended.store, retry.event!);
    expect(duplicated.duplicate).toBe(true);
    expect(duplicated.store.events).toHaveLength(1);
  });

  it("blocks quarantined fields from producing events", () => {
    const result = detectSemanticChange({
      projectId,
      entityId,
      predicate,
      previousFact: previous(),
      candidates: [candidate(4, { trustState: "quarantined" })],
      policy: policy(),
      observedAt: Date.UTC(2026, 7, 22, 10),
    });
    expect(result.event).toBeNull();
    expect(result.reconciliation.outcome).toBe("continue_last_known_good");
  });

  it("opens a conflict when independent verified official sources disagree", () => {
    const pricing = candidate(4);
    const documentation = candidate(5, {
      observationId: "obs:docs:5",
      observationFieldId: "field:docs:5",
      sourceId: "source:docs",
      sourceType: "official_docs",
      organizationId: "openai-docs",
      endpointId: "endpoint:docs",
      evidenceHash: "evidence:docs:5",
    });
    const result = detectSemanticChange({
      projectId,
      entityId,
      predicate,
      previousFact: previous(),
      candidates: [pricing, documentation],
      policy: policy(),
      observedAt: Date.UTC(2026, 7, 22, 10),
    });

    expect(result.reconciliation.outcome).toBe("conflict");
    expect(result.reconciliation.conflict).toMatchObject({ status: "open" });
    expect(result.event).toMatchObject({
      eventType: "source_conflict_started",
      state: "verified",
    });
  });

  it("does not count copied evidence as independent quorum support", () => {
    const copied = candidate(4, { sourceId: "source:copied-page" });
    const original = candidate(4);
    copied.organizationId = original.organizationId;
    copied.sourceType = original.sourceType;
    copied.endpointId = original.endpointId;
    copied.evidenceHash = original.evidenceHash;
    expect(independentCandidates([original, copied])).toHaveLength(1);

    const decision = reconcileCandidates({
      entityId,
      candidates: [original, copied],
      policy: policy({
        strategy: "quorum",
        quorum: 2,
        openConflictOnDisagreement: false,
      }),
    });
    expect(decision.outcome).toBe("continue_last_known_good");
    expect(decision.reasonCodes).toContain("independent_quorum_not_met");
  });

  it("distinguishes a correction from a real-world change", () => {
    const result = detectSemanticChange({
      projectId,
      entityId,
      predicate,
      previousFact: previous(79),
      nextFactVersionId: "fact:corrected-129",
      candidates: [candidate(129)],
      policy: policy(),
      observedAt: Date.UTC(2026, 7, 22, 10),
      validFrom: Date.UTC(2026, 7, 20, 10),
      intent: "correction",
    });
    expect(result.event?.eventType).toBe("fact_corrected");
    expect(result.event?.reasonCodes).not.toContain("provider_changed");
  });

  it("classifies verified rename and deprecation transitions", () => {
    const nameRule = PHASE8_FIELD_RULES["model.display_name"]!;
    const namePolicy = policy({
      predicate: "model.display_name",
      fieldRule: nameRule,
      openConflictOnDisagreement: false,
    });
    const renamed = detectSemanticChange({
      projectId,
      entityId,
      predicate: "model.display_name",
      previousFact: {
        ...previous(),
        predicate: "model.display_name",
        value: "GPT 4 Omni",
        valueHash: sha256("GPT 4 Omni"),
      },
      candidates: [candidate("GPT-4o", { predicate: "model.display_name" })],
      policy: namePolicy,
      observedAt: Date.UTC(2026, 7, 22, 10),
      intent: "rename",
    });
    expect(renamed.event?.eventType).toBe("entity_renamed");

    const statusPolicy = policy({
      predicate: "model.status",
      fieldRule: PHASE8_FIELD_RULES["model.status"]!,
      openConflictOnDisagreement: false,
    });
    const deprecated = detectSemanticChange({
      projectId,
      entityId,
      predicate: "model.status",
      previousFact: {
        ...previous(),
        predicate: "model.status",
        value: "active",
        valueHash: sha256("active"),
      },
      candidates: [candidate("deprecated", { predicate: "model.status" })],
      policy: statusPolicy,
      observedAt: Date.UTC(2026, 7, 22, 10),
      intent: "deprecation",
    });
    expect(deprecated.event?.eventType).toBe("entity_deprecated");
  });

  it("never treats source absence alone as fact removal", () => {
    const missing = detectSemanticChange({
      projectId,
      entityId,
      predicate,
      previousFact: previous(),
      candidates: [],
      policy: policy(),
      observedAt: Date.UTC(2026, 7, 22, 10),
      intent: "removal",
    });
    expect(missing.event).toBeNull();
    expect(missing.reconciliation.outcome).toBe("continue_last_known_good");
  });

  it("retracts a bad event and appends a linked correction without deletion", () => {
    const bad = detectSemanticChange({
      projectId,
      entityId,
      predicate,
      previousFact: previous(129),
      candidates: [candidate(79)],
      policy: policy(),
      observedAt: Date.UTC(2026, 7, 19, 10),
      validFrom: Date.UTC(2026, 7, 19, 9),
    }).event!;
    const corrected = detectSemanticChange({
      projectId,
      entityId,
      predicate,
      previousFact: previous(79),
      candidates: [candidate(129)],
      policy: policy(),
      observedAt: Date.UTC(2026, 7, 20, 10),
      validFrom: Date.UTC(2026, 7, 19, 9),
      intent: "correction",
    }).event!;
    const store = appendChangeEvent({ events: [], conflicts: [] }, bad).store;
    const result = retractAndCorrectEvent(store, {
      eventId: bad.eventId,
      correctedEvent: corrected,
      reason: "extraction_error_corrected",
      transactionAt: Date.UTC(2026, 7, 20, 10),
    });
    expect(result.original.state).toBe("retracted");
    expect(result.correction.correctionOfEventId).toBe(bad.eventId);
    expect(result.store.events).toHaveLength(2);
  });
});
