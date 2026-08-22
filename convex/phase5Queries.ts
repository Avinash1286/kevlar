import { v } from "convex/values";
import { query } from "./_generated/server";
import schema from "./schema";
import {
  publicFleetResultValidator,
  readKevlarCoreFleet,
} from "./phase5PublicRead";
import { resolveKevlarReleaseProjectReadAccess } from "./phase11Auth";

const publicAuthorityValidator = v.object({
  _id: v.id("sourceAuthorities"),
  sourceId: v.id("sources"),
  predicate: v.string(),
  authority: v.string(),
  active: v.boolean(),
});

const publicReviewValidator = v.object({
  _id: v.id("sourceReviews"),
  sourceId: v.id("sources"),
  decision: v.string(),
  summary: v.string(),
  createdAt: v.number(),
});

const publicCertificationValidator = v.object({
  _id: v.id("sourceCertifications"),
  sourceId: v.id("sources"),
  endpointId: v.id("sourceEndpoints"),
  status: v.string(),
  contractVersion: v.string(),
  createdAt: v.number(),
});

const publicBindingValidator = v.object({
  _id: v.id("collectorBindings"),
  sourceId: v.optional(v.id("sources")),
  endpointId: v.optional(v.id("sourceEndpoints")),
  bindingKind: v.string(),
  lifecycleStatus: v.string(),
  coreGateStatus: v.string(),
  bypassCore: v.literal(false),
});

const publicScheduleValidator = v.object({
  _id: v.id("schedulePolicies"),
  bindingId: v.id("collectorBindings"),
  intervalMs: v.number(),
  jitterMs: v.number(),
  maxConcurrency: v.number(),
  dailyQuota: v.number(),
  weight: v.number(),
  baseBackoffMs: v.number(),
  maxBackoffMs: v.number(),
  failureThreshold: v.number(),
  enabled: v.boolean(),
});

export const catalog = query({
  args: { domainPackKey: v.optional(v.string()) },
  returns: v.object({
    domainPack: v.union(schema.doc("domainPacks"), v.null()),
    sources: v.array(schema.doc("sources")),
    endpoints: v.array(schema.doc("sourceEndpoints")),
    authorities: v.array(publicAuthorityValidator),
    reviews: v.array(publicReviewValidator),
    certifications: v.array(publicCertificationValidator),
    bindings: v.array(publicBindingValidator),
    schedules: v.array(publicScheduleValidator),
  }),
  handler: async (ctx, args) => {
    const project = await resolveKevlarReleaseProjectReadAccess(ctx);
    if (!project)
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
    const sources = sourceGroups
      .flat()
      .filter((source) => source.visibility === "public")
      .slice(0, 50);
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
      .filter((endpoint) => endpoint.public)
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
    const certificationCandidates = (
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
    ).flat();
    const collectors = await ctx.db
      .query("collectors")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .take(100);
    const collectorIds = new Set(collectors.map((collector) => collector._id));
    const endpointIds = new Set(endpoints.map((endpoint) => endpoint._id));
    const endpointById = new Map(
      endpoints.map((endpoint) => [endpoint._id, endpoint] as const),
    );
    const sourceIds = new Set(sources.map((source) => source._id));
    const certifications = certificationCandidates
      .filter(
        (certification) =>
          collectorIds.has(certification.collectorId) &&
          sourceIds.has(certification.sourceId) &&
          endpointIds.has(certification.endpointId) &&
          endpointById.get(certification.endpointId)?.sourceId ===
            certification.sourceId,
      )
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
    const bindings = [...productionBindings, ...regressionBindings]
      .filter(
        (binding) =>
          collectorIds.has(binding.collectorId) &&
          ((!binding.sourceId && !binding.endpointId) ||
            (binding.sourceId !== undefined &&
              binding.endpointId !== undefined &&
              sourceIds.has(binding.sourceId) &&
              endpointIds.has(binding.endpointId) &&
              endpointById.get(binding.endpointId)?.sourceId ===
                binding.sourceId)),
      )
      .slice(0, 100);
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
      authorities: authorities.map((item) => ({
        _id: item._id,
        sourceId: item.sourceId,
        predicate: item.predicate,
        authority: item.authority,
        active: item.active,
      })),
      reviews: reviews.map((item) => ({
        _id: item._id,
        sourceId: item.sourceId,
        decision: item.decision,
        summary: item.summary,
        createdAt: item.createdAt,
      })),
      certifications: certifications.map((item) => ({
        _id: item._id,
        sourceId: item.sourceId,
        endpointId: item.endpointId,
        status: item.status,
        contractVersion: item.contractVersion,
        createdAt: item.createdAt,
      })),
      bindings: bindings.map((item) => ({
        _id: item._id,
        sourceId: item.sourceId,
        endpointId: item.endpointId,
        bindingKind: item.bindingKind,
        lifecycleStatus: item.lifecycleStatus,
        coreGateStatus: item.coreGateStatus,
        bypassCore: item.bypassCore,
      })),
      schedules: schedules.map((item) => ({
        _id: item._id,
        bindingId: item.bindingId,
        intervalMs: item.intervalMs,
        jitterMs: item.jitterMs,
        maxConcurrency: item.maxConcurrency,
        dailyQuota: item.dailyQuota,
        weight: item.weight,
        baseBackoffMs: item.baseBackoffMs,
        maxBackoffMs: item.maxBackoffMs,
        failureThreshold: item.failureThreshold,
        enabled: item.enabled,
      })),
    };
  },
});

export const fleet = query({
  args: { now: v.number() },
  returns: publicFleetResultValidator,
  handler: async (ctx, args) => await readKevlarCoreFleet(ctx, args.now),
});
