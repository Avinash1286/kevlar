import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const reserveExternalOperation = internalMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    incidentId: v.optional(v.id("incidents")),
    operationKey: v.string(),
    requestHash: v.string(),
    expiresAt: v.optional(v.number()),
  },
  returns: v.object({
    recordId: v.id("idempotencyRecords"),
    acquired: v.boolean(),
    status: v.union(
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    externalCallRef: v.union(v.string(), v.null()),
    result: v.any(),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("idempotencyRecords")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (existing) {
      if (
        existing.scope !== "external_call" ||
        existing.requestHash !== args.requestHash
      )
        throw new Error("Idempotency key was already used for another request");
      return {
        recordId: existing._id,
        acquired: false,
        status: existing.status,
        externalCallRef: existing.externalCallRef ?? null,
        result: existing.result ?? null,
      };
    }

    const now = Date.now();
    const recordId = await ctx.db.insert("idempotencyRecords", {
      ...(args.projectId ? { projectId: args.projectId } : {}),
      ...(args.incidentId ? { incidentId: args.incidentId } : {}),
      operationKey: args.operationKey,
      scope: "external_call",
      status: "in_progress",
      requestHash: args.requestHash,
      attempts: 1,
      ...(args.expiresAt ? { expiresAt: args.expiresAt } : {}),
      createdAt: now,
      updatedAt: now,
    });
    return {
      recordId,
      acquired: true,
      status: "in_progress" as const,
      externalCallRef: null,
      result: null,
    };
  },
});

export const completeExternalOperation = internalMutation({
  args: {
    recordId: v.id("idempotencyRecords"),
    requestHash: v.string(),
    externalCallRef: v.optional(v.string()),
    result: v.any(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const record = await ctx.db.get("idempotencyRecords", args.recordId);
    if (!record || record.scope !== "external_call")
      throw new Error("External operation reservation not found");
    if (record.requestHash !== args.requestHash)
      throw new Error("External operation request hash mismatch");
    if (record.status === "completed") return null;
    await ctx.db.patch("idempotencyRecords", record._id, {
      status: "completed",
      result: args.result,
      ...(args.externalCallRef
        ? { externalCallRef: args.externalCallRef }
        : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const failExternalOperation = internalMutation({
  args: {
    recordId: v.id("idempotencyRecords"),
    requestHash: v.string(),
    errorCode: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const record = await ctx.db.get("idempotencyRecords", args.recordId);
    if (!record || record.scope !== "external_call")
      throw new Error("External operation reservation not found");
    if (record.requestHash !== args.requestHash)
      throw new Error("External operation request hash mismatch");
    if (record.status === "completed") return null;
    await ctx.db.patch("idempotencyRecords", record._id, {
      status: "failed",
      result: { errorCode: args.errorCode },
      attempts: record.attempts + 1,
      updatedAt: Date.now(),
    });
    return null;
  },
});
