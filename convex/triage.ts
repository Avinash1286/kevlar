import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { performIncidentTransition } from "./incidentStateMachine";
import {
  diagnosisActionValidator,
  triageActionValidator,
  triageClassificationValidator,
} from "./phase3Validators";

const transportErrorValidator = v.union(
  v.literal("timeout"),
  v.literal("connection"),
  v.literal("rate_limited"),
  v.literal("server_error"),
);

const pageStateValidator = v.union(
  v.literal("ok"),
  v.literal("blocked"),
  v.literal("not_found"),
  v.literal("empty"),
  v.literal("unknown"),
);

const triageResultValidator = v.object({
  triageRecordId: v.id("triageRecords"),
  duplicate: v.boolean(),
  classification: triageClassificationValidator,
  recommendedAction: triageActionValidator,
  repeatedFetchRequired: v.boolean(),
});

type DeterministicClassification = {
  classification:
    | "structural_drift"
    | "semantic_swap"
    | "render_timing"
    | "transport_failure"
    | "soft_block"
    | "legitimate_empty"
    | "dead_page"
    | "ab_variant"
    | "unknown";
  recommendedAction:
    | "heal"
    | "retry"
    | "quarantine"
    | "do_not_heal"
    | "gather_evidence"
    | "mark_dead"
    | "human_review";
  signals: string[];
  repeatedFetchRequired: boolean;
};

function classifySignals(args: {
  httpStatus?: number;
  pageState: "ok" | "blocked" | "not_found" | "empty" | "unknown";
  transportError?: "timeout" | "connection" | "rate_limited" | "server_error";
  softBlockDetected: boolean;
  rowCount: number;
  criticalFieldMissing: boolean;
  optionalFieldExpectedEmpty: boolean;
  fieldEqualsMonthlyPayment: boolean;
  independentSourcesSupportBaseline: boolean;
  domFingerprintChanged: boolean;
  delayedFieldAppeared: boolean;
  repeatedDomFingerprints: string[];
}): DeterministicClassification {
  if (
    args.softBlockDetected ||
    args.pageState === "blocked" ||
    args.httpStatus === 403
  ) {
    return {
      classification: "soft_block",
      recommendedAction: "quarantine",
      signals: ["block marker or access-denied response detected"],
      repeatedFetchRequired: false,
    };
  }
  if (args.pageState === "not_found" || args.httpStatus === 404) {
    return {
      classification: "dead_page",
      recommendedAction: "mark_dead",
      signals: ["source returned a genuine not-found state"],
      repeatedFetchRequired: false,
    };
  }
  if (
    args.transportError ||
    (args.httpStatus !== undefined && args.httpStatus >= 500)
  ) {
    return {
      classification: "transport_failure",
      recommendedAction: "retry",
      signals: [
        args.transportError
          ? `transport error: ${args.transportError}`
          : `HTTP ${args.httpStatus}`,
      ],
      repeatedFetchRequired: false,
    };
  }
  if (
    args.pageState === "empty" &&
    args.optionalFieldExpectedEmpty &&
    !args.criticalFieldMissing
  ) {
    return {
      classification: "legitimate_empty",
      recommendedAction: "do_not_heal",
      signals: ["page explicitly represents an allowed empty state"],
      repeatedFetchRequired: false,
    };
  }
  if (
    args.fieldEqualsMonthlyPayment &&
    args.independentSourcesSupportBaseline
  ) {
    return {
      classification: "semantic_swap",
      recommendedAction: "heal",
      signals: [
        "critical field equals monthly payment",
        "independent sources continue to support the prior value",
      ],
      repeatedFetchRequired: false,
    };
  }
  if (args.delayedFieldAppeared) {
    return {
      classification: "render_timing",
      recommendedAction: "heal",
      signals: ["critical field appeared only after a delayed render"],
      repeatedFetchRequired: false,
    };
  }

  const distinctFingerprints = new Set(args.repeatedDomFingerprints);
  if (distinctFingerprints.size > 1) {
    return {
      classification: "ab_variant",
      recommendedAction: "gather_evidence",
      signals: ["repeated fetches produced inconsistent DOM fingerprints"],
      repeatedFetchRequired: true,
    };
  }
  if (args.criticalFieldMissing && args.domFingerprintChanged) {
    return {
      classification: "structural_drift",
      recommendedAction: "heal",
      signals: [
        "critical field is missing",
        "DOM fingerprint changed from the verified baseline",
      ],
      repeatedFetchRequired: false,
    };
  }
  return {
    classification: "unknown",
    recommendedAction: "gather_evidence",
    signals: ["deterministic evidence is insufficient"],
    repeatedFetchRequired: true,
  };
}

async function moveIncidentForTriage(
  ctx: Parameters<typeof performIncidentTransition>[0],
  args: {
    incidentId: Parameters<typeof performIncidentTransition>[1]["incidentId"];
    currentState: Parameters<typeof performIncidentTransition>[1]["toState"];
    classification: DeterministicClassification["classification"];
    action: DeterministicClassification["recommendedAction"];
    idempotencyKey: string;
    requestHash: string;
    now: number;
  },
) {
  let state = args.currentState;
  if (state === "detected" || state === "retrying" || state === "failed") {
    await performIncidentTransition(ctx, {
      incidentId: args.incidentId,
      toState: "triaging",
      reason: "Deterministic triage started",
      actorType: "system",
      idempotencyKey: `${args.idempotencyKey}:triaging`,
      requestHash: args.requestHash,
      details: { algorithmVersion: "triage-v1" },
      now: args.now,
    });
    state = "triaging";
  }
  if (state !== "triaging")
    throw new Error(`Incident cannot be triaged from state ${state}`);

  const nextState =
    args.action === "heal"
      ? "diagnosing"
      : args.action === "retry"
        ? "retrying"
        : args.action === "quarantine"
          ? "quarantined"
          : args.action === "do_not_heal" || args.action === "mark_dead"
            ? "resolved"
            : args.action === "human_review"
              ? "awaiting_human"
              : null;
  if (nextState) {
    await performIncidentTransition(ctx, {
      incidentId: args.incidentId,
      toState: nextState,
      reason: `Triage classified incident as ${args.classification}`,
      actorType: "system",
      idempotencyKey: `${args.idempotencyKey}:classified`,
      requestHash: args.requestHash,
      details: {
        classification: args.classification,
        recommendedAction: args.action,
      },
      now: args.now,
    });
  }
}

export const classifyDeterministically = internalMutation({
  args: {
    incidentId: v.id("incidents"),
    runId: v.id("runs"),
    httpStatus: v.optional(v.number()),
    pageState: pageStateValidator,
    transportError: v.optional(transportErrorValidator),
    softBlockDetected: v.boolean(),
    rowCount: v.number(),
    criticalFieldMissing: v.boolean(),
    optionalFieldExpectedEmpty: v.boolean(),
    fieldEqualsMonthlyPayment: v.boolean(),
    independentSourcesSupportBaseline: v.boolean(),
    domFingerprintChanged: v.boolean(),
    delayedFieldAppeared: v.boolean(),
    repeatedDomFingerprints: v.array(v.string()),
    idempotencyKey: v.string(),
    requestHash: v.string(),
  },
  returns: triageResultValidator,
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.rowCount) || args.rowCount < 0)
      throw new Error("rowCount must be a non-negative integer");
    if (args.repeatedDomFingerprints.length > 10)
      throw new Error("At most 10 repeated DOM fingerprints are accepted");

    const existing = await ctx.db
      .query("triageRecords")
      .withIndex("by_idempotencyKey", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();
    if (existing) {
      return {
        triageRecordId: existing._id,
        duplicate: true,
        classification: existing.classification,
        recommendedAction: existing.recommendedAction,
        repeatedFetchRequired: existing.repeatedFetchRequired,
      };
    }

    const [incident, run] = await Promise.all([
      ctx.db.get("incidents", args.incidentId),
      ctx.db.get("runs", args.runId),
    ]);
    if (!incident) throw new Error("Incident not found");
    if (!run || run.projectId !== incident.projectId)
      throw new Error("Triage run does not belong to the incident project");

    const decision = classifySignals(args);
    const now = Date.now();
    const triageRecordId = await ctx.db.insert("triageRecords", {
      projectId: incident.projectId,
      incidentId: incident._id,
      runId: run._id,
      classification: decision.classification,
      recommendedAction: decision.recommendedAction,
      confidenceSource: "deterministic_evidence",
      signals: decision.signals,
      repeatedFetchRequired: decision.repeatedFetchRequired,
      algorithmVersion: "triage-v1",
      idempotencyKey: args.idempotencyKey,
      createdAt: now,
    });
    await ctx.db.patch("incidents", incident._id, {
      classification: decision.classification,
      recommendedAction: decision.recommendedAction,
      currentWorkflowStep: decision.repeatedFetchRequired
        ? "triage.repeated_fetch"
        : "triage.complete",
      updatedAt: now,
    });
    await moveIncidentForTriage(ctx, {
      incidentId: incident._id,
      currentState: incident.state,
      classification: decision.classification,
      action: decision.recommendedAction,
      idempotencyKey: args.idempotencyKey,
      requestHash: args.requestHash,
      now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: incident.projectId,
      actorType: "system",
      action: "triage.persisted",
      targetType: "incident",
      targetId: String(incident._id),
      payload: {
        triageRecordId,
        classification: decision.classification,
        recommendedAction: decision.recommendedAction,
        repeatedFetchRequired: decision.repeatedFetchRequired,
        signals: decision.signals,
      },
      createdAt: now,
    });
    return {
      triageRecordId,
      duplicate: false,
      classification: decision.classification,
      recommendedAction: decision.recommendedAction,
      repeatedFetchRequired: decision.repeatedFetchRequired,
    };
  },
});

export const attachRepeatedFetchEvidence = internalMutation({
  args: {
    incidentId: v.id("incidents"),
    runId: v.id("runs"),
    domFingerprint: v.optional(v.string()),
    note: v.string(),
    idempotencyKey: v.string(),
  },
  returns: v.object({
    evidenceLinkId: v.id("incidentEvidenceLinks"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (args.note.length === 0 || args.note.length > 600)
      throw new Error("note must contain 1-600 characters");
    const existing = await ctx.db
      .query("incidentEvidenceLinks")
      .withIndex("by_idempotencyKey", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();
    if (existing) return { evidenceLinkId: existing._id, duplicate: true };

    const [incident, run] = await Promise.all([
      ctx.db.get("incidents", args.incidentId),
      ctx.db.get("runs", args.runId),
    ]);
    if (!incident || !run || incident.projectId !== run.projectId)
      throw new Error("Repeated-fetch run does not belong to the incident");
    const now = Date.now();
    const evidenceLinkId = await ctx.db.insert("incidentEvidenceLinks", {
      projectId: incident.projectId,
      incidentId: incident._id,
      runId: run._id,
      kind: "repeated_fetch",
      ...(args.domFingerprint ? { domFingerprint: args.domFingerprint } : {}),
      note: args.note,
      idempotencyKey: args.idempotencyKey,
      createdAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: incident.projectId,
      actorType: "system",
      action: "triage.repeated_fetch_attached",
      targetType: "incident",
      targetId: String(incident._id),
      payload: { evidenceLinkId, runId: run._id },
      createdAt: now,
    });
    return { evidenceLinkId, duplicate: false };
  },
});

export const persistAiClassification = internalMutation({
  args: {
    incidentId: v.id("incidents"),
    runId: v.id("runs"),
    modelCallId: v.id("modelCalls"),
    failureType: triageClassificationValidator,
    recommendedAction: diagnosisActionValidator,
    explanation: v.string(),
    evidenceUsed: v.array(v.string()),
    idempotencyKey: v.string(),
    requestHash: v.string(),
  },
  returns: triageResultValidator,
  handler: async (ctx, args) => {
    if (args.explanation.length === 0 || args.explanation.length > 600)
      throw new Error("AI explanation must contain 1-600 characters");
    if (args.evidenceUsed.length > 10)
      throw new Error("AI classification may cite at most 10 evidence items");
    const existing = await ctx.db
      .query("triageRecords")
      .withIndex("by_idempotencyKey", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();
    if (existing)
      return {
        triageRecordId: existing._id,
        duplicate: true,
        classification: existing.classification,
        recommendedAction: existing.recommendedAction,
        repeatedFetchRequired: existing.repeatedFetchRequired,
      };

    const [incident, run, modelCall] = await Promise.all([
      ctx.db.get("incidents", args.incidentId),
      ctx.db.get("runs", args.runId),
      ctx.db.get("modelCalls", args.modelCallId),
    ]);
    if (!incident || !run || run.projectId !== incident.projectId)
      throw new Error("AI triage inputs do not belong to the incident");
    if (
      !modelCall ||
      modelCall.incidentId !== incident._id ||
      modelCall.status !== "success" ||
      modelCall.outputSchemaValid !== true
    )
      throw new Error(
        "AI triage requires a schema-valid successful model call",
      );

    const now = Date.now();
    const triageRecordId = await ctx.db.insert("triageRecords", {
      projectId: incident.projectId,
      incidentId: incident._id,
      runId: run._id,
      classification: args.failureType,
      recommendedAction: args.recommendedAction,
      confidenceSource: "ai_residue",
      signals: [args.explanation, ...args.evidenceUsed],
      repeatedFetchRequired: false,
      algorithmVersion: "ai-residue-v1",
      idempotencyKey: args.idempotencyKey,
      createdAt: now,
    });
    await ctx.db.patch("incidents", incident._id, {
      classification: args.failureType,
      recommendedAction: args.recommendedAction,
      currentWorkflowStep: "triage.ai_complete",
      updatedAt: now,
    });
    await moveIncidentForTriage(ctx, {
      incidentId: incident._id,
      currentState: incident.state,
      classification: args.failureType,
      action: args.recommendedAction,
      idempotencyKey: args.idempotencyKey,
      requestHash: args.requestHash,
      now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: incident.projectId,
      actorType: "system",
      action: "triage.ai_residue_persisted",
      targetType: "incident",
      targetId: String(incident._id),
      payload: { triageRecordId, modelCallId: modelCall._id },
      createdAt: now,
    });
    return {
      triageRecordId,
      duplicate: false,
      classification: args.failureType,
      recommendedAction: args.recommendedAction,
      repeatedFetchRequired: false,
    };
  },
});
