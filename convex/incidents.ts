import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { performIncidentTransition } from "./incidentStateMachine";
import {
  actorTypeValidator,
  humanReviewStatusValidator,
  incidentStateValidator,
} from "./phase3Validators";
import schema from "./schema";

const createIncidentResultValidator = v.object({
  incidentId: v.id("incidents"),
  duplicate: v.boolean(),
});

const transitionResultValidator = v.object({
  duplicate: v.boolean(),
  sequence: v.number(),
});

export const createIncident = internalMutation({
  args: {
    failingRunId: v.id("runs"),
    failureSummary: v.string(),
    operationKey: v.string(),
    requestHash: v.string(),
  },
  returns: createIncidentResultValidator,
  handler: async (ctx, args) => {
    if (args.failureSummary.length === 0 || args.failureSummary.length > 1_000)
      throw new Error("failureSummary must contain 1-1000 characters");

    const run = await ctx.db.get("runs", args.failingRunId);
    if (!run) throw new Error("Failing run not found");

    const operation = await ctx.db
      .query("idempotencyRecords")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (operation && operation.requestHash !== args.requestHash)
      throw new Error("Idempotency key was already used for another request");

    const existing = await ctx.db
      .query("incidents")
      .withIndex("by_failingRunId", (q) =>
        q.eq("failingRunId", args.failingRunId),
      )
      .unique();
    if (existing) return { incidentId: existing._id, duplicate: true };
    if (operation)
      throw new Error("Idempotency key belongs to an incident that is missing");

    const now = Date.now();
    const incidentId = await ctx.db.insert("incidents", {
      projectId: run.projectId,
      failingRunId: run._id,
      collectorId: run.collectorId,
      state: "detected",
      failureSummary: args.failureSummary,
      transitionSequence: 0,
      openedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("incidentTransitions", {
      projectId: run.projectId,
      incidentId,
      sequence: 0,
      fromState: null,
      toState: "detected",
      reason: "Critical verification failure detected",
      actorType: "system",
      idempotencyKey: args.operationKey,
      details: { failingRunId: run._id },
      createdAt: now,
    });
    await ctx.db.insert("idempotencyRecords", {
      projectId: run.projectId,
      incidentId,
      operationKey: args.operationKey,
      scope: "incident",
      status: "completed",
      requestHash: args.requestHash,
      result: { incidentId },
      attempts: 1,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: run.projectId,
      actorType: "system",
      action: "incident.created",
      targetType: "incident",
      targetId: String(incidentId),
      payload: {
        failingRunId: run._id,
        collectorId: run.collectorId,
        idempotencyKey: args.operationKey,
      },
      createdAt: now,
    });

    return { incidentId, duplicate: false };
  },
});

export const transition = internalMutation({
  args: {
    incidentId: v.id("incidents"),
    toState: incidentStateValidator,
    reason: v.string(),
    actorType: actorTypeValidator,
    actorId: v.optional(v.string()),
    idempotencyKey: v.string(),
    requestHash: v.string(),
    details: v.any(),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    if (args.reason.length === 0 || args.reason.length > 600)
      throw new Error("reason must contain 1-600 characters");
    return await performIncidentTransition(ctx, {
      ...args,
      now: Date.now(),
    });
  },
});

export const resolveHumanReview = internalMutation({
  args: {
    reviewId: v.id("humanReviews"),
    status: humanReviewStatusValidator,
    resolutionNote: v.string(),
    idempotencyKey: v.string(),
    requestHash: v.string(),
  },
  returns: v.object({ duplicate: v.boolean(), reviewId: v.id("humanReviews") }),
  handler: async (ctx, args) => {
    if (args.status === "pending")
      throw new Error("A review resolution cannot remain pending");
    if (args.resolutionNote.length === 0 || args.resolutionNote.length > 1_000)
      throw new Error("resolutionNote must contain 1-1000 characters");

    const operation = await ctx.db
      .query("idempotencyRecords")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.idempotencyKey),
      )
      .unique();
    if (operation) {
      if (operation.requestHash !== args.requestHash)
        throw new Error("Idempotency key was already used for another request");
      return { duplicate: true, reviewId: args.reviewId };
    }

    const review = await ctx.db.get("humanReviews", args.reviewId);
    if (!review) throw new Error("Human review not found");
    if (review.status !== "pending")
      return { duplicate: true, reviewId: review._id };

    const identity = await ctx.auth.getUserIdentity();
    const actorId = identity?.tokenIdentifier ?? "anonymous-reviewer";
    const now = Date.now();
    await ctx.db.patch("humanReviews", review._id, {
      status: args.status,
      resolutionNote: args.resolutionNote,
      resolvedAt: now,
    });
    await ctx.db.insert("idempotencyRecords", {
      projectId: review.projectId,
      incidentId: review.incidentId,
      operationKey: args.idempotencyKey,
      scope: "human_review",
      status: "completed",
      requestHash: args.requestHash,
      result: { reviewId: review._id, status: args.status },
      attempts: 1,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      projectId: review.projectId,
      actorType: "user",
      actorId,
      action: "human_review.resolved",
      targetType: "incident",
      targetId: String(review.incidentId),
      payload: {
        reviewId: review._id,
        status: args.status,
        resolutionNote: args.resolutionNote,
        idempotencyKey: args.idempotencyKey,
      },
      createdAt: now,
    });
    return { duplicate: false, reviewId: review._id };
  },
});

export const detail = query({
  args: { incidentId: v.id("incidents") },
  returns: v.union(
    v.null(),
    v.object({
      incident: schema.doc("incidents"),
      failingRun: v.union(schema.doc("runs"), v.null()),
      collector: v.union(schema.doc("collectors"), v.null()),
      latestTriage: v.union(schema.doc("triageRecords"), v.null()),
      latestWorkflow: v.union(schema.doc("workflowRuns"), v.null()),
      latestReview: v.union(schema.doc("humanReviews"), v.null()),
      modelCalls: v.array(schema.doc("modelCalls")),
    }),
  ),
  handler: async (ctx, args) => {
    const incident = await ctx.db.get("incidents", args.incidentId);
    if (!incident) return null;
    const [
      failingRun,
      collector,
      latestTriage,
      latestWorkflow,
      latestReview,
      modelCalls,
    ] = await Promise.all([
      ctx.db.get("runs", incident.failingRunId),
      ctx.db.get("collectors", incident.collectorId),
      ctx.db
        .query("triageRecords")
        .withIndex("by_incidentId_and_createdAt", (q) =>
          q.eq("incidentId", incident._id),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("workflowRuns")
        .withIndex("by_incidentId_and_createdAt", (q) =>
          q.eq("incidentId", incident._id),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("humanReviews")
        .withIndex("by_incidentId_and_requestedAt", (q) =>
          q.eq("incidentId", incident._id),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("modelCalls")
        .withIndex("by_incidentId_and_startedAt", (q) =>
          q.eq("incidentId", incident._id),
        )
        .order("desc")
        .take(25),
    ]);
    return {
      incident,
      failingRun,
      collector,
      latestTriage,
      latestWorkflow,
      latestReview,
      modelCalls,
    };
  },
});

const timelineItemValidator = v.object({
  id: v.string(),
  at: v.number(),
  kind: v.union(
    v.literal("incident"),
    v.literal("triage"),
    v.literal("workflow"),
    v.literal("model"),
    v.literal("human_review"),
  ),
  label: v.string(),
  details: v.any(),
});

export const timeline = query({
  args: { incidentId: v.id("incidents") },
  returns: v.array(timelineItemValidator),
  handler: async (ctx, args) => {
    const incident = await ctx.db.get("incidents", args.incidentId);
    if (!incident) return [];
    const [transitions, triage, workflows, modelCalls, reviews] =
      await Promise.all([
        ctx.db
          .query("incidentTransitions")
          .withIndex("by_incidentId_and_createdAt", (q) =>
            q.eq("incidentId", incident._id),
          )
          .order("desc")
          .take(100),
        ctx.db
          .query("triageRecords")
          .withIndex("by_incidentId_and_createdAt", (q) =>
            q.eq("incidentId", incident._id),
          )
          .order("desc")
          .take(25),
        ctx.db
          .query("workflowEvents")
          .withIndex("by_incidentId_and_createdAt", (q) =>
            q.eq("incidentId", incident._id),
          )
          .order("desc")
          .take(100),
        ctx.db
          .query("modelCalls")
          .withIndex("by_incidentId_and_startedAt", (q) =>
            q.eq("incidentId", incident._id),
          )
          .order("desc")
          .take(50),
        ctx.db
          .query("humanReviews")
          .withIndex("by_incidentId_and_requestedAt", (q) =>
            q.eq("incidentId", incident._id),
          )
          .order("desc")
          .take(25),
      ]);

    return [
      ...transitions.map((item) => ({
        id: String(item._id),
        at: item.createdAt,
        kind: "incident" as const,
        label: `${item.fromState ?? "new"} -> ${item.toState}`,
        details: item,
      })),
      ...triage.map((item) => ({
        id: String(item._id),
        at: item.createdAt,
        kind: "triage" as const,
        label: `${item.classification}: ${item.recommendedAction}`,
        details: item,
      })),
      ...workflows.map((item) => ({
        id: String(item._id),
        at: item.createdAt,
        kind: "workflow" as const,
        label: `${item.eventType}: ${item.step}`,
        details: item,
      })),
      ...modelCalls.map((item) => ({
        id: String(item._id),
        at: item.startedAt,
        kind: "model" as const,
        label: `${item.provider}/${item.model}: ${item.status}`,
        details: item,
      })),
      ...reviews.map((item) => ({
        id: String(item._id),
        at: item.requestedAt,
        kind: "human_review" as const,
        label: `human review: ${item.status}`,
        details: item,
      })),
    ]
      .sort((a, b) => b.at - a.at)
      .slice(0, 200);
  },
});
