import { v } from "convex/values";
import {
  productPriceContract,
  verifyProductPrice,
} from "../packages/semantic-contracts/src/index";
import { mutation, query } from "./_generated/server";
import {
  assertProjectScope,
  resolveKevlarReleaseProjectReadAccess,
} from "./phase11Auth";

const evidenceItemValidator = v.object({
  kind: v.union(
    v.literal("html"),
    v.literal("screenshot"),
    v.literal("jsonld"),
    v.literal("network_response"),
    v.literal("visible_context"),
  ),
  sourceUrl: v.string(),
  contentHash: v.string(),
  metadata: v.any(),
  capturedAt: v.number(),
});

const ingestResultValidator = v.union(
  v.object({
    duplicate: v.literal(true),
    runId: v.id("runs"),
  }),
  v.object({
    duplicate: v.literal(false),
    runId: v.id("runs"),
    decision: v.union(
      v.literal("verified"),
      v.literal("quarantined"),
      v.literal("needs_review"),
      v.literal("invalid"),
    ),
    releasedValue: v.union(v.number(), v.null()),
    observedValue: v.union(v.number(), v.null()),
    alertStatus: v.union(
      v.literal("not_triggered"),
      v.literal("blocked"),
      v.literal("sent"),
    ),
    violationCodes: v.array(
      v.union(
        v.literal("semantic_swap"),
        v.literal("independent_source_mismatch"),
        v.literal("source_disagreement"),
        v.literal("historical_delta"),
      ),
    ),
  }),
);

export const ingestObservation = mutation({
  args: {
    ingestKey: v.string(),
    collectorPlatformId: v.string(),
    targetUrl: v.string(),
    brightDataJobId: v.string(),
    rawPayload: v.any(),
    outputHash: v.string(),
    recordHash: v.string(),
    evidence: v.array(evidenceItemValidator),
  },
  returns: ingestResultValidator,
  handler: async (ctx, args) => {
    const expectedKey = process.env.KEVLAR_BASELINE_INGEST_KEY;
    if (!expectedKey || args.ingestKey !== expectedKey)
      throw new Error("Unauthorized observation ingestion");

    const duplicate = await ctx.db
      .query("runs")
      .withIndex("by_bright_data_job", (q) =>
        q.eq("brightDataJobId", args.brightDataJobId),
      )
      .unique();
    if (duplicate) return { duplicate: true as const, runId: duplicate._id };

    const project = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", "kevlar-core"))
      .unique();
    if (!project)
      throw new Error("Kevlar Core project has not been initialized");

    const collector = await ctx.db
      .query("collectors")
      .withIndex("by_platform_id", (q) =>
        q.eq("collectorId", args.collectorPlatformId),
      )
      .unique();
    if (!collector) throw new Error("Nova collector has not been initialized");

    const previousRelease = await ctx.db
      .query("fieldReleases")
      .withIndex("by_projectId_and_entityId_and_fieldPath_and_updatedAt", (q) =>
        q
          .eq("projectId", project._id)
          .eq("entityId", "nova-headphones")
          .eq("fieldPath", "product.purchase_price.amount"),
      )
      .order("desc")
      .first();
    const decision = verifyProductPrice({
      raw: args.rawPayload,
      previousVerifiedValue: previousRelease?.releasedValue ?? null,
    });
    const now = Date.now();

    let contract = await ctx.db
      .query("contracts")
      .withIndex("by_projectId_and_key", (q) =>
        q.eq("projectId", project._id).eq("key", productPriceContract.key),
      )
      .unique();
    if (!contract) {
      const contractId = await ctx.db.insert("contracts", {
        projectId: project._id,
        key: productPriceContract.key,
        version: productPriceContract.version,
        critical: true,
        spec: productPriceContract,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      contract = await ctx.db.get(contractId);
    }
    if (!contract) throw new Error("Unable to initialize semantic contract");

    const runStatus =
      decision.decision === "verified"
        ? "verified"
        : decision.decision === "quarantined"
          ? "quarantined"
          : decision.decision === "invalid"
            ? "failed"
            : "validating";
    const runId = await ctx.db.insert("runs", {
      projectId: project._id,
      collectorId: collector._id,
      mode: "monitor",
      status: runStatus,
      brightDataJobId: args.brightDataJobId,
      startedAt: now,
      completedAt: now,
      outputHash: args.outputHash,
      rowCount: 1,
    });
    const rowId = await ctx.db.insert("rows", {
      runId,
      entityId: decision.normalized?.entityId ?? "nova-headphones",
      rawPayload: args.rawPayload,
      normalizedPayload: decision.normalized ?? args.rawPayload,
      fieldTrust: {
        state: decision.decision,
        proof: decision.proof,
        contractId: contract._id,
      },
      recordHash: args.recordHash,
    });

    for (const item of decision.violations) {
      await ctx.db.insert("violations", {
        projectId: project._id,
        runId,
        rowId,
        code: item.code,
        severity: item.severity,
        message: item.message,
        evidence: item.evidence,
        createdAt: now,
      });
    }
    for (const item of args.evidence) {
      await ctx.db.insert("evidence", {
        projectId: project._id,
        runId,
        ...item,
      });
    }

    if (decision.proof) {
      await ctx.db.insert("fieldReleases", {
        projectId: project._id,
        entityId: decision.normalized?.entityId ?? "nova-headphones",
        fieldPath: decision.proof.field,
        status: decision.proof.state,
        observedValue: decision.proof.observedValue,
        releasedValue: decision.proof.value,
        ...(decision.proof.lastKnownGoodValue === null
          ? {}
          : { lastKnownGoodValue: decision.proof.lastKnownGoodValue }),
        currency: decision.proof.currency,
        runId,
        proof: decision.proof,
        updatedAt: now,
      });
    }
    await ctx.db.insert("alertEvents", {
      projectId: project._id,
      runId,
      kind: decision.alert.kind,
      status: decision.alert.status,
      ...(decision.alert.previousValue === null
        ? {}
        : { previousValue: decision.alert.previousValue }),
      ...(decision.alert.observedValue === null
        ? {}
        : { observedValue: decision.alert.observedValue }),
      reason: decision.alert.reason,
      createdAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: project._id,
      actorType: "system",
      action: `semantic_gate.${decision.decision}`,
      targetType: "run",
      targetId: String(runId),
      payload: {
        contractId: contract._id,
        violationCodes: decision.violations.map((item) => item.code),
        alertStatus: decision.alert.status,
      },
      createdAt: now,
    });

    return {
      duplicate: false as const,
      runId,
      decision: decision.decision,
      releasedValue: decision.proof?.value ?? null,
      observedValue: decision.proof?.observedValue ?? null,
      alertStatus: decision.alert.status,
      violationCodes: decision.violations.map((item) => item.code),
    };
  },
});

export const feed = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const project = await resolveKevlarReleaseProjectReadAccess(ctx);
    if (!project) return null;
    const release = await ctx.db
      .query("fieldReleases")
      .withIndex("by_projectId_and_entityId_and_fieldPath_and_updatedAt", (q) =>
        q
          .eq("projectId", project._id)
          .eq("entityId", "nova-headphones")
          .eq("fieldPath", "product.purchase_price.amount"),
      )
      .order("desc")
      .first();
    if (!release) return { project, release: null };
    const [run, violations, alert] = await Promise.all([
      ctx.db.get(release.runId),
      ctx.db
        .query("violations")
        .withIndex("by_runId", (q) => q.eq("runId", release.runId))
        .take(20),
      ctx.db
        .query("alertEvents")
        .withIndex("by_runId", (q) => q.eq("runId", release.runId))
        .first(),
    ]);
    if (!run) throw new Error("Released field run is missing");
    assertProjectScope(project._id, [release, run, ...violations, alert]);
    return { project, release, run, violations, alert };
  },
});

export const projectStatus = query({
  args: { slug: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    if (args.slug !== "kevlar-core") return null;
    const project = await resolveKevlarReleaseProjectReadAccess(ctx);
    if (!project) return null;
    const [release, contract] = await Promise.all([
      ctx.db
        .query("fieldReleases")
        .withIndex(
          "by_projectId_and_entityId_and_fieldPath_and_updatedAt",
          (q) =>
            q
              .eq("projectId", project._id)
              .eq("entityId", "nova-headphones")
              .eq("fieldPath", "product.purchase_price.amount"),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("contracts")
        .withIndex("by_projectId_and_key", (q) =>
          q.eq("projectId", project._id).eq("key", productPriceContract.key),
        )
        .unique(),
    ]);
    if (!release) return { project, contract, release: null };
    const [run, violations, alert, row] = await Promise.all([
      ctx.db.get(release.runId),
      ctx.db
        .query("violations")
        .withIndex("by_runId", (q) => q.eq("runId", release.runId))
        .take(20),
      ctx.db
        .query("alertEvents")
        .withIndex("by_runId", (q) => q.eq("runId", release.runId))
        .first(),
      ctx.db
        .query("rows")
        .withIndex("by_run", (q) => q.eq("runId", release.runId))
        .first(),
    ]);
    if (!run) throw new Error("Released field run is missing");
    assertProjectScope(project._id, [
      contract,
      release,
      run,
      ...violations,
      alert,
    ]);
    return { project, contract, release, run, violations, alert, row };
  },
});
