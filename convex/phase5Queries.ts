import { v } from "convex/values";
import { query } from "./_generated/server";
import schema from "./schema";

export const catalog = query({
  args: { domainPackKey: v.optional(v.string()) },
  returns: v.object({
    domainPack: v.union(schema.doc("domainPacks"), v.null()),
    sources: v.array(schema.doc("sources")),
    endpoints: v.array(schema.doc("sourceEndpoints")),
    authorities: v.array(schema.doc("sourceAuthorities")),
    reviews: v.array(schema.doc("sourceReviews")),
    certifications: v.array(schema.doc("sourceCertifications")),
    bindings: v.array(schema.doc("collectorBindings")),
    schedules: v.array(schema.doc("schedulePolicies")),
  }),
  handler: async (ctx, args) => {
    const domainPack = await ctx.db
      .query("domainPacks")
      .withIndex("by_key", (q) =>
        q.eq("key", args.domainPackKey ?? "ai-infrastructure"),
      )
      .unique();
    if (!domainPack)
      return {
        domainPack: null,
        sources: [],
        endpoints: [],
        authorities: [],
        reviews: [],
        certifications: [],
        bindings: [],
        schedules: [],
      };
    const statuses = [
      "draft",
      "onboarding",
      "active",
      "paused",
      "retired",
    ] as const;
    const sourceGroups = await Promise.all(
      statuses.map((status) =>
        ctx.db
          .query("sources")
          .withIndex("by_domainPackId_and_lifecycleStatus", (q) =>
            q.eq("domainPackId", domainPack._id).eq("lifecycleStatus", status),
          )
          .take(20),
      ),
    );
    const sources = sourceGroups.flat().slice(0, 50);
    const endpoints = (
      await Promise.all(
        sources.map((source) =>
          ctx.db
            .query("sourceEndpoints")
            .withIndex("by_sourceId_and_approvalStatus", (q) =>
              q.eq("sourceId", source._id),
            )
            .take(10),
        ),
      )
    )
      .flat()
      .slice(0, 100);
    const authorities = (
      await Promise.all(
        sources.map((source) =>
          ctx.db
            .query("sourceAuthorities")
            .withIndex("by_sourceId_and_active", (q) =>
              q.eq("sourceId", source._id),
            )
            .take(50),
        ),
      )
    )
      .flat()
      .slice(0, 150);
    const reviews = (
      await Promise.all(
        sources.map((source) =>
          ctx.db
            .query("sourceReviews")
            .withIndex("by_sourceId_and_createdAt", (q) =>
              q.eq("sourceId", source._id),
            )
            .order("desc")
            .take(5),
        ),
      )
    )
      .flat()
      .slice(0, 100);
    const certifications = (
      await Promise.all(
        sources.map((source) =>
          ctx.db
            .query("sourceCertifications")
            .withIndex("by_sourceId_and_createdAt", (q) =>
              q.eq("sourceId", source._id),
            )
            .order("desc")
            .take(10),
        ),
      )
    )
      .flat()
      .slice(0, 100);
    const bindingStatuses = [
      "draft",
      "onboarding",
      "active",
      "cooling",
      "failing",
      "paused",
      "disabled",
    ] as const;
    const productionBindings = (
      await Promise.all(
        sources.flatMap((source) =>
          bindingStatuses.map((status) =>
            ctx.db
              .query("collectorBindings")
              .withIndex("by_sourceId_and_lifecycleStatus", (q) =>
                q.eq("sourceId", source._id).eq("lifecycleStatus", status),
              )
              .take(10),
          ),
        ),
      )
    )
      .flat()
      .slice(0, 100);
    const regressionBindings = await ctx.db
      .query("collectorBindings")
      .withIndex("by_bindingKind_and_updatedAt", (q) =>
        q.eq("bindingKind", "regression"),
      )
      .order("desc")
      .take(20);
    const bindings = [...productionBindings, ...regressionBindings].slice(
      0,
      100,
    );
    const schedules = (
      await Promise.all(
        bindings.map((binding) =>
          ctx.db
            .query("schedulePolicies")
            .withIndex("by_bindingId", (q) => q.eq("bindingId", binding._id))
            .unique(),
        ),
      )
    ).filter((policy) => policy !== null);
    return {
      domainPack,
      sources,
      endpoints,
      authorities,
      reviews,
      certifications,
      bindings,
      schedules,
    };
  },
});

export const fleet = query({
  args: { now: v.number() },
  returns: v.object({
    due: v.array(schema.doc("fleetQueueItems")),
    leased: v.array(schema.doc("fleetQueueItems")),
    leases: v.array(schema.doc("fleetLeases")),
    health: v.array(schema.doc("sourceHealth")),
    observations: v.array(schema.doc("aiInfrastructureObservations")),
  }),
  handler: async (ctx, args) => {
    const [
      due,
      leased,
      leases,
      healthy,
      cooling,
      failing,
      verified,
      quarantined,
    ] = await Promise.all([
      ctx.db
        .query("fleetQueueItems")
        .withIndex("by_state_and_dueAt", (q) =>
          q.eq("state", "due").lte("dueAt", args.now),
        )
        .take(50),
      ctx.db
        .query("fleetQueueItems")
        .withIndex("by_state_and_dueAt", (q) => q.eq("state", "leased"))
        .take(50),
      ctx.db
        .query("fleetLeases")
        .withIndex("by_status_and_expiresAt", (q) => q.eq("status", "active"))
        .take(50),
      ctx.db
        .query("sourceHealth")
        .withIndex("by_state_and_cooldownUntil", (q) =>
          q.eq("state", "healthy"),
        )
        .take(50),
      ctx.db
        .query("sourceHealth")
        .withIndex("by_state_and_cooldownUntil", (q) =>
          q.eq("state", "cooling"),
        )
        .take(50),
      ctx.db
        .query("sourceHealth")
        .withIndex("by_state_and_cooldownUntil", (q) =>
          q.eq("state", "failing"),
        )
        .take(50),
      ctx.db
        .query("aiInfrastructureObservations")
        .withIndex("by_trust_and_createdAt", (q) => q.eq("trust", "verified"))
        .order("desc")
        .take(25),
      ctx.db
        .query("aiInfrastructureObservations")
        .withIndex("by_trust_and_createdAt", (q) =>
          q.eq("trust", "quarantined"),
        )
        .order("desc")
        .take(25),
    ]);
    return {
      due,
      leased,
      leases,
      health: [...healthy, ...cooling, ...failing],
      observations: [...verified, ...quarantined]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 50),
    };
  },
});
