import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { stableHash } from "./phase6Support";
import type { Infer } from "convex/values";
import {
  canaryStageValidator,
  provenanceNodeTypeValidator,
  provenanceRelationshipValidator,
} from "./phase9Validators";

export type CanaryStage = Infer<typeof canaryStageValidator>;
export type ProvenanceNodeType = Infer<typeof provenanceNodeTypeValidator>;
export type ProvenanceRelationship = Infer<
  typeof provenanceRelationshipValidator
>;

export const CANARY_STAGE_ORDER: CanaryStage[] = [
  "trigger_url",
  "stored_fixtures",
  "held_out_mutations",
  "live_endpoint_subset",
  "shadow_production",
  "active_production",
];

export function assertPhase9Text(
  value: string,
  name: string,
  maximum = 500,
): void {
  if (value.trim().length < 1 || value.length > maximum)
    throw new Error(`${name} must contain 1-${maximum} characters`);
}

export function phase9Limit(value: number | undefined, maximum = 100): number {
  if (value === undefined) return Math.min(50, maximum);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new Error(`limit must be an integer from 1-${maximum}`);
  return value;
}

export function integrityDigest(value: unknown): string {
  return stableHash(value);
}

export function canaryStagePasses(args: {
  totalCases: number;
  passedCases: number;
  criticalFailures: number;
  falseEventCount: number;
  extractionAssertionsPassed: boolean;
  eventAssertionsPassed: boolean;
  identityStable: boolean;
  schemaCompatible: boolean;
  mappingCompatible: boolean;
  thresholds: Doc<"repairCanaryRuns">["thresholds"];
  stage: CanaryStage;
}): boolean {
  const passRate =
    args.totalCases === 0 ? 0 : args.passedCases / args.totalCases;
  return (
    passRate >= args.thresholds.minimumPassRate &&
    args.criticalFailures <= args.thresholds.maximumCriticalFailures &&
    args.falseEventCount <= args.thresholds.maximumFalseEvents &&
    args.extractionAssertionsPassed &&
    args.eventAssertionsPassed &&
    (!args.thresholds.requireIdentityStable || args.identityStable) &&
    args.schemaCompatible &&
    args.mappingCompatible &&
    (!args.thresholds.requireHeldOutPass ||
      args.stage !== "held_out_mutations" ||
      args.passedCases === args.totalCases)
  );
}

export function isFullReleaseEligible(args: {
  stages: Doc<"canaryStageResults">[];
  gauntlet: Doc<"fleetGauntletRuns">;
  approved: boolean;
  bundle: Doc<"evidenceBundles">;
}): boolean {
  const required: CanaryStage[] = [
    "trigger_url",
    "stored_fixtures",
    "held_out_mutations",
    "live_endpoint_subset",
    "shadow_production",
  ];
  const passed = new Set(
    args.stages
      .filter((stage) => stage.outcome === "pass")
      .map((stage) => stage.stage),
  );
  return (
    args.approved &&
    args.bundle.status === "sealed" &&
    required.every((stage) => passed.has(stage)) &&
    args.gauntlet.status === "passed" &&
    args.gauntlet.heldOutPassed === args.gauntlet.heldOutTotal &&
    args.gauntlet.criticalFailures === 0 &&
    args.gauntlet.falseEventCount === 0
  );
}

export async function ensureProvenanceNode(
  ctx: MutationCtx,
  input: {
    projectId: Id<"projects">;
    nodeType: ProvenanceNodeType;
    externalId: string;
    label: string;
    integrityDigest?: string;
    metadata: unknown;
    operationKey: string;
    createdAt: number;
  },
): Promise<Id<"provenanceNodes">> {
  const duplicate = await ctx.db
    .query("provenanceNodes")
    .withIndex("by_operationKey", (q) =>
      q.eq("operationKey", input.operationKey),
    )
    .unique();
  if (duplicate) return duplicate._id;
  return await ctx.db.insert("provenanceNodes", input);
}

export async function ensureProvenanceEdge(
  ctx: MutationCtx,
  input: {
    projectId: Id<"projects">;
    fromNodeId: Id<"provenanceNodes">;
    relationship: ProvenanceRelationship;
    toNodeId: Id<"provenanceNodes">;
    metadata: unknown;
    operationKey: string;
    createdAt: number;
  },
): Promise<Id<"provenanceEdges">> {
  const duplicate = await ctx.db
    .query("provenanceEdges")
    .withIndex("by_operationKey", (q) =>
      q.eq("operationKey", input.operationKey),
    )
    .unique();
  if (duplicate) return duplicate._id;
  return await ctx.db.insert("provenanceEdges", input);
}
