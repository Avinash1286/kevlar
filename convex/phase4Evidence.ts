import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { assertOperationText, requirePhase4IngestKey } from "./phase4Auth";
import { phase4EvidenceKindValidator } from "./phase4Validators";

export const persist = mutation({
  args: {
    ingestKey: v.string(),
    projectId: v.id("projects"),
    incidentId: v.id("incidents"),
    runId: v.optional(v.id("runs")),
    kind: phase4EvidenceKindValidator,
    sourceUrl: v.string(),
    storageId: v.optional(v.id("_storage")),
    contentHash: v.string(),
    metadata: v.any(),
    capturedAt: v.number(),
    operationKey: v.string(),
  },
  returns: v.object({
    evidenceId: v.id("evidence"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase4IngestKey(args.ingestKey);
    assertOperationText(args.operationKey, "operationKey");
    assertOperationText(args.contentHash, "contentHash");
    assertOperationText(args.sourceUrl, "sourceUrl");

    const existing = await ctx.db
      .query("evidence")
      .withIndex("by_phase4OperationKey", (q) =>
        q.eq("phase4OperationKey", args.operationKey),
      )
      .unique();
    if (existing) return { evidenceId: existing._id, duplicate: true };

    const incident = await ctx.db.get("incidents", args.incidentId);
    if (!incident || incident.projectId !== args.projectId)
      throw new Error("Evidence incident does not belong to the project");
    if (args.runId) {
      const run = await ctx.db.get("runs", args.runId);
      if (!run || run.projectId !== args.projectId)
        throw new Error("Evidence run does not belong to the project");
    }

    const evidenceId = await ctx.db.insert("evidence", {
      projectId: args.projectId,
      ...(args.runId ? { runId: args.runId } : {}),
      kind: args.kind,
      sourceUrl: args.sourceUrl,
      ...(args.storageId ? { storageId: args.storageId } : {}),
      contentHash: args.contentHash,
      metadata: args.metadata,
      phase4OperationKey: args.operationKey,
      capturedAt: args.capturedAt,
    });
    await ctx.db.insert("auditEvents", {
      projectId: args.projectId,
      actorType: "system",
      action: "phase4.evidence_persisted",
      targetType: "evidence",
      targetId: String(evidenceId),
      payload: {
        incidentId: args.incidentId,
        kind: args.kind,
        contentHash: args.contentHash,
      },
      createdAt: Date.now(),
    });
    return { evidenceId, duplicate: false };
  },
});
