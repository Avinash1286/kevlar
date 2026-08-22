import type { Doc } from "./_generated/dataModel";

export const MAX_FACT_VERSIONS_PER_KEY = 200;

type VersionLike = Pick<
  Doc<"factVersions">,
  | "_id"
  | "transactionFrom"
  | "validFrom"
  | "validTo"
  | "state"
  | "changeKind"
  | "releaseDecisionId"
  | "valueHash"
>;

export type ProjectionChoice = {
  currentVersion: VersionLike | null;
  decisionVersion: VersionLike | null;
  baseState: "released" | "last_known_good" | "conflicted" | "retracted";
};

export function chooseProjection(versions: VersionLike[]): ProjectionChoice {
  const ordered = [...versions].sort(
    (left, right) => left.transactionFrom - right.transactionFrom,
  );
  let currentVersion: VersionLike | null = null;
  let decisionVersion: VersionLike | null = null;
  let baseState: ProjectionChoice["baseState"] = "retracted";
  for (const version of ordered) {
    decisionVersion = version;
    if (version.state === "released") {
      currentVersion = version;
      baseState = "released";
    } else if (version.state === "retracted") {
      currentVersion = version;
      baseState = "retracted";
    } else if (version.state === "conflicted") {
      baseState = currentVersion ? "conflicted" : "retracted";
    } else {
      baseState = currentVersion ? "last_known_good" : "retracted";
    }
  }
  return { currentVersion, decisionVersion, baseState };
}

export function selectBeliefAt(
  versions: VersionLike[],
  args: { validAt?: number; believedAt?: number },
): ProjectionChoice {
  const eligible = versions.filter((version) => {
    if (
      args.believedAt !== undefined &&
      version.transactionFrom > args.believedAt
    )
      return false;
    if (args.validAt !== undefined) {
      if (version.validFrom !== undefined && version.validFrom > args.validAt)
        return false;
      if (version.validTo !== undefined && version.validTo <= args.validAt)
        return false;
    }
    return true;
  });
  return chooseProjection(eligible);
}

export function materializedState(args: {
  baseState: ProjectionChoice["baseState"];
  freshnessDeadline: number;
  evaluatedAt: number;
  allowLastKnownGood: boolean;
}): {
  state: Doc<"currentFacts">["state"];
  servingLabel: Doc<"currentFacts">["servingLabel"];
} {
  if (args.baseState === "retracted")
    return { state: "retracted", servingLabel: "unavailable" };
  if (args.baseState === "conflicted")
    return {
      state: "conflicted",
      servingLabel: args.allowLastKnownGood ? "last_known_good" : "unavailable",
    };
  if (args.evaluatedAt > args.freshnessDeadline)
    return {
      state: "stale",
      servingLabel: args.allowLastKnownGood ? "last_known_good" : "unavailable",
    };
  if (args.baseState === "last_known_good")
    return {
      state: "last_known_good",
      servingLabel: "last_known_good",
    };
  return { state: "released", servingLabel: "verified" };
}
