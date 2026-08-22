import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { assertOperationText, requirePhase4IngestKey } from "./phase4Auth";
import {
  tribunalCheckKindValidator,
  tribunalStatusValidator,
} from "./phase4Validators";

export const upsertCheck = mutation({
  args: {
    ingestKey: v.string(),
    healAttemptId: v.id("healAttempts"),
    check: tribunalCheckKindValidator,
    status: tribunalStatusValidator,
    summary: v.string(),
    details: v.any(),
    evidenceIds: v.array(v.id("evidence")),
    operationKey: v.string(),
    requestHash: v.string(),
  },
  returns: v.object({
    tribunalCheckId: v.id("tribunalChecks"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase4IngestKey(args.ingestKey);
    assertOperationText(args.operationKey, "operationKey");
    assertOperationText(args.requestHash, "requestHash");
    if (args.summary.length === 0 || args.summary.length > 500)
      throw new Error("Tribunal summary must contain 1-500 characters");
    if (args.evidenceIds.length > 12)
      throw new Error("A Tribunal check may link at most 12 evidence items");
    const operation = await ctx.db
      .query("idempotencyRecords")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (operation) {
      if (operation.requestHash !== args.requestHash)
        throw new Error("Idempotency key was reused with a different request");
      const existing = await ctx.db
        .query("tribunalChecks")
        .withIndex("by_healAttemptId_and_check", (q) =>
          q.eq("healAttemptId", args.healAttemptId).eq("check", args.check),
        )
        .unique();
      if (!existing)
        throw new Error("Tribunal idempotency record has no check");
      return { tribunalCheckId: existing._id, duplicate: true };
    }

    const attempt = await ctx.db.get("healAttempts", args.healAttemptId);
    if (!attempt) throw new Error("Heal attempt not found");
    if (attempt.status !== "preview_ready" && attempt.status !== "approved")
      throw new Error(
        "Tribunal checks require a preview-ready or approved attempt",
      );
    for (const evidenceId of args.evidenceIds) {
      const evidence = await ctx.db.get("evidence", evidenceId);
      if (!evidence || evidence.projectId !== attempt.projectId)
        throw new Error(
          "Tribunal evidence does not belong to the repair project",
        );
    }

    const now = Date.now();
    let check = await ctx.db
      .query("tribunalChecks")
      .withIndex("by_healAttemptId_and_check", (q) =>
        q.eq("healAttemptId", attempt._id).eq("check", args.check),
      )
      .unique();
    if (!check) {
      const checkId = await ctx.db.insert("tribunalChecks", {
        projectId: attempt.projectId,
        incidentId: attempt.incidentId,
        healAttemptId: attempt._id,
        check: args.check,
        status: args.status,
        summary: args.summary,
        details: args.details,
        operationKey: args.operationKey,
        createdAt: now,
        updatedAt: now,
      });
      check = await ctx.db.get("tribunalChecks", checkId);
    } else {
      await ctx.db.patch("tribunalChecks", check._id, {
        status: args.status,
        summary: args.summary,
        details: args.details,
        operationKey: args.operationKey,
        updatedAt: now,
      });
      check = await ctx.db.get("tribunalChecks", check._id);
    }
    if (!check) throw new Error("Unable to persist Tribunal check");

    const relation =
      args.check === "preview_contract"
        ? "preview"
        : args.check === "evidence_support"
          ? "support"
          : args.check === "selector_risk"
            ? "selector"
            : "human_review";
    for (const evidenceId of args.evidenceIds) {
      await ctx.db.insert("phase4EvidenceLinks", {
        projectId: attempt.projectId,
        incidentId: attempt.incidentId,
        healAttemptId: attempt._id,
        tribunalCheckId: check._id,
        evidenceId,
        relation,
        operationKey: `${args.operationKey}:evidence:${evidenceId}`,
        createdAt: now,
      });
    }
    await ctx.db.insert("idempotencyRecords", {
      projectId: attempt.projectId,
      incidentId: attempt.incidentId,
      operationKey: args.operationKey,
      scope: "external_call",
      status: "completed",
      requestHash: args.requestHash,
      result: { tribunalCheckId: check._id },
      attempts: 1,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: attempt.projectId,
      actorType: "system",
      action: `tribunal.${args.check}.${args.status}`,
      targetType: "heal_attempt",
      targetId: String(attempt._id),
      payload: {
        tribunalCheckId: check._id,
        evidenceCount: args.evidenceIds.length,
      },
      createdAt: now,
    });
    return { tribunalCheckId: check._id, duplicate: false };
  },
});
