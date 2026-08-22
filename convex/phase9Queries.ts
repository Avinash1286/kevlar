import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { phase9Limit } from "./phase9Support";

export const evidenceGraph = query({
  args: {
    rootNodeId: v.optional(v.id("provenanceNodes")),
    projectId: v.optional(v.id("projects")),
    depth: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    root: v.union(schema.doc("provenanceNodes"), v.null()),
    nodes: v.array(schema.doc("provenanceNodes")),
    edges: v.array(schema.doc("provenanceEdges")),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const limit = phase9Limit(args.limit, 200);
    const depth = args.depth ?? 4;
    if (!Number.isSafeInteger(depth) || depth < 1 || depth > 6)
      throw new Error("depth must be an integer from 1-6");
    let root = args.rootNodeId
      ? await ctx.db.get("provenanceNodes", args.rootNodeId)
      : null;
    if (!root && args.projectId)
      root = await ctx.db
        .query("provenanceNodes")
        .withIndex("by_projectId_and_nodeType_and_createdAt", (q) =>
          q.eq("projectId", args.projectId!).eq("nodeType", "change_event"),
        )
        .order("desc")
        .first();
    if (!root) return { root: null, nodes: [], edges: [], truncated: false };
    if (args.projectId && root.projectId !== args.projectId)
      throw new Error("Root node belongs to another project");
    const nodeIds = new Set<Id<"provenanceNodes">>([root._id]);
    const edgeMap = new Map<Id<"provenanceEdges">, Doc<"provenanceEdges">>();
    let frontier: Id<"provenanceNodes">[] = [root._id];
    let truncated = false;
    for (let level = 0; level < depth && frontier.length > 0; level += 1) {
      const next = new Set<Id<"provenanceNodes">>();
      for (const nodeId of frontier.slice(0, limit)) {
        const [outgoing, incoming] = await Promise.all([
          ctx.db
            .query("provenanceEdges")
            .withIndex("by_fromNodeId_and_createdAt", (q) =>
              q.eq("fromNodeId", nodeId),
            )
            .take(Math.min(limit, 50)),
          ctx.db
            .query("provenanceEdges")
            .withIndex("by_toNodeId_and_createdAt", (q) =>
              q.eq("toNodeId", nodeId),
            )
            .take(Math.min(limit, 50)),
        ]);
        for (const edge of [...outgoing, ...incoming]) {
          if (edgeMap.size >= limit) {
            truncated = true;
            break;
          }
          edgeMap.set(edge._id, edge);
          for (const candidate of [edge.fromNodeId, edge.toNodeId]) {
            if (!nodeIds.has(candidate) && nodeIds.size < limit) {
              nodeIds.add(candidate);
              next.add(candidate);
            } else if (!nodeIds.has(candidate)) truncated = true;
          }
        }
      }
      frontier = [...next];
    }
    const nodes = (
      await Promise.all(
        [...nodeIds].map((id) => ctx.db.get("provenanceNodes", id)),
      )
    ).filter((item): item is Doc<"provenanceNodes"> => item !== null);
    return { root, nodes, edges: [...edgeMap.values()], truncated };
  },
});

export const evidenceBundle = query({
  args: {
    bundleId: v.optional(v.id("evidenceBundles")),
    digest: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      bundle: schema.doc("evidenceBundles"),
      artifacts: v.array(schema.doc("evidenceBundleArtifacts")),
      evidence: v.array(schema.doc("evidence")),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    if (!args.bundleId && !args.digest)
      throw new Error("bundleId or digest is required");
    const bundle = args.bundleId
      ? await ctx.db.get("evidenceBundles", args.bundleId)
      : await ctx.db
          .query("evidenceBundles")
          .withIndex("by_digest", (q) => q.eq("digest", args.digest!))
          .unique();
    if (!bundle) return null;
    const artifacts = await ctx.db
      .query("evidenceBundleArtifacts")
      .withIndex("by_bundleId_and_createdAt", (q) =>
        q.eq("bundleId", bundle._id),
      )
      .take(100);
    const evidence = (
      await Promise.all(
        artifacts.flatMap((artifact) =>
          artifact.evidenceId
            ? [ctx.db.get("evidence", artifact.evidenceId)]
            : [],
        ),
      )
    ).filter((item): item is Doc<"evidence"> => item !== null);
    return { bundle, artifacts, evidence };
  },
});

export const blastRadius = query({
  args: {
    incidentId: v.optional(v.id("incidents")),
    assessmentId: v.optional(v.id("blastRadiusAssessments")),
  },
  returns: v.union(
    v.object({
      assessment: schema.doc("blastRadiusAssessments"),
      impacts: v.array(schema.doc("blastRadiusImpacts")),
      tribunalContext: v.union(schema.doc("repairTribunalContexts"), v.null()),
      tribunalItems: v.array(schema.doc("repairTribunalContextItems")),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    if (!args.incidentId && !args.assessmentId)
      throw new Error("incidentId or assessmentId is required");
    const assessment = args.assessmentId
      ? await ctx.db.get("blastRadiusAssessments", args.assessmentId)
      : await ctx.db
          .query("blastRadiusAssessments")
          .withIndex("by_incidentId_and_createdAt", (q) =>
            q.eq("incidentId", args.incidentId!),
          )
          .order("desc")
          .first();
    if (!assessment) return null;
    const impacts = await ctx.db
      .query("blastRadiusImpacts")
      .withIndex("by_assessmentId_and_kind", (q) =>
        q.eq("assessmentId", assessment._id),
      )
      .take(200);
    const tribunalContext = await ctx.db
      .query("repairTribunalContexts")
      .withIndex("by_incidentId_and_createdAt", (q) =>
        q.eq("incidentId", assessment.incidentId),
      )
      .order("desc")
      .first();
    const tribunalItems = tribunalContext
      ? await ctx.db
          .query("repairTribunalContextItems")
          .withIndex("by_contextId_and_kind", (q) =>
            q.eq("contextId", tribunalContext._id),
          )
          .take(200)
      : [];
    return { assessment, impacts, tribunalContext, tribunalItems };
  },
});

const fleetValidator = v.object({
  canaries: v.array(schema.doc("repairCanaryRuns")),
  candidates: v.array(schema.doc("repairCandidateVersions")),
  stages: v.array(schema.doc("canaryStageResults")),
  eventHolds: v.array(schema.doc("repairEventHolds")),
  gauntletRuns: v.array(schema.doc("fleetGauntletRuns")),
  suites: v.array(schema.doc("fleetGauntletSuites")),
  cases: v.array(schema.doc("fleetGauntletCases")),
  results: v.array(schema.doc("fleetGauntletResults")),
  metrics: v.array(schema.doc("fleetBenchmarkMetrics")),
  certificates: v.array(schema.doc("extendedRepairCertificates")),
});

export const fleet = query({
  args: {
    incidentId: v.optional(v.id("incidents")),
    canaryRunId: v.optional(v.id("repairCanaryRuns")),
    gauntletRunId: v.optional(v.id("fleetGauntletRuns")),
    limit: v.optional(v.number()),
  },
  returns: fleetValidator,
  handler: async (ctx, args) => {
    const limit = phase9Limit(args.limit, 50);
    let incidentId = args.incidentId;
    let selectedCanary = args.canaryRunId
      ? await ctx.db.get("repairCanaryRuns", args.canaryRunId)
      : null;
    let selectedGauntlet = args.gauntletRunId
      ? await ctx.db.get("fleetGauntletRuns", args.gauntletRunId)
      : null;
    incidentId ??= selectedCanary?.incidentId ?? selectedGauntlet?.incidentId;
    if (!incidentId) {
      const proof = await ctx.db
        .query("phase9Proofs")
        .withIndex("by_key", (q) =>
          q.eq("key", "phase9:evidence-fleet-proof:v1"),
        )
        .unique();
      incidentId = proof?.incidentId;
    }
    if (!incidentId)
      return {
        canaries: [],
        candidates: [],
        stages: [],
        eventHolds: [],
        gauntletRuns: [],
        suites: [],
        cases: [],
        results: [],
        metrics: [],
        certificates: [],
      };
    const canaries = selectedCanary
      ? [selectedCanary]
      : await ctx.db
          .query("repairCanaryRuns")
          .withIndex("by_incidentId_and_startedAt", (q) =>
            q.eq("incidentId", incidentId!),
          )
          .order("desc")
          .take(limit);
    const candidateIds = [
      ...new Set(canaries.map((item) => item.candidateVersionId)),
    ];
    const candidates = (
      await Promise.all(
        candidateIds.map((id) => ctx.db.get("repairCandidateVersions", id)),
      )
    ).filter((item): item is Doc<"repairCandidateVersions"> => item !== null);
    const stages: Doc<"canaryStageResults">[] = [];
    const eventHolds: Doc<"repairEventHolds">[] = [];
    for (const canary of canaries) {
      stages.push(
        ...(await ctx.db
          .query("canaryStageResults")
          .withIndex("by_canaryRunId_and_stage", (q) =>
            q.eq("canaryRunId", canary._id),
          )
          .take(10)),
      );
      eventHolds.push(
        ...(await ctx.db
          .query("repairEventHolds")
          .withIndex("by_canaryRunId_and_createdAt", (q) =>
            q.eq("canaryRunId", canary._id),
          )
          .take(50)),
      );
    }
    const gauntletRuns = selectedGauntlet
      ? [selectedGauntlet]
      : await ctx.db
          .query("fleetGauntletRuns")
          .withIndex("by_incidentId_and_startedAt", (q) =>
            q.eq("incidentId", incidentId!),
          )
          .order("desc")
          .take(limit);
    const suiteIds = [...new Set(gauntletRuns.map((item) => item.suiteId))];
    const suites = (
      await Promise.all(
        suiteIds.map((id) => ctx.db.get("fleetGauntletSuites", id)),
      )
    ).filter((item): item is Doc<"fleetGauntletSuites"> => item !== null);
    const cases: Doc<"fleetGauntletCases">[] = [];
    for (const suite of suites)
      cases.push(
        ...(await ctx.db
          .query("fleetGauntletCases")
          .withIndex("by_suiteId_and_caseId", (q) => q.eq("suiteId", suite._id))
          .take(100)),
      );
    const results: Doc<"fleetGauntletResults">[] = [];
    const metrics: Doc<"fleetBenchmarkMetrics">[] = [];
    for (const run of gauntletRuns) {
      results.push(
        ...(await ctx.db
          .query("fleetGauntletResults")
          .withIndex("by_gauntletRunId_and_caseId", (q) =>
            q.eq("gauntletRunId", run._id),
          )
          .take(100)),
      );
      const metric = await ctx.db
        .query("fleetBenchmarkMetrics")
        .withIndex("by_gauntletRunId", (q) => q.eq("gauntletRunId", run._id))
        .unique();
      if (metric) metrics.push(metric);
    }
    const certificates = await ctx.db
      .query("extendedRepairCertificates")
      .withIndex("by_incidentId_and_createdAt", (q) =>
        q.eq("incidentId", incidentId!),
      )
      .order("desc")
      .take(limit);
    return {
      canaries,
      candidates,
      stages,
      eventHolds,
      gauntletRuns,
      suites,
      cases,
      results,
      metrics,
      certificates,
    };
  },
});

export const proof = query({
  args: { key: v.optional(v.string()) },
  returns: v.union(
    v.object({
      proof: schema.doc("phase9Proofs"),
      proofId: v.id("phase9Proofs"),
      incidentId: v.id("incidents"),
      evidenceBundleId: v.id("evidenceBundles"),
      rootNodeId: v.id("provenanceNodes"),
      failedCanaryRunId: v.id("repairCanaryRuns"),
      passedCanaryRunId: v.id("repairCanaryRuns"),
      gauntletRunId: v.id("fleetGauntletRuns"),
      extendedCertificateId: v.id("extendedRepairCertificates"),
      bundle: schema.doc("evidenceBundles"),
      blastRadius: schema.doc("blastRadiusAssessments"),
      tribunalContext: schema.doc("repairTribunalContexts"),
      failedCanary: schema.doc("repairCanaryRuns"),
      passedCanary: schema.doc("repairCanaryRuns"),
      gauntlet: schema.doc("fleetGauntletRuns"),
      metrics: schema.doc("fleetBenchmarkMetrics"),
      certificate: schema.doc("extendedRepairCertificates"),
      releasedEventCount: v.number(),
      navigableReleasedEventCount: v.number(),
      evidenceNodeCount: v.number(),
      evidenceEdgeCount: v.number(),
      gauntletCaseCount: v.number(),
      gauntletPassedCount: v.number(),
      everyReleasedEventHasEvidencePath: v.boolean(),
      repairActivationBeganWithCanary: v.boolean(),
      triggerOnlyCannotActivate: v.boolean(),
      heldOutBeforeFullRelease: v.boolean(),
      failedRepairWithheldEvents: v.boolean(),
      productFixtureRegressionPassed: v.boolean(),
      allExitGatesPassed: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const proof = await ctx.db
      .query("phase9Proofs")
      .withIndex("by_key", (q) =>
        q.eq("key", args.key ?? "phase9:evidence-fleet-proof:v1"),
      )
      .unique();
    if (!proof) return null;
    const [
      bundle,
      blastRadius,
      tribunalContext,
      failedCanary,
      passedCanary,
      gauntlet,
      certificate,
    ] = await Promise.all([
      ctx.db.get("evidenceBundles", proof.evidenceBundleId),
      ctx.db.get("blastRadiusAssessments", proof.blastRadiusAssessmentId),
      ctx.db.get("repairTribunalContexts", proof.tribunalContextId),
      ctx.db.get("repairCanaryRuns", proof.failedCanaryRunId),
      ctx.db.get("repairCanaryRuns", proof.passedCanaryRunId),
      ctx.db.get("fleetGauntletRuns", proof.gauntletRunId),
      ctx.db.get("extendedRepairCertificates", proof.extendedCertificateId),
    ]);
    if (
      !bundle ||
      !blastRadius ||
      !tribunalContext ||
      !failedCanary ||
      !passedCanary ||
      !gauntlet ||
      !certificate
    )
      throw new Error("Phase 9 proof references missing records");
    const [
      metrics,
      phase8,
      graphNodes,
      graphEdges,
      failedHolds,
      stages,
      cases,
      results,
    ] = await Promise.all([
      ctx.db
        .query("fleetBenchmarkMetrics")
        .withIndex("by_gauntletRunId", (q) =>
          q.eq("gauntletRunId", gauntlet._id),
        )
        .unique(),
      ctx.db
        .query("phase8Proofs")
        .withIndex("by_key", (q) => q.eq("key", "phase8:semantic-cdc-proof:v1"))
        .unique(),
      ctx.db
        .query("provenanceNodes")
        .withIndex("by_projectId_and_nodeType_and_createdAt", (q) =>
          q.eq("projectId", proof.projectId),
        )
        .take(500),
      ctx.db
        .query("provenanceEdges")
        .withIndex("by_projectId_and_relationship_and_createdAt", (q) =>
          q.eq("projectId", proof.projectId),
        )
        .take(500),
      ctx.db
        .query("repairEventHolds")
        .withIndex("by_canaryRunId_and_createdAt", (q) =>
          q.eq("canaryRunId", failedCanary._id),
        )
        .take(50),
      ctx.db
        .query("canaryStageResults")
        .withIndex("by_canaryRunId_and_stage", (q) =>
          q.eq("canaryRunId", passedCanary._id),
        )
        .take(10),
      ctx.db
        .query("fleetGauntletCases")
        .withIndex("by_suiteId_and_caseId", (q) =>
          q.eq("suiteId", gauntlet.suiteId),
        )
        .take(100),
      ctx.db
        .query("fleetGauntletResults")
        .withIndex("by_gauntletRunId_and_caseId", (q) =>
          q.eq("gauntletRunId", gauntlet._id),
        )
        .take(100),
    ]);
    if (!metrics || !phase8)
      throw new Error("Phase 9 proof prerequisites are missing");
    const events = (
      await Promise.all(
        phase8.eventIds.map((id) => ctx.db.get("changeEvents", id)),
      )
    ).filter((item): item is Doc<"changeEvents"> => item !== null);
    const released = events.filter((event) => event.state === "released");
    let navigableReleasedEventCount = 0;
    for (const event of released) {
      const node = await ctx.db
        .query("provenanceNodes")
        .withIndex("by_nodeType_and_externalId", (q) =>
          q.eq("nodeType", "change_event").eq("externalId", String(event._id)),
        )
        .unique();
      if (!node) continue;
      const edges = await ctx.db
        .query("provenanceEdges")
        .withIndex("by_fromNodeId_and_createdAt", (q) =>
          q.eq("fromNodeId", node._id),
        )
        .take(20);
      if (edges.length > 0) navigableReleasedEventCount += 1;
    }
    const repairActivationBeganWithCanary =
      passedCanary.status === "fully_released" &&
      stages.some((stage) => stage.stage === "trigger_url");
    const triggerOnlyCannotActivate = stages.some(
      (stage) => stage.stage === "stored_fixtures" && stage.outcome === "pass",
    );
    const heldOutBeforeFullRelease = stages.some(
      (stage) =>
        stage.stage === "held_out_mutations" && stage.outcome === "pass",
    );
    const failedRepairWithheldEvents =
      (failedCanary.status === "stopped" ||
        failedCanary.status === "rolled_back") &&
      failedHolds.length > 0;
    const regressionCases = cases.filter(
      (item) => item.archetype === "product_pricing_fixture",
    );
    const passedIds = new Set(
      results
        .filter((result) => result.outcome === "pass")
        .map((result) => result.caseId),
    );
    const productFixtureRegressionPassed =
      regressionCases.length > 0 &&
      regressionCases.every((item) => passedIds.has(item._id));
    const everyReleasedEventHasEvidencePath =
      released.length > 0 && navigableReleasedEventCount === released.length;
    const gates = [
      everyReleasedEventHasEvidencePath,
      repairActivationBeganWithCanary,
      triggerOnlyCannotActivate,
      heldOutBeforeFullRelease,
      failedRepairWithheldEvents,
      productFixtureRegressionPassed,
    ];
    return {
      proof,
      proofId: proof._id,
      incidentId: proof.incidentId,
      evidenceBundleId: proof.evidenceBundleId,
      rootNodeId: proof.rootNodeId,
      failedCanaryRunId: proof.failedCanaryRunId,
      passedCanaryRunId: proof.passedCanaryRunId,
      gauntletRunId: proof.gauntletRunId,
      extendedCertificateId: proof.extendedCertificateId,
      bundle,
      blastRadius,
      tribunalContext,
      failedCanary,
      passedCanary,
      gauntlet,
      metrics,
      certificate,
      releasedEventCount: released.length,
      navigableReleasedEventCount,
      evidenceNodeCount: graphNodes.length,
      evidenceEdgeCount: graphEdges.length,
      gauntletCaseCount: cases.length,
      gauntletPassedCount: results.filter((result) => result.outcome === "pass")
        .length,
      everyReleasedEventHasEvidencePath,
      repairActivationBeganWithCanary,
      triggerOnlyCannotActivate,
      heldOutBeforeFullRelease,
      failedRepairWithheldEvents,
      productFixtureRegressionPassed,
      allExitGatesPassed: gates.every(Boolean),
    };
  },
});
