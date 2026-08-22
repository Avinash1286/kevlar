import { z } from "zod";
import { collectorProductSchema } from "../../shared-types/src/index";

export const rawCollectorRecordSchema = collectorProductSchema.passthrough();

export const normalizedProductPriceSchema = z.object({
  entityId: z.string().min(1),
  title: z.string().min(1),
  observedPurchasePrice: z.number().positive(),
  monthlyPayment: z.number().positive(),
  currency: z.string().length(3),
  availability: z.enum(["in_stock", "out_of_stock", "unavailable"]),
  purchaseContext: z.string().min(1),
  purchaseLabel: z.string().min(1),
  rawPurchaseText: z.string().min(1),
  jsonLdPrice: z.number().positive(),
  publicApiPrice: z.number().positive(),
  sourceUrl: z.url(),
  capturedAt: z.iso.datetime(),
});

export const trustStateSchema = z.enum([
  "verified",
  "quarantined",
  "needs_review",
  "invalid",
  "stale",
]);

export const violationCodeSchema = z.enum([
  "semantic_swap",
  "independent_source_mismatch",
  "source_disagreement",
  "historical_delta",
]);

export const semanticViolationSchema = z.object({
  code: violationCodeSchema,
  severity: z.enum(["warning", "critical"]),
  message: z.string().min(1),
  evidence: z.record(z.string(), z.unknown()),
});

export const proofCarryingFieldSchema = z.object({
  field: z.literal("product.purchase_price.amount"),
  state: trustStateSchema,
  value: z.number().positive().nullable(),
  observedValue: z.number().positive(),
  lastKnownGoodValue: z.number().positive().nullable(),
  currency: z.string().length(3),
  contract: z.object({
    key: z.literal("product.purchase_price"),
    version: z.literal("1.0.0"),
  }),
  evidence: z.object({
    visibleContext: z.string().min(1),
    jsonLdPrice: z.number().positive(),
    publicApiPrice: z.number().positive(),
  }),
  violationCodes: z.array(violationCodeSchema),
  capturedAt: z.iso.datetime(),
});

export const releaseDecisionSchema = z.object({
  decision: z.enum(["verified", "quarantined", "needs_review", "invalid"]),
  normalized: normalizedProductPriceSchema.nullable(),
  violations: z.array(semanticViolationSchema),
  proof: proofCarryingFieldSchema.nullable(),
  alert: z.object({
    kind: z.literal("price_drop"),
    status: z.enum(["not_triggered", "blocked", "sent"]),
    previousValue: z.number().positive().nullable(),
    observedValue: z.number().positive().nullable(),
    reason: z.string().min(1),
  }),
});

export type NormalizedProductPrice = z.infer<
  typeof normalizedProductPriceSchema
>;
export type ReleaseDecision = z.infer<typeof releaseDecisionSchema>;

export const productPriceContract = {
  key: "product.purchase_price" as const,
  version: "1.0.0" as const,
  positiveContext: ["purchase price", "one-time", "buy now"],
  forbiddenContext: ["per month", "monthly", "financing", "split the total"],
  sourceTolerance: 0.01,
  warningDeltaRatio: 0.5,
};

export function normalizeProductRecord(raw: unknown): NormalizedProductPrice {
  const record = rawCollectorRecordSchema.parse(raw);
  return normalizedProductPriceSchema.parse({
    entityId: record.product.id,
    title: record.product.title,
    observedPurchasePrice: record.product.purchase_price.amount,
    monthlyPayment: record.product.monthly_payment.amount,
    currency: record.product.purchase_price.currency,
    availability: record.product.availability,
    purchaseContext: record.product.purchase_price.nearby_text,
    purchaseLabel: record.product.purchase_price.label,
    rawPurchaseText: record.product.purchase_price.raw_text,
    jsonLdPrice: record.independent_sources.jsonld_price,
    publicApiPrice: record.independent_sources.public_api_price,
    sourceUrl: record.source_url,
    capturedAt: record.captured_at,
  });
}

function nearlyEqual(left: number, right: number) {
  return Math.abs(left - right) <= productPriceContract.sourceTolerance;
}

function violation(
  code: z.infer<typeof violationCodeSchema>,
  severity: "warning" | "critical",
  message: string,
  evidence: Record<string, unknown>,
) {
  return semanticViolationSchema.parse({ code, severity, message, evidence });
}

export function verifyProductPrice(input: {
  raw: unknown;
  previousVerifiedValue?: number | null;
}): ReleaseDecision {
  const parsed = rawCollectorRecordSchema.safeParse(input.raw);
  if (!parsed.success) {
    return releaseDecisionSchema.parse({
      decision: "invalid",
      normalized: null,
      violations: [],
      proof: null,
      alert: {
        kind: "price_drop",
        status: "blocked",
        previousValue: input.previousVerifiedValue ?? null,
        observedValue: null,
        reason: "Raw collector output failed schema validation",
      },
    });
  }

  const normalized = normalizeProductRecord(parsed.data);
  const context = [
    normalized.purchaseLabel,
    normalized.purchaseContext,
    normalized.rawPurchaseText,
  ]
    .join(" ")
    .toLowerCase();
  const violations: z.infer<typeof semanticViolationSchema>[] = [];
  const missingPositive = productPriceContract.positiveContext.filter(
    (token) => !context.includes(token),
  );
  const forbidden = productPriceContract.forbiddenContext.filter((token) =>
    context.includes(token),
  );
  const equalsMonthly = nearlyEqual(
    normalized.observedPurchasePrice,
    normalized.monthlyPayment,
  );

  const hasPositiveContext =
    missingPositive.length < productPriceContract.positiveContext.length;

  if (!hasPositiveContext || forbidden.length > 0 || equalsMonthly) {
    violations.push(
      violation(
        "semantic_swap",
        "critical",
        "The observed purchase price carries financing semantics",
        {
          missingPositiveContext: missingPositive,
          forbiddenContext: forbidden,
          purchaseEqualsMonthlyPayment: equalsMonthly,
          purchaseContext: normalized.purchaseContext,
        },
      ),
    );
  }

  if (!nearlyEqual(normalized.jsonLdPrice, normalized.publicApiPrice)) {
    violations.push(
      violation(
        "source_disagreement",
        "critical",
        "Independent sources disagree with each other",
        {
          jsonLdPrice: normalized.jsonLdPrice,
          publicApiPrice: normalized.publicApiPrice,
        },
      ),
    );
  }

  if (
    !nearlyEqual(normalized.observedPurchasePrice, normalized.jsonLdPrice) ||
    !nearlyEqual(normalized.observedPurchasePrice, normalized.publicApiPrice)
  ) {
    violations.push(
      violation(
        "independent_source_mismatch",
        "critical",
        "The observed purchase price disagrees with independent evidence",
        {
          observedPurchasePrice: normalized.observedPurchasePrice,
          jsonLdPrice: normalized.jsonLdPrice,
          publicApiPrice: normalized.publicApiPrice,
        },
      ),
    );
  }

  const previous = input.previousVerifiedValue ?? null;
  if (previous !== null) {
    const deltaRatio =
      Math.abs(normalized.observedPurchasePrice - previous) / previous;
    if (deltaRatio >= productPriceContract.warningDeltaRatio) {
      violations.push(
        violation(
          "historical_delta",
          "warning",
          "Observed value changed by at least 50% from the last verified value",
          {
            previousVerifiedValue: previous,
            observedPurchasePrice: normalized.observedPurchasePrice,
            deltaRatio,
          },
        ),
      );
    }
  }

  const hasCritical = violations.some((item) => item.severity === "critical");
  const hasWarning = violations.some((item) => item.severity === "warning");
  const decision = hasCritical
    ? "quarantined"
    : hasWarning
      ? "needs_review"
      : "verified";
  const releasedValue =
    decision === "verified" ? normalized.observedPurchasePrice : previous;
  const proofState =
    decision === "verified"
      ? "verified"
      : previous !== null
        ? "stale"
        : decision;
  const isDrop =
    previous !== null && normalized.observedPurchasePrice < previous;

  return releaseDecisionSchema.parse({
    decision,
    normalized,
    violations,
    proof: {
      field: "product.purchase_price.amount",
      state: proofState,
      value: releasedValue,
      observedValue: normalized.observedPurchasePrice,
      lastKnownGoodValue: previous,
      currency: normalized.currency,
      contract: {
        key: productPriceContract.key,
        version: productPriceContract.version,
      },
      evidence: {
        visibleContext: normalized.purchaseContext,
        jsonLdPrice: normalized.jsonLdPrice,
        publicApiPrice: normalized.publicApiPrice,
      },
      violationCodes: violations.map((item) => item.code),
      capturedAt: normalized.capturedAt,
    },
    alert: {
      kind: "price_drop",
      status: isDrop
        ? decision === "verified"
          ? "sent"
          : "blocked"
        : "not_triggered",
      previousValue: previous,
      observedValue: normalized.observedPurchasePrice,
      reason: isDrop
        ? decision === "verified"
          ? "Verified price drop"
          : "Price drop blocked by the semantic release gate"
        : "No downward price movement",
    },
  });
}
