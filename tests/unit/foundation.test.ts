import { describe, expect, it } from "vitest";
import { collectorProductSchema } from "../../packages/shared-types/src/index";
import { sha256 } from "../../packages/hashing/src/index";
import { novaBaseline } from "../../packages/test-fixtures/src/index";

describe("Week 1 foundation", () => {
  it("accepts the schema-valid Nova V1 baseline", () => {
    expect(
      collectorProductSchema.parse(novaBaseline).product.purchase_price.amount,
    ).toBe(129);
  });

  it("hashes object keys deterministically", () => {
    expect(sha256({ b: 2, a: 1 })).toBe(sha256({ a: 1, b: 2 }));
  });
});
