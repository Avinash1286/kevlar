/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");
const now = 1_787_400_000;

async function authzFixture() {
  const t = convexTest(schema, modules);
  const providerUsers = await t.run(async (ctx) => ({
    owner: await ctx.db.insert("users", {
      name: "Owner",
      email: "owner@example.test",
    }),
    admin: await ctx.db.insert("users", {
      name: "Admin",
      email: "admin@example.test",
    }),
    viewer: await ctx.db.insert("users", {
      name: "Viewer",
      email: "viewer@example.test",
    }),
    foreignOwner: await ctx.db.insert("users", {
      name: "Foreign owner",
      email: "foreign-owner@example.test",
    }),
  }));

  const withIdentity = (userId: string, email: string) =>
    t.withIdentity({
      subject: userId,
      issuer: "https://auth.test",
      tokenIdentifier: `https://auth.test|${userId}`,
      email,
    });

  const owner = withIdentity(String(providerUsers.owner), "owner@example.test");
  const admin = withIdentity(String(providerUsers.admin), "admin@example.test");
  const viewer = withIdentity(
    String(providerUsers.viewer),
    "viewer@example.test",
  );
  const foreignOwner = withIdentity(
    String(providerUsers.foreignOwner),
    "foreign-owner@example.test",
  );

  const [ownerUser, adminUser, viewerUser, foreignUser] = await Promise.all([
    owner.mutation(api.phase11Access.syncCurrentUser, {}),
    admin.mutation(api.phase11Access.syncCurrentUser, {}),
    viewer.mutation(api.phase11Access.syncCurrentUser, {}),
    foreignOwner.mutation(api.phase11Access.syncCurrentUser, {}),
  ]);

  const ids = await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert("organizations", {
      slug: "primary-authz",
      name: "Primary authz",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const foreignOrganizationId = await ctx.db.insert("organizations", {
      slug: "foreign-authz",
      name: "Foreign authz",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await Promise.all([
      ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: ownerUser._id,
        role: "owner",
        status: "active",
        createdAt: now,
        updatedAt: now,
      }),
      ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: adminUser._id,
        role: "admin",
        status: "active",
        createdAt: now,
        updatedAt: now,
      }),
      ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: viewerUser._id,
        role: "viewer",
        status: "active",
        createdAt: now,
        updatedAt: now,
      }),
      ctx.db.insert("organizationMemberships", {
        organizationId: foreignOrganizationId,
        userId: foreignUser._id,
        role: "owner",
        status: "active",
        createdAt: now,
        updatedAt: now,
      }),
    ]);

    const projectId = await ctx.db.insert("projects", {
      name: "Protected project",
      slug: "protected-project",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("projectTenancies", {
      projectId,
      organizationId,
      createdAt: now,
    });

    const endpointId = await ctx.db.insert("webhookEndpoints", {
      projectId,
      name: "Sensitive endpoint",
      url: "https://hooks.example.test/tenant-secret-path",
      status: "active",
      operationKey: "test:endpoint",
      createdAt: now,
      updatedAt: now,
    });
    const secretVersionId = await ctx.db.insert("webhookSecretVersions", {
      endpointId,
      version: 1,
      secretHash: `sha256:${"a".repeat(64)}`,
      secretRef: "vault://tenant-sensitive-secret",
      status: "active",
      operationKey: "test:endpoint-secret",
      createdAt: now,
    });
    await ctx.db.patch("webhookEndpoints", endpointId, {
      activeSecretVersionId: secretVersionId,
    });
    const subscriptionId = await ctx.db.insert("filteredSubscriptions", {
      projectId,
      name: "Protected subscription",
      channel: "webhook",
      filters: {
        eventTypes: ["price_changed"],
        entityTypes: ["product"],
        predicates: ["price"],
        includeCorrections: false,
      },
      webhookEndpointId: endpointId,
      status: "active",
      operationKey: "test:subscription",
      createdAt: now,
      updatedAt: now,
    });
    const deliveryId = await ctx.db.insert("webhookDeliveries", {
      projectId,
      subscriptionId,
      endpointId,
      eventExternalId: "evt-sensitive",
      mode: "test",
      payload: { accessToken: "must-never-leak", price: 129 },
      payloadHash: `sha256:${"b".repeat(64)}`,
      idempotencyKey: "tenant-sensitive-idempotency-key",
      status: "delivered",
      attemptCount: 1,
      maxAttempts: 6,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    });
    await ctx.db.insert("webhookDeliveryAttempts", {
      deliveryId,
      attempt: 1,
      requestId: "sensitive-provider-request-id",
      outcome: "success",
      responseStatus: 200,
      responseSnippet: "private downstream response",
      latencyMs: 42,
      secretVersionId,
      signatureTimestamp: now,
      signatureInput: `${now}.private-payload`,
      signature: `v1=${"c".repeat(64)}`,
      bodyHash: `sha256:${"d".repeat(64)}`,
      createdAt: now,
    });

    return { projectId, deliveryId };
  });

  return { t, owner, admin, viewer, foreignOwner, ...ids };
}

const keyArgs = (projectId: Id<"projects">, suffix: string) => ({
  projectId,
  name: `${suffix} key`,
  rawKey: `fixture-key-material-${suffix}-at-least-24`,
  scopes: ["facts:read" as const],
  rateLimitPerMinute: 10,
  operationKey: `test:api-key:${suffix}`,
});

describe("Phase 10 authorization hardening", () => {
  it("rejects unauthenticated and cross-tenant API-key creation", async () => {
    const { t, foreignOwner, projectId } = await authzFixture();

    await expect(
      t.action(api.phase10Admin.createApiKey, keyArgs(projectId, "anonymous")),
    ).rejects.toThrow("Unauthenticated");
    await expect(
      foreignOwner.action(
        api.phase10Admin.createApiKey,
        keyArgs(projectId, "foreign"),
      ),
    ).rejects.toThrow(/Forbidden|tenant|organization/i);

    const keys = await t.run(async (ctx) => ctx.db.query("apiKeys").take(10));
    expect(keys).toHaveLength(0);
  });

  it("allows project owners and administrators to create API keys", async () => {
    const { owner, admin, projectId } = await authzFixture();

    const ownerKey = await owner.action(
      api.phase10Admin.createApiKey,
      keyArgs(projectId, "owner"),
    );
    const adminKey = await admin.action(
      api.phase10Admin.createApiKey,
      keyArgs(projectId, "admin"),
    );

    expect(ownerKey).toMatchObject({ projectId, status: "active" });
    expect(adminKey).toMatchObject({ projectId, status: "active" });
  });

  it("rejects unauthenticated and cross-tenant delivery reads", async () => {
    const { t, foreignOwner, deliveryId } = await authzFixture();

    await expect(
      t.query(api.phase10Deliveries.delivery, { deliveryId }),
    ).rejects.toThrow("Unauthenticated");
    await expect(
      foreignOwner.query(api.phase10Deliveries.delivery, { deliveryId }),
    ).rejects.toThrow(/Forbidden|tenant|organization/i);
  });

  it("allows tenant members and administrators a redacted delivery view", async () => {
    const { viewer, admin, deliveryId } = await authzFixture();

    const memberView = await viewer.query(api.phase10Deliveries.delivery, {
      deliveryId,
    });
    const adminView = await admin.query(api.phase10Deliveries.delivery, {
      deliveryId,
    });

    expect(memberView?.delivery.status).toBe("delivered");
    expect(adminView?.delivery.status).toBe("delivered");
    expect(memberView?.attempts).toHaveLength(1);
    expect(memberView?.delivery).not.toHaveProperty("payload");
    expect(memberView?.delivery).not.toHaveProperty("idempotencyKey");
    expect(memberView?.endpoint).not.toHaveProperty("url");
    expect(memberView?.endpoint).not.toHaveProperty("activeSecretVersionId");
    expect(memberView?.attempts[0]).not.toHaveProperty("responseSnippet");
    expect(memberView?.attempts[0]).not.toHaveProperty("signature");
    expect(memberView?.attempts[0]).not.toHaveProperty("signatureInput");
    expect(memberView?.attempts[0]).not.toHaveProperty("secretVersionId");
  });
});
