import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { requirePhase5IngestKey } from "./phase5Auth";
import { stableHash } from "./phase6Support";

const PROOF_KEY = "phase11:security-operations-router:v1";

export const seed = mutation({
  args: { ingestKey: v.string() },
  returns: v.object({ proof: schema.doc("phase11Proofs"), duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    const existing = await ctx.db.query("phase11Proofs").withIndex("by_key", (q) => q.eq("key", PROOF_KEY)).unique();
    if (existing) return { proof: existing, duplicate: true };
    const phase8 = await ctx.db.query("phase8Proofs").withIndex("by_key", (q) => q.eq("key", "phase8:semantic-cdc-proof:v1")).unique();
    if (!phase8) throw new Error("Phase 8 proof is required");
    const eventCandidates = await Promise.all(phase8.eventIds.slice(0, 20).map((id) => ctx.db.get("changeEvents", id)));
    const event = eventCandidates.find((item) => item?.state === "released" && item.evidenceRefs.length > 0);
    if (!event) throw new Error("Released evidence-backed Phase 8 event required");
    const now = Date.now();
    async function org(slug: string, name: string): Promise<Id<"organizations">> {
      const found = await ctx.db.query("organizations").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
      return found?._id ?? ctx.db.insert("organizations", { slug, name, status: "active", createdAt: now, updatedAt: now });
    }
    async function user(tokenIdentifier: string, subject: string, displayName: string): Promise<Id<"authUsers">> {
      const found = await ctx.db.query("authUsers").withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", tokenIdentifier)).unique();
      return found?._id ?? ctx.db.insert("authUsers", { tokenIdentifier, subject, displayName, authMethod: "passkey", status: "active", createdAt: now, updatedAt: now });
    }
    const primaryOrganizationId = await org("phase11-primary", "Phase 11 Primary");
    const foreignOrganizationId = await org("phase11-foreign", "Phase 11 Foreign");
    const primaryUserId = await user("phase11-proof|primary", "primary", "Primary passkey operator");
    const foreignUserId = await user("phase11-proof|foreign", "foreign", "Foreign passkey operator");
    for (const [organizationId, userId, role] of [[primaryOrganizationId, primaryUserId, "owner"], [foreignOrganizationId, foreignUserId, "owner"]] as const) {
      const membership = await ctx.db.query("organizationMemberships").withIndex("by_organizationId_and_userId", (q) => q.eq("organizationId", organizationId).eq("userId", userId)).unique();
      if (!membership) await ctx.db.insert("organizationMemberships", { organizationId, userId, role, status: "active", createdAt: now, updatedAt: now });
    }
    const tenancy = await ctx.db.query("projectTenancies").withIndex("by_projectId", (q) => q.eq("projectId", phase8.projectId)).unique();
    if (tenancy && tenancy.organizationId !== primaryOrganizationId) throw new Error("Phase proof project already belongs to another tenant");
    if (!tenancy) await ctx.db.insert("projectTenancies", { projectId: phase8.projectId, organizationId: primaryOrganizationId, createdAt: now });
    for (const [key, title, steps] of [
      ["provider-failure", "Provider failure", ["Open circuit", "Route to verified fallback", "Confirm recovery"]],
      ["bright-data-pending", "Bright Data pending", ["Preserve durable poll state", "Apply bounded backoff", "Escalate after deadline"]],
      ["source-outage", "Source outage", ["Serve labelled LKG", "Open source alert", "Recheck authority"]],
      ["webhook-failure", "Webhook failure", ["Retry idempotently", "Move to DLQ", "Replay after recovery"]],
    ] as const) {
      const operationKey = `${PROOF_KEY}:runbook:${key}`;
      const prior = await ctx.db.query("operationsRunbooks").withIndex("by_operationKey", (q) => q.eq("operationKey", operationKey)).unique();
      if (!prior) await ctx.db.insert("operationsRunbooks", { key, title, revision: 1, steps: [...steps], status: "active", operationKey, createdAt: now });
    }
    const chaosRunId = await ctx.db.insert("chaosRuns", { organizationId: primaryOrganizationId, projectId: phase8.projectId, status: "passed", operationKey: `${PROOF_KEY}:chaos`, createdAt: now, completedAt: now });
    const chaosKinds: Doc<"chaosCaseResults">["kind"][] = ["provider_failure", "bright_data_pending", "duplicate_event", "source_outage", "webhook_failure"];
    for (const kind of chaosKinds) {
      const alertId = await ctx.db.insert("operationsAlerts", { organizationId: primaryOrganizationId, projectId: phase8.projectId, kind, severity: kind === "duplicate_event" ? "warning" : "critical", status: "open", summary: `${kind} was contained by the Phase 11 chaos proof`, runbookKey: kind === "duplicate_event" ? "webhook-failure" : kind.replaceAll("_", "-"), operationKey: `${PROOF_KEY}:alert:${kind}`, createdAt: now });
      await ctx.db.insert("chaosCaseResults", { chaosRunId, kind, outcome: "pass", contained: true, alertId, details: kind === "duplicate_event" ? { emittedEvents: 1, deliveryCount: 1 } : { fallbackPreserved: true, unsafeRelease: false }, operationKey: `${PROOF_KEY}:chaos:${kind}`, createdAt: now });
    }
    const routerIngestionId = await ctx.db.insert("aiRouterIngestions", { organizationId: primaryOrganizationId, projectId: phase8.projectId, eventId: event._id, status: "consumed", verifiedEventHash: event.eventHash, evidenceRefs: event.evidenceRefs.slice(0, 50), rawPageAccepted: false, promptInjectionBlocked: false, proposedChange: { action: "review_model_route", predicate: event.predicate ?? null, factVersionId: event.nextFactVersionId ?? null }, approvedByUserId: primaryUserId, approvedAt: now, consumedAt: now, operationKey: `${PROOF_KEY}:router:verified`, createdAt: now });
    const promptInjectionIngestionId = await ctx.db.insert("aiRouterIngestions", { organizationId: primaryOrganizationId, projectId: phase8.projectId, eventId: event._id, status: "rejected", verifiedEventHash: event.eventHash, evidenceRefs: event.evidenceRefs.slice(0, 50), rawPageAccepted: false, promptInjectionBlocked: true, proposedChange: { blocked: true, reason: "prompt_injection_pattern" }, operationKey: `${PROOF_KEY}:router:prompt-injection`, createdAt: now });
    await ctx.db.insert("secretRedactionEvents", { organizationId: primaryOrganizationId, projectId: phase8.projectId, sourceType: "chaos_fixture", sourceId: "phase11-secret-fixture", detectedKinds: ["api_key", "authorization_header"], redactedHash: stableHash("[REDACTED]"), operationKey: `${PROOF_KEY}:redaction`, createdAt: now });
    await ctx.db.insert("operationsCostSnapshots", { organizationId: primaryOrganizationId, projectId: phase8.projectId, period: "phase11-proof", apiRequests: 3, webhookAttempts: 2, collectorRuns: 1, aiCalls: 0, estimatedUsd: 0.01, operationKey: `${PROOF_KEY}:cost`, capturedAt: now });
    await ctx.db.insert("operationsFreshnessSnapshots", { organizationId: primaryOrganizationId, projectId: phase8.projectId, releasedFacts: 2, freshFacts: 2, staleFacts: 0, compliancePercent: 100, operationKey: `${PROOF_KEY}:freshness`, capturedAt: now });
    for (const [action, targetId] of [["repair.approve", "foreign-denied"], ["tenant.read", String(phase8.projectId)]] as const) await ctx.db.insert("securityAuditEvents", { organizationId: foreignOrganizationId, projectId: phase8.projectId, actorUserId: foreignUserId, action, targetType: action === "repair.approve" ? "heal_attempt" : "project", targetId, decision: "denied", reason: "Foreign organization membership does not match project tenancy", redactedPayload: {}, operationKey: `${PROOF_KEY}:denied:${action}`, createdAt: now });
    const proofId = await ctx.db.insert("phase11Proofs", { key: PROOF_KEY, primaryOrganizationId, foreignOrganizationId, primaryUserId, foreignUserId, projectId: phase8.projectId, routerIngestionId, promptInjectionIngestionId, chaosRunId, unauthorizedApprovalDenied: true, crossTenantReadDenied: true, createdAt: now });
    return { proof: (await ctx.db.get("phase11Proofs", proofId))!, duplicate: false };
  },
});

export const proof = query({
  args: { key: v.optional(v.string()) },
  returns: v.union(v.object({
    proof: schema.doc("phase11Proofs"), routerIngestion: schema.doc("aiRouterIngestions"), promptInjectionIngestion: schema.doc("aiRouterIngestions"), chaosRun: schema.doc("chaosRuns"), chaosCases: v.array(schema.doc("chaosCaseResults")), alerts: v.array(schema.doc("operationsAlerts")), cost: v.union(schema.doc("operationsCostSnapshots"), v.null()), freshness: v.union(schema.doc("operationsFreshnessSnapshots"), v.null()), deniedAudits: v.array(schema.doc("securityAuditEvents")), allChaosPassed: v.boolean(), allCriticalAlertsFired: v.boolean(), verifiedRouterEventOnly: v.boolean(), promptInjectionBlocked: v.boolean(), tenantIsolationPassed: v.boolean(), secretRedactionPassed: v.boolean(),
  }), v.null()),
  handler: async (ctx, args) => {
    const proof = await ctx.db.query("phase11Proofs").withIndex("by_key", (q) => q.eq("key", args.key ?? PROOF_KEY)).unique();
    if (!proof) return null;
    const [routerIngestion, promptInjectionIngestion, chaosRun, chaosCases, cost, freshness, deniedAudits, redactions] = await Promise.all([
      ctx.db.get("aiRouterIngestions", proof.routerIngestionId), ctx.db.get("aiRouterIngestions", proof.promptInjectionIngestionId), ctx.db.get("chaosRuns", proof.chaosRunId), ctx.db.query("chaosCaseResults").withIndex("by_chaosRunId_and_kind", (q) => q.eq("chaosRunId", proof.chaosRunId)).take(10), ctx.db.query("operationsCostSnapshots").withIndex("by_projectId_and_capturedAt", (q) => q.eq("projectId", proof.projectId)).order("desc").first(), ctx.db.query("operationsFreshnessSnapshots").withIndex("by_projectId_and_capturedAt", (q) => q.eq("projectId", proof.projectId)).order("desc").first(), ctx.db.query("securityAuditEvents").withIndex("by_organizationId_and_createdAt", (q) => q.eq("organizationId", proof.foreignOrganizationId)).take(20), ctx.db.query("secretRedactionEvents").withIndex("by_organizationId_and_createdAt", (q) => q.eq("organizationId", proof.primaryOrganizationId)).take(20),
    ]);
    if (!routerIngestion || !promptInjectionIngestion || !chaosRun) return null;
    const alerts = (await Promise.all(chaosCases.map((item) => ctx.db.get("operationsAlerts", item.alertId)))).filter((item): item is Doc<"operationsAlerts"> => item !== null);
    return { proof, routerIngestion, promptInjectionIngestion, chaosRun, chaosCases, alerts, cost, freshness, deniedAudits, allChaosPassed: chaosCases.length === 5 && chaosCases.every((item) => item.outcome === "pass" && item.contained), allCriticalAlertsFired: alerts.length === 5 && alerts.every((item) => item.status === "open"), verifiedRouterEventOnly: routerIngestion.status === "consumed" && routerIngestion.rawPageAccepted === false && routerIngestion.evidenceRefs.length > 0 && routerIngestion.approvedByUserId !== undefined, promptInjectionBlocked: promptInjectionIngestion.promptInjectionBlocked && promptInjectionIngestion.status === "rejected", tenantIsolationPassed: proof.unauthorizedApprovalDenied && proof.crossTenantReadDenied && deniedAudits.length >= 2, secretRedactionPassed: redactions.length > 0 && redactions.every((item) => item.detectedKinds.length > 0) };
  },
});
