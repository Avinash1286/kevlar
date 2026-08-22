import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const projectForIncident = internalQuery({
  args: { incidentId: v.id("incidents") },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const incident = await ctx.db.get("incidents", args.incidentId);
    if (!incident) throw new Error("Incident not found");
    return incident.projectId;
  },
});

export const ensureScenarioRun = internalMutation({
  args: {
    sourceRunId: v.id("runs"),
    scenarioKey: v.string(),
    scenario: v.union(
      v.literal("semantic_swap"),
      v.literal("transport_failure"),
      v.literal("soft_block"),
      v.literal("legitimate_empty"),
      v.literal("all_provider_failure"),
    ),
  },
  returns: v.object({ runId: v.id("runs"), duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const brightDataJobId = `phase3:${args.scenarioKey}`;
    const existing = await ctx.db
      .query("runs")
      .withIndex("by_bright_data_job", (q) =>
        q.eq("brightDataJobId", brightDataJobId),
      )
      .unique();
    if (existing) {
      const source = await ctx.db.get("runs", args.sourceRunId);
      if (!source || existing.projectId !== source.projectId)
        throw new Error("scenarioKey belongs to another project");
      return { runId: existing._id, duplicate: true };
    }
    const source = await ctx.db.get("runs", args.sourceRunId);
    if (!source) throw new Error("Source run not found");
    const sourceRows =
      args.scenario === "semantic_swap"
        ? await ctx.db
            .query("rows")
            .withIndex("by_run", (q) => q.eq("runId", source._id))
            .take(100)
        : [];
    const sourceEvidence =
      args.scenario === "semantic_swap"
        ? await ctx.db
            .query("evidence")
            .withIndex("by_run", (q) => q.eq("runId", source._id))
            .take(50)
        : [];
    if (args.scenario === "semantic_swap") {
      if (!source.outputHash || sourceRows.length === 0)
        throw new Error(
          "Semantic-swap scenarios require source output and row evidence",
        );
      if (source.rowCount !== undefined && source.rowCount > sourceRows.length)
        throw new Error("Source run exceeds the bounded scenario clone limit");
    }
    const now = Date.now();
    const runId = await ctx.db.insert("runs", {
      projectId: source.projectId,
      collectorId: source.collectorId,
      mode: "verification",
      mutationId: `phase3-control:${args.scenario}`,
      status: args.scenario === "transport_failure" ? "failed" : "quarantined",
      brightDataJobId,
      startedAt: now,
      completedAt: now,
      outputHash:
        args.scenario === "semantic_swap"
          ? source.outputHash
          : `phase3-control:${args.scenarioKey}`,
      rowCount: sourceRows.length,
    });
    for (const row of sourceRows)
      await ctx.db.insert("rows", {
        runId,
        entityId: row.entityId,
        rawPayload: row.rawPayload,
        normalizedPayload: row.normalizedPayload,
        fieldTrust: row.fieldTrust,
        recordHash: row.recordHash,
      });
    for (const evidence of sourceEvidence)
      await ctx.db.insert("evidence", {
        projectId: source.projectId,
        runId,
        kind: evidence.kind,
        sourceUrl: evidence.sourceUrl,
        ...(evidence.storageId ? { storageId: evidence.storageId } : {}),
        contentHash: evidence.contentHash,
        metadata: evidence.metadata,
        capturedAt: evidence.capturedAt,
      });
    await ctx.db.insert("auditEvents", {
      projectId: source.projectId,
      actorType: "system",
      action: "phase3.control_run_created",
      targetType: "run",
      targetId: String(runId),
      payload: {
        scenario: args.scenario,
        scenarioKey: args.scenarioKey,
        sourceRunId: source._id,
        sourceOutputHash: source.outputHash ?? null,
        clonedRows: sourceRows.length,
        clonedEvidence: sourceEvidence.length,
        synthetic: true,
      },
      createdAt: now,
    });
    return { runId, duplicate: false };
  },
});
