import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const latestBaseline = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const run = await ctx.db
      .query("runs")
      .withIndex("by_mode_and_startedAt", (q) => q.eq("mode", "baseline"))
      .order("desc")
      .first();
    if (!run) return null;

    const [row, evidence] = await Promise.all([
      ctx.db
        .query("rows")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .first(),
      ctx.db
        .query("evidence")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .take(100),
    ]);
    const collector = await ctx.db.get(run.collectorId);

    return { run, row, evidence, collector };
  },
});

export const ingestBaseline = mutation({
  args: {
    ingestKey: v.string(),
    collectorPlatformId: v.string(),
    targetUrl: v.string(),
    brightDataJobId: v.string(),
    rawPayload: v.any(),
    outputHash: v.string(),
    recordHash: v.string(),
    evidence: v.array(
      v.object({
        kind: v.union(
          v.literal("html"),
          v.literal("screenshot"),
          v.literal("jsonld"),
          v.literal("network_response"),
          v.literal("visible_context"),
        ),
        sourceUrl: v.string(),
        contentHash: v.string(),
        metadata: v.any(),
        capturedAt: v.number(),
      }),
    ),
  },
  returns: v.object({ runId: v.id("runs"), duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const expectedKey = process.env.KEVLAR_BASELINE_INGEST_KEY;
    if (!expectedKey || args.ingestKey !== expectedKey)
      throw new Error("Unauthorized baseline ingestion");

    const duplicate = await ctx.db
      .query("runs")
      .withIndex("by_bright_data_job", (q) =>
        q.eq("brightDataJobId", args.brightDataJobId),
      )
      .unique();
    if (duplicate) return { runId: duplicate._id, duplicate: true };

    const now = Date.now();
    let project = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", "kevlar-core"))
      .unique();
    if (!project) {
      const projectId = await ctx.db.insert("projects", {
        name: "Kevlar Core",
        slug: "kevlar-core",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      project = await ctx.db.get(projectId);
    }
    if (!project) throw new Error("Unable to create project");

    let collector = await ctx.db
      .query("collectors")
      .withIndex("by_platform_id", (q) =>
        q.eq("collectorId", args.collectorPlatformId),
      )
      .unique();
    if (!collector) {
      const collectorId = await ctx.db.insert("collectors", {
        projectId: project._id,
        collectorId: args.collectorPlatformId,
        name: "Nova product pricing",
        workerType: "browser",
        targetUrl: args.targetUrl,
        createdAfterKickoff: true,
        status: "published",
      });
      collector = await ctx.db.get(collectorId);
    }
    if (!collector) throw new Error("Unable to create collector");

    const runId = await ctx.db.insert("runs", {
      projectId: project._id,
      collectorId: collector._id,
      mode: "baseline",
      status: "validating",
      brightDataJobId: args.brightDataJobId,
      startedAt: now,
      completedAt: now,
      outputHash: args.outputHash,
      rowCount: 1,
    });

    await ctx.db.insert("rows", {
      runId,
      entityId: "nova-headphones",
      rawPayload: args.rawPayload,
      normalizedPayload: args.rawPayload,
      fieldTrust: {
        state: "needs_review",
        reason: "semantic contract scheduled for Week 2",
      },
      recordHash: args.recordHash,
    });

    for (const item of args.evidence) {
      await ctx.db.insert("evidence", {
        projectId: project._id,
        runId,
        ...item,
      });
    }

    await ctx.db.insert("auditEvents", {
      projectId: project._id,
      actorType: "system",
      action: "baseline.ingested",
      targetType: "run",
      targetId: String(runId),
      payload: {
        collectorPlatformId: args.collectorPlatformId,
        brightDataJobId: args.brightDataJobId,
      },
      createdAt: now,
    });

    return { runId, duplicate: false };
  },
});
