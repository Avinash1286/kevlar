import { describe, expect, it } from "vitest";
import fixture from "../../domains/ai-infrastructure/fixtures/openai-pricing.json";
import {
  AI_INFRASTRUCTURE_SCHEMA_REVISION,
  canonicalEntityTypeSchema,
  canonicalFieldRegistry,
  verifyAiInfrastructureObservation,
} from "../../domains/ai-infrastructure/src/index";

describe("AI infrastructure domain pack", () => {
  it("defines the required canonical entities, units, and active revision", () => {
    expect(AI_INFRASTRUCTURE_SCHEMA_REVISION).toBe(1);
    expect(canonicalEntityTypeSchema.options).toEqual([
      "provider",
      "model",
      "endpoint",
      "pricing_plan",
      "region",
      "capability",
      "limit",
      "deprecation_notice",
    ]);
    expect(canonicalFieldRegistry).toHaveProperty(
      "model.input_price_usd_per_million_tokens",
    );
  });

  it("verifies an official pricing observation", () => {
    const result = verifyAiInfrastructureObservation(fixture);
    expect(result.decision).toBe("verified");
    expect(result.normalized?.records).toHaveLength(1);
    expect(result.evidenceHash).toMatch(/^sha256:/);
  });

  it("quarantines a valid payload from an unapproved host", () => {
    const result = verifyAiInfrastructureObservation({
      ...fixture,
      source_url: "https://example.com/api/pricing/",
    });
    expect(result.decision).toBe("quarantined");
    expect(result.violations.map((item) => item.code)).toContain(
      "source_policy_mismatch",
    );
  });

  it("quarantines forged evidence hashes even when their shape is valid", () => {
    const result = verifyAiInfrastructureObservation({
      ...fixture,
      evidence: {
        ...fixture.evidence,
        content_hash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    });
    expect(result.decision).toBe("quarantined");
    expect(result.violations.map((item) => item.code)).toContain(
      "evidence_hash_mismatch",
    );
  });

  it("rejects ambiguous or structurally incomplete prices", () => {
    const record = fixture.records[0]!;
    const result = verifyAiInfrastructureObservation({
      ...fixture,
      records: [
        {
          ...record,
          input_price: { ...record.input_price, amount: 0 },
        },
      ],
    });
    expect(result.decision).toBe("invalid");
  });
});
