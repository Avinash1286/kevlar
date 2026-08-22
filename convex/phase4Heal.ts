import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { performIncidentTransition } from "./incidentStateMachine";
import { assertOperationText, requirePhase4IngestKey } from "./phase4Auth";
import { healAttemptStatusValidator } from "./phase4Validators";

const allowed: Record<
  | "created"
  | "submitted"
  | "polling"
  | "preview_ready"
  | "approved"
  | "rejected"
  | "failed",
  readonly (
    | "created"
    | "submitted"
    | "polling"
    | "preview_ready"
    | "approved"
    | "rejected"
    | "failed"
  )[]
> = {
  created: ["submitted", "failed"],
  submitted: ["polling", "preview_ready", "failed"],
  polling: ["preview_ready", "failed"],
  preview_ready: ["approved", "rejected", "failed"],
  approved: [],
  rejected: [],
  failed: [],
};

export const persistAttempt = mutation({
  args: {
    ingestKey: v.string(),
    incidentId: v.id("incidents"),
    attempt: v.number(),
    prompt: v.string(),
    promptHash: v.string(),
    status: healAttemptStatusValidator,
    brightDataJobRef: v.optional(v.string()),
    previewResult: v.optional(v.any()),
    previewRunId: v.optional(v.id("runs")),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    operationKey: v.string(),
    requestHash: v.string(),
  },
  returns: v.object({
    healAttemptId: v.id("healAttempts"),
    duplicate: v.boolean(),
    status: healAttemptStatusValidator,
  }),
  handler: async (ctx, args) => {
    requirePhase4IngestKey(args.ingestKey);
    if (args.status === "approved" || args.status === "rejected")
      throw new Error("Use phase4Approval:decide for human repair decisions");
    assertOperationText(args.operationKey, "operationKey");
    assertOperationText(args.requestHash, "requestHash");
    if (!/^sha256:[0-9a-f]{64}$/i.test(args.promptHash))
      throw new Error("promptHash must be a sha256 digest");
    if (!Number.isInteger(args.attempt) || args.attempt < 1 || args.attempt > 2)
      throw new Error("Automated heal attempt must be 1 or 2");
    if (args.prompt.length === 0 || args.prompt.length > 1_000)
      throw new Error("Repair prompt must contain 1-1000 characters");

    const priorEvent = await ctx.db
      .query("healAttemptEvents")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (priorEvent) {
      if (priorEvent.requestHash !== args.requestHash)
        throw new Error("Idempotency key was reused with a different request");
      const prior = await ctx.db.get("healAttempts", priorEvent.healAttemptId);
      if (!prior) throw new Error("Heal attempt no longer exists");
      return {
        healAttemptId: prior._id,
        duplicate: true,
        status: prior.status,
      };
    }

    const incident = await ctx.db.get("incidents", args.incidentId);
    if (!incident) throw new Error("Incident not found");
    if (args.previewRunId) {
      const previewRun = await ctx.db.get("runs", args.previewRunId);
      if (!previewRun || previewRun.projectId !== incident.projectId)
        throw new Error("Preview run does not belong to the incident project");
    }
    let healAttempt = await ctx.db
      .query("healAttempts")
      .withIndex("by_incidentId_and_attempt", (q) =>
        q.eq("incidentId", incident._id).eq("attempt", args.attempt),
      )
      .unique();
    const now = Date.now();
    const fromStatus = healAttempt?.status ?? null;
    if (!healAttempt) {
      if (args.status !== "created" && args.status !== "submitted")
        throw new Error("A heal attempt must begin as created or submitted");
      const healAttemptId = await ctx.db.insert("healAttempts", {
        projectId: incident.projectId,
        incidentId: incident._id,
        collectorId: incident.collectorId,
        attempt: args.attempt,
        prompt: args.prompt,
        promptHash: args.promptHash,
        status: args.status,
        ...(args.brightDataJobRef
          ? { brightDataJobRef: args.brightDataJobRef }
          : {}),
        ...(args.previewResult === undefined
          ? {}
          : { previewResult: args.previewResult }),
        ...(args.previewRunId ? { previewRunId: args.previewRunId } : {}),
        ...(args.provider ? { provider: args.provider } : {}),
        ...(args.model ? { model: args.model } : {}),
        createdAt: now,
        updatedAt: now,
      });
      healAttempt = await ctx.db.get("healAttempts", healAttemptId);
    } else if (healAttempt.status === args.status) {
      return {
        healAttemptId: healAttempt._id,
        duplicate: true,
        status: healAttempt.status,
      };
    } else {
      if (!allowed[healAttempt.status].includes(args.status))
        throw new Error(
          `Invalid heal lifecycle transition: ${healAttempt.status} -> ${args.status}`,
        );
      await ctx.db.patch("healAttempts", healAttempt._id, {
        status: args.status,
        prompt: args.prompt,
        promptHash: args.promptHash,
        ...(args.brightDataJobRef
          ? { brightDataJobRef: args.brightDataJobRef }
          : {}),
        ...(args.previewResult === undefined
          ? {}
          : { previewResult: args.previewResult }),
        ...(args.previewRunId ? { previewRunId: args.previewRunId } : {}),
        ...(args.provider ? { provider: args.provider } : {}),
        ...(args.model ? { model: args.model } : {}),
        updatedAt: now,
        ...(args.status === "failed" ? { completedAt: now } : {}),
      });
      healAttempt = await ctx.db.get("healAttempts", healAttempt._id);
    }
    if (!healAttempt) throw new Error("Unable to persist heal attempt");

    await ctx.db.insert("healAttemptEvents", {
      projectId: incident.projectId,
      incidentId: incident._id,
      healAttemptId: healAttempt._id,
      fromStatus,
      toStatus: args.status,
      operationKey: args.operationKey,
      requestHash: args.requestHash,
      details: {
        brightDataJobRef: args.brightDataJobRef ?? null,
        previewRunId: args.previewRunId ?? null,
      },
      createdAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: incident.projectId,
      actorType: "provider",
      actorId: "bright-data",
      action: `heal_attempt.${args.status}`,
      targetType: "heal_attempt",
      targetId: String(healAttempt._id),
      payload: { incidentId: incident._id, operationKey: args.operationKey },
      createdAt: now,
    });

    if (
      args.status === "submitted" &&
      (incident.state === "diagnosing" || incident.state === "quarantined")
    )
      await performIncidentTransition(ctx, {
        incidentId: incident._id,
        toState: "healing",
        reason: "Repair submitted to Bright Data",
        actorType: "provider",
        actorId: "bright-data",
        idempotencyKey: `${args.operationKey}:incident`,
        requestHash: args.requestHash,
        details: { healAttemptId: healAttempt._id },
        now,
      });
    if (args.status === "preview_ready" && incident.state === "healing")
      await performIncidentTransition(ctx, {
        incidentId: incident._id,
        toState: "awaiting_preview",
        reason: "Official repair preview is ready",
        actorType: "provider",
        actorId: "bright-data",
        idempotencyKey: `${args.operationKey}:incident`,
        requestHash: args.requestHash,
        details: { healAttemptId: healAttempt._id },
        now,
      });

    return {
      healAttemptId: healAttempt._id,
      duplicate: false,
      status: healAttempt.status,
    };
  },
});

export const backfillFailureEvidence = mutation({
  args: {
    ingestKey: v.string(),
    incidentId: v.id("incidents"),
    operationKey: v.string(),
  },
  returns: v.object({
    failingRunId: v.id("runs"),
    sourceRunId: v.id("runs"),
    outputHash: v.string(),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase4IngestKey(args.ingestKey);
    assertOperationText(args.operationKey, "operationKey");
    const incident = await ctx.db.get("incidents", args.incidentId);
    if (!incident || incident.classification !== "semantic_swap")
      throw new Error("Backfill requires an existing semantic-swap incident");
    const failingRun = await ctx.db.get("runs", incident.failingRunId);
    if (!failingRun) throw new Error("Incident failing run not found");

    const operation = await ctx.db
      .query("idempotencyRecords")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (operation) {
      if (operation.incidentId !== incident._id)
        throw new Error("operationKey belongs to another incident");
      const result =
        operation.result && typeof operation.result === "object"
          ? (operation.result as Record<string, unknown>)
          : null;
      const sourceRunId =
        typeof result?.sourceRunId === "string"
          ? ctx.db.normalizeId("runs", result.sourceRunId)
          : null;
      const current = await ctx.db.get("runs", failingRun._id);
      if (!sourceRunId || !current?.outputHash)
        throw new Error("Backfill idempotency record is incomplete");
      return {
        failingRunId: current._id,
        sourceRunId,
        outputHash: current.outputHash,
        duplicate: true,
      };
    }

    const sourceIsValid = async (sourceRunId: string) => {
      const normalized = ctx.db.normalizeId("runs", sourceRunId);
      if (!normalized || normalized === failingRun._id) return null;
      const source = await ctx.db.get("runs", normalized);
      if (
        !source ||
        source.projectId !== incident.projectId ||
        source.collectorId !== incident.collectorId ||
        source.status !== "quarantined" ||
        !source.outputHash
      )
        return null;
      const row = await ctx.db
        .query("rows")
        .withIndex("by_run", (q) => q.eq("runId", source._id))
        .first();
      return row ? source : null;
    };

    const creationEvents = await ctx.db
      .query("auditEvents")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "run").eq("targetId", String(failingRun._id)),
      )
      .order("desc")
      .take(20);
    let sourceRun = null;
    for (const event of creationEvents) {
      if (event.action !== "phase3.control_run_created") continue;
      const payload =
        event.payload && typeof event.payload === "object"
          ? (event.payload as Record<string, unknown>)
          : null;
      if (typeof payload?.sourceRunId !== "string") continue;
      sourceRun = await sourceIsValid(payload.sourceRunId);
      if (sourceRun) break;
    }
    if (!sourceRun) {
      const recent = await ctx.db
        .query("runs")
        .withIndex("by_collector_started", (q) =>
          q.eq("collectorId", incident.collectorId),
        )
        .order("desc")
        .take(25);
      const ordered = [
        ...recent.filter(
          (run) => !run.mutationId?.startsWith("phase3-control:"),
        ),
        ...recent.filter((run) =>
          run.mutationId?.startsWith("phase3-control:"),
        ),
      ];
      for (const candidate of ordered) {
        sourceRun = await sourceIsValid(String(candidate._id));
        if (sourceRun) break;
      }
    }
    if (!sourceRun)
      throw new Error(
        "No bounded same-project quarantined source run with a row was found",
      );
    const sourceOutputHash = sourceRun.outputHash;
    if (!sourceOutputHash)
      throw new Error("Validated source run has no output hash");

    const existingRow = await ctx.db
      .query("rows")
      .withIndex("by_run", (q) => q.eq("runId", failingRun._id))
      .first();
    const sourceRows = await ctx.db
      .query("rows")
      .withIndex("by_run", (q) => q.eq("runId", sourceRun._id))
      .take(100);
    if (sourceRows.length === 0)
      throw new Error("Validated source run no longer has row evidence");
    if (
      sourceRun.rowCount !== undefined &&
      sourceRun.rowCount > sourceRows.length
    )
      throw new Error("Source run exceeds the bounded backfill clone limit");
    const sourceEvidence = await ctx.db
      .query("evidence")
      .withIndex("by_run", (q) => q.eq("runId", sourceRun._id))
      .take(50);
    const now = Date.now();
    if (!existingRow) {
      for (const row of sourceRows)
        await ctx.db.insert("rows", {
          runId: failingRun._id,
          entityId: row.entityId,
          rawPayload: row.rawPayload,
          normalizedPayload: row.normalizedPayload,
          fieldTrust: row.fieldTrust,
          recordHash: row.recordHash,
        });
      for (const evidence of sourceEvidence)
        await ctx.db.insert("evidence", {
          projectId: failingRun.projectId,
          runId: failingRun._id,
          kind: evidence.kind,
          sourceUrl: evidence.sourceUrl,
          ...(evidence.storageId ? { storageId: evidence.storageId } : {}),
          contentHash: evidence.contentHash,
          metadata: evidence.metadata,
          capturedAt: evidence.capturedAt,
        });
      await ctx.db.patch("runs", failingRun._id, {
        outputHash: sourceOutputHash,
        rowCount: sourceRows.length,
      });
      await ctx.db.insert("auditEvents", {
        projectId: incident.projectId,
        actorType: "system",
        action: "phase4.failure_evidence_backfilled",
        targetType: "run",
        targetId: String(failingRun._id),
        payload: {
          incidentId: incident._id,
          sourceRunId: sourceRun._id,
          previousOutputHash: failingRun.outputHash ?? null,
          outputHash: sourceOutputHash,
          clonedRows: sourceRows.length,
          clonedEvidence: sourceEvidence.length,
          operationKey: args.operationKey,
        },
        createdAt: now,
      });
    } else if (!failingRun.outputHash) {
      throw new Error("Existing failing row has no output hash");
    }
    const outputHash = existingRow ? failingRun.outputHash! : sourceOutputHash;
    await ctx.db.insert("idempotencyRecords", {
      projectId: incident.projectId,
      incidentId: incident._id,
      operationKey: args.operationKey,
      scope: "workflow",
      status: "completed",
      requestHash: `phase4-failure-evidence:${incident._id}`,
      result: {
        failingRunId: failingRun._id,
        sourceRunId: sourceRun._id,
        outputHash,
      },
      attempts: 1,
      createdAt: now,
      updatedAt: now,
    });
    return {
      failingRunId: failingRun._id,
      sourceRunId: sourceRun._id,
      outputHash,
      duplicate: existingRow !== null,
    };
  },
});
