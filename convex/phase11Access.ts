import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import { organizationRoleValidator } from "./phase11Validators";
import {
  KEVLAR_RELEASE_PROJECT_SLUG,
  requireAuthUser,
  requireOrganizationRole,
} from "./phase11Auth";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requirePhase5IngestKey } from "./phase5Auth";

export const syncCurrentUser = mutation({
  args: {},
  returns: schema.doc("authUsers"),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) throw new Error("Convex Auth user is missing");
    const providerUser = await ctx.db.get("users", authUserId);
    if (!providerUser) throw new Error("Convex Auth user record is missing");
    const existing =
      (await ctx.db
        .query("authUsers")
        .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId))
        .unique()) ??
      (await ctx.db
        .query("authUsers")
        .withIndex("by_tokenIdentifier", (q) =>
          q.eq("tokenIdentifier", identity.tokenIdentifier),
        )
        .unique());
    const now = Date.now();
    if (existing) {
      await ctx.db.patch("authUsers", existing._id, {
        authUserId,
        displayName: providerUser.name ?? identity.name ?? existing.displayName,
        email: providerUser.email ?? identity.email ?? existing.email,
        updatedAt: now,
      });
      return (await ctx.db.get("authUsers", existing._id))!;
    }
    const id = await ctx.db.insert("authUsers", {
      authUserId,
      tokenIdentifier: identity.tokenIdentifier,
      subject: identity.subject,
      displayName:
        providerUser.name ??
        identity.name ??
        providerUser.email ??
        identity.email ??
        "Password user",
      email: providerUser.email ?? identity.email,
      authMethod: "password",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return (await ctx.db.get("authUsers", id))!;
  },
});

export const createOrganization = mutation({
  args: { slug: v.string(), name: v.string() },
  returns: v.object({
    organization: schema.doc("organizations"),
    membership: schema.doc("organizationMemberships"),
  }),
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(args.slug))
      throw new Error("Invalid organization slug");
    if (args.name.length < 1 || args.name.length > 120)
      throw new Error("Invalid organization name");
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (existing) throw new Error("Organization slug already exists");
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", {
      slug: args.slug,
      name: args.name,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const membershipId = await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: user._id,
      role: "owner",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return {
      organization: (await ctx.db.get("organizations", organizationId))!,
      membership: (await ctx.db.get("organizationMemberships", membershipId))!,
    };
  },
});

export const organizationsForCurrentUser = query({
  args: {},
  returns: v.array(
    v.object({
      organization: schema.doc("organizations"),
      role: organizationRoleValidator,
    }),
  ),
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_userId_and_status", (q) =>
        q.eq("userId", user._id).eq("status", "active"),
      )
      .take(50);
    const result: {
      organization: Doc<"organizations">;
      role: Doc<"organizationMemberships">["role"];
    }[] = [];
    for (const membership of memberships) {
      const organization = await ctx.db.get(
        "organizations",
        membership.organizationId,
      );
      if (organization?.status === "active")
        result.push({ organization, role: membership.role });
    }
    return result;
  },
});

export const tenantOverview = query({
  args: { organizationId: v.id("organizations") },
  returns: v.object({
    projects: v.array(schema.doc("projects")),
    alerts: v.array(schema.doc("operationsAlerts")),
    costSnapshots: v.array(schema.doc("operationsCostSnapshots")),
    freshnessSnapshots: v.array(schema.doc("operationsFreshnessSnapshots")),
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
    const tenancies = await ctx.db
      .query("projectTenancies")
      .withIndex("by_organizationId_and_projectId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .take(100);
    const projects = (
      await Promise.all(
        tenancies.map((item) => ctx.db.get("projects", item.projectId)),
      )
    ).filter((item): item is Doc<"projects"> => item !== null);
    const alerts = await ctx.db
      .query("operationsAlerts")
      .withIndex("by_organizationId_and_status_and_createdAt", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "open"),
      )
      .order("desc")
      .take(50);
    const costSnapshots = (
      await Promise.all(
        projects.slice(0, 20).map((project) =>
          ctx.db
            .query("operationsCostSnapshots")
            .withIndex("by_projectId_and_capturedAt", (q) =>
              q.eq("projectId", project._id),
            )
            .order("desc")
            .first(),
        ),
      )
    ).filter((item): item is Doc<"operationsCostSnapshots"> => item !== null);
    const freshnessSnapshots = (
      await Promise.all(
        projects.slice(0, 20).map((project) =>
          ctx.db
            .query("operationsFreshnessSnapshots")
            .withIndex("by_projectId_and_capturedAt", (q) =>
              q.eq("projectId", project._id),
            )
            .order("desc")
            .first(),
        ),
      )
    ).filter(
      (item): item is Doc<"operationsFreshnessSnapshots"> => item !== null,
    );
    const projectIds = new Set(projects.map((project) => project._id));
    if (
      tenancies.some(
        (tenancy) => tenancy.organizationId !== args.organizationId,
      ) ||
      alerts.some(
        (alert) =>
          alert.organizationId !== args.organizationId ||
          (alert.projectId !== undefined && !projectIds.has(alert.projectId)),
      ) ||
      costSnapshots.some(
        (snapshot) =>
          snapshot.organizationId !== args.organizationId ||
          !projectIds.has(snapshot.projectId),
      ) ||
      freshnessSnapshots.some(
        (snapshot) =>
          snapshot.organizationId !== args.organizationId ||
          !projectIds.has(snapshot.projectId),
      )
    )
      throw new Error("Cross-tenant overview relationship");
    return { projects, alerts, costSnapshots, freshnessSnapshots };
  },
});

export const setKevlarCorePublicRead = mutation({
  args: {
    ingestKey: v.string(),
    published: v.boolean(),
    operationKey: v.string(),
  },
  returns: schema.doc("projects"),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    if (args.operationKey.length < 1 || args.operationKey.length > 250)
      throw new Error("operationKey must contain 1-250 characters");
    const project = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", KEVLAR_RELEASE_PROJECT_SLUG))
      .unique();
    if (!project) throw new Error("Kevlar release project not found");
    if (
      args.published &&
      (project.status !== "active" || project.deletionState === "deleted")
    )
      throw new Error(
        "Only the active, non-deleted release project may be published",
      );
    const nextStatus = args.published ? "published" : "private";
    const now = Date.now();
    if (project.publicReadStatus !== nextStatus) {
      await ctx.db.patch("projects", project._id, {
        publicReadStatus: nextStatus,
        updatedAt: now,
      });
      await ctx.db.insert("auditEvents", {
        projectId: project._id,
        actorType: "system",
        action: args.published
          ? "project.public_read.published"
          : "project.public_read.unpublished",
        targetType: "project",
        targetId: String(project._id),
        payload: {
          slug: KEVLAR_RELEASE_PROJECT_SLUG,
          previousStatus: project.publicReadStatus ?? "private",
          nextStatus,
          operationKey: args.operationKey,
        },
        createdAt: now,
      });
    }
    return (await ctx.db.get("projects", project._id))!;
  },
});
