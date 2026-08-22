import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const fixtureStateValidator = v.object({
  version: v.union(v.literal("v1"), v.literal("v2")),
  updatedAt: v.union(v.number(), v.null()),
});

export const getNova = query({
  args: {},
  returns: fixtureStateValidator,
  handler: async (ctx) => {
    const state = await ctx.db
      .query("fixtureStates")
      .withIndex("by_key", (q) => q.eq("key", "nova-product"))
      .unique();
    return state
      ? { version: state.version, updatedAt: state.updatedAt }
      : { version: "v1" as const, updatedAt: null };
  },
});

export const setNova = mutation({
  args: {
    ingestKey: v.string(),
    version: v.union(v.literal("v1"), v.literal("v2")),
  },
  returns: fixtureStateValidator,
  handler: async (ctx, args) => {
    const expectedKey = process.env.KEVLAR_BASELINE_INGEST_KEY;
    if (!expectedKey || args.ingestKey !== expectedKey)
      throw new Error("Unauthorized fixture-state change");

    const existing = await ctx.db
      .query("fixtureStates")
      .withIndex("by_key", (q) => q.eq("key", "nova-product"))
      .unique();
    const updatedAt = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        version: args.version,
        updatedAt,
        updatedBy: "week-2-scenario",
      });
    } else {
      await ctx.db.insert("fixtureStates", {
        key: "nova-product",
        version: args.version,
        updatedAt,
        updatedBy: "week-2-scenario",
      });
    }
    return { version: args.version, updatedAt };
  },
});
