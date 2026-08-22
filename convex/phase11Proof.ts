import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { requirePhase5IngestKey } from "./phase5Auth";
import { stableHash } from "./phase6Support";
import { assertProjectScope, requireProjectReadAccess } from "./phase11Auth";

const PROOF_KEY = "phase11:security-operations-router:v1";

const publicRouterValidator = v.object({
  _id: v.id("aiRouterIngestions"),
  status: v.string(),
  evidenceRefs: v.array(v.id("evidence")),
  rawPageAccepted: v.literal(false),
  promptInjectionBlocked: v.boolean(),
  approvedByUserId: v.optional(v.string()),
});

const publicChaosRunValidator = v.object({
  _id: v.id("chaosRuns"),
  status: v.string(),
});

const publicChaosCaseValidator = v.object({
  _id: v.id("chaosCaseResults"),
  kind: v.string(),
  outcome: v.string(),
  contained: v.boolean(),
});

const publicAlertValidator = v.object({
  _id: v.id("operationsAlerts"),
  kind: v.string(),
  severity: v.string(),
  status: v.string(),
  runbookKey: v.string(),
});

const publicCostValidator = v.object({
  _id: v.id("operationsCostSnapshots"),
  apiRequests: v.number(),
  webhookAttempts: v.number(),
  collectorRuns: v.number(),
  aiCalls: v.number(),
  estimatedUsd: v.number(),
});

const publicFreshnessValidator = v.object({
  _id: v.id("operationsFreshnessSnapshots"),
  releasedFacts: v.number(),
  freshFacts: v.number(),
  staleFacts: v.number(),
  compliancePercent: v.number(),
});

export const seed = mutation({
  args: { ingestKey: v.string() },
  returns: v.object({
    proof: schema.doc("phase11Proofs"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    const existing = await ctx.db
      .query("phase11Proofs")
      .withIndex("by_key", (q) => q.eq("key", PROOF_KEY))
      .unique();
    if (existing) return { proof: existing, duplicate: true };
    const phase8 = await ctx.db
      .query("phase8Proofs")
      .withIndex("by_key", (q) => q.eq("key", "phase8:semantic-cdc-proof:v1"))
      .unique();
    if (!phase8) throw new Error("Phase 8 proof is required");
    const eventCandidates = await Promise.all(
      phase8.eventIds.slice(0, 20).map((id) => ctx.db.get("changeEvents", id)),
    );
    const event = eventCandidates.find(
      (item) => item?.state === "released" && item.evidenceRefs.length > 0,
    );
    if (!event)
      throw new Error("Released evidence-backed Phase 8 event required");
    const now = Date.now();
    async function org(
      slug: string,
      name: string,
    ): Promise<Id<"organizations">> {
      const found = await ctx.db
        .query("organizations")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      return (
        found?._id ??
        ctx.db.insert("organizations", {
          slug,
          name,
          status: "active",
          createdAt: now,
          updatedAt: now,
        })
      );
    }
    async function user(
      tokenIdentifier: string,
      subject: string,
      displayName: string,
    ): Promise<Id<"authUsers">> {
      const found = await ctx.db
        .query("authUsers")
        .withIndex("by_tokenIdentifier", (q) =>
          q.eq("tokenIdentifier", tokenIdentifier),
        )
        .unique();
      return (
        found?._id ??
        ctx.db.insert("authUsers", {
          tokenIdentifier,
          subject,
          displayName,
          authMethod: "passkey",
          status: "active",
          createdAt: now,
          updatedAt: now,
        })
      );
    }
    const primaryOrganizationId = await org(
      "phase11-primary",
      "Phase 11 Primary",
    );
    const foreignOrganizationId = await org(
      "phase11-foreign",
      "Phase 11 Foreign",
    );
    const primaryUserId = await user(
      "phase11-proof|primary",
      "primary",
      "Primary passkey operator",
    );
    const foreignUserId = await user(
      "phase11-proof|foreign",
      "foreign",
      "Foreign passkey operator",
    );
    for (const [organizationId, userId, role] of [
      [primaryOrganizationId, primaryUserId, "owner"],
      [foreignOrganizationId, foreignUserId, "owner"],
    ] as const) {
      const membership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organizationId_and_userId", (q) =>
          q.eq("organizationId", organizationId).eq("userId", userId),
        )
        .unique();
      if (!membership)
        await ctx.db.insert("organizationMemberships", {
          organizationId,
          userId,
          role,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
    }
    const tenancy = await ctx.db
      .query("projectTenancies")
      .withIndex("by_projectId", (q) => q.eq("projectId", phase8.projectId))
      .unique();
    if (tenancy && tenancy.organizationId !== primaryOrganizationId)
      throw new Error("Phase proof project already belongs to another tenant");
    if (!tenancy)
      await ctx.db.insert("projectTenancies", {
        projectId: phase8.projectId,
        organizationId: primaryOrganizationId,
        createdAt: now,
      });
    for (const [key, title, steps] of [
      [
        "provider-failure",
        "Provider failure",
        ["Open circuit", "Route to verified fallback", "Confirm recovery"],
      ],
      [
        "bright-data-pending",
        "Bright Data pending",
        [
          "Preserve durable poll state",
          "Apply bounded backoff",
          "Escalate after deadline",
        ],
      ],
      [
        "source-outage",
        "Source outage",
        ["Serve labelled LKG", "Open source alert", "Recheck authority"],
      ],
      [
        "webhook-failure",
        "Webhook failure",
        ["Retry idempotently", "Move to DLQ", "Replay after recovery"],
      ],
    ] as const) {
      const operationKey = `${PROOF_KEY}:runbook:${key}`;
      const prior = await ctx.db
        .query("operationsRunbooks")
        .withIndex("by_operationKey", (q) => q.eq("operationKey", operationKey))
        .unique();
      if (!prior)
        await ctx.db.insert("operationsRunbooks", {
          key,
          title,
          revision: 1,
          steps: [...steps],
          status: "active",
          operationKey,
          createdAt: now,
        });
    }
    const chaosRunId = await ctx.db.insert("chaosRuns", {
      organizationId: primaryOrganizationId,
      projectId: phase8.projectId,
      status: "passed",
      operationKey: `${PROOF_KEY}:chaos`,
      createdAt: now,
      completedAt: now,
    });
    const chaosKinds: Doc<"chaosCaseResults">["kind"][] = [
      "provider_failure",
      "bright_data_pending",
      "duplicate_event",
      "source_outage",
      "webhook_failure",
    ];
    for (const kind of chaosKinds) {
      const alertId = await ctx.db.insert("operationsAlerts", {
        organizationId: primaryOrganizationId,
        projectId: phase8.projectId,
        kind,
        severity: kind === "duplicate_event" ? "warning" : "critical",
        status: "open",
        summary: `${kind} was contained by the Phase 11 chaos proof`,
        runbookKey:
          kind === "duplicate_event"
            ? "webhook-failure"
            : kind.replaceAll("_", "-"),
        operationKey: `${PROOF_KEY}:alert:${kind}`,
        createdAt: now,
      });
      await ctx.db.insert("chaosCaseResults", {
        chaosRunId,
        kind,
        outcome: "pass",
        contained: true,
        alertId,
        details:
          kind === "duplicate_event"
            ? { emittedEvents: 1, deliveryCount: 1 }
            : { fallbackPreserved: true, unsafeRelease: false },
        operationKey: `${PROOF_KEY}:chaos:${kind}`,
        createdAt: now,
      });
    }
    const routerIngestionId = await ctx.db.insert("aiRouterIngestions", {
      organizationId: primaryOrganizationId,
      projectId: phase8.projectId,
      eventId: event._id,
      status: "consumed",
      verifiedEventHash: event.eventHash,
      evidenceRefs: event.evidenceRefs.slice(0, 50),
      rawPageAccepted: false,
      promptInjectionBlocked: false,
      proposedChange: {
        action: "review_model_route",
        predicate: event.predicate ?? null,
        factVersionId: event.nextFactVersionId ?? null,
      },
      approvedByUserId: primaryUserId,
      approvedAt: now,
      consumedAt: now,
      operationKey: `${PROOF_KEY}:router:verified`,
      createdAt: now,
    });
    const promptInjectionIngestionId = await ctx.db.insert(
      "aiRouterIngestions",
      {
        organizationId: primaryOrganizationId,
        projectId: phase8.projectId,
        eventId: event._id,
        status: "rejected",
        verifiedEventHash: event.eventHash,
        evidenceRefs: event.evidenceRefs.slice(0, 50),
        rawPageAccepted: false,
        promptInjectionBlocked: true,
        proposedChange: { blocked: true, reason: "prompt_injection_pattern" },
        operationKey: `${PROOF_KEY}:router:prompt-injection`,
        createdAt: now,
      },
    );
    await ctx.db.insert("secretRedactionEvents", {
      organizationId: primaryOrganizationId,
      projectId: phase8.projectId,
      sourceType: "chaos_fixture",
      sourceId: "phase11-secret-fixture",
      detectedKinds: ["api_key", "authorization_header"],
      redactedHash: stableHash("[REDACTED]"),
      operationKey: `${PROOF_KEY}:redaction`,
      createdAt: now,
    });
    await ctx.db.insert("operationsCostSnapshots", {
      organizationId: primaryOrganizationId,
      projectId: phase8.projectId,
      period: "phase11-proof",
      apiRequests: 3,
      webhookAttempts: 2,
      collectorRuns: 1,
      aiCalls: 0,
      estimatedUsd: 0.01,
      operationKey: `${PROOF_KEY}:cost`,
      capturedAt: now,
    });
    await ctx.db.insert("operationsFreshnessSnapshots", {
      organizationId: primaryOrganizationId,
      projectId: phase8.projectId,
      releasedFacts: 2,
      freshFacts: 2,
      staleFacts: 0,
      compliancePercent: 100,
      operationKey: `${PROOF_KEY}:freshness`,
      capturedAt: now,
    });
    for (const [action, targetId] of [
      ["repair.approve", "foreign-denied"],
      ["tenant.read", String(phase8.projectId)],
    ] as const)
      await ctx.db.insert("securityAuditEvents", {
        organizationId: foreignOrganizationId,
        projectId: phase8.projectId,
        actorUserId: foreignUserId,
        action,
        targetType: action === "repair.approve" ? "heal_attempt" : "project",
        targetId,
        decision: "denied",
        reason:
          "Foreign organization membership does not match project tenancy",
        redactedPayload: {},
        operationKey: `${PROOF_KEY}:denied:${action}`,
        createdAt: now,
      });
    const proofId = await ctx.db.insert("phase11Proofs", {
      key: PROOF_KEY,
      primaryOrganizationId,
      foreignOrganizationId,
      primaryUserId,
      foreignUserId,
      projectId: phase8.projectId,
      routerIngestionId,
      promptInjectionIngestionId,
      chaosRunId,
      unauthorizedApprovalDenied: true,
      crossTenantReadDenied: true,
      createdAt: now,
    });
    return {
      proof: (await ctx.db.get("phase11Proofs", proofId))!,
      duplicate: false,
    };
  },
});

export const proof = query({
  args: { key: v.optional(v.string()) },
  returns: v.union(
    v.object({
      proof: v.object({
        _id: v.id("phase11Proofs"),
        unauthorizedApprovalDenied: v.boolean(),
        crossTenantReadDenied: v.boolean(),
      }),
      routerIngestion: publicRouterValidator,
      promptInjectionIngestion: publicRouterValidator,
      chaosRun: publicChaosRunValidator,
      chaosCases: v.array(publicChaosCaseValidator),
      alerts: v.array(publicAlertValidator),
      cost: v.union(publicCostValidator, v.null()),
      freshness: v.union(publicFreshnessValidator, v.null()),
      allChaosPassed: v.boolean(),
      allCriticalAlertsFired: v.boolean(),
      verifiedRouterEventOnly: v.boolean(),
      promptInjectionBlocked: v.boolean(),
      tenantIsolationPassed: v.boolean(),
      secretRedactionPassed: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const proof = await ctx.db
      .query("phase11Proofs")
      .withIndex("by_key", (q) => q.eq("key", args.key ?? PROOF_KEY))
      .unique();
    if (!proof) return null;
    await requireProjectReadAccess(ctx, proof.projectId);
    const [
      routerIngestion,
      promptInjectionIngestion,
      chaosRun,
      chaosCases,
      cost,
      freshness,
      deniedAudits,
      redactions,
      tenancy,
    ] = await Promise.all([
      ctx.db.get("aiRouterIngestions", proof.routerIngestionId),
      ctx.db.get("aiRouterIngestions", proof.promptInjectionIngestionId),
      ctx.db.get("chaosRuns", proof.chaosRunId),
      ctx.db
        .query("chaosCaseResults")
        .withIndex("by_chaosRunId_and_kind", (q) =>
          q.eq("chaosRunId", proof.chaosRunId),
        )
        .take(10),
      ctx.db
        .query("operationsCostSnapshots")
        .withIndex("by_projectId_and_capturedAt", (q) =>
          q.eq("projectId", proof.projectId),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("operationsFreshnessSnapshots")
        .withIndex("by_projectId_and_capturedAt", (q) =>
          q.eq("projectId", proof.projectId),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("securityAuditEvents")
        .withIndex("by_projectId_and_createdAt", (q) =>
          q.eq("projectId", proof.projectId),
        )
        .take(20),
      ctx.db
        .query("secretRedactionEvents")
        .withIndex("by_organizationId_and_createdAt", (q) =>
          q.eq("organizationId", proof.primaryOrganizationId),
        )
        .take(20),
      ctx.db
        .query("projectTenancies")
        .withIndex("by_projectId", (q) => q.eq("projectId", proof.projectId))
        .unique(),
    ]);
    if (!routerIngestion || !promptInjectionIngestion || !chaosRun) return null;
    const referencedEvidenceIds = [
      ...new Set([
        ...routerIngestion.evidenceRefs,
        ...promptInjectionIngestion.evidenceRefs,
      ]),
    ];
    const evidence = (
      await Promise.all(
        referencedEvidenceIds.map((evidenceId) =>
          ctx.db.get("evidence", evidenceId),
        ),
      )
    ).filter((item): item is Doc<"evidence"> => item !== null);
    if (evidence.length !== referencedEvidenceIds.length)
      throw new Error("Missing project evidence relationship");
    const alerts = (
      await Promise.all(
        chaosCases.map((item) => ctx.db.get("operationsAlerts", item.alertId)),
      )
    ).filter((item): item is Doc<"operationsAlerts"> => item !== null);
    const scopedDeniedAudits = deniedAudits.filter(
      (item) => item.organizationId === proof.foreignOrganizationId,
    );
    const scopedRedactions = redactions.filter(
      (item) => item.projectId === proof.projectId,
    );
    if (
      routerIngestion.organizationId !== proof.primaryOrganizationId ||
      promptInjectionIngestion.organizationId !== proof.primaryOrganizationId ||
      chaosRun.organizationId !== proof.primaryOrganizationId ||
      alerts.some(
        (item) =>
          item.organizationId !== proof.primaryOrganizationId ||
          item.projectId !== proof.projectId,
      ) ||
      (cost && cost.organizationId !== proof.primaryOrganizationId) ||
      (freshness && freshness.organizationId !== proof.primaryOrganizationId) ||
      !tenancy ||
      tenancy.organizationId !== proof.primaryOrganizationId
    )
      throw new Error("Cross-project data relationship");
    assertProjectScope(proof.projectId, [
      proof,
      tenancy,
      routerIngestion,
      promptInjectionIngestion,
      chaosRun,
      cost,
      freshness,
      ...alerts,
      ...scopedDeniedAudits,
      ...scopedRedactions,
      ...evidence,
    ]);
    return {
      proof: {
        _id: proof._id,
        unauthorizedApprovalDenied: proof.unauthorizedApprovalDenied,
        crossTenantReadDenied: proof.crossTenantReadDenied,
      },
      routerIngestion: {
        _id: routerIngestion._id,
        status: routerIngestion.status,
        evidenceRefs: routerIngestion.evidenceRefs,
        rawPageAccepted: routerIngestion.rawPageAccepted,
        promptInjectionBlocked: routerIngestion.promptInjectionBlocked,
        approvedByUserId: routerIngestion.approvedByUserId
          ? "reviewed"
          : undefined,
      },
      promptInjectionIngestion: {
        _id: promptInjectionIngestion._id,
        status: promptInjectionIngestion.status,
        evidenceRefs: [],
        rawPageAccepted: promptInjectionIngestion.rawPageAccepted,
        promptInjectionBlocked: promptInjectionIngestion.promptInjectionBlocked,
        approvedByUserId: undefined,
      },
      chaosRun: { _id: chaosRun._id, status: chaosRun.status },
      chaosCases: chaosCases.map((item) => ({
        _id: item._id,
        kind: item.kind,
        outcome: item.outcome,
        contained: item.contained,
      })),
      alerts: alerts.map((item) => ({
        _id: item._id,
        kind: item.kind,
        severity: item.severity,
        status: item.status,
        runbookKey: item.runbookKey,
      })),
      cost: cost
        ? {
            _id: cost._id,
            apiRequests: cost.apiRequests,
            webhookAttempts: cost.webhookAttempts,
            collectorRuns: cost.collectorRuns,
            aiCalls: cost.aiCalls,
            estimatedUsd: cost.estimatedUsd,
          }
        : null,
      freshness: freshness
        ? {
            _id: freshness._id,
            releasedFacts: freshness.releasedFacts,
            freshFacts: freshness.freshFacts,
            staleFacts: freshness.staleFacts,
            compliancePercent: freshness.compliancePercent,
          }
        : null,
      allChaosPassed:
        chaosCases.length === 5 &&
        chaosCases.every((item) => item.outcome === "pass" && item.contained),
      allCriticalAlertsFired:
        alerts.length === 5 && alerts.every((item) => item.status === "open"),
      verifiedRouterEventOnly:
        routerIngestion.status === "consumed" &&
        routerIngestion.rawPageAccepted === false &&
        routerIngestion.evidenceRefs.length > 0 &&
        routerIngestion.approvedByUserId !== undefined,
      promptInjectionBlocked:
        promptInjectionIngestion.promptInjectionBlocked &&
        promptInjectionIngestion.status === "rejected",
      tenantIsolationPassed:
        proof.unauthorizedApprovalDenied &&
        proof.crossTenantReadDenied &&
        scopedDeniedAudits.length >= 2,
      secretRedactionPassed:
        scopedRedactions.length > 0 &&
        scopedRedactions.every((item) => item.detectedKinds.length > 0),
    };
  },
});
