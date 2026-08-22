import { z } from "zod";

export const runStateSchema = z.enum([
  "created",
  "triggering",
  "collecting",
  "normalizing",
  "validating",
  "verified",
  "quarantined",
  "failed",
]);

export const incidentStateSchema = z.enum([
  "detected",
  "triaging",
  "retrying",
  "quarantined",
  "diagnosing",
  "healing",
  "awaiting_preview",
  "awaiting_human",
  "approved",
  "certifying",
  "resolved",
  "failed",
]);

export type RunState = z.infer<typeof runStateSchema>;
export type IncidentState = z.infer<typeof incidentStateSchema>;

const runTransitions: Record<RunState, readonly RunState[]> = {
  created: ["triggering", "failed"],
  triggering: ["collecting", "failed"],
  collecting: ["normalizing", "failed"],
  normalizing: ["validating", "failed"],
  validating: ["verified", "quarantined", "failed"],
  verified: [],
  quarantined: [],
  failed: [],
};

const incidentTransitions: Record<IncidentState, readonly IncidentState[]> = {
  detected: ["triaging", "failed"],
  triaging: [
    "retrying",
    "quarantined",
    "diagnosing",
    "healing",
    "awaiting_human",
    "resolved",
    "failed",
  ],
  retrying: ["triaging", "resolved", "failed"],
  quarantined: ["diagnosing", "awaiting_human", "resolved", "failed"],
  diagnosing: ["healing", "awaiting_human", "resolved", "failed"],
  healing: ["awaiting_preview", "awaiting_human", "failed"],
  awaiting_preview: ["awaiting_human", "failed"],
  awaiting_human: ["approved", "resolved", "failed"],
  approved: ["certifying", "failed"],
  certifying: ["resolved", "failed"],
  resolved: [],
  failed: [],
};

function assertTransition<T extends string>(
  kind: string,
  current: T,
  next: T,
  transitions: Record<T, readonly T[]>,
) {
  if (!transitions[current].includes(next)) {
    throw new Error(`Invalid ${kind} transition: ${current} -> ${next}`);
  }
  return next;
}

export function transitionRun(current: RunState, next: RunState) {
  return assertTransition(
    "run",
    runStateSchema.parse(current),
    runStateSchema.parse(next),
    runTransitions,
  );
}

export function transitionIncident(
  current: IncidentState,
  next: IncidentState,
) {
  return assertTransition(
    "incident",
    incidentStateSchema.parse(current),
    incidentStateSchema.parse(next),
    incidentTransitions,
  );
}

export const triageClassificationSchema = z.enum([
  "structural_drift",
  "semantic_swap",
  "render_timing",
  "transport_failure",
  "soft_block",
  "legitimate_empty",
  "dead_page",
  "ab_variant",
  "unknown",
]);

export const triageActionSchema = z.enum([
  "heal",
  "retry",
  "quarantine",
  "do_not_heal",
  "mark_dead",
  "gather_more_evidence",
  "human_review",
]);

export const repeatedFetchSchema = z.object({
  domFingerprint: z.string().min(1),
  fieldPresent: z.boolean(),
  pageState: z.enum(["ok", "blocked", "not_found", "empty"]),
});

export const triageSignalsSchema = z.object({
  httpStatus: z.number().int().min(100).max(599).nullable().default(null),
  networkError: z
    .enum(["timeout", "connection", "dns", "tls"])
    .nullable()
    .default(null),
  pageState: z
    .enum(["ok", "blocked", "not_found", "empty", "unknown"])
    .default("unknown"),
  blockMarkers: z.array(z.string()).default([]),
  semanticViolationCodes: z.array(z.string()).default([]),
  fieldMissing: z.boolean().default(false),
  optionalField: z.boolean().default(false),
  soldOut: z.boolean().default(false),
  alternateEvidencePresent: z.boolean().default(false),
  selectorFailure: z.boolean().default(false),
  valueAppearedAfterMs: z.number().nonnegative().nullable().default(null),
  renderDeadlineMs: z.number().positive().default(5_000),
  repeatedFetches: z.array(repeatedFetchSchema).max(5).default([]),
});

export const triageResultSchema = z.object({
  classification: triageClassificationSchema,
  action: triageActionSchema,
  confidenceSource: z.literal("deterministic_evidence"),
  signals: z.array(z.string().min(1)).min(1),
  requiresRepeatedFetch: z.boolean(),
});

export type TriageSignals = z.input<typeof triageSignalsSchema>;
export type TriageResult = z.infer<typeof triageResultSchema>;

function result(
  classification: z.infer<typeof triageClassificationSchema>,
  action: z.infer<typeof triageActionSchema>,
  signals: string[],
  requiresRepeatedFetch = false,
): TriageResult {
  return triageResultSchema.parse({
    classification,
    action,
    confidenceSource: "deterministic_evidence",
    signals,
    requiresRepeatedFetch,
  });
}

export function classifyFailure(input: TriageSignals): TriageResult {
  const signals = triageSignalsSchema.parse(input);
  const fingerprints = new Set(
    signals.repeatedFetches.map((item) => item.domFingerprint),
  );
  const fieldPresence = new Set(
    signals.repeatedFetches.map((item) => item.fieldPresent),
  );

  if (
    signals.httpStatus === 404 ||
    signals.httpStatus === 410 ||
    signals.pageState === "not_found"
  ) {
    return result("dead_page", "mark_dead", [
      `page is permanently unavailable (${signals.httpStatus ?? "marker"})`,
    ]);
  }

  if (
    signals.pageState === "blocked" ||
    signals.httpStatus === 401 ||
    signals.httpStatus === 403 ||
    signals.httpStatus === 429 ||
    signals.blockMarkers.length > 0
  ) {
    return result("soft_block", "quarantine", [
      signals.blockMarkers.length
        ? `block markers: ${signals.blockMarkers.join(", ")}`
        : `blocked response (${signals.httpStatus ?? "page marker"})`,
    ]);
  }

  if (
    signals.networkError !== null ||
    (signals.httpStatus !== null && signals.httpStatus >= 500)
  ) {
    return result("transport_failure", "retry", [
      signals.networkError
        ? `transport error: ${signals.networkError}`
        : `upstream response: ${signals.httpStatus}`,
    ]);
  }

  if (
    signals.fieldMissing &&
    signals.optionalField &&
    (signals.soldOut || signals.pageState === "empty")
  ) {
    return result("legitimate_empty", "do_not_heal", [
      signals.soldOut
        ? "optional field is absent on a sold-out product"
        : "page explicitly represents a legitimate empty state",
    ]);
  }

  if (signals.semanticViolationCodes.includes("semantic_swap")) {
    return result("semantic_swap", "heal", [
      "critical semantic_swap violation is present",
    ]);
  }

  if (
    signals.valueAppearedAfterMs !== null &&
    signals.valueAppearedAfterMs > signals.renderDeadlineMs
  ) {
    return result("render_timing", "heal", [
      `field appeared after ${signals.valueAppearedAfterMs}ms`,
      `render deadline was ${signals.renderDeadlineMs}ms`,
    ]);
  }

  if (fingerprints.size > 1 || fieldPresence.size > 1) {
    return result(
      "ab_variant",
      "gather_more_evidence",
      [
        `${fingerprints.size} DOM variants observed`,
        `${fieldPresence.size} field-presence outcomes observed`,
      ],
      true,
    );
  }

  if (
    signals.fieldMissing &&
    (signals.selectorFailure || signals.alternateEvidencePresent)
  ) {
    return result("structural_drift", "heal", [
      signals.alternateEvidencePresent
        ? "field is missing from the selector but remains in independent evidence"
        : "configured selector no longer resolves",
    ]);
  }

  return result(
    "unknown",
    "human_review",
    ["deterministic evidence is insufficient"],
    signals.repeatedFetches.length < 3,
  );
}

export const pollPolicySchema = z.object({
  baseDelayMs: z.number().int().positive().default(2_000),
  maximumDelayMs: z.number().int().positive().default(30_000),
  maximumAttempts: z.number().int().positive().default(8),
  timeoutMs: z.number().int().positive().default(180_000),
  stuckAfterMs: z.number().int().positive().default(45_000),
});

export type PollPolicy = z.input<typeof pollPolicySchema>;

export const pollDecisionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("complete") }),
  z.object({ kind: z.literal("retry"), delayMs: z.number().int().positive() }),
  z.object({ kind: z.literal("stuck"), reason: z.string().min(1) }),
  z.object({ kind: z.literal("failed"), reason: z.string().min(1) }),
]);

export function nextPollDecision(input: {
  attempt: number;
  startedAt: number;
  lastProgressAt: number;
  now: number;
  complete: boolean;
  policy?: PollPolicy;
}) {
  const policy = pollPolicySchema.parse(input.policy ?? {});
  if (input.complete) return pollDecisionSchema.parse({ kind: "complete" });
  if (input.now - input.startedAt >= policy.timeoutMs) {
    return pollDecisionSchema.parse({
      kind: "failed",
      reason: "workflow exceeded its polling timeout",
    });
  }
  if (input.now - input.lastProgressAt >= policy.stuckAfterMs) {
    return pollDecisionSchema.parse({
      kind: "stuck",
      reason: "provider job stopped making progress",
    });
  }
  if (input.attempt >= policy.maximumAttempts) {
    return pollDecisionSchema.parse({
      kind: "failed",
      reason: "workflow reached its retry cap",
    });
  }
  return pollDecisionSchema.parse({
    kind: "retry",
    delayMs: Math.min(
      policy.maximumDelayMs,
      policy.baseDelayMs * 2 ** input.attempt,
    ),
  });
}
