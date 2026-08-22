/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");
const ingestKey = "test-phase5-pending-source-seed";

beforeEach(() => {
  vi.stubEnv("KEVLAR_BASELINE_INGEST_KEY", ingestKey);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Phase 5 pending source seeding", () => {
  it("registers provider-active Anthropic collectors without approving or scheduling them", async () => {
    const t = convexTest(schema, modules);
    const now = 1_787_400_000;
    await t.run(async (ctx) => {
      await ctx.db.insert("projects", {
        name: "Kevlar Core",
        slug: "kevlar-core",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    });

    const first = await t.mutation(api.phase5Catalog.seedCatalog, {
      ingestKey,
    });
    const second = await t.mutation(api.phase5Catalog.seedCatalog, {
      ingestKey,
    });
    expect(first.sourceIds).toHaveLength(5);
    expect(second.sourceIds).toEqual(first.sourceIds);

    const state = await t.run(async (ctx) => {
      const sources = await ctx.db.query("sources").collect();
      const endpoints = await ctx.db.query("sourceEndpoints").collect();
      const authorities = await ctx.db.query("sourceAuthorities").collect();
      const reviews = await ctx.db.query("sourceReviews").collect();
      const health = await ctx.db.query("sourceHealth").collect();
      const collectors = await ctx.db.query("collectors").collect();
      const bindings = await ctx.db.query("collectorBindings").collect();
      const schedules = await ctx.db.query("schedulePolicies").collect();
      const audits = await ctx.db.query("auditEvents").collect();
      return {
        sources,
        endpoints,
        authorities,
        reviews,
        health,
        collectors,
        bindings,
        schedules,
        audits,
      };
    });

    const pendingKeys = new Set(["anthropic-pricing", "anthropic-models"]);
    const pendingSources = state.sources.filter((source) =>
      pendingKeys.has(source.key),
    );
    expect(pendingSources).toHaveLength(2);
    expect(
      pendingSources.every(
        (source) =>
          source.approvalStatus === "pending" &&
          source.lifecycleStatus === "onboarding",
      ),
    ).toBe(true);

    for (const source of pendingSources) {
      const endpoint = state.endpoints.find(
        (item) => item.sourceId === source._id,
      );
      expect(endpoint).toMatchObject({
        public: true,
        approvalStatus: "pending",
      });
      expect(
        state.authorities
          .filter((item) => item.sourceId === source._id)
          .every((item) => item.active === false),
      ).toBe(true);
      expect(
        state.reviews.find((item) => item.sourceId === source._id),
      ).toMatchObject({ decision: "pending" });
      expect(
        state.health.find((item) => item.sourceId === source._id),
      ).toMatchObject({ state: "failing", consecutiveFailures: 1 });

      const collector = state.collectors.find(
        (item) => item.name === source.name,
      );
      expect(collector?.collectorId).toMatch(/^c_/);
      const binding = state.bindings.find(
        (item) =>
          item.sourceId === source._id && item.collectorId === collector?._id,
      );
      expect(binding).toMatchObject({
        lifecycleStatus: "onboarding",
        coreGateStatus: "pending",
        bypassCore: false,
      });
      expect(
        state.schedules.some((item) => item.bindingId === binding?._id),
      ).toBe(false);
    }

    expect(
      state.audits.filter(
        (event) =>
          event.action === "phase5.catalog_seeded" &&
          (event.payload as { sourceCount?: unknown }).sourceCount === 5,
      ),
    ).toHaveLength(1);
  });
});
