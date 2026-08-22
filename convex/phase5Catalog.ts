import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import schema from "./schema";
import { assertPhase5Text, requirePhase5IngestKey } from "./phase5Auth";
import {
  bindingLifecycleValidator,
  onboardingStatusValidator,
  sourceApprovalValidator,
} from "./phase5Validators";
import {
  requireAnyAdministrativeRole,
  requireAuthUser,
  requireProjectReadAccess,
  requireProjectRole,
} from "./phase11Auth";

const sourceSpecs = [
  {
    key: "openai-pricing",
    name: "OpenAI API pricing",
    providerKey: "openai",
    sourceType: "pricing",
    collectorPlatformId: "c_mt460ht33qmbg7m8k",
    replacedCollectorPlatformId: "c_mt44i1ik1lgbr9let8",
    url: "https://openai.com/api/pricing/",
    host: "openai.com",
    pathPrefix: "/api/pricing",
    initialApproval: "approved",
    predicates: [
      "model.input_price_usd_per_million_tokens",
      "model.output_price_usd_per_million_tokens",
    ],
  },
  {
    key: "openai-models",
    name: "OpenAI model catalog",
    providerKey: "openai",
    sourceType: "catalog",
    collectorPlatformId: "c_mt44w77a1irbn8ooh",
    url: "https://platform.openai.com/docs/models",
    host: "platform.openai.com",
    pathPrefix: "/docs/models",
    initialApproval: "approved",
    predicates: [
      "model.provider_model_id",
      "model.display_name",
      "model.family",
      "model.status",
      "model.context_window_tokens",
      "model.max_output_tokens",
      "model.supports_tools",
      "model.supports_structured_output",
    ],
  },
  {
    key: "anthropic-release-notes",
    name: "Anthropic release notes",
    providerKey: "anthropic",
    sourceType: "changelog",
    collectorPlatformId: "c_mt43rdlsyxpwuqofn",
    url: "https://docs.anthropic.com/en/release-notes/overview",
    host: "docs.anthropic.com",
    pathPrefix: "/en/release-notes",
    initialApproval: "approved",
    predicates: ["notice.deprecation_date"],
  },
  {
    key: "anthropic-pricing",
    name: "Anthropic API pricing",
    providerKey: "anthropic",
    sourceType: "pricing",
    collectorPlatformId: "c_mt4e7tgw1i46wxboqa",
    url: "https://platform.claude.com/docs/en/about-claude/pricing",
    host: "platform.claude.com",
    pathPrefix: "/docs/en/about-claude/pricing",
    initialApproval: "pending",
    predicates: [
      "model.input_price_usd_per_million_tokens",
      "model.output_price_usd_per_million_tokens",
    ],
  },
  {
    key: "anthropic-models",
    name: "Anthropic model catalog",
    providerKey: "anthropic",
    sourceType: "catalog",
    collectorPlatformId: "c_mt4e811ufis8kdvlt",
    url: "https://platform.claude.com/docs/en/about-claude/models/overview",
    host: "platform.claude.com",
    pathPrefix: "/docs/en/about-claude/models/overview",
    initialApproval: "pending",
    predicates: [
      "model.provider_model_id",
      "model.display_name",
      "model.family",
      "model.status",
      "model.context_window_tokens",
      "model.max_output_tokens",
      "model.supports_tools",
      "model.supports_structured_output",
    ],
  },
] as const;

const phase5SourceKeyValidator = v.union(
  v.literal("openai-pricing"),
  v.literal("openai-models"),
  v.literal("anthropic-release-notes"),
  v.literal("anthropic-pricing"),
  v.literal("anthropic-models"),
);

const anthropicActivationSourceKeyValidator = v.union(
  v.literal("anthropic-pricing"),
  v.literal("anthropic-models"),
);

type Phase5SourceKey = (typeof sourceSpecs)[number]["key"];

function sourceSpecFor(sourceKey: Phase5SourceKey) {
  const spec = sourceSpecs.find((candidate) => candidate.key === sourceKey);
  if (!spec) throw new Error(`Unsupported Phase 5 source ${sourceKey}`);
  return spec;
}

async function resolvePhase5AutomationContext(
  ctx: MutationCtx,
  sourceKey: Phase5SourceKey,
  collectorPlatformId: string,
) {
  const spec = sourceSpecFor(sourceKey);
  if (collectorPlatformId !== spec.collectorPlatformId)
    throw new Error("Collector platform ID does not match the source policy");

  const [project, domainPack, source, collector] = await Promise.all([
    ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", "kevlar-core"))
      .unique(),
    ctx.db
      .query("domainPacks")
      .withIndex("by_key", (q) => q.eq("key", "ai-infrastructure"))
      .unique(),
    ctx.db
      .query("sources")
      .withIndex("by_key", (q) => q.eq("key", sourceKey))
      .unique(),
    ctx.db
      .query("collectors")
      .withIndex("by_platform_id", (q) =>
        q.eq("collectorId", collectorPlatformId),
      )
      .unique(),
  ]);
  if (
    !project ||
    project.status !== "active" ||
    project.deletionState !== undefined ||
    project.deletedAt !== undefined
  )
    throw new Error("Stable kevlar-core project is unavailable");
  if (!domainPack || domainPack.status !== "active")
    throw new Error("AI-infrastructure domain pack is unavailable");
  if (
    !source ||
    source.domainPackId !== domainPack._id ||
    source.providerKey !== spec.providerKey ||
    source.sourceType !== spec.sourceType ||
    !source.official ||
    source.visibility !== "public"
  )
    throw new Error("Source does not match the committed Phase 5 policy");
  if (
    !collector ||
    collector.projectId !== project._id ||
    collector.targetUrl !== spec.url ||
    collector.status !== "published"
  )
    throw new Error("Collector does not belong to the stable release project");

  const binding = await ctx.db
    .query("collectorBindings")
    .withIndex("by_sourceId_and_collectorId", (q) =>
      q.eq("sourceId", source._id).eq("collectorId", collector._id),
    )
    .unique();
  if (
    !binding ||
    !binding.endpointId ||
    binding.bindingKind !== "production" ||
    binding.lifecycleStatus === "disabled" ||
    binding.bypassCore !== false
  )
    throw new Error("Stable production collector binding is unavailable");
  const endpoint = await ctx.db.get("sourceEndpoints", binding.endpointId);
  if (
    !endpoint ||
    endpoint.sourceId !== source._id ||
    endpoint.url !== spec.url ||
    endpoint.host !== spec.host ||
    endpoint.pathPrefix !== spec.pathPrefix ||
    !endpoint.public
  )
    throw new Error("Collector binding has an invalid source endpoint");

  const authorities = await Promise.all(
    spec.predicates.map((predicate) =>
      ctx.db
        .query("sourceAuthorities")
        .withIndex("by_sourceId_and_predicate", (q) =>
          q.eq("sourceId", source._id).eq("predicate", predicate),
        )
        .unique(),
    ),
  );
  const policyReady =
    source.approvalStatus === "approved" &&
    source.lifecycleStatus === "active" &&
    endpoint.approvalStatus === "approved" &&
    authorities.every(
      (authority) =>
        authority?.authority === "authoritative" && authority.active,
    );
  return {
    spec,
    project,
    source,
    endpoint,
    collector,
    binding,
    authorities,
    policyReady,
  };
}

export const resolveFleetBinding = mutation({
  args: {
    ingestKey: v.string(),
    sourceKey: phase5SourceKeyValidator,
    collectorPlatformId: v.string(),
  },
  returns: v.object({
    sourceId: v.id("sources"),
    endpointId: v.id("sourceEndpoints"),
    collectorId: v.id("collectors"),
    bindingId: v.id("collectorBindings"),
    policyReady: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase5Text(args.collectorPlatformId, "collectorPlatformId", 120);
    const resolved = await resolvePhase5AutomationContext(
      ctx,
      args.sourceKey,
      args.collectorPlatformId,
    );
    return {
      sourceId: resolved.source._id,
      endpointId: resolved.endpoint._id,
      collectorId: resolved.collector._id,
      bindingId: resolved.binding._id,
      policyReady: resolved.policyReady,
    };
  },
});

export const activateVerifiedAnthropicPolicy = mutation({
  args: {
    ingestKey: v.string(),
    sourceKey: anthropicActivationSourceKeyValidator,
    collectorPlatformId: v.string(),
    verificationSnapshotId: v.string(),
    verifiedRowCount: v.literal(1),
    operationKey: v.string(),
  },
  returns: v.object({
    reviewId: v.id("sourceReviews"),
    authorityIds: v.array(v.id("sourceAuthorities")),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase5Text(args.collectorPlatformId, "collectorPlatformId", 120);
    assertPhase5Text(
      args.verificationSnapshotId,
      "verificationSnapshotId",
      240,
    );
    assertPhase5Text(args.operationKey, "operationKey", 240);
    if (!/^[A-Za-z0-9_-]+$/.test(args.verificationSnapshotId))
      throw new Error("verificationSnapshotId has an invalid format");

    const resolved = await resolvePhase5AutomationContext(
      ctx,
      args.sourceKey,
      args.collectorPlatformId,
    );
    if (resolved.spec.initialApproval !== "pending")
      throw new Error("Only pending Anthropic sources can use this operation");
    const requestHash = JSON.stringify({
      sourceKey: args.sourceKey,
      collectorPlatformId: args.collectorPlatformId,
      verificationSnapshotId: args.verificationSnapshotId,
      verifiedRowCount: args.verifiedRowCount,
    });
    const idempotency = await ctx.db
      .query("idempotencyRecords")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (idempotency) {
      if (idempotency.requestHash !== requestHash)
        throw new Error(
          "operationKey was reused with different source activation input",
        );
      const review = await ctx.db
        .query("sourceReviews")
        .withIndex("by_operationKey", (q) =>
          q.eq("operationKey", args.operationKey),
        )
        .unique();
      const authorityIds = resolved.authorities.flatMap((authority) =>
        authority ? [authority._id] : [],
      );
      if (
        !review ||
        review.sourceId !== resolved.source._id ||
        !resolved.policyReady ||
        authorityIds.length !== resolved.spec.predicates.length
      )
        throw new Error("Idempotent source activation state is incomplete");
      return { reviewId: review._id, authorityIds, duplicate: true };
    }
    if (
      resolved.source.approvalStatus === "rejected" ||
      resolved.endpoint.approvalStatus === "rejected" ||
      (resolved.source.lifecycleStatus !== "onboarding" &&
        resolved.source.lifecycleStatus !== "active")
    )
      throw new Error("Rejected or inactive source policy cannot be activated");
    const conflictingReview = await ctx.db
      .query("sourceReviews")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (conflictingReview)
      throw new Error("operationKey belongs to another source review");

    const now = Date.now();
    const authorityIds = [];
    for (const [index, predicate] of resolved.spec.predicates.entries()) {
      const existing = resolved.authorities[index];
      const authorityInput = {
        authority: "authoritative" as const,
        active: true,
        rationale: `Activated after verified Bright Data snapshot ${args.verificationSnapshotId}.`,
        operationKey: `${args.operationKey}:authority:${index}`,
        updatedAt: now,
      };
      if (existing) {
        await ctx.db.patch("sourceAuthorities", existing._id, authorityInput);
        authorityIds.push(existing._id);
      } else {
        authorityIds.push(
          await ctx.db.insert("sourceAuthorities", {
            sourceId: resolved.source._id,
            predicate,
            ...authorityInput,
            createdAt: now,
          }),
        );
      }
    }
    const reviewId = await ctx.db.insert("sourceReviews", {
      sourceId: resolved.source._id,
      decision: "approved",
      summary: `Approved after the committed contract returned one verified row in Bright Data snapshot ${args.verificationSnapshotId}.`,
      reviewerId: "system:phase5-verified-collector-activation",
      operationKey: args.operationKey,
      createdAt: now,
    });
    await ctx.db.patch("sourceEndpoints", resolved.endpoint._id, {
      approvalStatus: "approved",
      updatedAt: now,
    });
    await ctx.db.patch("sources", resolved.source._id, {
      approvalStatus: "approved",
      lifecycleStatus: "active",
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: resolved.project._id,
      actorType: "system",
      action: "phase5.verified_source_policy_activated",
      targetType: "source",
      targetId: String(resolved.source._id),
      payload: {
        sourceKey: args.sourceKey,
        collectorPlatformId: args.collectorPlatformId,
        verificationSnapshotId: args.verificationSnapshotId,
        verifiedRowCount: args.verifiedRowCount,
        endpointId: resolved.endpoint._id,
        bindingId: resolved.binding._id,
        predicates: resolved.spec.predicates,
        reviewId,
      },
      createdAt: now,
    });
    await ctx.db.insert("idempotencyRecords", {
      projectId: resolved.project._id,
      operationKey: args.operationKey,
      scope: "workflow",
      status: "completed",
      requestHash,
      result: { reviewId, authorityIds },
      attempts: 1,
      createdAt: now,
      updatedAt: now,
    });
    return { reviewId, authorityIds, duplicate: false };
  },
});

export const seedCatalog = mutation({
  args: {
    ingestKey: v.string(),
    regressionCollectorPlatformId: v.optional(v.string()),
  },
  returns: v.object({
    domainPackId: v.id("domainPacks"),
    sourceIds: v.array(v.id("sources")),
    regressionBound: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    const now = Date.now();
    let pack = await ctx.db
      .query("domainPacks")
      .withIndex("by_key", (q) => q.eq("key", "ai-infrastructure"))
      .unique();
    if (!pack) {
      const domainPackId = await ctx.db.insert("domainPacks", {
        key: "ai-infrastructure",
        name: "AI Infrastructure",
        version: "source-v1",
        status: "active",
        coreRequired: true,
        createdAt: now,
        updatedAt: now,
      });
      pack = await ctx.db.get("domainPacks", domainPackId);
    }
    if (!pack) throw new Error("Unable to seed AI-infrastructure domain pack");
    const coreProject = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", "kevlar-core"))
      .unique();

    const sourceIds = [];
    for (const spec of sourceSpecs) {
      const approved = spec.initialApproval === "approved";
      let source = await ctx.db
        .query("sources")
        .withIndex("by_key", (q) => q.eq("key", spec.key))
        .unique();
      if (!source) {
        const sourceId = await ctx.db.insert("sources", {
          domainPackId: pack._id,
          key: spec.key,
          name: spec.name,
          providerKey: spec.providerKey,
          sourceType: spec.sourceType,
          official: true,
          visibility: "public",
          approvalStatus: spec.initialApproval,
          lifecycleStatus: approved ? "active" : "onboarding",
          createdAt: now,
          updatedAt: now,
        });
        source = await ctx.db.get("sources", sourceId);
      }
      if (!source) throw new Error(`Unable to seed source ${spec.key}`);
      sourceIds.push(source._id);
      let endpoint = await ctx.db
        .query("sourceEndpoints")
        .withIndex("by_sourceId_and_url", (q) =>
          q.eq("sourceId", source!._id).eq("url", spec.url),
        )
        .unique();
      if (!endpoint) {
        const endpointId = await ctx.db.insert("sourceEndpoints", {
          sourceId: source._id,
          url: spec.url,
          host: spec.host,
          pathPrefix: spec.pathPrefix,
          public: true,
          approvalStatus: spec.initialApproval,
          createdAt: now,
          updatedAt: now,
        });
        endpoint = await ctx.db.get("sourceEndpoints", endpointId);
      }
      if (!endpoint) throw new Error(`Unable to seed endpoint ${spec.key}`);
      for (const predicate of spec.predicates) {
        const authority = await ctx.db
          .query("sourceAuthorities")
          .withIndex("by_sourceId_and_predicate", (q) =>
            q.eq("sourceId", source!._id).eq("predicate", predicate),
          )
          .unique();
        if (!authority)
          await ctx.db.insert("sourceAuthorities", {
            sourceId: source._id,
            predicate,
            authority: "authoritative",
            rationale: approved
              ? "Official provider-controlled public source."
              : "Pending named-owner and source-terms approval.",
            active: approved,
            operationKey: `phase5:seed:authority:${spec.key}:${predicate}`,
            createdAt: now,
            updatedAt: now,
          });
      }
      const reviewKey = `phase5:seed:review:${spec.key}`;
      const review = await ctx.db
        .query("sourceReviews")
        .withIndex("by_operationKey", (q) => q.eq("operationKey", reviewKey))
        .unique();
      if (!review)
        await ctx.db.insert("sourceReviews", {
          sourceId: source._id,
          decision: spec.initialApproval,
          summary: approved
            ? "Official public source and explicit predicates approved."
            : "Provider-active collector is awaiting human source policy approval and a contract-valid Kevlar certification run.",
          reviewerId: "system:phase5-seed",
          operationKey: reviewKey,
          createdAt: now,
        });
      const health = await ctx.db
        .query("sourceHealth")
        .withIndex("by_sourceId", (q) => q.eq("sourceId", source!._id))
        .unique();
      if (!health)
        await ctx.db.insert("sourceHealth", {
          sourceId: source._id,
          state: approved ? "healthy" : "failing",
          consecutiveFailures: approved ? 0 : 1,
          quotaDate: "uninitialized",
          quotaUsed: 0,
          totalClaims: 0,
          ...(approved
            ? {}
            : {
                lastError:
                  "Provider run completed, but its output failed the committed Kevlar contract.",
              }),
          updatedAt: now,
        });
      let collector = await ctx.db
        .query("collectors")
        .withIndex("by_platform_id", (q) =>
          q.eq("collectorId", spec.collectorPlatformId),
        )
        .unique();
      if (!collector && coreProject) {
        const collectorId = await ctx.db.insert("collectors", {
          projectId: coreProject._id,
          collectorId: spec.collectorPlatformId,
          name: spec.name,
          workerType: "browser",
          targetUrl: spec.url,
          createdAfterKickoff: true,
          currentVersion: "phase5-source-v1",
          status: "published",
        });
        collector = await ctx.db.get("collectors", collectorId);
      }
      if (collector) {
        const binding = await ctx.db
          .query("collectorBindings")
          .withIndex("by_sourceId_and_collectorId", (q) =>
            q.eq("sourceId", source!._id).eq("collectorId", collector._id),
          )
          .unique();
        if (!binding)
          await ctx.db.insert("collectorBindings", {
            sourceId: source._id,
            endpointId: endpoint._id,
            collectorId: collector._id,
            bindingKind: "production",
            lifecycleStatus: "onboarding",
            coreGateStatus: "pending",
            bypassCore: false,
            operationKey: `phase5:seed:binding:${spec.key}:${spec.collectorPlatformId}`,
            createdAt: now,
            updatedAt: now,
          });
      }
      if ("replacedCollectorPlatformId" in spec) {
        const replacedCollector = await ctx.db
          .query("collectors")
          .withIndex("by_platform_id", (q) =>
            q.eq("collectorId", spec.replacedCollectorPlatformId),
          )
          .unique();
        if (replacedCollector) {
          const replacedBinding = await ctx.db
            .query("collectorBindings")
            .withIndex("by_sourceId_and_collectorId", (q) =>
              q
                .eq("sourceId", source!._id)
                .eq("collectorId", replacedCollector._id),
            )
            .unique();
          const disableOperationKey = `phase5:seed:replacement-disabled:${spec.key}:${spec.replacedCollectorPlatformId}`;
          if (
            replacedBinding &&
            (replacedBinding.lifecycleStatus !== "disabled" ||
              replacedBinding.operationKey !== disableOperationKey)
          ) {
            await ctx.db.patch("collectorBindings", replacedBinding._id, {
              lifecycleStatus: "disabled",
              operationKey: disableOperationKey,
              updatedAt: now,
            });
            await ctx.db.insert("auditEvents", {
              projectId: replacedCollector.projectId,
              actorType: "system",
              action: "phase5.binding_disabled_after_collector_replacement",
              targetType: "collector_binding",
              targetId: String(replacedBinding._id),
              payload: {
                sourceId: source._id,
                replacedCollectorPlatformId: spec.replacedCollectorPlatformId,
                replacementCollectorPlatformId: spec.collectorPlatformId,
                operationKey: disableOperationKey,
              },
              createdAt: now,
            });
          }
        }
      }
    }

    const platformId =
      args.regressionCollectorPlatformId ?? "c_mt3utzwt29hbznvax9";
    const regressionCollector = await ctx.db
      .query("collectors")
      .withIndex("by_platform_id", (q) => q.eq("collectorId", platformId))
      .unique();
    let regressionBound = false;
    if (regressionCollector) {
      const operationKey = `phase5:regression:${regressionCollector._id}`;
      const binding = await ctx.db
        .query("collectorBindings")
        .withIndex("by_operationKey", (q) => q.eq("operationKey", operationKey))
        .unique();
      if (!binding)
        await ctx.db.insert("collectorBindings", {
          collectorId: regressionCollector._id,
          bindingKind: "regression",
          lifecycleStatus: "active",
          coreGateStatus: "regression_only",
          bypassCore: false,
          operationKey,
          createdAt: now,
          updatedAt: now,
        });
      regressionBound = true;
    }
    const priorAudit = (
      await ctx.db
        .query("auditEvents")
        .withIndex("by_target", (q) =>
          q.eq("targetType", "domain_pack").eq("targetId", String(pack!._id)),
        )
        .order("desc")
        .take(10)
    ).find((event) => event.action === "phase5.catalog_seeded");
    if (
      !priorAudit ||
      (priorAudit.payload as { sourceCount?: unknown }).sourceCount !==
        sourceIds.length
    )
      await ctx.db.insert("auditEvents", {
        actorType: "system",
        action: "phase5.catalog_seeded",
        targetType: "domain_pack",
        targetId: String(pack._id),
        payload: { sourceCount: sourceIds.length, regressionBound },
        createdAt: now,
      });
    return { domainPackId: pack._id, sourceIds, regressionBound };
  },
});

export const upsertApproval = mutation({
  args: {
    ingestKey: v.string(),
    sourceId: v.id("sources"),
    endpointId: v.id("sourceEndpoints"),
    decision: sourceApprovalValidator,
    summary: v.string(),
    operationKey: v.string(),
  },
  returns: v.object({
    reviewId: v.id("sourceReviews"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    const auth = await requireAnyAdministrativeRole(ctx);
    const reviewerId = String(auth.user._id);
    assertPhase5Text(args.operationKey, "operationKey", 240);
    assertPhase5Text(args.summary, "summary", 1_000);
    const prior = await ctx.db
      .query("sourceReviews")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (prior) {
      if (prior.sourceId !== args.sourceId)
        throw new Error("operationKey belongs to another source review");
      return { reviewId: prior._id, duplicate: true };
    }
    const [source, endpoint, authorities] = await Promise.all([
      ctx.db.get("sources", args.sourceId),
      ctx.db.get("sourceEndpoints", args.endpointId),
      ctx.db
        .query("sourceAuthorities")
        .withIndex("by_sourceId_and_active", (q) =>
          q.eq("sourceId", args.sourceId).eq("active", true),
        )
        .take(50),
    ]);
    if (!source || !endpoint || endpoint.sourceId !== source._id)
      throw new Error("Source approval context is invalid");
    if (
      args.decision === "approved" &&
      (!source.official ||
        source.visibility !== "public" ||
        !endpoint.public ||
        authorities.every((item) => item.authority !== "authoritative"))
    )
      throw new Error(
        "Approval requires official public source, public endpoint, and explicit authority",
      );
    const now = Date.now();
    const reviewId = await ctx.db.insert("sourceReviews", {
      sourceId: source._id,
      decision: args.decision,
      summary: args.summary,
      reviewerId,
      operationKey: args.operationKey,
      createdAt: now,
    });
    await ctx.db.patch("sourceEndpoints", endpoint._id, {
      approvalStatus: args.decision,
      updatedAt: now,
    });
    await ctx.db.patch("sources", source._id, {
      approvalStatus: args.decision,
      lifecycleStatus: args.decision === "approved" ? "active" : "paused",
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      actorType: "user",
      actorId: reviewerId,
      action: `phase5.source_${args.decision}`,
      targetType: "source",
      targetId: String(source._id),
      payload: { endpointId: endpoint._id, reviewId },
      createdAt: now,
    });
    return { reviewId, duplicate: false };
  },
});

export const upsertAuthority = mutation({
  args: {
    ingestKey: v.string(),
    sourceId: v.id("sources"),
    predicate: v.string(),
    authority: v.union(
      v.literal("authoritative"),
      v.literal("supporting"),
      v.literal("forbidden"),
    ),
    rationale: v.string(),
    active: v.boolean(),
    operationKey: v.string(),
  },
  returns: v.id("sourceAuthorities"),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase5Text(args.predicate, "predicate", 240);
    assertPhase5Text(args.rationale, "rationale", 1_000);
    assertPhase5Text(args.operationKey, "operationKey", 240);
    const requestHash = JSON.stringify({
      sourceId: args.sourceId,
      predicate: args.predicate,
      authority: args.authority,
      rationale: args.rationale,
      active: args.active,
    });
    const idempotency = await ctx.db
      .query("idempotencyRecords")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (idempotency) {
      if (idempotency.requestHash !== requestHash)
        throw new Error(
          "operationKey was reused with different authority input",
        );
      const authority = await ctx.db
        .query("sourceAuthorities")
        .withIndex("by_sourceId_and_predicate", (q) =>
          q.eq("sourceId", args.sourceId).eq("predicate", args.predicate),
        )
        .unique();
      if (!authority) throw new Error("Idempotent authority no longer exists");
      return authority._id;
    }
    const byOperation = await ctx.db
      .query("sourceAuthorities")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (byOperation) {
      if (byOperation.sourceId !== args.sourceId)
        throw new Error("operationKey belongs to another authority");
      return byOperation._id;
    }
    const source = await ctx.db.get("sources", args.sourceId);
    if (!source) throw new Error("Source not found");
    const existing = await ctx.db
      .query("sourceAuthorities")
      .withIndex("by_sourceId_and_predicate", (q) =>
        q.eq("sourceId", source._id).eq("predicate", args.predicate),
      )
      .unique();
    const now = Date.now();
    let authorityId;
    if (existing) {
      await ctx.db.patch("sourceAuthorities", existing._id, {
        authority: args.authority,
        rationale: args.rationale,
        active: args.active,
        operationKey: args.operationKey,
        updatedAt: now,
      });
      authorityId = existing._id;
    } else {
      authorityId = await ctx.db.insert("sourceAuthorities", {
        sourceId: source._id,
        predicate: args.predicate,
        authority: args.authority,
        rationale: args.rationale,
        active: args.active,
        operationKey: args.operationKey,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.insert("auditEvents", {
      actorType: "system",
      action: "phase5.authority_upserted",
      targetType: "source_authority",
      targetId: String(authorityId),
      payload: {
        sourceId: source._id,
        predicate: args.predicate,
        authority: args.authority,
        active: args.active,
      },
      createdAt: now,
    });
    await ctx.db.insert("idempotencyRecords", {
      operationKey: args.operationKey,
      scope: "workflow",
      status: "completed",
      requestHash,
      result: { authorityId },
      attempts: 1,
      createdAt: now,
      updatedAt: now,
    });
    return authorityId;
  },
});

export const bindCollector = mutation({
  args: {
    ingestKey: v.string(),
    sourceId: v.id("sources"),
    endpointId: v.id("sourceEndpoints"),
    collectorId: v.id("collectors"),
    sourceCertificationId: v.id("sourceCertifications"),
    activate: v.boolean(),
    operationKey: v.string(),
  },
  returns: v.object({
    bindingId: v.id("collectorBindings"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase5Text(args.operationKey, "operationKey", 240);
    const requestHash = JSON.stringify({
      sourceId: args.sourceId,
      endpointId: args.endpointId,
      collectorId: args.collectorId,
      sourceCertificationId: args.sourceCertificationId,
      activate: args.activate,
    });
    const idempotency = await ctx.db
      .query("idempotencyRecords")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (idempotency) {
      if (idempotency.requestHash !== requestHash)
        throw new Error("operationKey was reused with different binding input");
      const binding = await ctx.db
        .query("collectorBindings")
        .withIndex("by_sourceId_and_collectorId", (q) =>
          q.eq("sourceId", args.sourceId).eq("collectorId", args.collectorId),
        )
        .unique();
      if (!binding)
        throw new Error("Idempotent collector binding no longer exists");
      return { bindingId: binding._id, duplicate: true };
    }
    const prior = await ctx.db
      .query("collectorBindings")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (prior) {
      if (
        prior.sourceId !== args.sourceId ||
        prior.collectorId !== args.collectorId
      )
        throw new Error("operationKey belongs to another collector binding");
      return { bindingId: prior._id, duplicate: true };
    }
    const [source, endpoint, collector, certification, authorities] =
      await Promise.all([
        ctx.db.get("sources", args.sourceId),
        ctx.db.get("sourceEndpoints", args.endpointId),
        ctx.db.get("collectors", args.collectorId),
        ctx.db.get("sourceCertifications", args.sourceCertificationId),
        ctx.db
          .query("sourceAuthorities")
          .withIndex("by_sourceId_and_active", (q) =>
            q.eq("sourceId", args.sourceId).eq("active", true),
          )
          .take(50),
      ]);
    if (!source || !endpoint || !collector || !certification)
      throw new Error("Collector binding context is incomplete");
    if (
      source.approvalStatus !== "approved" ||
      (source.lifecycleStatus !== "active" &&
        source.lifecycleStatus !== "onboarding") ||
      source.visibility !== "public" ||
      !source.official ||
      endpoint.sourceId !== source._id ||
      endpoint.approvalStatus !== "approved" ||
      !endpoint.public ||
      certification.status !== "certified" ||
      certification.sourceId !== source._id ||
      certification.endpointId !== endpoint._id ||
      certification.collectorId !== collector._id ||
      authorities.every((item) => item.authority !== "authoritative")
    )
      throw new Error("Production binding failed source certification gate");
    const now = Date.now();
    const pending = await ctx.db
      .query("collectorBindings")
      .withIndex("by_sourceId_and_collectorId", (q) =>
        q.eq("sourceId", source._id).eq("collectorId", collector._id),
      )
      .unique();
    const bindingId = pending
      ? pending._id
      : await ctx.db.insert("collectorBindings", {
          sourceId: source._id,
          endpointId: endpoint._id,
          collectorId: collector._id,
          bindingKind: "production",
          lifecycleStatus: args.activate ? "active" : "onboarding",
          coreGateStatus: "certified",
          sourceCertificationId: certification._id,
          bypassCore: false,
          operationKey: args.operationKey,
          createdAt: now,
          updatedAt: now,
        });
    if (pending)
      await ctx.db.patch("collectorBindings", pending._id, {
        endpointId: endpoint._id,
        bindingKind: "production",
        lifecycleStatus: args.activate ? "active" : "onboarding",
        coreGateStatus: "certified",
        sourceCertificationId: certification._id,
        bypassCore: false,
        operationKey: args.operationKey,
        updatedAt: now,
      });
    await ctx.db.insert("auditEvents", {
      projectId: collector.projectId,
      actorType: "system",
      action: "phase5.collector_bound_after_source_certification",
      targetType: "collector_binding",
      targetId: String(bindingId),
      payload: {
        sourceId: source._id,
        sourceCertificationId: certification._id,
      },
      createdAt: now,
    });
    await ctx.db.insert("idempotencyRecords", {
      projectId: collector.projectId,
      operationKey: args.operationKey,
      scope: "workflow",
      status: "completed",
      requestHash,
      result: { bindingId },
      attempts: 1,
      createdAt: now,
      updatedAt: now,
    });
    return { bindingId, duplicate: false };
  },
});

export const upsertSchedule = mutation({
  args: {
    ingestKey: v.string(),
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
    firstDueAt: v.number(),
    operationKey: v.string(),
  },
  returns: v.object({
    schedulePolicyId: v.id("schedulePolicies"),
    queueItemId: v.id("fleetQueueItems"),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase5Text(args.operationKey, "operationKey", 240);
    const requestHash = JSON.stringify({
      bindingId: args.bindingId,
      intervalMs: args.intervalMs,
      jitterMs: args.jitterMs,
      maxConcurrency: args.maxConcurrency,
      dailyQuota: args.dailyQuota,
      weight: args.weight,
      baseBackoffMs: args.baseBackoffMs,
      maxBackoffMs: args.maxBackoffMs,
      failureThreshold: args.failureThreshold,
      enabled: args.enabled,
      firstDueAt: args.firstDueAt,
    });
    const idempotency = await ctx.db
      .query("idempotencyRecords")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (idempotency) {
      if (idempotency.requestHash !== requestHash)
        throw new Error(
          "operationKey was reused with different schedule input",
        );
      const policy = await ctx.db
        .query("schedulePolicies")
        .withIndex("by_bindingId", (q) => q.eq("bindingId", args.bindingId))
        .unique();
      if (!policy) throw new Error("Idempotent schedule no longer exists");
      const queue = await ctx.db
        .query("fleetQueueItems")
        .withIndex("by_schedulePolicyId", (q) =>
          q.eq("schedulePolicyId", policy._id),
        )
        .unique();
      if (!queue) throw new Error("Idempotent schedule has no queue item");
      return { schedulePolicyId: policy._id, queueItemId: queue._id };
    }
    const byOperation = await ctx.db
      .query("schedulePolicies")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (byOperation) {
      if (byOperation.bindingId !== args.bindingId)
        throw new Error("operationKey belongs to another schedule");
      const queue = await ctx.db
        .query("fleetQueueItems")
        .withIndex("by_schedulePolicyId", (q) =>
          q.eq("schedulePolicyId", byOperation._id),
        )
        .unique();
      if (!queue) throw new Error("Idempotent schedule has no queue item");
      return { schedulePolicyId: byOperation._id, queueItemId: queue._id };
    }
    if (
      !Number.isInteger(args.maxConcurrency) ||
      !Number.isInteger(args.dailyQuota) ||
      !Number.isInteger(args.failureThreshold) ||
      args.intervalMs < 1_000 ||
      args.jitterMs < 0 ||
      args.maxConcurrency < 1 ||
      args.maxConcurrency > 20 ||
      args.dailyQuota < 1 ||
      args.weight <= 0 ||
      args.baseBackoffMs < 1_000 ||
      args.maxBackoffMs < args.baseBackoffMs ||
      args.failureThreshold < 1
    )
      throw new Error("Schedule limits are invalid");
    const binding = await ctx.db.get("collectorBindings", args.bindingId);
    if (
      !binding ||
      binding.bindingKind !== "production" ||
      binding.coreGateStatus !== "certified" ||
      !binding.sourceCertificationId ||
      !binding.sourceId
    )
      throw new Error("Only source-certified production bindings can schedule");
    const sourceCertification = await ctx.db.get(
      "sourceCertifications",
      binding.sourceCertificationId,
    );
    if (
      !sourceCertification ||
      sourceCertification.status !== "certified" ||
      sourceCertification.sourceId !== binding.sourceId ||
      sourceCertification.collectorId !== binding.collectorId ||
      sourceCertification.endpointId !== binding.endpointId
    )
      throw new Error("Binding source certification is invalid");
    const now = Date.now();
    let policy = await ctx.db
      .query("schedulePolicies")
      .withIndex("by_bindingId", (q) => q.eq("bindingId", binding._id))
      .unique();
    if (policy) {
      await ctx.db.patch("schedulePolicies", policy._id, {
        intervalMs: args.intervalMs,
        jitterMs: args.jitterMs,
        maxConcurrency: args.maxConcurrency,
        dailyQuota: args.dailyQuota,
        weight: args.weight,
        baseBackoffMs: args.baseBackoffMs,
        maxBackoffMs: args.maxBackoffMs,
        failureThreshold: args.failureThreshold,
        enabled: args.enabled,
        operationKey: args.operationKey,
        updatedAt: now,
      });
      policy = await ctx.db.get("schedulePolicies", policy._id);
    } else {
      const policyId = await ctx.db.insert("schedulePolicies", {
        bindingId: binding._id,
        intervalMs: args.intervalMs,
        jitterMs: args.jitterMs,
        maxConcurrency: args.maxConcurrency,
        dailyQuota: args.dailyQuota,
        weight: args.weight,
        baseBackoffMs: args.baseBackoffMs,
        maxBackoffMs: args.maxBackoffMs,
        failureThreshold: args.failureThreshold,
        enabled: args.enabled,
        operationKey: args.operationKey,
        createdAt: now,
        updatedAt: now,
      });
      policy = await ctx.db.get("schedulePolicies", policyId);
    }
    if (!policy) throw new Error("Unable to persist schedule policy");
    let queue = await ctx.db
      .query("fleetQueueItems")
      .withIndex("by_schedulePolicyId", (q) =>
        q.eq("schedulePolicyId", policy!._id),
      )
      .unique();
    if (!queue) {
      const queueItemId = await ctx.db.insert("fleetQueueItems", {
        sourceId: binding.sourceId,
        bindingId: binding._id,
        schedulePolicyId: policy._id,
        state: args.enabled ? "due" : "canceled",
        dueAt: args.firstDueAt,
        virtualFinish: 0,
        attempt: 0,
        createdAt: now,
        updatedAt: now,
      });
      queue = await ctx.db.get("fleetQueueItems", queueItemId);
    } else {
      await ctx.db.patch("fleetQueueItems", queue._id, {
        state: args.enabled ? "due" : "canceled",
        dueAt: args.firstDueAt,
        updatedAt: now,
      });
      queue = await ctx.db.get("fleetQueueItems", queue._id);
    }
    if (!queue) throw new Error("Unable to persist fleet queue item");
    const collector = await ctx.db.get("collectors", binding.collectorId);
    await ctx.db.insert("auditEvents", {
      ...(collector ? { projectId: collector.projectId } : {}),
      actorType: "system",
      action: "phase5.schedule_upserted",
      targetType: "schedule_policy",
      targetId: String(policy._id),
      payload: { bindingId: binding._id, enabled: args.enabled },
      createdAt: now,
    });
    await ctx.db.insert("idempotencyRecords", {
      ...(collector ? { projectId: collector.projectId } : {}),
      operationKey: args.operationKey,
      scope: "workflow",
      status: "completed",
      requestHash,
      result: { schedulePolicyId: policy._id, queueItemId: queue._id },
      attempts: 1,
      createdAt: now,
      updatedAt: now,
    });
    return { schedulePolicyId: policy._id, queueItemId: queue._id };
  },
});

export const startOnboarding = mutation({
  args: {
    ingestKey: v.string(),
    sourceId: v.id("sources"),
    operationKey: v.string(),
  },
  returns: v.object({
    onboardingRunId: v.id("sourceOnboardingRuns"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase5Text(args.operationKey, "operationKey", 240);
    const prior = await ctx.db
      .query("sourceOnboardingRuns")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (prior) {
      if (prior.sourceId !== args.sourceId)
        throw new Error("operationKey belongs to another onboarding run");
      return { onboardingRunId: prior._id, duplicate: true };
    }
    const source = await ctx.db.get("sources", args.sourceId);
    if (!source) throw new Error("Source not found");
    const now = Date.now();
    const onboardingRunId = await ctx.db.insert("sourceOnboardingRuns", {
      sourceId: source._id,
      status: "created",
      currentStep: "created",
      operationKey: args.operationKey,
      eventSequence: 1,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("sourceOnboardingEvents", {
      sourceId: source._id,
      onboardingRunId,
      sequence: 1,
      fromStatus: null,
      toStatus: "created",
      details: {},
      operationKey: `${args.operationKey}:created`,
      createdAt: now,
    });
    await ctx.db.patch("sources", source._id, {
      lifecycleStatus: "onboarding",
      updatedAt: now,
    });
    return { onboardingRunId, duplicate: false };
  },
});

const onboardingTransitions = {
  created: ["policy_review", "rejected", "failed"],
  policy_review: ["core_verification", "rejected", "failed"],
  core_verification: ["ready_to_bind", "rejected", "failed"],
  ready_to_bind: ["active", "failed"],
  active: [],
  rejected: [],
  failed: [],
} as const;

export const transitionOnboarding = mutation({
  args: {
    ingestKey: v.string(),
    onboardingRunId: v.id("sourceOnboardingRuns"),
    toStatus: onboardingStatusValidator,
    details: v.any(),
    operationKey: v.string(),
  },
  returns: v.object({
    status: onboardingStatusValidator,
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase5Text(args.operationKey, "operationKey", 240);
    const prior = await ctx.db
      .query("sourceOnboardingEvents")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (prior) {
      if (prior.onboardingRunId !== args.onboardingRunId)
        throw new Error(
          "operationKey belongs to another onboarding transition",
        );
      return { status: prior.toStatus, duplicate: true };
    }
    const run = await ctx.db.get("sourceOnboardingRuns", args.onboardingRunId);
    if (!run) throw new Error("Onboarding run not found");
    const allowed = onboardingTransitions[run.status] as readonly string[];
    if (!allowed.includes(args.toStatus))
      throw new Error(
        `Invalid onboarding transition ${run.status} -> ${args.toStatus}`,
      );
    if (args.toStatus === "active") {
      const activeBindings = await ctx.db
        .query("collectorBindings")
        .withIndex("by_sourceId_and_lifecycleStatus", (q) =>
          q.eq("sourceId", run.sourceId).eq("lifecycleStatus", "active"),
        )
        .take(20);
      const certifications = await Promise.all(
        activeBindings.map((binding) =>
          binding.sourceCertificationId
            ? ctx.db.get("sourceCertifications", binding.sourceCertificationId)
            : null,
        ),
      );
      if (
        !activeBindings.some((binding, index) => {
          const certification = certifications[index];
          return (
            binding.bindingKind === "production" &&
            binding.coreGateStatus === "certified" &&
            certification?.status === "certified" &&
            certification.sourceId === binding.sourceId &&
            certification.endpointId === binding.endpointId &&
            certification.collectorId === binding.collectorId
          );
        })
      )
        throw new Error(
          "Onboarding cannot activate before a source-certified binding",
        );
    }
    const now = Date.now();
    const sequence = run.eventSequence + 1;
    await ctx.db.insert("sourceOnboardingEvents", {
      sourceId: run.sourceId,
      onboardingRunId: run._id,
      sequence,
      fromStatus: run.status,
      toStatus: args.toStatus,
      details: args.details,
      operationKey: args.operationKey,
      createdAt: now,
    });
    await ctx.db.patch("sourceOnboardingRuns", run._id, {
      status: args.toStatus,
      currentStep: args.toStatus,
      eventSequence: sequence,
      updatedAt: now,
      ...(args.toStatus === "active" ||
      args.toStatus === "rejected" ||
      args.toStatus === "failed"
        ? { completedAt: now }
        : {}),
    });
    if (args.toStatus === "active")
      await ctx.db.patch("sources", run.sourceId, {
        lifecycleStatus: "active",
        updatedAt: now,
      });
    if (args.toStatus === "rejected" || args.toStatus === "failed")
      await ctx.db.patch("sources", run.sourceId, {
        lifecycleStatus: "paused",
        updatedAt: now,
      });
    return { status: args.toStatus, duplicate: false };
  },
});

export const setBindingLifecycle = mutation({
  args: {
    ingestKey: v.string(),
    bindingId: v.id("collectorBindings"),
    lifecycleStatus: bindingLifecycleValidator,
    operationKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase5Text(args.operationKey, "operationKey", 240);
    const requestHash = `phase5:binding-lifecycle:${args.bindingId}:${args.lifecycleStatus}`;
    const prior = await ctx.db
      .query("idempotencyRecords")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (prior) {
      if (prior.requestHash !== requestHash)
        throw new Error("operationKey belongs to another lifecycle update");
      return null;
    }
    const binding = await ctx.db.get("collectorBindings", args.bindingId);
    if (!binding) throw new Error("Binding not found");
    if (
      args.lifecycleStatus === "active" &&
      (binding.bindingKind !== "production" ||
        binding.coreGateStatus !== "certified" ||
        !binding.sourceCertificationId)
    )
      throw new Error("Only source-certified production bindings can activate");
    if (args.lifecycleStatus === "active") {
      if (!binding.sourceId || !binding.endpointId)
        throw new Error(
          "Active production binding requires source and endpoint",
        );
      const [source, endpoint, certification] = await Promise.all([
        ctx.db.get("sources", binding.sourceId),
        ctx.db.get("sourceEndpoints", binding.endpointId),
        ctx.db.get("sourceCertifications", binding.sourceCertificationId!),
      ]);
      if (
        !source ||
        !endpoint ||
        !certification ||
        source.approvalStatus !== "approved" ||
        source.lifecycleStatus !== "active" ||
        source.visibility !== "public" ||
        endpoint.approvalStatus !== "approved" ||
        !endpoint.public ||
        certification.status !== "certified" ||
        certification.sourceId !== source._id ||
        certification.endpointId !== endpoint._id ||
        certification.collectorId !== binding.collectorId
      )
        throw new Error(
          "Active binding requires approved public source policy",
        );
    }
    const now = Date.now();
    await ctx.db.patch("collectorBindings", binding._id, {
      lifecycleStatus: args.lifecycleStatus,
      operationKey: args.operationKey,
      updatedAt: now,
    });
    const policy = await ctx.db
      .query("schedulePolicies")
      .withIndex("by_bindingId", (q) => q.eq("bindingId", binding._id))
      .unique();
    if (policy) {
      const item = await ctx.db
        .query("fleetQueueItems")
        .withIndex("by_schedulePolicyId", (q) =>
          q.eq("schedulePolicyId", policy._id),
        )
        .unique();
      if (item && item.state !== "leased")
        await ctx.db.patch("fleetQueueItems", item._id, {
          state: args.lifecycleStatus === "active" ? "due" : "canceled",
          ...(args.lifecycleStatus === "active" ? { dueAt: now } : {}),
          updatedAt: now,
        });
    }
    await ctx.db.insert("idempotencyRecords", {
      operationKey: args.operationKey,
      scope: "workflow",
      status: "completed",
      requestHash,
      result: { bindingId: binding._id, lifecycleStatus: args.lifecycleStatus },
      attempts: 1,
      createdAt: now,
      updatedAt: now,
    });
    const collector = await ctx.db.get("collectors", binding.collectorId);
    await ctx.db.insert("auditEvents", {
      ...(collector ? { projectId: collector.projectId } : {}),
      actorType: "system",
      action: `phase5.binding_${args.lifecycleStatus}`,
      targetType: "collector_binding",
      targetId: String(binding._id),
      payload: {},
      createdAt: now,
    });
    return null;
  },
});

export const resetSourceHealth = mutation({
  args: {
    ingestKey: v.string(),
    sourceId: v.id("sources"),
    operationKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    assertPhase5Text(args.operationKey, "operationKey", 240);
    const prior = await ctx.db
      .query("idempotencyRecords")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (prior) {
      if (prior.requestHash !== `phase5:health-reset:${args.sourceId}`)
        throw new Error("operationKey belongs to another health reset");
      return null;
    }
    const health = await ctx.db
      .query("sourceHealth")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", args.sourceId))
      .unique();
    if (!health) throw new Error("Source health not found");
    await ctx.db.patch("sourceHealth", health._id, {
      state: "healthy",
      consecutiveFailures: 0,
      cooldownUntil: undefined,
      lastError: undefined,
      updatedAt: Date.now(),
    });
    const recovering = ["cooling", "failing"] as const;
    for (const status of recovering) {
      const bindings = await ctx.db
        .query("collectorBindings")
        .withIndex("by_sourceId_and_lifecycleStatus", (q) =>
          q.eq("sourceId", args.sourceId).eq("lifecycleStatus", status),
        )
        .take(50);
      for (const binding of bindings) {
        const certification = binding.sourceCertificationId
          ? await ctx.db.get(
              "sourceCertifications",
              binding.sourceCertificationId,
            )
          : null;
        if (
          binding.coreGateStatus === "certified" &&
          certification?.status === "certified" &&
          certification.sourceId === binding.sourceId &&
          certification.endpointId === binding.endpointId &&
          certification.collectorId === binding.collectorId
        )
          await ctx.db.patch("collectorBindings", binding._id, {
            lifecycleStatus: "active",
            updatedAt: Date.now(),
          });
      }
    }
    const now = Date.now();
    await ctx.db.insert("idempotencyRecords", {
      operationKey: args.operationKey,
      scope: "workflow",
      status: "completed",
      requestHash: `phase5:health-reset:${args.sourceId}`,
      result: { sourceId: args.sourceId },
      attempts: 1,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      actorType: "system",
      actorId: "phase5-catalog",
      action: "phase5.source_health_reset",
      targetType: "source",
      targetId: String(args.sourceId),
      payload: { operationKey: args.operationKey },
      createdAt: now,
    });
    return null;
  },
});

export const sourceByKey = query({
  args: { key: v.string() },
  returns: v.union(schema.doc("sources"), v.null()),
  handler: async (ctx, args) => {
    const source = await ctx.db
      .query("sources")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (!source || source.visibility === "private") return null;
    if (source.visibility === "authenticated") await requireAuthUser(ctx);
    return source;
  },
});

export const bindingById = query({
  args: { bindingId: v.id("collectorBindings") },
  returns: v.union(
    v.object({
      _id: v.id("collectorBindings"),
      sourceId: v.optional(v.id("sources")),
      endpointId: v.optional(v.id("sourceEndpoints")),
      bindingKind: v.string(),
      lifecycleStatus: v.string(),
      coreGateStatus: v.string(),
      bypassCore: v.literal(false),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const binding = await ctx.db.get("collectorBindings", args.bindingId);
    if (!binding) return null;
    const [collector, source, endpoint] = await Promise.all([
      ctx.db.get("collectors", binding.collectorId),
      binding.sourceId ? ctx.db.get("sources", binding.sourceId) : null,
      binding.endpointId
        ? ctx.db.get("sourceEndpoints", binding.endpointId)
        : null,
    ]);
    if (!collector) throw new Error("Collector binding owner is missing");
    const publiclyVisible =
      source?.visibility === "public" &&
      endpoint?.public === true &&
      endpoint.sourceId === source._id;
    if (publiclyVisible)
      await requireProjectReadAccess(ctx, collector.projectId);
    else
      await requireProjectRole(ctx, collector.projectId, [
        "owner",
        "admin",
        "operator",
        "reviewer",
        "developer",
        "viewer",
      ]);
    return {
      _id: binding._id,
      sourceId: binding.sourceId,
      endpointId: binding.endpointId,
      bindingKind: binding.bindingKind,
      lifecycleStatus: binding.lifecycleStatus,
      coreGateStatus: binding.coreGateStatus,
      bypassCore: binding.bypassCore,
    };
  },
});
