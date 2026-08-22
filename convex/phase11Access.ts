import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import { organizationRoleValidator } from "./phase11Validators";
import { requireAuthUser, requireOrganizationRole } from "./phase11Auth";
import { getAuthUserId } from "@convex-dev/auth/server";

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
    const existing = (await ctx.db.query("authUsers").withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId)).unique()) ?? (await ctx.db.query("authUsers").withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier)).unique());
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
      displayName: providerUser.name ?? identity.name ?? providerUser.email ?? identity.email ?? "Password user",
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
  returns: v.object({ organization: schema.doc("organizations"), membership: schema.doc("organizationMemberships") }),
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(args.slug)) throw new Error("Invalid organization slug");
    if (args.name.length < 1 || args.name.length > 120) throw new Error("Invalid organization name");
    const existing = await ctx.db.query("organizations").withIndex("by_slug", (q) => q.eq("slug", args.slug)).unique();
    if (existing) throw new Error("Organization slug already exists");
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", { slug: args.slug, name: args.name, status: "active", createdAt: now, updatedAt: now });
    const membershipId = await ctx.db.insert("organizationMemberships", { organizationId, userId: user._id, role: "owner", status: "active", createdAt: now, updatedAt: now });
    return { organization: (await ctx.db.get("organizations", organizationId))!, membership: (await ctx.db.get("organizationMemberships", membershipId))! };
  },
});

export const organizationsForCurrentUser = query({
  args: {},
  returns: v.array(v.object({ organization: schema.doc("organizations"), role: organizationRoleValidator })),
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    const memberships = await ctx.db.query("organizationMemberships").withIndex("by_userId_and_status", (q) => q.eq("userId", user._id).eq("status", "active")).take(50);
    const result: { organization: Doc<"organizations">; role: Doc<"organizationMemberships">["role"] }[] = [];
    for (const membership of memberships) {
      const organization = await ctx.db.get("organizations", membership.organizationId);
      if (organization?.status === "active") result.push({ organization, role: membership.role });
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
    await requireOrganizationRole(ctx, args.organizationId, ["owner", "admin", "operator", "reviewer", "developer", "viewer"]);
    const tenancies = await ctx.db.query("projectTenancies").withIndex("by_organizationId_and_projectId", (q) => q.eq("organizationId", args.organizationId)).take(100);
    const projects = (await Promise.all(tenancies.map((item) => ctx.db.get("projects", item.projectId)))).filter((item): item is Doc<"projects"> => item !== null);
    const alerts = await ctx.db.query("operationsAlerts").withIndex("by_organizationId_and_status_and_createdAt", (q) => q.eq("organizationId", args.organizationId).eq("status", "open")).order("desc").take(50);
    const costSnapshots = (await Promise.all(projects.slice(0, 20).map((project) => ctx.db.query("operationsCostSnapshots").withIndex("by_projectId_and_capturedAt", (q) => q.eq("projectId", project._id)).order("desc").first()))).filter((item): item is Doc<"operationsCostSnapshots"> => item !== null);
    const freshnessSnapshots = (await Promise.all(projects.slice(0, 20).map((project) => ctx.db.query("operationsFreshnessSnapshots").withIndex("by_projectId_and_capturedAt", (q) => q.eq("projectId", project._id)).order("desc").first()))).filter((item): item is Doc<"operationsFreshnessSnapshots"> => item !== null);
    return { projects, alerts, costSnapshots, freshnessSnapshots };
  },
});
