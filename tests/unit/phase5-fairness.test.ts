import { describe, expect, it } from "vitest";
import {
  isFairCandidateEligible,
  orderFairCandidates,
  type FairCandidateEligibility,
} from "../../convex/phase5Fairness";

const eligible: FairCandidateEligibility = {
  bindingKind: "production",
  bindingLifecycle: "active",
  coreGateStatus: "certified",
  bypassCore: false,
  certificationStatus: "certified",
  certificationMatches: true,
  sourceApprovalStatus: "approved",
  sourceLifecycle: "active",
  sourceVisibility: "public",
  sourceOfficial: true,
  endpointApprovalStatus: "approved",
  endpointPublic: true,
  policyEnabled: true,
  healthState: "healthy",
  cooldownUntil: null,
  now: 10_000,
  quotaUsed: 0,
  dailyQuota: 12,
  activeLeases: 0,
  maxConcurrency: 1,
};

describe("Phase 5 fleet fairness", () => {
  it("chooses the least recently claimed healthy source", () => {
    const ordered = orderFairCandidates([
      {
        sourceId: "source-a",
        candidateId: "job-a",
        lastClaimedAt: 9_000,
        virtualFinish: 1,
        weight: 1,
      },
      {
        sourceId: "source-b",
        candidateId: "job-b",
        lastClaimedAt: null,
        virtualFinish: 5,
        weight: 1,
      },
      {
        sourceId: "source-c",
        candidateId: "job-c",
        lastClaimedAt: 4_000,
        virtualFinish: 2,
        weight: 1,
      },
    ]);

    expect(ordered.map((item) => item.sourceId)).toEqual([
      "source-b",
      "source-c",
      "source-a",
    ]);
  });

  it("uses weighted virtual finish and stable IDs for deterministic ties", () => {
    const ordered = orderFairCandidates([
      {
        sourceId: "source-z",
        candidateId: "job-z",
        lastClaimedAt: 100,
        virtualFinish: 4,
        weight: 2,
      },
      {
        sourceId: "source-a",
        candidateId: "job-b",
        lastClaimedAt: 100,
        virtualFinish: 2,
        weight: 1,
      },
      {
        sourceId: "source-a",
        candidateId: "job-a",
        lastClaimedAt: 100,
        virtualFinish: 2,
        weight: 1,
      },
    ]);

    expect(ordered.map((item) => item.candidateId)).toEqual([
      "job-a",
      "job-b",
      "job-z",
    ]);
  });

  it("cannot be starved by a failed source excluded from eligibility", () => {
    expect(isFairCandidateEligible(eligible)).toBe(true);
    expect(
      isFairCandidateEligible({
        ...eligible,
        healthState: "failing",
        bindingLifecycle: "failing",
      }),
    ).toBe(false);
    expect(
      isFairCandidateEligible({
        ...eligible,
        healthState: "cooling",
        bindingLifecycle: "cooling",
        cooldownUntil: eligible.now + 1,
      }),
    ).toBe(false);
    expect(
      isFairCandidateEligible({
        ...eligible,
        healthState: "cooling",
        bindingLifecycle: "cooling",
        cooldownUntil: eligible.now,
      }),
    ).toBe(true);
  });
});
