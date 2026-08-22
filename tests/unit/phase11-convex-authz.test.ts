import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");
async function tenantFixture() {
  const t = convexTest(schema, modules);
  const providerUsers = await t.run(async (ctx) => ({
    primary: await ctx.db.insert("users", { name: "Primary", email: "primary@example.test" }),
    foreign: await ctx.db.insert("users", { name: "Foreign", email: "foreign@example.test" }),
  }));
  const primaryIdentity = { subject: String(providerUsers.primary), issuer: "https://auth.test", tokenIdentifier: `https://auth.test|${providerUsers.primary}`, email: "primary@example.test" };
  const foreignIdentity = { subject: String(providerUsers.foreign), issuer: "https://auth.test", tokenIdentifier: `https://auth.test|${providerUsers.foreign}`, email: "foreign@example.test" };
  const primary = t.withIdentity(primaryIdentity);
  const foreign = t.withIdentity(foreignIdentity);
  const primaryUser = await primary.mutation(api.phase11Access.syncCurrentUser, {});
  const foreignUser = await foreign.mutation(api.phase11Access.syncCurrentUser, {});
  const ids = await t.run(async (ctx) => {
    const now = 1_787_400_000;
    const primaryOrganizationId = await ctx.db.insert("organizations", { slug: "primary", name: "Primary", status: "active", createdAt: now, updatedAt: now });
    const foreignOrganizationId = await ctx.db.insert("organizations", { slug: "foreign", name: "Foreign", status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: primaryOrganizationId, userId: primaryUser._id, role: "owner", status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: foreignOrganizationId, userId: foreignUser._id, role: "owner", status: "active", createdAt: now, updatedAt: now });
    const projectId = await ctx.db.insert("projects", { name: "Primary project", slug: "primary-project", status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("projectTenancies", { projectId, organizationId: primaryOrganizationId, createdAt: now });
    return { projectId, primaryOrganizationId, foreignOrganizationId };
  });
  return { t, primary, foreign, ...ids };
}

describe("Phase 11 Convex authorization", () => {
  it("allows a member to read only their own tenant overview", async () => {
    const { primary, primaryOrganizationId, foreignOrganizationId } = await tenantFixture();
    await expect(primary.query(api.phase11Access.tenantOverview, { organizationId: primaryOrganizationId })).resolves.toMatchObject({ projects: [{ slug: "primary-project" }] });
    await expect(primary.query(api.phase11Access.tenantOverview, { organizationId: foreignOrganizationId })).rejects.toThrow("Forbidden organization operation");
  });

  it("blocks a foreign organization owner from creating a key in another tenant", async () => {
    const { foreign, projectId } = await tenantFixture();
    await expect(foreign.action(api.phase10Admin.createApiKey, { projectId, name: "cross-tenant key", rawKey: "fixture-key-material-at-least-24", scopes: ["facts:read"], rateLimitPerMinute: 10, operationKey: "phase11:test:foreign-key" })).rejects.toThrow(/Forbidden|tenant|organization/i);
  });

  it("blocks unauthenticated tenant reads", async () => {
    const { t, primaryOrganizationId } = await tenantFixture();
    await expect(t.query(api.phase11Access.tenantOverview, { organizationId: primaryOrganizationId })).rejects.toThrow("Unauthenticated");
  });
});
