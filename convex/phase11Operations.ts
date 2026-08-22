import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import schema from "./schema";
import {
  assertProjectScope,
  requireOrganizationRole,
  requireProjectRole,
  redactSecurityPayload,
} from "./phase11Auth";

export const registerSecretReference = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    provider: v.string(),
    secretRef: v.string(),
    version: v.number(),
    operationKey: v.string(),
  },
  returns: schema.doc("secretReferences"),
  handler: async (ctx, args) => {
    const auth = await requireOrganizationRole(ctx, args.organizationId, [
      "owner",
      "admin",
    ]);
    if (
      args.secretRef.length < 8 ||
      args.secretRef.length > 300 ||
      /(?:whsec_|kv_live_|-----BEGIN)/.test(args.secretRef)
    )
      throw new Error("Only an external vault reference may be stored");
    const prior = await ctx.db
      .query("secretReferences")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (prior) return prior;
    const now = Date.now();
    const id = await ctx.db.insert("secretReferences", {
      ...args,
      status: "active",
      createdAt: now,
    });
    await ctx.db.insert("securityAuditEvents", {
      organizationId: args.organizationId,
      actorUserId: auth.user._id,
      action: "secret.reference.registered",
      targetType: "secret_reference",
      targetId: String(id),
      decision: "allowed",
      reason: "External secret reference accepted",
      redactedPayload: redactSecurityPayload({
        name: args.name,
        provider: args.provider,
        secretRef: args.secretRef,
      }),
      operationKey: args.operationKey,
      createdAt: now,
    });
    return (await ctx.db.get("secretReferences", id))!;
  },
});

export const requestBackupExport = mutation({
  args: {
    projectId: v.id("projects"),
    kind: v.union(v.literal("backup"), v.literal("export")),
    operationKey: v.string(),
  },
  returns: schema.doc("backupExportRecords"),
  handler: async (ctx, args) => {
    const auth = await requireProjectRole(ctx, args.projectId, [
      "owner",
      "admin",
    ]);
    const prior = await ctx.db
      .query("backupExportRecords")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (prior) return prior;
    const id = await ctx.db.insert("backupExportRecords", {
      organizationId: auth.tenancy.organizationId,
      projectId: args.projectId,
      kind: args.kind,
      status: "requested",
      requestedAt: Date.now(),
      operationKey: args.operationKey,
    });
    return (await ctx.db.get("backupExportRecords", id))!;
  },
});

export const acknowledgeAlert = mutation({
  args: { alertId: v.id("operationsAlerts") },
  returns: schema.doc("operationsAlerts"),
  handler: async (ctx, args) => {
    const alert = await ctx.db.get("operationsAlerts", args.alertId);
    if (!alert) throw new Error("Alert not found");
    await requireOrganizationRole(ctx, alert.organizationId, [
      "owner",
      "admin",
      "operator",
    ]);
    if (alert.status === "open")
      await ctx.db.patch("operationsAlerts", alert._id, {
        status: "acknowledged",
      });
    return (await ctx.db.get("operationsAlerts", alert._id))!;
  },
});

export const operations = query({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.optional(v.id("projects")),
  },
  returns: v.object({
    alerts: v.array(schema.doc("operationsAlerts")),
    runbooks: v.array(schema.doc("operationsRunbooks")),
    backups: v.array(schema.doc("backupExportRecords")),
    costs: v.array(schema.doc("operationsCostSnapshots")),
    freshness: v.array(schema.doc("operationsFreshnessSnapshots")),
  }),
  handler: async (ctx, args) => {
    await requireOrganizationRole(ctx, args.organizationId, [
      "owner",
      "admin",
      "operator",
      "reviewer",
      "developer",
      "viewer",
    ]);
    if (args.projectId) {
      const projectAuth = await requireProjectRole(ctx, args.projectId, [
        "owner",
        "admin",
        "operator",
        "reviewer",
        "developer",
        "viewer",
      ]);
      if (projectAuth.tenancy.organizationId !== args.organizationId)
        throw new Error("Cross-tenant project relationship");
    }
    const alerts = await ctx.db
      .query("operationsAlerts")
      .withIndex("by_organizationId_and_status_and_createdAt", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "open"),
      )
      .order("desc")
      .take(100);
    const runbooks = await ctx.db
      .query("operationsRunbooks")
      .withIndex("by_key_and_revision")
      .order("desc")
      .take(50);
    const backups = args.projectId
      ? await ctx.db
          .query("backupExportRecords")
          .withIndex("by_projectId_and_requestedAt", (q) =>
            q.eq("projectId", args.projectId!),
          )
          .order("desc")
          .take(50)
      : [];
    const costs = args.projectId
      ? await ctx.db
          .query("operationsCostSnapshots")
          .withIndex("by_projectId_and_capturedAt", (q) =>
            q.eq("projectId", args.projectId!),
          )
          .order("desc")
          .take(50)
      : [];
    const freshness = args.projectId
      ? await ctx.db
          .query("operationsFreshnessSnapshots")
          .withIndex("by_projectId_and_capturedAt", (q) =>
            q.eq("projectId", args.projectId!),
          )
          .order("desc")
          .take(50)
      : [];
    if (args.projectId)
      assertProjectScope(args.projectId, [...backups, ...costs, ...freshness]);
    return { alerts, runbooks, backups, costs, freshness };
  },
});
