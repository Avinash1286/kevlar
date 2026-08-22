import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const benchmark = JSON.parse(
  readFileSync("benchmarks/results/v1.0.1.json", "utf8"),
);
const e2e = JSON.parse(
  readFileSync("benchmarks/results/v1.0.1-e2e.json", "utf8"),
);
const load = JSON.parse(
  readFileSync("benchmarks/results/v1.0.1-load.json", "utf8"),
);

describe("Phase 12 release evidence", () => {
  it("contains all five measured baselines and no benchmark placeholders", () => {
    expect(
      benchmark.baselines.map((item: { name: string }) => item.name),
    ).toEqual([
      "schema_only",
      "source_semantic_contracts",
      "contracts_canonical_mapping",
      "full_kevlar_without_held_out_repair_tests",
      "full_kevlar",
    ]);
    expect(benchmark.baselines[2].canonical_mapping).toMatchObject({
      passed: true,
      mapped_records: 1,
      expected_records: 1,
    });
    expect(JSON.stringify(benchmark)).not.toMatch(
      /\b(?:todo|tbd|placeholder|coming soon)\b/i,
    );
  });

  it("supports every public benchmark claim with numerator and denominator", () => {
    expect(benchmark.metrics).toMatchObject({
      silent_corruption_catch_rate: { numerator: 1, denominator: 1, value: 1 },
      correct_triage_rate: { numerator: 9, denominator: 9, value: 1 },
      false_heal_rate: { numerator: 0, denominator: 2, value: 0 },
      held_out_pass_rate: { numerator: 2, denominator: 2, value: 1 },
      false_release_count: 0,
      semantic_event_precision: { numerator: 3, denominator: 3, value: 1 },
      semantic_event_recall: { numerator: 3, denominator: 3, value: 1 },
      entity_resolution_accuracy: { numerator: 3, denominator: 3, value: 1 },
      delivery_success: { value: 1 },
    });
  });

  it("binds live E2E and load assertions into committed raw output", () => {
    expect(Object.values(e2e.assertions).every(Boolean)).toBe(true);
    expect(
      e2e.pages.every((page: { status: number }) => page.status === 200),
    ).toBe(true);
    expect(load.successful_requests).toBe(load.requests);
    expect(load.latency_ms.p95).toBeGreaterThan(0);
  });
});
