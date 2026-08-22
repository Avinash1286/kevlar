import { v } from "convex/values";
import { query } from "./_generated/server";
import schema from "./schema";

export const incidentCourtroom = query({
  args: { incidentId: v.id("incidents") },
  returns: v.union(
    v.null(),
    v.object({
      incident: schema.doc("incidents"),
      healAttempts: v.array(schema.doc("healAttempts")),
      tribunalChecks: v.array(schema.doc("tribunalChecks")),
      repairDecisions: v.array(schema.doc("repairDecisions")),
      benchmarkRuns: v.array(schema.doc("benchmarkRuns")),
      certificates: v.array(schema.doc("certificates")),
      evidenceLinks: v.array(schema.doc("phase4EvidenceLinks")),
    }),
  ),
  handler: async (ctx, args) => {
    const incident = await ctx.db.get("incidents", args.incidentId);
    if (!incident) return null;
    const [
      healAttempts,
      tribunalChecks,
      repairDecisions,
      benchmarkRuns,
      certificates,
      evidenceLinks,
    ] = await Promise.all([
      ctx.db
        .query("healAttempts")
        .withIndex("by_incidentId_and_createdAt", (q) =>
          q.eq("incidentId", incident._id),
        )
        .order("desc")
        .take(5),
      ctx.db
        .query("tribunalChecks")
        .withIndex("by_incidentId_and_createdAt", (q) =>
          q.eq("incidentId", incident._id),
        )
        .order("desc")
        .take(12),
      ctx.db
        .query("repairDecisions")
        .withIndex("by_incidentId_and_createdAt", (q) =>
          q.eq("incidentId", incident._id),
        )
        .order("desc")
        .take(10),
      ctx.db
        .query("benchmarkRuns")
        .withIndex("by_incidentId_and_startedAt", (q) =>
          q.eq("incidentId", incident._id),
        )
        .order("desc")
        .take(8),
      ctx.db
        .query("certificates")
        .withIndex("by_incidentId_and_createdAt", (q) =>
          q.eq("incidentId", incident._id),
        )
        .order("desc")
        .take(5),
      ctx.db
        .query("phase4EvidenceLinks")
        .withIndex("by_incidentId_and_createdAt", (q) =>
          q.eq("incidentId", incident._id),
        )
        .order("desc")
        .take(50),
    ]);
    return {
      incident,
      healAttempts,
      tribunalChecks,
      repairDecisions,
      benchmarkRuns,
      certificates,
      evidenceLinks,
    };
  },
});

export const certificateBySlug = query({
  args: { publicSlug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      certificate: schema.doc("certificates"),
      incident: v.union(schema.doc("incidents"), v.null()),
      collector: v.union(schema.doc("collectors"), v.null()),
      healAttempt: v.union(schema.doc("healAttempts"), v.null()),
      benchmarkRun: v.union(schema.doc("benchmarkRuns"), v.null()),
      results: v.array(schema.doc("benchmarkCaseResults")),
      tribunalChecks: v.array(schema.doc("tribunalChecks")),
      evidenceLinks: v.array(schema.doc("phase4EvidenceLinks")),
    }),
  ),
  handler: async (ctx, args) => {
    const certificate = await ctx.db
      .query("certificates")
      .withIndex("by_publicSlug", (q) => q.eq("publicSlug", args.publicSlug))
      .unique();
    if (!certificate) return null;
    const [
      incident,
      collector,
      healAttempt,
      benchmarkRun,
      results,
      tribunalChecks,
      evidenceLinks,
    ] = await Promise.all([
      ctx.db.get("incidents", certificate.incidentId),
      ctx.db.get("collectors", certificate.collectorId),
      ctx.db.get("healAttempts", certificate.healAttemptId),
      ctx.db.get("benchmarkRuns", certificate.benchmarkRunId),
      ctx.db
        .query("benchmarkCaseResults")
        .withIndex("by_benchmarkRunId_and_createdAt", (q) =>
          q.eq("benchmarkRunId", certificate.benchmarkRunId),
        )
        .take(16),
      ctx.db
        .query("tribunalChecks")
        .withIndex("by_healAttemptId_and_check", (q) =>
          q.eq("healAttemptId", certificate.healAttemptId),
        )
        .take(8),
      ctx.db
        .query("phase4EvidenceLinks")
        .withIndex("by_certificateId_and_createdAt", (q) =>
          q.eq("certificateId", certificate._id),
        )
        .take(20),
    ]);
    return {
      certificate,
      incident,
      collector,
      healAttempt,
      benchmarkRun,
      results,
      tribunalChecks,
      evidenceLinks,
    };
  },
});

export const gauntlet = query({
  args: { incidentId: v.optional(v.id("incidents")) },
  returns: v.object({
    catalog: v.array(schema.doc("repairMutations")),
    benchmarkRun: v.union(schema.doc("benchmarkRuns"), v.null()),
    results: v.array(schema.doc("benchmarkCaseResults")),
  }),
  handler: async (ctx, args) => {
    const catalog = await ctx.db
      .query("repairMutations")
      .withIndex("by_catalogVersion_and_code", (q) =>
        q.eq("catalogVersion", "core-v1"),
      )
      .take(8);
    const benchmarkRun = args.incidentId
      ? await ctx.db
          .query("benchmarkRuns")
          .withIndex("by_incidentId_and_startedAt", (q) =>
            q.eq("incidentId", args.incidentId!),
          )
          .order("desc")
          .first()
      : await ctx.db
          .query("benchmarkRuns")
          .withIndex("by_startedAt")
          .order("desc")
          .first();
    const results = benchmarkRun
      ? await ctx.db
          .query("benchmarkCaseResults")
          .withIndex("by_benchmarkRunId_and_createdAt", (q) =>
            q.eq("benchmarkRunId", benchmarkRun._id),
          )
          .take(16)
      : [];
    return { catalog, benchmarkRun, results };
  },
});
