import { v } from "convex/values";
import { query } from "./_generated/server";
import schema from "./schema";
import { requireProjectRole } from "./phase11Auth";

const readRoles = [
  "owner",
  "admin",
  "operator",
  "reviewer",
  "developer",
  "viewer",
] as const;

export const retention = query({
  args: { projectId: v.id("projects") },
  returns: v.object({
    policies: v.array(schema.doc("evidenceRetentionPolicies")),
    runs: v.array(schema.doc("evidenceRetentionRuns")),
  }),
  handler: async (ctx, args) => {
    await requireProjectRole(ctx, args.projectId, readRoles);
    const policies = await ctx.db
      .query("evidenceRetentionPolicies")
      .withIndex("by_projectId_and_status", (q) =>
        q.eq("projectId", args.projectId),
      )
      .take(50);
    const runs = await ctx.db
      .query("evidenceRetentionRuns")
      .withIndex("by_projectId_and_createdAt", (q) =>
        q.eq("projectId", args.projectId),
      )
      .order("desc")
      .take(100);
    return { policies, runs };
  },
});

export const projectDeletion = query({
  args: { projectId: v.id("projects") },
  returns: v.object({
    project: v.union(schema.doc("projects"), v.null()),
    tombstone: v.union(schema.doc("projectDeletionTombstones"), v.null()),
    audits: v.array(schema.doc("securityAuditEvents")),
  }),
  handler: async (ctx, args) => {
    await requireProjectRole(ctx, args.projectId, readRoles);
    const [project, tombstone, audits] = await Promise.all([
      ctx.db.get("projects", args.projectId),
      ctx.db
        .query("projectDeletionTombstones")
        .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
        .unique(),
      ctx.db
        .query("securityAuditEvents")
        .withIndex("by_projectId_and_createdAt", (q) =>
          q.eq("projectId", args.projectId),
        )
        .order("desc")
        .take(50),
    ]);
    return { project, tombstone, audits };
  },
});

export const recovery = query({
  args: { projectId: v.id("projects") },
  returns: v.object({
    manifests: v.array(schema.doc("backupRestoreManifests")),
    backupRecords: v.array(schema.doc("backupExportRecords")),
  }),
  handler: async (ctx, args) => {
    await requireProjectRole(ctx, args.projectId, readRoles);
    const [manifests, backupRecords] = await Promise.all([
      ctx.db
        .query("backupRestoreManifests")
        .withIndex("by_projectId_and_capturedAt", (q) =>
          q.eq("projectId", args.projectId),
        )
        .order("desc")
        .take(20),
      ctx.db
        .query("backupExportRecords")
        .withIndex("by_projectId_and_requestedAt", (q) =>
          q.eq("projectId", args.projectId),
        )
        .order("desc")
        .take(20),
    ]);
    return { manifests, backupRecords };
  },
});
