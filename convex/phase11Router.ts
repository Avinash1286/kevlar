import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import schema from "./schema";
import { requireProjectRole } from "./phase11Auth";

export const ingestVerifiedEvent = mutation({
  args: {
    eventId: v.id("changeEvents"),
    proposedChange: v.any(),
    operationKey: v.string(),
  },
  returns: v.object({
    ingestion: schema.doc("aiRouterIngestions"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const event = await ctx.db.get("changeEvents", args.eventId);
    if (!event || event.state !== "released" || event.evidenceRefs.length === 0)
      throw new Error("Router accepts released evidence-backed events only");
    const auth = await requireProjectRole(ctx, event.projectId, [
      "owner",
      "admin",
      "operator",
    ]);
    const prior = await ctx.db
      .query("aiRouterIngestions")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (prior) return { ingestion: prior, duplicate: true };
    const nextFact = event.nextFactVersionId
      ? await ctx.db.get("factVersions", event.nextFactVersionId)
      : null;
    if (nextFact && nextFact.state !== "released")
      throw new Error("Router event references an unreleased fact");
    const serialized = JSON.stringify(args.proposedChange);
    if (serialized.length > 20_000)
      throw new Error("Router change proposal is too large");
    const promptInjectionBlocked =
      /ignore previous|system prompt|developer message|tool call/i.test(
        serialized,
      );
    const id = await ctx.db.insert("aiRouterIngestions", {
      organizationId: auth.tenancy.organizationId,
      projectId: event.projectId,
      eventId: event._id,
      status: "pending_approval",
      verifiedEventHash: event.eventHash,
      evidenceRefs: event.evidenceRefs.slice(0, 50),
      rawPageAccepted: false,
      promptInjectionBlocked,
      proposedChange: promptInjectionBlocked
        ? { blocked: true, reason: "prompt_injection_pattern" }
        : args.proposedChange,
      operationKey: args.operationKey,
      createdAt: Date.now(),
    });
    return {
      ingestion: (await ctx.db.get("aiRouterIngestions", id))!,
      duplicate: false,
    };
  },
});

export const review = mutation({
  args: {
    ingestionId: v.id("aiRouterIngestions"),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
  },
  returns: schema.doc("aiRouterIngestions"),
  handler: async (ctx, args) => {
    const ingestion = await ctx.db.get("aiRouterIngestions", args.ingestionId);
    if (!ingestion) throw new Error("Router ingestion not found");
    const auth = await requireProjectRole(ctx, ingestion.projectId, [
      "owner",
      "admin",
      "reviewer",
    ]);
    if (ingestion.status === "pending_approval")
      await ctx.db.patch("aiRouterIngestions", ingestion._id, {
        status: args.decision,
        approvedByUserId:
          args.decision === "approved" ? auth.user._id : undefined,
        approvedAt: args.decision === "approved" ? Date.now() : undefined,
      });
    return (await ctx.db.get("aiRouterIngestions", ingestion._id))!;
  },
});

export const markConsumed = mutation({
  args: { ingestionId: v.id("aiRouterIngestions") },
  returns: schema.doc("aiRouterIngestions"),
  handler: async (ctx, args) => {
    const ingestion = await ctx.db.get("aiRouterIngestions", args.ingestionId);
    if (!ingestion) throw new Error("Router ingestion not found");
    await requireProjectRole(ctx, ingestion.projectId, [
      "owner",
      "admin",
      "operator",
    ]);
    if (ingestion.status !== "approved" && ingestion.status !== "consumed")
      throw new Error("Router change requires approval before consumption");
    if (ingestion.status === "approved")
      await ctx.db.patch("aiRouterIngestions", ingestion._id, {
        status: "consumed",
        consumedAt: Date.now(),
      });
    return (await ctx.db.get("aiRouterIngestions", ingestion._id))!;
  },
});

export const queue = query({
  args: {
    projectId: v.id("projects"),
    status: v.optional(
      v.union(
        v.literal("pending_approval"),
        v.literal("approved"),
        v.literal("consumed"),
        v.literal("rejected"),
      ),
    ),
  },
  returns: v.array(schema.doc("aiRouterIngestions")),
  handler: async (ctx, args) => {
    await requireProjectRole(ctx, args.projectId, [
      "owner",
      "admin",
      "operator",
      "reviewer",
      "developer",
      "viewer",
    ]);
    return ctx.db
      .query("aiRouterIngestions")
      .withIndex("by_projectId_and_status_and_createdAt", (q) =>
        q
          .eq("projectId", args.projectId)
          .eq("status", args.status ?? "pending_approval"),
      )
      .order("desc")
      .take(100);
  },
});
