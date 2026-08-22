import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { performIncidentTransition } from "./incidentStateMachine";
import { assertOperationText, requirePhase4IngestKey } from "./phase4Auth";
import { requireProjectRole } from "./phase11Auth";

export const decide = mutation({
  args: {
    ingestKey: v.string(),
    healAttemptId: v.id("healAttempts"),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    reason: v.string(),
    providerApprovalRef: v.optional(v.string()),
    operationKey: v.string(),
    requestHash: v.string(),
  },
  returns: v.object({
    repairDecisionId: v.id("repairDecisions"),
    duplicate: v.boolean(),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    authorizeProviderApproval: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase4IngestKey(args.ingestKey);
    assertOperationText(args.operationKey, "operationKey");
    assertOperationText(args.requestHash, "requestHash");
    if (args.reason.length === 0 || args.reason.length > 1_000)
      throw new Error("Decision reason must contain 1-1000 characters");
    const attempt = await ctx.db.get("healAttempts", args.healAttemptId);
    if (!attempt) throw new Error("Heal attempt not found");
    const auth = await requireProjectRole(ctx, attempt.projectId, [
      "owner",
      "admin",
      "reviewer",
    ]);
    const actorId = String(auth.user._id);

    const byOperation = await ctx.db
      .query("repairDecisions")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (byOperation) {
      if (byOperation.requestHash !== args.requestHash)
        throw new Error("Idempotency key was reused with a different request");
      return {
        repairDecisionId: byOperation._id,
        duplicate: true,
        decision: byOperation.decision,
        authorizeProviderApproval: false,
      };
    }
    const original = await ctx.db
      .query("repairDecisions")
      .withIndex("by_healAttemptId_and_createdAt", (q) =>
        q.eq("healAttemptId", args.healAttemptId),
      )
      .order("asc")
      .first();
    if (original)
      return {
        repairDecisionId: original._id,
        duplicate: true,
        decision: original.decision,
        authorizeProviderApproval: false,
      };

    if (attempt.status !== "preview_ready")
      throw new Error("Only a preview-ready heal attempt can be decided");
    const incident = await ctx.db.get("incidents", attempt.incidentId);
    if (!incident) throw new Error("Incident not found");
    const checks = await ctx.db
      .query("tribunalChecks")
      .withIndex("by_healAttemptId_and_check", (q) =>
        q.eq("healAttemptId", attempt._id),
      )
      .take(8);
    const checkStatus = new Map(
      checks.map((check) => [check.check, check.status]),
    );
    if (args.decision === "approved") {
      if (checkStatus.get("preview_contract") !== "pass")
        throw new Error("Preview contract must pass before approval");
      if (checkStatus.get("evidence_support") !== "pass")
        throw new Error("Evidence support must pass before approval");
      const selector = checkStatus.get("selector_risk");
      if (selector !== "pass" && selector !== "deferred")
        throw new Error("Selector risk must pass or be explicitly deferred");
    }

    const now = Date.now();
    let humanCheck = checkStatus.has("human_review")
      ? (checks.find((check) => check.check === "human_review") ?? null)
      : null;
    if (!humanCheck) {
      const humanCheckId = await ctx.db.insert("tribunalChecks", {
        projectId: attempt.projectId,
        incidentId: attempt.incidentId,
        healAttemptId: attempt._id,
        check: "human_review",
        status: args.decision === "approved" ? "pass" : "fail",
        summary: `Human ${args.decision} the repair candidate.`,
        details: { actorId, reason: args.reason },
        operationKey: `${args.operationKey}:human-review`,
        createdAt: now,
        updatedAt: now,
      });
      humanCheck = await ctx.db.get("tribunalChecks", humanCheckId);
    } else {
      await ctx.db.patch("tribunalChecks", humanCheck._id, {
        status: args.decision === "approved" ? "pass" : "fail",
        summary: `Human ${args.decision} the repair candidate.`,
        details: { actorId, reason: args.reason },
        operationKey: `${args.operationKey}:human-review`,
        updatedAt: now,
      });
    }

    const repairDecisionId = await ctx.db.insert("repairDecisions", {
      projectId: attempt.projectId,
      incidentId: attempt.incidentId,
      healAttemptId: attempt._id,
      decision: args.decision,
      reason: args.reason,
      actorId,
      operationKey: args.operationKey,
      requestHash: args.requestHash,
      ...(args.providerApprovalRef
        ? { providerApprovalRef: args.providerApprovalRef }
        : {}),
      createdAt: now,
    });
    await ctx.db.patch("healAttempts", attempt._id, {
      status: args.decision,
      completedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("healAttemptEvents", {
      projectId: attempt.projectId,
      incidentId: attempt.incidentId,
      healAttemptId: attempt._id,
      fromStatus: attempt.status,
      toStatus: args.decision,
      operationKey: args.operationKey,
      requestHash: args.requestHash,
      details: { repairDecisionId, actorId },
      createdAt: now,
    });

    let currentState = incident.state;
    if (currentState === "awaiting_preview") {
      await performIncidentTransition(ctx, {
        incidentId: incident._id,
        toState: "awaiting_human",
        reason: "Repair preview entered explicit human review",
        actorType: "user",
        actorId,
        idempotencyKey: `${args.operationKey}:awaiting-human`,
        requestHash: args.requestHash,
        details: { healAttemptId: attempt._id },
        now,
      });
      currentState = "awaiting_human";
    }
    if (currentState !== "awaiting_human")
      throw new Error(`Incident cannot be decided from state ${currentState}`);
    await performIncidentTransition(ctx, {
      incidentId: incident._id,
      toState: args.decision === "approved" ? "approved" : "quarantined",
      reason: `Human ${args.decision} repair candidate`,
      actorType: "user",
      actorId,
      idempotencyKey: `${args.operationKey}:decision`,
      requestHash: args.requestHash,
      details: { healAttemptId: attempt._id, repairDecisionId },
      now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: attempt.projectId,
      actorType: "user",
      actorId,
      action: `repair.${args.decision}`,
      targetType: "heal_attempt",
      targetId: String(attempt._id),
      payload: {
        repairDecisionId,
        authorizeProviderApproval:
          args.decision === "approved" && !args.providerApprovalRef,
      },
      createdAt: now,
    });
    return {
      repairDecisionId,
      duplicate: false,
      decision: args.decision,
      authorizeProviderApproval:
        args.decision === "approved" && !args.providerApprovalRef,
    };
  },
});

export const recordProviderApproval = mutation({
  args: {
    ingestKey: v.string(),
    repairDecisionId: v.id("repairDecisions"),
    providerApprovalRef: v.string(),
    operationKey: v.string(),
    requestHash: v.string(),
  },
  returns: v.object({ duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    requirePhase4IngestKey(args.ingestKey);
    assertOperationText(args.operationKey, "operationKey");
    assertOperationText(args.requestHash, "requestHash");
    assertOperationText(args.providerApprovalRef, "providerApprovalRef");
    const operation = await ctx.db
      .query("idempotencyRecords")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (operation) {
      if (operation.requestHash !== args.requestHash)
        throw new Error("Idempotency key was reused with a different request");
      return { duplicate: true };
    }
    const decision = await ctx.db.get("repairDecisions", args.repairDecisionId);
    if (!decision || decision.decision !== "approved")
      throw new Error(
        "Provider approval can only attach to an approved decision",
      );
    if (decision.providerApprovalRef) return { duplicate: true };
    const now = Date.now();
    await ctx.db.patch("repairDecisions", decision._id, {
      providerApprovalRef: args.providerApprovalRef,
    });
    await ctx.db.insert("idempotencyRecords", {
      projectId: decision.projectId,
      incidentId: decision.incidentId,
      operationKey: args.operationKey,
      scope: "external_call",
      status: "completed",
      requestHash: args.requestHash,
      externalCallRef: args.providerApprovalRef,
      result: { repairDecisionId: decision._id },
      attempts: 1,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: decision.projectId,
      actorType: "provider",
      actorId: "bright-data",
      action: "repair.provider_approval_recorded",
      targetType: "heal_attempt",
      targetId: String(decision.healAttemptId),
      payload: {
        repairDecisionId: decision._id,
        providerApprovalRef: args.providerApprovalRef,
      },
      createdAt: now,
    });
    return { duplicate: false };
  },
});
