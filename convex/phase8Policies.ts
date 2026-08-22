import { v } from "convex/values";
import { mutation } from "./_generated/server";
import schema from "./schema";
import { requirePhase5IngestKey } from "./phase5Auth";
import { assertPhase6Text, stableHash } from "./phase6Support";
import {
  equivalenceRuleValidator,
  policySourceRoleValidator,
  reconciliationStrategyValidator,
  releasePolicyStatusValidator,
} from "./phase8Validators";

const sourceInputValidator = v.object({
  sourceId: v.id("sources"),
  priority: v.number(),
  role: policySourceRoleValidator,
  independenceGroup: v.string(),
});

export const create = mutation({
  args: {
    ingestKey: v.string(),
    projectId: v.id("projects"),
    name: v.string(),
    predicate: v.string(),
    revision: v.number(),
    status: releasePolicyStatusValidator,
    strategy: reconciliationStrategyValidator,
    equivalenceRule: equivalenceRuleValidator,
    numericTolerancePercent: v.optional(v.number()),
    quorum: v.optional(v.number()),
    continueLastKnownGood: v.boolean(),
    explicitRemovalRequired: v.boolean(),
    repeatedAbsenceMinimum: v.number(),
    sources: v.array(sourceInputValidator),
    operationKey: v.string(),
  },
  returns: v.object({
    policy: schema.doc("releasePolicies"),
    sources: v.array(schema.doc("releasePolicySources")),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requirePhase5IngestKey(args.ingestKey);
    for (const [name, value, max] of [
      ["name", args.name, 200],
      ["predicate", args.predicate, 300],
      ["operationKey", args.operationKey, 240],
    ] as const)
      assertPhase6Text(value, name, max);
    if (!Number.isSafeInteger(args.revision) || args.revision < 1)
      throw new Error("revision must be a positive integer");
    if (
      !Number.isSafeInteger(args.repeatedAbsenceMinimum) ||
      args.repeatedAbsenceMinimum < 1 ||
      args.repeatedAbsenceMinimum > 100
    )
      throw new Error("repeatedAbsenceMinimum must be 1-100");
    if (args.sources.length < 1 || args.sources.length > 20)
      throw new Error("Release policy requires 1-20 sources");
    if (
      args.equivalenceRule === "numeric_tolerance" &&
      (args.numericTolerancePercent === undefined ||
        !Number.isFinite(args.numericTolerancePercent) ||
        args.numericTolerancePercent < 0 ||
        args.numericTolerancePercent > 100)
    )
      throw new Error("Numeric tolerance policy requires a 0-100 percentage");
    if (
      args.strategy === "quorum" &&
      (!Number.isSafeInteger(args.quorum) ||
        args.quorum! < 2 ||
        args.quorum! > args.sources.length)
    )
      throw new Error("Quorum strategy requires quorum from 2 to source count");
    const priorities = new Set<number>();
    const sourceIds = new Set<string>();
    for (const source of args.sources) {
      if (!Number.isSafeInteger(source.priority) || source.priority < 1)
        throw new Error("Source priority must be a positive integer");
      if (priorities.has(source.priority))
        throw new Error("Release policy source priorities must be unique");
      if (sourceIds.has(source.sourceId))
        throw new Error("Release policy source IDs must be unique");
      priorities.add(source.priority);
      sourceIds.add(source.sourceId);
      assertPhase6Text(source.independenceGroup, "independenceGroup", 120);
    }
    const duplicate = await ctx.db
      .query("releasePolicies")
      .withIndex("by_operationKey", (q) =>
        q.eq("operationKey", args.operationKey),
      )
      .unique();
    if (duplicate) {
      const sourceDocs = await ctx.db
        .query("releasePolicySources")
        .withIndex("by_policyId_and_priority", (q) =>
          q.eq("policyId", duplicate._id),
        )
        .take(20);
      return { policy: duplicate, sources: sourceDocs, duplicate: true };
    }
    if (!(await ctx.db.get("projects", args.projectId)))
      throw new Error("Project does not exist");
    for (const sourceInput of args.sources) {
      const [source, authority] = await Promise.all([
        ctx.db.get("sources", sourceInput.sourceId),
        ctx.db
          .query("sourceAuthorities")
          .withIndex("by_sourceId_and_predicate", (q) =>
            q
              .eq("sourceId", sourceInput.sourceId)
              .eq("predicate", args.predicate),
          )
          .unique(),
      ]);
      if (
        !source ||
        source.approvalStatus !== "approved" ||
        source.lifecycleStatus !== "active" ||
        !authority ||
        !authority.active ||
        authority.authority === "forbidden"
      )
        throw new Error(
          "Every release-policy source needs active predicate authority",
        );
    }
    const policyShape = {
      projectId: args.projectId,
      name: args.name,
      predicate: args.predicate,
      revision: args.revision,
      status: args.status,
      strategy: args.strategy,
      equivalenceRule: args.equivalenceRule,
      ...(args.numericTolerancePercent !== undefined
        ? { numericTolerancePercent: args.numericTolerancePercent }
        : {}),
      ...(args.quorum !== undefined ? { quorum: args.quorum } : {}),
      continueLastKnownGood: args.continueLastKnownGood,
      explicitRemovalRequired: args.explicitRemovalRequired,
      repeatedAbsenceMinimum: args.repeatedAbsenceMinimum,
    };
    const policyId = await ctx.db.insert("releasePolicies", {
      ...policyShape,
      policyHash: stableHash({ ...policyShape, sources: args.sources }),
      operationKey: args.operationKey,
      createdAt: Date.now(),
    });
    for (const source of args.sources)
      await ctx.db.insert("releasePolicySources", {
        policyId,
        ...source,
        operationKey: `${args.operationKey}:source:${source.sourceId}`,
        createdAt: Date.now(),
      });
    const policy = await ctx.db.get("releasePolicies", policyId);
    const sourceDocs = await ctx.db
      .query("releasePolicySources")
      .withIndex("by_policyId_and_priority", (q) => q.eq("policyId", policyId))
      .take(20);
    if (!policy) throw new Error("Release policy insert failed");
    return { policy, sources: sourceDocs, duplicate: false };
  },
});
