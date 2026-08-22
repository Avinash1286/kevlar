/// <reference types="vite/client" />

import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");
const ingestKey = "test-phase5-automation-ingest-key";
const now = 1_787_400_000;

beforeEach(() => {
  vi.stubEnv("KEVLAR_BASELINE_INGEST_KEY", ingestKey);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function seededFixture() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("projects", {
      name: "Kevlar Core",
      slug: "kevlar-core",
      status: "active",
      publicReadStatus: "published",
      createdAt: now,
      updatedAt: now,
    });
  });
  await t.mutation(api.phase5Catalog.seedCatalog, { ingestKey });
  return t;
}

describe("Phase 5 secure fleet automation", () => {
  it("resolves internal binding IDs only through the ingest-key boundary", async () => {
    const t = await seededFixture();
    await expect(
      t.mutation(api.phase5Catalog.resolveFleetBinding, {
        ingestKey: "wrong-key",
        sourceKey: "anthropic-pricing",
        collectorPlatformId: "c_mt4e7tgw1i46wxboqa",
      }),
    ).rejects.toThrow(/Unauthorized Phase 5/i);
    await expect(
      t.mutation(api.phase5Catalog.resolveFleetBinding, {
        ingestKey,
        sourceKey: "anthropic-pricing",
        collectorPlatformId: "c_mt4e811ufis8kdvlt",
      }),
    ).rejects.toThrow(/does not match/i);

    const resolved = await t.mutation(api.phase5Catalog.resolveFleetBinding, {
      ingestKey,
      sourceKey: "anthropic-pricing",
      collectorPlatformId: "c_mt4e7tgw1i46wxboqa",
    });
    expect(resolved).toMatchObject({ policyReady: false });
    expect(resolved.sourceId).toBeTruthy();
    expect(resolved.endpointId).toBeTruthy();
    expect(resolved.collectorId).toBeTruthy();
    expect(resolved.bindingId).toBeTruthy();

    const publicCatalog = await t.query(api.phase5Queries.catalog, {});
    expect(publicCatalog.bindings.length).toBeGreaterThan(0);
    expect(JSON.stringify(publicCatalog.bindings)).not.toContain("collectorId");
  });

  it("activates only the verified Anthropic source policy and is idempotent", async () => {
    const t = await seededFixture();
    const activation = {
      ingestKey,
      sourceKey: "anthropic-pricing" as const,
      collectorPlatformId: "c_mt4e7tgw1i46wxboqa",
      verificationSnapshotId: "j_verified_pricing_001",
      verifiedRowCount: 1 as const,
      operationKey: "phase5:anthropic-pricing:policy:j_verified_pricing_001",
    };
    await expect(
      t.mutation(api.phase5Catalog.activateVerifiedAnthropicPolicy, {
        ...activation,
        ingestKey: "wrong-key",
      }),
    ).rejects.toThrow(/Unauthorized Phase 5/i);
    await expect(
      t.mutation(api.phase5Catalog.activateVerifiedAnthropicPolicy, {
        ...activation,
        verificationSnapshotId: "invalid snapshot/id",
      }),
    ).rejects.toThrow(/invalid format/i);
    await expect(
      t.mutation(api.phase5Catalog.activateVerifiedAnthropicPolicy, {
        ...activation,
        sourceKey: "openai-pricing" as "anthropic-pricing",
        collectorPlatformId: "c_mt460ht33qmbg7m8k",
      }),
    ).rejects.toThrow();

    const first = await t.mutation(
      api.phase5Catalog.activateVerifiedAnthropicPolicy,
      activation,
    );
    const second = await t.mutation(
      api.phase5Catalog.activateVerifiedAnthropicPolicy,
      activation,
    );
    expect(first.duplicate).toBe(false);
    expect(second).toEqual({ ...first, duplicate: true });
    expect(first.authorityIds).toHaveLength(2);
    await expect(
      t.mutation(api.phase5Catalog.activateVerifiedAnthropicPolicy, {
        ...activation,
        verificationSnapshotId: "j_verified_pricing_002",
      }),
    ).rejects.toThrow(/operationKey was reused/i);

    const resolved = await t.mutation(api.phase5Catalog.resolveFleetBinding, {
      ingestKey,
      sourceKey: "anthropic-pricing",
      collectorPlatformId: "c_mt4e7tgw1i46wxboqa",
    });
    expect(resolved.policyReady).toBe(true);
    const persisted = await t.run(async (ctx) => {
      const source = await ctx.db
        .query("sources")
        .withIndex("by_key", (q) => q.eq("key", "anthropic-pricing"))
        .unique();
      if (!source) throw new Error("test source missing");
      const endpoint = await ctx.db
        .query("sourceEndpoints")
        .withIndex("by_sourceId_and_approvalStatus", (q) =>
          q.eq("sourceId", source._id),
        )
        .unique();
      const authorities = await ctx.db
        .query("sourceAuthorities")
        .withIndex("by_sourceId_and_active", (q) =>
          q.eq("sourceId", source._id).eq("active", true),
        )
        .collect();
      const reviews = await ctx.db
        .query("sourceReviews")
        .withIndex("by_operationKey", (q) =>
          q.eq("operationKey", activation.operationKey),
        )
        .collect();
      const audits = (
        await ctx.db
          .query("auditEvents")
          .withIndex("by_target", (q) =>
            q.eq("targetType", "source").eq("targetId", String(source._id)),
          )
          .collect()
      ).filter(
        (event) => event.action === "phase5.verified_source_policy_activated",
      );
      return { source, endpoint, authorities, reviews, audits };
    });
    expect(persisted.source).toMatchObject({
      approvalStatus: "approved",
      lifecycleStatus: "active",
    });
    expect(persisted.endpoint?.approvalStatus).toBe("approved");
    expect(persisted.authorities).toHaveLength(2);
    expect(
      persisted.authorities.every(
        (authority) => authority.authority === "authoritative",
      ),
    ).toBe(true);
    expect(persisted.reviews).toHaveLength(1);
    expect(persisted.reviews[0]).toMatchObject({
      decision: "approved",
      reviewerId: "system:phase5-verified-collector-activation",
    });
    expect(persisted.audits).toHaveLength(1);
    expect(persisted.audits[0]?.payload).toMatchObject({
      verificationSnapshotId: "j_verified_pricing_001",
      verifiedRowCount: 1,
    });
  });

  it("keeps the fleet runner off the redacted public catalog", () => {
    const script = readFileSync("scripts/run-phase5-fleet.ts", "utf8");
    expect(script).not.toContain("phase5Queries:catalog");
    expect(script).toContain("phase5Catalog:resolveFleetBinding");
    expect(script).toContain("phase5Catalog:activateVerifiedAnthropicPolicy");
    expect(script).toContain("--activate-policy");
  });
});
