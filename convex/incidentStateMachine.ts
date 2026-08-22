import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

type IncidentState = Doc<"incidents">["state"];
type ActorType = Doc<"incidentTransitions">["actorType"];

const allowedTransitions: Record<IncidentState, readonly IncidentState[]> = {
  detected: ["triaging", "quarantined", "failed"],
  triaging: [
    "retrying",
    "quarantined",
    "diagnosing",
    "healing",
    "awaiting_human",
    "resolved",
    "failed",
  ],
  retrying: ["triaging", "quarantined", "awaiting_human", "failed"],
  quarantined: [
    "diagnosing",
    "healing",
    "awaiting_human",
    "resolved",
    "failed",
  ],
  diagnosing: ["healing", "awaiting_human", "quarantined", "failed"],
  healing: ["awaiting_preview", "awaiting_human", "failed"],
  awaiting_preview: ["awaiting_human", "healing", "failed"],
  awaiting_human: ["approved", "quarantined", "resolved", "failed"],
  approved: ["certifying", "failed"],
  certifying: ["resolved", "quarantined", "failed"],
  resolved: [],
  failed: ["retrying", "triaging", "awaiting_human"],
};

export async function performIncidentTransition(
  ctx: MutationCtx,
  args: {
    incidentId: Id<"incidents">;
    toState: IncidentState;
    reason: string;
    actorType: ActorType;
    actorId?: string;
    idempotencyKey: string;
    requestHash: string;
    details: unknown;
    now: number;
  },
): Promise<{ duplicate: boolean; sequence: number }> {
  const existingOperation = await ctx.db
    .query("idempotencyRecords")
    .withIndex("by_operationKey", (q) =>
      q.eq("operationKey", args.idempotencyKey),
    )
    .unique();
  if (existingOperation) {
    if (
      existingOperation.scope !== "incident" ||
      existingOperation.requestHash !== args.requestHash ||
      existingOperation.incidentId !== args.incidentId
    ) {
      throw new Error("Idempotency key was already used for another operation");
    }
    const incident = await ctx.db.get("incidents", args.incidentId);
    if (!incident) throw new Error("Incident no longer exists");
    return { duplicate: true, sequence: incident.transitionSequence };
  }

  const incident = await ctx.db.get("incidents", args.incidentId);
  if (!incident) throw new Error("Incident not found");
  if (!allowedTransitions[incident.state].includes(args.toState)) {
    throw new Error(
      `Invalid incident transition: ${incident.state} -> ${args.toState}`,
    );
  }

  const sequence = incident.transitionSequence + 1;
  await ctx.db.patch("incidents", incident._id, {
    state: args.toState,
    transitionSequence: sequence,
    updatedAt: args.now,
    ...(args.toState === "resolved" ? { resolvedAt: args.now } : {}),
  });
  await ctx.db.insert("incidentTransitions", {
    projectId: incident.projectId,
    incidentId: incident._id,
    sequence,
    fromState: incident.state,
    toState: args.toState,
    reason: args.reason,
    actorType: args.actorType,
    ...(args.actorId ? { actorId: args.actorId } : {}),
    idempotencyKey: args.idempotencyKey,
    details: args.details,
    createdAt: args.now,
  });
  await ctx.db.insert("idempotencyRecords", {
    projectId: incident.projectId,
    incidentId: incident._id,
    operationKey: args.idempotencyKey,
    scope: "incident",
    status: "completed",
    requestHash: args.requestHash,
    result: { sequence, state: args.toState },
    attempts: 1,
    createdAt: args.now,
    updatedAt: args.now,
  });
  await ctx.db.insert("auditEvents", {
    projectId: incident.projectId,
    actorType: args.actorType,
    ...(args.actorId ? { actorId: args.actorId } : {}),
    action: "incident.transitioned",
    targetType: "incident",
    targetId: String(incident._id),
    payload: {
      fromState: incident.state,
      toState: args.toState,
      reason: args.reason,
      sequence,
      idempotencyKey: args.idempotencyKey,
      details: args.details,
    },
    createdAt: args.now,
  });

  return { duplicate: false, sequence };
}
