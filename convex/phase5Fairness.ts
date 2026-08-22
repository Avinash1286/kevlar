export type FairCandidate = {
  sourceId: string;
  candidateId: string;
  lastClaimedAt: number | null;
  virtualFinish: number;
  weight: number;
};

export type FairCandidateEligibility = {
  bindingKind: "production" | "regression";
  bindingLifecycle:
    | "draft"
    | "onboarding"
    | "active"
    | "cooling"
    | "failing"
    | "paused"
    | "disabled";
  coreGateStatus: "pending" | "certified" | "regression_only";
  bypassCore: boolean;
  certificationStatus: "certified" | "rejected" | null;
  certificationMatches: boolean;
  sourceApprovalStatus: "pending" | "approved" | "rejected";
  sourceLifecycle: "draft" | "onboarding" | "active" | "paused" | "retired";
  sourceVisibility: "public" | "authenticated" | "private";
  sourceOfficial: boolean;
  endpointApprovalStatus: "pending" | "approved" | "rejected";
  endpointPublic: boolean;
  policyEnabled: boolean;
  healthState: "healthy" | "cooling" | "failing";
  cooldownUntil: number | null;
  now: number;
  quotaUsed: number;
  dailyQuota: number;
  activeLeases: number;
  maxConcurrency: number;
};

export function isFairCandidateEligible(
  candidate: FairCandidateEligibility,
): boolean {
  const cooldownExpired =
    candidate.cooldownUntil !== null &&
    candidate.cooldownUntil <= candidate.now;
  const bindingCanRun =
    candidate.bindingLifecycle === "active" ||
    (candidate.bindingLifecycle === "cooling" &&
      candidate.healthState === "cooling" &&
      cooldownExpired);
  return (
    candidate.bindingKind === "production" &&
    bindingCanRun &&
    candidate.coreGateStatus === "certified" &&
    !candidate.bypassCore &&
    candidate.certificationStatus === "certified" &&
    candidate.certificationMatches &&
    candidate.sourceApprovalStatus === "approved" &&
    candidate.sourceLifecycle === "active" &&
    candidate.sourceVisibility === "public" &&
    candidate.sourceOfficial &&
    candidate.endpointApprovalStatus === "approved" &&
    candidate.endpointPublic &&
    candidate.policyEnabled &&
    candidate.healthState !== "failing" &&
    (candidate.healthState !== "cooling" || cooldownExpired) &&
    candidate.quotaUsed < candidate.dailyQuota &&
    candidate.activeLeases < candidate.maxConcurrency
  );
}

export function orderFairCandidates<T extends FairCandidate>(
  candidates: readonly T[],
): T[] {
  return [...candidates].sort((left, right) => {
    const lastClaimDelta =
      (left.lastClaimedAt ?? 0) - (right.lastClaimedAt ?? 0);
    if (lastClaimDelta !== 0) return lastClaimDelta;
    const virtualFinishDelta =
      left.virtualFinish / left.weight - right.virtualFinish / right.weight;
    if (virtualFinishDelta !== 0) return virtualFinishDelta;
    const sourceIdDelta = left.sourceId.localeCompare(right.sourceId);
    if (sourceIdDelta !== 0) return sourceIdDelta;
    return left.candidateId.localeCompare(right.candidateId);
  });
}
