import { describe, expect, it } from "vitest";
import baseline from "../../collectors/product-pricing/nova/samples/fixture-derived-baseline.json";
import {
  CORE_GAUNTLET_CASES,
  certificationCanRelease,
  composeRepairInstruction,
  createRepairCertificate,
  evaluateCollectedCase,
  evaluateNegativeControl,
  projectBenchmarkBaseline,
  reviewSelectorRisk,
  runPreApprovalTribunal,
  summarizeBenchmark,
  summarizeFullKevlar,
  verifyCertificateDigest,
  type BenchmarkSummary,
} from "../../packages/certification/src/index";

function measuredResults() {
  return CORE_GAUNTLET_CASES.map((testCase) => {
    if (testCase.id === "N1") {
      return evaluateNegativeControl({
        testCase,
        detectedState: "blocked",
        durationMs: 12,
        evidence: { pageState: "blocked" },
      });
    }
    if (testCase.id === "N2") {
      return evaluateNegativeControl({
        testCase,
        detectedState: "legitimate_empty",
        durationMs: 9,
        evidence: { availability: "out_of_stock" },
      });
    }
    return evaluateCollectedCase({
      testCase,
      record: {
        ...baseline,
        source_url: `https://fixture.test${testCase.path}`,
      },
      lastKnownGoodValue: 129,
      durationMs: 100,
    });
  });
}

describe("Repair Tribunal", () => {
  it("keeps held-out DOM details out of the repair instruction", () => {
    const instruction = composeRepairInstruction({
      observedBadValue: 10.75,
      expectedValue: 129,
      monthlyPayment: 10.75,
      visibleContext: "Monthly financing $10.75 per month",
    });

    expect(instruction.prompt.length).toBeLessThanOrEqual(1_000);
    expect(instruction.prompt).not.toMatch(
      /H1|H2|label split|delayed rendering/i,
    );
    expect(instruction.hash).toMatch(/^sha256:/);
  });

  it("checks schema, semantic evidence, and keeps approval human", () => {
    const checks = runPreApprovalTribunal({
      previewResult: baseline,
      expectedPurchasePrice: 129,
      selectorSource:
        "let purchase = $('[aria-label^=\"Purchase price\"]'); // jsonld product_api monthly",
    });

    expect(checks.map((item) => [item.check, item.status])).toEqual([
      ["preview_contract", "pass"],
      ["evidence_support", "pass"],
      ["selector_risk", "pass"],
      ["human_review", "needs_review"],
    ]);
  });

  it("marks selector review deferred when candidate code is unavailable", () => {
    expect(reviewSelectorRisk(null).status).toBe("deferred");
  });
});

describe("Held-Out Gauntlet", () => {
  it("passes all visible, held-out, and negative-control relations", () => {
    const results = measuredResults();
    expect(results).toHaveLength(8);
    expect(results.every((item) => item.outcome === "pass")).toBe(true);
    expect(
      results.filter((item) => item.visibility === "held_out"),
    ).toHaveLength(2);
    expect(results.filter((item) => item.falseHeal)).toHaveLength(0);
    expect(results.filter((item) => item.falseRelease)).toHaveLength(0);
  });

  it("derives deterministic measured comparison baselines", () => {
    const results = measuredResults();
    const schemaOnly = projectBenchmarkBaseline("schema_only", results);
    const contractOnly = projectBenchmarkBaseline("contract_only", results);

    expect(summarizeBenchmark("schema_only", schemaOnly)).toMatchObject({
      passedCases: 5,
      falseHealRate: 1,
      falseReleases: 1,
    });
    expect(summarizeBenchmark("contract_only", contractOnly)).toMatchObject({
      passedCases: 8,
      silentCorruptionCaught: 1,
      falseReleases: 0,
    });
    expect(schemaOnly.find((item) => item.caseId === "M4")).toMatchObject({
      outcome: "fail",
      observedValue: 10.75,
      releasedValue: 10.75,
    });
  });

  it("blocks certification if even one critical case fails", () => {
    const checks = runPreApprovalTribunal({
      previewResult: baseline,
      expectedPurchasePrice: 129,
    });
    const results = measuredResults();
    results[5] = { ...results[5]!, outcome: "fail" };

    expect(
      certificationCanRelease({
        tribunalChecks: checks,
        gauntletResults: results,
        humanApproved: true,
      }),
    ).toBe(false);
  });
});

describe("Metamorphic Repair Certificate", () => {
  it("binds measured results into a reproducible integrity digest", () => {
    const results = measuredResults();
    const full = summarizeFullKevlar(results);
    const schemaOnly = projectBenchmarkBaseline("schema_only", results);
    const contractOnly = projectBenchmarkBaseline("contract_only", results);
    const baselines: BenchmarkSummary[] = [
      summarizeBenchmark("schema_only", schemaOnly),
      summarizeBenchmark("contract_only", contractOnly),
      full,
    ];
    const certificate = createRepairCertificate({
      certificate_version: "1.0",
      certificate_id: "mrc_test",
      collector: {
        platform: "Bright Data Scraper Studio",
        collector_id: "c_test",
        same_id_before_after: true,
      },
      incident: {
        type: "semantic_swap",
        field: "product.purchase_price.amount",
        observed_bad_value: 10.75,
        blocked_downstream_action: "price_drop_alert",
      },
      repair: {
        heal_prompt_hash: "sha256:prompt",
        diagnosis_provider: "deterministic",
        diagnosis_model: "semantic-contract-v1",
        human_approved: true,
        approved_at: "2026-08-22T00:00:00.000Z",
      },
      pre_approval_checks: {
        preview_contract: "pass",
        evidence_support: "pass",
        selector_risk: "deferred",
      },
      post_approval_checks: {
        trigger_case: "pass",
        visible_cases: "4/4",
        held_out_cases: "2/2",
        negative_controls: "2/2",
      },
      release: { status: "certified", released_value: 129 },
      integrity: {
        before_output_hash: "sha256:before",
        after_output_hash: "sha256:after",
      },
      measured: { gauntlet_results: results, baseline_comparison: baselines },
      issued_at: "2026-08-22T00:05:00.000Z",
    });

    expect(verifyCertificateDigest(certificate)).toBe(true);
    expect(
      verifyCertificateDigest({
        ...certificate,
        release: { ...certificate.release, released_value: 130 },
      }),
    ).toBe(false);
  });
});
