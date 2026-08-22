import { describe, expect, it } from "vitest";
import {
  novaBaseline,
  novaSemanticSwap,
} from "../../packages/test-fixtures/src/index";
import {
  normalizeProductRecord,
  verifyProductPrice,
} from "../../packages/semantic-contracts/src/index";

describe("product price semantic contract", () => {
  it("verifies the correct V1 purchase price without AI", () => {
    const decision = verifyProductPrice({ raw: novaBaseline });

    expect(normalizeProductRecord(novaBaseline).observedPurchasePrice).toBe(
      129,
    );
    expect(decision.decision).toBe("verified");
    expect(decision.proof?.state).toBe("verified");
    expect(decision.proof?.value).toBe(129);
    expect(decision.violations).toEqual([]);
  });

  it("quarantines the valid-but-wrong financing value", () => {
    const decision = verifyProductPrice({
      raw: novaSemanticSwap,
      previousVerifiedValue: 129,
    });

    expect(decision.decision).toBe("quarantined");
    expect(decision.proof?.state).toBe("stale");
    expect(decision.proof?.observedValue).toBe(10.75);
    expect(decision.proof?.value).toBe(129);
    expect(decision.violations.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "semantic_swap",
        "independent_source_mismatch",
        "historical_delta",
      ]),
    );
    expect(decision.alert.status).toBe("blocked");
  });

  it("releases nothing when the first observation has a critical violation", () => {
    const decision = verifyProductPrice({ raw: novaSemanticSwap });

    expect(decision.decision).toBe("quarantined");
    expect(decision.proof?.state).toBe("quarantined");
    expect(decision.proof?.value).toBeNull();
  });

  it("uses the monthly-payment equality as a cross-field invariant", () => {
    const crossFieldSwap = {
      ...novaBaseline,
      product: {
        ...novaBaseline.product,
        purchase_price: {
          ...novaBaseline.product.purchase_price,
          amount: 10.75,
          raw_text: "$10.75",
        },
      },
      independent_sources: {
        jsonld_price: 10.75,
        public_api_price: 10.75,
      },
    };
    const decision = verifyProductPrice({ raw: crossFieldSwap });

    expect(decision.decision).toBe("quarantined");
    expect(decision.violations).toEqual([
      expect.objectContaining({
        code: "semantic_swap",
        evidence: expect.objectContaining({
          purchaseEqualsMonthlyPayment: true,
        }),
      }),
    ]);
  });

  it("quarantines disagreement between independent sources", () => {
    const disagreement = {
      ...novaBaseline,
      independent_sources: {
        jsonld_price: 129,
        public_api_price: 128,
      },
    };
    const decision = verifyProductPrice({ raw: disagreement });

    expect(decision.decision).toBe("quarantined");
    expect(decision.violations.map((item) => item.code)).toContain(
      "source_disagreement",
    );
  });

  it("holds a large but corroborated price change for review", () => {
    const corroboratedChange = {
      ...novaBaseline,
      product: {
        ...novaBaseline.product,
        purchase_price: {
          ...novaBaseline.product.purchase_price,
          amount: 60,
          raw_text: "$60.00",
          nearby_text: "Purchase price $60.00 USD one-time Buy now",
        },
      },
      independent_sources: { jsonld_price: 60, public_api_price: 60 },
      evidence: {
        ...novaBaseline.evidence,
        purchase_context: "Purchase price $60.00 USD one-time Buy now",
      },
    };
    const decision = verifyProductPrice({
      raw: corroboratedChange,
      previousVerifiedValue: 129,
    });

    expect(decision.decision).toBe("needs_review");
    expect(decision.proof?.state).toBe("stale");
    expect(decision.proof?.value).toBe(129);
    expect(decision.alert.status).toBe("blocked");
  });

  it("marks malformed collector output invalid", () => {
    const decision = verifyProductPrice({
      raw: { product: null },
      previousVerifiedValue: 129,
    });

    expect(decision.decision).toBe("invalid");
    expect(decision.proof).toBeNull();
    expect(decision.alert.status).toBe("blocked");
  });
});
