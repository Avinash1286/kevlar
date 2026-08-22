import { describe, expect, it } from "vitest";
import {
  appendFactVersion,
  assertCurrentFactsRegenerate,
  classifyFactTransition,
  queryBelievedAt,
  queryValidAt,
  regenerateCurrentFacts,
  retractFactVersion,
  type BitemporalFactHistory,
  type FactProvenance,
} from "../../domains/ai-infrastructure/src/index";

const day = 86_400_000;
const october1 = Date.UTC(2026, 9, 1);
const october3 = Date.UTC(2026, 9, 3);
const october4 = Date.UTC(2026, 9, 4);
const october10 = Date.UTC(2026, 9, 10);
const october11 = Date.UTC(2026, 9, 11);
const october12 = Date.UTC(2026, 9, 12);

const provenance: FactProvenance = {
  canonicalObservationId: "observation_price_1",
  canonicalObservationFieldId: "field_price_1",
  sourceObservationId: "source_observation_price_1",
  sourcePaths: ["records[0].input_price.amount"],
  evidenceRefs: ["evidence_price_context_1"],
  semanticContractId: "contract_ai_infrastructure_pricing_v1",
  mappingRevisionId: "mapping_openai_pricing_r1",
  collectorBindingId: "collector_openai_pricing",
  collectorRunId: "run_openai_pricing_1",
  certificateId: "certificate_openai_pricing_1",
};

function buildHistory() {
  const empty: BitemporalFactHistory = { versions: [], transitions: [] };
  const mistaken = appendFactVersion(empty, {
    operationKey: "price:mistaken",
    projectId: "project_kevlar",
    entityId: "model_openai_gpt_4o",
    predicate: "model.input_price_usd_per_million_tokens",
    value: 0.05,
    unit: "usd_per_million_input_tokens",
    validFrom: october1,
    validTimeSource: "explicit",
    transactionFrom: october3,
    verifiedAt: october3,
    fieldState: "verified",
    releaseDecisionId: "release_price_mistaken",
    provenance,
    intent: "initial",
    reason: "Initial extraction was believed correct.",
  });
  const corrected = appendFactVersion(mistaken.history, {
    operationKey: "price:correction",
    projectId: "project_kevlar",
    entityId: "model_openai_gpt_4o",
    predicate: "model.input_price_usd_per_million_tokens",
    value: 0.5,
    unit: "usd_per_million_input_tokens",
    validFrom: october1,
    validTimeSource: "explicit",
    transactionFrom: october4,
    verifiedAt: october4,
    fieldState: "verified",
    releaseDecisionId: "release_price_correction",
    provenance: { ...provenance, canonicalObservationId: "observation_price_correction" },
    intent: "correction",
    previousFactVersionId: mistaken.version.id,
    reason: "Independent evidence proved a decimal extraction error.",
  });
  const changed = appendFactVersion(corrected.history, {
    operationKey: "price:real-change",
    projectId: "project_kevlar",
    entityId: "model_openai_gpt_4o",
    predicate: "model.input_price_usd_per_million_tokens",
    value: 0.4,
    unit: "usd_per_million_input_tokens",
    validFrom: october10,
    validTimeSource: "explicit",
    transactionFrom: october11,
    verifiedAt: october11,
    fieldState: "verified",
    releaseDecisionId: "release_price_change",
    provenance: { ...provenance, canonicalObservationId: "observation_price_change" },
    intent: "real_change",
    previousFactVersionId: corrected.version.id,
    reason: "Provider published a new effective price.",
  });
  return { mistaken, corrected, changed };
}

describe("Phase 7 append-only bitemporal history", () => {
  it("preserves corrected beliefs and distinguishes them from external changes", () => {
    const { mistaken, corrected, changed } = buildHistory();
    expect(changed.history.versions).toHaveLength(3);
    expect(changed.history.versions[0].value).toBe(0.05);
    expect(classifyFactTransition(corrected.transition!)).toBe("fact.corrected");
    expect(classifyFactTransition(changed.transition!)).toBe("fact.changed");
    expect(mistaken.history.versions).toHaveLength(1);
    expect(corrected.history.versions).toHaveLength(2);
  });

  it("queries transaction belief separately from external valid time", () => {
    const { changed } = buildHistory();
    const beforeCorrection = queryBelievedAt(changed.history, {
      projectId: "project_kevlar",
      entityId: "model_openai_gpt_4o",
      predicate: "model.input_price_usd_per_million_tokens",
      transactionAt: october3 + day / 2,
    });
    const afterCorrection = queryBelievedAt(changed.history, {
      projectId: "project_kevlar",
      entityId: "model_openai_gpt_4o",
      predicate: "model.input_price_usd_per_million_tokens",
      transactionAt: october4 + day / 2,
    });
    expect(beforeCorrection?.value).toBe(0.05);
    expect(afterCorrection?.value).toBe(0.5);

    const externallyBeforeChange = queryValidAt(changed.history, {
      projectId: "project_kevlar",
      entityId: "model_openai_gpt_4o",
      predicate: "model.input_price_usd_per_million_tokens",
      validAt: october4,
      believedAtTransaction: october12,
    });
    const externallyAfterChange = queryValidAt(changed.history, {
      projectId: "project_kevlar",
      entityId: "model_openai_gpt_4o",
      predicate: "model.input_price_usd_per_million_tokens",
      validAt: october10,
      believedAtTransaction: october12,
    });
    expect(externallyBeforeChange?.value).toBe(0.5);
    expect(externallyAfterChange?.value).toBe(0.4);
  });

  it("regenerates the current projection exactly and idempotently", () => {
    const { corrected, changed } = buildHistory();
    const policies = [{
      predicate: "model.input_price_usd_per_million_tokens",
      freshnessMs: 7 * day,
      sourceHealthy: true,
      affectedSourceCount: 1,
    }];
    const current = regenerateCurrentFacts(changed.history, policies, october12);
    expect(current).toHaveLength(1);
    expect(current[0].factVersionId).toBe(changed.version.id);
    expect(current[0].state).toBe("released");
    expect(assertCurrentFactsRegenerate(changed.history, current, policies, october12).matches).toBe(true);

    const duplicate = appendFactVersion(changed.history, {
      operationKey: "price:real-change",
      projectId: "project_kevlar",
      entityId: "model_openai_gpt_4o",
      predicate: "model.input_price_usd_per_million_tokens",
      value: 0.4,
      unit: "usd_per_million_input_tokens",
      validFrom: october10,
      validTimeSource: "explicit",
      transactionFrom: october11,
      verifiedAt: october11,
      fieldState: "verified",
      releaseDecisionId: "release_price_change",
      provenance,
      intent: "real_change",
      previousFactVersionId: corrected.version.id,
      reason: "retry",
    });
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.history.versions).toHaveLength(3);
  });

  it("labels a stale fallback as last-known-good after a retraction", () => {
    const { corrected, changed } = buildHistory();
    const retracted = retractFactVersion(changed.history, {
      factVersionId: changed.version.id,
      transactionAt: october12,
      operationKey: "price:retract-change",
      reason: "New source run was invalidated; keep prior verified fact.",
    });
    const current = regenerateCurrentFacts(retracted.history, [{
      predicate: "model.input_price_usd_per_million_tokens",
      freshnessMs: day,
      sourceHealthy: false,
      affectedSourceCount: 1,
    }], october12 + day);
    expect(current[0].factVersionId).toBe(corrected.version.id);
    expect(current[0].state).toBe("last_known_good");
    expect(current[0].stale).toBe(true);
  });

  it("withholds partially verified or quarantined fields from current facts", () => {
    const result = appendFactVersion({ versions: [], transitions: [] }, {
      operationKey: "model:status:quarantined",
      projectId: "project_kevlar",
      entityId: "model_openai_gpt_4o",
      predicate: "model.status",
      value: "retired",
      validTimeSource: "observation_time",
      transactionFrom: october3,
      verifiedAt: october3,
      fieldState: "quarantined",
      releaseDecisionId: "release_status_withheld",
      provenance,
      intent: "initial",
      reason: "Source field did not pass verification.",
    });
    expect(result.version.state).toBe("withheld");
    expect(regenerateCurrentFacts(result.history, [], october4)).toEqual([]);
  });

  it("requires a complete provenance path for every fact", () => {
    expect(() => appendFactVersion({ versions: [], transitions: [] }, {
      operationKey: "missing:evidence",
      projectId: "project_kevlar",
      entityId: "product_nova",
      predicate: "offer.price.amount",
      value: 129,
      unit: "USD",
      validTimeSource: "observation_time",
      transactionFrom: october3,
      verifiedAt: october3,
      fieldState: "verified",
      releaseDecisionId: "release_product_fixture",
      provenance: { ...provenance, evidenceRefs: [] },
      intent: "initial",
      reason: "Fixture backfill.",
    })).toThrow(/evidence references/i);
  });
});
