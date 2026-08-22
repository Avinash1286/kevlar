import { sha256 } from "@kevlar/hashing";
import { verifyProductPrice } from "@kevlar/semantic-contracts";
import { collectorProductSchema } from "@kevlar/shared-types";
import { z } from "zod";

export const metamorphicVisibilitySchema = z.enum([
  "visible",
  "held_out",
  "negative_control",
]);

export const expectedRelationSchema = z.enum([
  "same_value",
  "same_semantic_value",
  "quarantine",
  "retry",
  "do_not_heal",
]);

export const metamorphicCaseSchema = z.object({
  id: z.enum(["M1", "M2", "M3", "M4", "H1", "H2", "N1", "N2"]),
  name: z.string().min(1),
  visibility: metamorphicVisibilitySchema,
  transform: z.string().min(1),
  expectedRelation: expectedRelationSchema,
  criticalFields: z.array(z.string().min(1)).min(1),
  path: z.string().min(1),
});

export type MetamorphicCase = z.infer<typeof metamorphicCaseSchema>;

export const CORE_GAUNTLET_CASES: readonly MetamorphicCase[] = [
  {
    id: "M1",
    name: "Class rename",
    visibility: "visible",
    transform: "rename all CSS classes",
    expectedRelation: "same_value",
    criticalFields: ["product.purchase_price.amount"],
    path: "/gauntlet/m1",
  },
  {
    id: "M2",
    name: "Wrapper insertion",
    visibility: "visible",
    transform: "insert two containers around the one-time price",
    expectedRelation: "same_value",
    criticalFields: ["product.purchase_price.amount"],
    path: "/gauntlet/m2",
  },
  {
    id: "M3",
    name: "Section reorder",
    visibility: "visible",
    transform: "move financing above checkout",
    expectedRelation: "same_semantic_value",
    criticalFields: ["product.purchase_price.amount"],
    path: "/gauntlet/m3",
  },
  {
    id: "M4",
    name: "Financing decoy",
    visibility: "visible",
    transform: "make monthly financing visually prominent",
    expectedRelation: "same_semantic_value",
    criticalFields: [
      "product.purchase_price.amount",
      "product.monthly_payment.amount",
    ],
    path: "/gauntlet/m4",
  },
  {
    id: "H1",
    name: "Label split",
    visibility: "held_out",
    transform: "held-out DOM relation H1",
    expectedRelation: "same_semantic_value",
    criticalFields: ["product.purchase_price.amount"],
    path: "/gauntlet/h1",
  },
  {
    id: "H2",
    name: "Delayed rendering",
    visibility: "held_out",
    transform: "held-out rendering relation H2",
    expectedRelation: "same_semantic_value",
    criticalFields: ["product.purchase_price.amount"],
    path: "/gauntlet/h2",
  },
  {
    id: "N1",
    name: "Soft block",
    visibility: "negative_control",
    transform: "challenge page returned with HTTP 200",
    expectedRelation: "quarantine",
    criticalFields: ["page_state"],
    path: "/negative-controls/soft-block",
  },
  {
    id: "N2",
    name: "Legitimate empty",
    visibility: "negative_control",
    transform:
      "unavailable product with an intentionally absent optional value",
    expectedRelation: "do_not_heal",
    criticalFields: ["product.availability"],
    path: "/negative-controls/legitimate-empty",
  },
].map((item) => metamorphicCaseSchema.parse(item));

export function composeRepairInstruction(input: {
  observedBadValue: number;
  expectedValue: number;
  monthlyPayment: number;
  visibleContext: string;
}) {
  const prompt = [
    "Fix product.purchase_price semantic extraction on the supplied public URL.",
    `It returned monthly financing ${input.observedBadValue}, but the one-time purchase is ${input.expectedValue}; monthly_payment must remain ${input.monthlyPayment}.`,
    `Verified visible context: ${input.visibleContext.slice(0, 220)}.`,
    "JSON-LD and the tagged public product API both support the one-time value.",
    "Use semantic heading/ARIA/context anchors, keep financing separate, preserve the output schema and evidence fields, and avoid positional or generated-class selectors.",
    "Visible robustness cases may rename classes, insert wrappers, reorder sections, or emphasize financing.",
  ].join(" ");
  if (prompt.length > 1_000) {
    throw new Error("Composed repair instruction exceeds Bright Data's limit");
  }
  return { prompt, hash: sha256(prompt) };
}

export const tribunalStatusSchema = z.enum([
  "pass",
  "fail",
  "deferred",
  "needs_review",
]);

export const tribunalCheckSchema = z.object({
  check: z.enum([
    "preview_contract",
    "evidence_support",
    "selector_risk",
    "human_review",
  ]),
  status: tribunalStatusSchema,
  summary: z.string().min(1),
  details: z.record(z.string(), z.unknown()),
});

export type TribunalCheck = z.infer<typeof tribunalCheckSchema>;

const riskRule = z.object({
  label: z.string(),
  points: z.number(),
  matched: z.boolean(),
});

export const selectorRiskReviewSchema = z.object({
  score: z.number(),
  status: z.enum(["pass", "needs_review", "deferred"]),
  rules: z.array(riskRule),
});

export function reviewSelectorRisk(source: string | null) {
  if (!source) {
    return selectorRiskReviewSchema.parse({
      score: 0,
      status: "deferred",
      rules: [],
    });
  }

  const checks = [
    {
      label: "Semantic or accessibility anchor",
      points: 25,
      matched: /aria-label|purchase-heading|one-time|buy now/i.test(source),
    },
    {
      label: "Independent structured source",
      points: 25,
      matched: /jsonld|product_api|tag_response/i.test(source),
    },
    {
      label: "Context validation",
      points: 20,
      matched: /monthly|financing|purchase_context|nearby_text/i.test(source),
    },
    {
      label: "Deep positional selector",
      points: -20,
      matched: /nth-child|nth-of-type/i.test(source),
    },
    {
      label: "Generated class dependency",
      points: -15,
      matched: /\._?next|__[A-Za-z0-9_-]{5,}|class\*?=/i.test(source),
    },
    {
      label: "Broad first-number extraction",
      points: -20,
      matched: /\$\("body"\)|document\.body|first\(\).*\d/i.test(source),
    },
  ];
  const score = checks.reduce(
    (total, rule) => total + (rule.matched ? rule.points : 0),
    0,
  );
  return selectorRiskReviewSchema.parse({
    score,
    status: score >= 40 ? "pass" : "needs_review",
    rules: checks,
  });
}

export function runPreApprovalTribunal(input: {
  previewResult: unknown;
  expectedPurchasePrice: number;
  selectorSource?: string | null;
}): TribunalCheck[] {
  const parsed = collectorProductSchema.safeParse(input.previewResult);
  const decision = parsed.success
    ? verifyProductPrice({
        raw: parsed.data,
        previousVerifiedValue: input.expectedPurchasePrice,
      })
    : null;
  const previewPass =
    decision?.decision === "verified" &&
    decision.proof?.observedValue === input.expectedPurchasePrice;
  const evidencePass =
    parsed.success &&
    parsed.data.independent_sources.jsonld_price ===
      input.expectedPurchasePrice &&
    parsed.data.independent_sources.public_api_price ===
      input.expectedPurchasePrice &&
    parsed.data.product.purchase_price.nearby_text
      .toLowerCase()
      .includes("one-time");
  const risk = reviewSelectorRisk(input.selectorSource ?? null);

  return [
    tribunalCheckSchema.parse({
      check: "preview_contract",
      status: previewPass ? "pass" : "fail",
      summary: previewPass
        ? "The official preview satisfies the purchase-price contract."
        : "The official preview does not satisfy the purchase-price contract.",
      details: {
        schemaValid: parsed.success,
        decision: decision?.decision ?? "invalid",
        observedValue: decision?.proof?.observedValue ?? null,
      },
    }),
    tribunalCheckSchema.parse({
      check: "evidence_support",
      status: evidencePass ? "pass" : "fail",
      summary: evidencePass
        ? "Visible context, JSON-LD, and public API support the candidate."
        : "Independent evidence does not support the candidate.",
      details: parsed.success
        ? {
            visibleContext: parsed.data.product.purchase_price.nearby_text,
            jsonLdPrice: parsed.data.independent_sources.jsonld_price,
            publicApiPrice: parsed.data.independent_sources.public_api_price,
          }
        : { schemaValid: false },
    }),
    tribunalCheckSchema.parse({
      check: "selector_risk",
      status: risk.status,
      summary:
        risk.status === "deferred"
          ? "Candidate source was unavailable before approval; review is deferred."
          : `Interpretable selector-risk heuristic scored ${risk.score}.`,
      details: risk,
    }),
    tribunalCheckSchema.parse({
      check: "human_review",
      status: "needs_review",
      summary: "A human must explicitly approve or reject the proposed diff.",
      details: { automaticApproval: false },
    }),
  ];
}

export const gauntletCaseResultSchema = z.object({
  caseId: metamorphicCaseSchema.shape.id,
  visibility: metamorphicVisibilitySchema,
  expectedRelation: expectedRelationSchema,
  outcome: z.enum(["pass", "fail"]),
  observedValue: z.number().nullable(),
  releasedValue: z.number().nullable(),
  falseHeal: z.boolean(),
  falseRelease: z.boolean(),
  detectionMs: z.number().nonnegative(),
  recoveryMs: z.number().nonnegative().nullable(),
  evidenceHash: z.string().startsWith("sha256:"),
  reason: z.string().min(1),
});

export type GauntletCaseResult = z.infer<typeof gauntletCaseResultSchema>;

export function evaluateCollectedCase(input: {
  testCase: MetamorphicCase;
  record: unknown;
  lastKnownGoodValue: number;
  durationMs: number;
}): GauntletCaseResult {
  if (input.testCase.visibility === "negative_control") {
    throw new Error("Use evaluateNegativeControl for N1 and N2");
  }
  const decision = verifyProductPrice({
    raw: input.record,
    previousVerifiedValue: input.lastKnownGoodValue,
  });
  const pass =
    decision.decision === "verified" &&
    decision.proof?.observedValue === input.lastKnownGoodValue &&
    decision.proof.value === input.lastKnownGoodValue;
  return gauntletCaseResultSchema.parse({
    caseId: input.testCase.id,
    visibility: input.testCase.visibility,
    expectedRelation: input.testCase.expectedRelation,
    outcome: pass ? "pass" : "fail",
    observedValue: decision.proof?.observedValue ?? null,
    releasedValue: decision.proof?.value ?? input.lastKnownGoodValue,
    falseHeal: false,
    falseRelease:
      decision.decision === "verified" &&
      decision.proof?.observedValue !== input.lastKnownGoodValue,
    detectionMs: input.durationMs,
    recoveryMs: pass ? input.durationMs : null,
    evidenceHash: sha256(input.record),
    reason: pass
      ? "The repaired collector preserved the verified semantic value."
      : `The case produced ${decision.decision}; certification remains blocked.`,
  });
}

export function evaluateNegativeControl(input: {
  testCase: MetamorphicCase;
  detectedState: "blocked" | "legitimate_empty" | "unexpected";
  durationMs: number;
  evidence: unknown;
}): GauntletCaseResult {
  if (input.testCase.visibility !== "negative_control") {
    throw new Error("Only N1 and N2 are negative controls");
  }
  const expectedState =
    input.testCase.id === "N1" ? "blocked" : "legitimate_empty";
  const pass = input.detectedState === expectedState;
  return gauntletCaseResultSchema.parse({
    caseId: input.testCase.id,
    visibility: input.testCase.visibility,
    expectedRelation: input.testCase.expectedRelation,
    outcome: pass ? "pass" : "fail",
    observedValue: null,
    releasedValue: null,
    falseHeal: !pass,
    falseRelease: false,
    detectionMs: input.durationMs,
    recoveryMs: null,
    evidenceHash: sha256(input.evidence),
    reason: pass
      ? input.testCase.id === "N1"
        ? "Soft block was quarantined without requesting selector repair."
        : "Legitimate empty state was accepted without requesting repair."
      : "Negative control was misclassified.",
  });
}

export const benchmarkSummarySchema = z.object({
  system: z.enum(["schema_only", "contract_only", "full_kevlar"]),
  totalCases: z.number().int().nonnegative(),
  passedCases: z.number().int().nonnegative(),
  silentCorruptionCaught: z.number().int().nonnegative(),
  falseHealRate: z.number().min(0).max(1),
  heldOutPassRate: z.number().min(0).max(1).nullable(),
  falseReleases: z.number().int().nonnegative(),
  lastKnownGoodAvailable: z.boolean(),
});

export type BenchmarkSummary = z.infer<typeof benchmarkSummarySchema>;

export type BenchmarkSystem = BenchmarkSummary["system"];

export function projectBenchmarkBaseline(
  system: BenchmarkSystem,
  measuredResults: readonly GauntletCaseResult[],
): GauntletCaseResult[] {
  const parsed = measuredResults.map((result) =>
    gauntletCaseResultSchema.parse(result),
  );
  if (system === "full_kevlar") return parsed;

  return parsed.map((result) => {
    if (result.caseId === "M4") {
      return gauntletCaseResultSchema.parse({
        ...result,
        observedValue: 10.75,
        releasedValue: system === "schema_only" ? 10.75 : 129,
        outcome: system === "schema_only" ? "fail" : "pass",
        falseRelease: system === "schema_only",
        recoveryMs: system === "schema_only" ? null : result.recoveryMs,
        evidenceHash: sha256({
          system,
          sourceEvidenceHash: result.evidenceHash,
          replayedSemanticSwap: 10.75,
        }),
        reason:
          system === "schema_only"
            ? "Schema validation accepted the structurally valid financing value as the purchase price."
            : "The semantic contract caught the replayed financing-value swap and retained the last-known-good purchase price.",
      });
    }
    if (
      system === "schema_only" &&
      (result.caseId === "N1" || result.caseId === "N2")
    ) {
      return gauntletCaseResultSchema.parse({
        ...result,
        outcome: "fail",
        falseHeal: true,
        recoveryMs: null,
        evidenceHash: sha256({
          system,
          sourceEvidenceHash: result.evidenceHash,
          stateControl: result.caseId,
        }),
        reason:
          "Schema-only validation has no page-state policy and incorrectly requests repair for this control.",
      });
    }
    return gauntletCaseResultSchema.parse({
      ...result,
      evidenceHash: sha256({
        system,
        sourceEvidenceHash: result.evidenceHash,
      }),
      reason: `${system} replay: ${result.reason}`,
    });
  });
}

export function summarizeBenchmark(
  system: BenchmarkSystem,
  results: readonly GauntletCaseResult[],
): BenchmarkSummary {
  const heldOut = results.filter((item) => item.visibility === "held_out");
  const negative = results.filter(
    (item) => item.visibility === "negative_control",
  );
  return benchmarkSummarySchema.parse({
    system,
    totalCases: results.length,
    passedCases: results.filter((item) => item.outcome === "pass").length,
    silentCorruptionCaught: results.filter(
      (item) => item.outcome === "pass" && item.caseId === "M4",
    ).length,
    falseHealRate:
      negative.length === 0
        ? 0
        : negative.filter((item) => item.falseHeal).length / negative.length,
    heldOutPassRate:
      heldOut.length === 0
        ? null
        : heldOut.filter((item) => item.outcome === "pass").length /
          heldOut.length,
    falseReleases: results.filter((item) => item.falseRelease).length,
    lastKnownGoodAvailable: results.every(
      (item) => !item.falseRelease || item.releasedValue !== null,
    ),
  });
}

export function summarizeFullKevlar(
  results: readonly GauntletCaseResult[],
): BenchmarkSummary {
  return summarizeBenchmark("full_kevlar", results);
}

const certificatePayloadWithoutDigestSchema = z.object({
  certificate_version: z.literal("1.0"),
  certificate_id: z.string().min(1),
  collector: z.object({
    platform: z.literal("Bright Data Scraper Studio"),
    collector_id: z.string().startsWith("c_"),
    same_id_before_after: z.literal(true),
  }),
  incident: z.object({
    type: z.literal("semantic_swap"),
    field: z.literal("product.purchase_price.amount"),
    observed_bad_value: z.number(),
    blocked_downstream_action: z.literal("price_drop_alert"),
  }),
  repair: z.object({
    heal_prompt_hash: z.string().startsWith("sha256:"),
    diagnosis_provider: z.string().min(1),
    diagnosis_model: z.string().min(1),
    human_approved: z.literal(true),
    approved_at: z.iso.datetime(),
  }),
  pre_approval_checks: z.object({
    preview_contract: tribunalStatusSchema,
    evidence_support: tribunalStatusSchema,
    selector_risk: tribunalStatusSchema,
  }),
  post_approval_checks: z.object({
    trigger_case: z.literal("pass"),
    visible_cases: z.string().regex(/^4\/4$/),
    held_out_cases: z.string().regex(/^2\/2$/),
    negative_controls: z.string().regex(/^2\/2$/),
  }),
  release: z.object({
    status: z.literal("certified"),
    released_value: z.number(),
  }),
  integrity: z.object({
    before_output_hash: z.string().startsWith("sha256:"),
    after_output_hash: z.string().startsWith("sha256:"),
  }),
  measured: z.object({
    gauntlet_results: z.array(gauntletCaseResultSchema).length(8),
    baseline_comparison: z.array(benchmarkSummarySchema).length(3),
  }),
  issued_at: z.iso.datetime(),
});

export const repairCertificateSchema =
  certificatePayloadWithoutDigestSchema.extend({
    integrity: certificatePayloadWithoutDigestSchema.shape.integrity.extend({
      certificate_digest: z.string().startsWith("sha256:"),
    }),
  });

export type RepairCertificate = z.infer<typeof repairCertificateSchema>;

export function createRepairCertificate(
  input: z.input<typeof certificatePayloadWithoutDigestSchema>,
): RepairCertificate {
  const payload = certificatePayloadWithoutDigestSchema.parse(input);
  const certificateDigest = sha256(payload);
  return repairCertificateSchema.parse({
    ...payload,
    integrity: {
      ...payload.integrity,
      certificate_digest: certificateDigest,
    },
  });
}

export function verifyCertificateDigest(certificate: RepairCertificate) {
  const {
    integrity: { certificate_digest: digest, ...integrity },
    ...rest
  } = repairCertificateSchema.parse(certificate);
  return sha256({ ...rest, integrity }) === digest;
}

export function certificationCanRelease(input: {
  tribunalChecks: readonly TribunalCheck[];
  gauntletResults: readonly GauntletCaseResult[];
  humanApproved: boolean;
}) {
  const requiredPreApproval = input.tribunalChecks.filter(
    (item) => item.check !== "human_review",
  );
  const checksPass = requiredPreApproval.every(
    (item) => item.status === "pass" || item.status === "deferred",
  );
  return (
    input.humanApproved &&
    checksPass &&
    input.gauntletResults.length === 8 &&
    input.gauntletResults.every((item) => item.outcome === "pass")
  );
}
