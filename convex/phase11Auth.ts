import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

type DatabaseCtx = QueryCtx | MutationCtx;
export type OrganizationRole = Doc<"organizationMemberships">["role"];
export const KEVLAR_RELEASE_PROJECT_SLUG = "kevlar-core";

const projectReadRoles = [
  "owner",
  "admin",
  "operator",
  "reviewer",
  "developer",
  "viewer",
] as const;

export async function requireAuthUser(
  ctx: DatabaseCtx,
): Promise<Doc<"authUsers">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  const authUserId = await getAuthUserId(ctx);
  const user = authUserId
    ? await ctx.db
        .query("authUsers")
        .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId))
        .unique()
    : await ctx.db
        .query("authUsers")
        .withIndex("by_tokenIdentifier", (q) =>
          q.eq("tokenIdentifier", identity.tokenIdentifier),
        )
        .unique();
  if (!user || user.status !== "active")
    throw new Error("Authenticated user is not active");
  return user;
}

export async function requireOrganizationRole(
  ctx: DatabaseCtx,
  organizationId: Id<"organizations">,
  allowed: readonly OrganizationRole[],
): Promise<{
  user: Doc<"authUsers">;
  membership: Doc<"organizationMemberships">;
}> {
  const user = await requireAuthUser(ctx);
  const membership = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_organizationId_and_userId", (q) =>
      q.eq("organizationId", organizationId).eq("userId", user._id),
    )
    .unique();
  if (
    !membership ||
    membership.status !== "active" ||
    !allowed.includes(membership.role)
  )
    throw new Error("Forbidden organization operation");
  return { user, membership };
}

export async function requireProjectRole(
  ctx: DatabaseCtx,
  projectId: Id<"projects">,
  allowed: readonly OrganizationRole[],
): Promise<{
  user: Doc<"authUsers">;
  membership: Doc<"organizationMemberships">;
  tenancy: Doc<"projectTenancies">;
}> {
  const tenancy = await ctx.db
    .query("projectTenancies")
    .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
    .unique();
  if (!tenancy) throw new Error("Project has no tenant assignment");
  const auth = await requireOrganizationRole(
    ctx,
    tenancy.organizationId,
    allowed,
  );
  return { ...auth, tenancy };
}

export async function requireProjectReadAccess(
  ctx: DatabaseCtx,
  projectId: Id<"projects">,
): Promise<Doc<"projects">> {
  const project = await ctx.db.get("projects", projectId);
  if (!project || project.deletionState === "deleted")
    throw new Error("Project is unavailable");
  if (project.status === "active" && project.publicReadStatus === "published")
    return project;
  await requireProjectRole(ctx, projectId, projectReadRoles);
  return project;
}

export async function resolveKevlarReleaseProjectReadAccess(
  ctx: DatabaseCtx,
): Promise<Doc<"projects"> | null> {
  const project = await ctx.db
    .query("projects")
    .withIndex("by_slug", (q) => q.eq("slug", KEVLAR_RELEASE_PROJECT_SLUG))
    .unique();
  if (!project) return null;
  return await requireProjectReadAccess(ctx, project._id);
}

export function assertProjectScope(
  projectId: Id<"projects">,
  resources: readonly ({ projectId?: Id<"projects"> } | null | undefined)[],
): void {
  if (
    resources.some((resource) => resource && resource.projectId !== projectId)
  )
    throw new Error("Cross-project data relationship");
}

export async function requireAnyAdministrativeRole(ctx: DatabaseCtx): Promise<{
  user: Doc<"authUsers">;
  membership: Doc<"organizationMemberships">;
}> {
  const user = await requireAuthUser(ctx);
  const memberships = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_userId_and_status", (q) =>
      q.eq("userId", user._id).eq("status", "active"),
    )
    .take(50);
  const membership = memberships.find(
    (item) => item.role === "owner" || item.role === "admin",
  );
  if (!membership) throw new Error("Administrative organization role required");
  return { user, membership };
}

const secretPattern =
  /(authorization|api[-_]?key|token|password|secret|cookie|private[-_]?key)/i;

export function redactSecurityPayload(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[REDACTED_DEPTH]";
  if (Array.isArray(value))
    return value
      .slice(0, 100)
      .map((item) => redactSecurityPayload(item, depth + 1));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    ).slice(0, 100))
      result[key] = secretPattern.test(key)
        ? "[REDACTED]"
        : redactSecurityPayload(child, depth + 1);
    return result;
  }
  if (
    typeof value === "string" &&
    /(?:kv_|whsec_|bearer\s|-----BEGIN)/i.test(value)
  )
    return "[REDACTED]";
  return value;
}
