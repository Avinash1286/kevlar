import { describe, expect, it } from "vitest";
import {
  classifyFailure,
  nextPollDecision,
  transitionIncident,
  transitionRun,
} from "../../packages/triage/src/index";

describe("deterministic failure triage", () => {
  it.each([
    {
      name: "semantic swap",
      input: { semanticViolationCodes: ["semantic_swap"] },
      classification: "semantic_swap",
      action: "heal",
    },
    {
      name: "transport failure",
      input: { httpStatus: 503 },
      classification: "transport_failure",
      action: "retry",
    },
    {
      name: "N1 soft-block negative control",
      input: {
        httpStatus: 403,
        pageState: "blocked" as const,
        blockMarkers: ["challenge-platform"],
      },
      classification: "soft_block",
      action: "quarantine",
    },
    {
      name: "N2 legitimate-empty negative control",
      input: {
        pageState: "empty" as const,
        fieldMissing: true,
        optionalField: true,
        soldOut: true,
      },
      classification: "legitimate_empty",
      action: "do_not_heal",
    },
    {
      name: "dead page",
      input: { httpStatus: 404 },
      classification: "dead_page",
      action: "mark_dead",
    },
    {
      name: "render timing",
      input: { valueAppearedAfterMs: 8_000, renderDeadlineMs: 5_000 },
      classification: "render_timing",
      action: "heal",
    },
    {
      name: "structural drift",
      input: {
        fieldMissing: true,
        selectorFailure: true,
        alternateEvidencePresent: true,
      },
      classification: "structural_drift",
      action: "heal",
    },
  ])("classifies $name", ({ input, classification, action }) => {
    expect(classifyFailure(input)).toMatchObject({ classification, action });
  });

  it("requests repeated evidence for inconsistent A/B outcomes", () => {
    const result = classifyFailure({
      repeatedFetches: [
        { domFingerprint: "a", fieldPresent: true, pageState: "ok" },
        { domFingerprint: "b", fieldPresent: false, pageState: "ok" },
      ],
    });

    expect(result).toMatchObject({
      classification: "ab_variant",
      action: "gather_more_evidence",
      requiresRepeatedFetch: true,
    });
  });

  it("sends ambiguous residue to human review", () => {
    expect(classifyFailure({})).toMatchObject({
      classification: "unknown",
      action: "human_review",
      requiresRepeatedFetch: true,
    });
  });
});

describe("typed workflow policies", () => {
  it("accepts declared transitions and rejects unsafe jumps", () => {
    expect(transitionRun("validating", "quarantined")).toBe("quarantined");
    expect(transitionIncident("triaging", "awaiting_human")).toBe(
      "awaiting_human",
    );
    expect(() => transitionRun("created", "verified")).toThrow(
      "Invalid run transition",
    );
    expect(() => transitionIncident("resolved", "healing")).toThrow(
      "Invalid incident transition",
    );
  });

  it("backs off, detects stuck jobs, caps retries, and times out", () => {
    expect(
      nextPollDecision({
        attempt: 2,
        startedAt: 0,
        lastProgressAt: 9_000,
        now: 10_000,
        complete: false,
      }),
    ).toEqual({ kind: "retry", delayMs: 8_000 });
    expect(
      nextPollDecision({
        attempt: 2,
        startedAt: 0,
        lastProgressAt: 0,
        now: 50_000,
        complete: false,
      }).kind,
    ).toBe("stuck");
    expect(
      nextPollDecision({
        attempt: 8,
        startedAt: 0,
        lastProgressAt: 179_000,
        now: 179_000,
        complete: false,
      }).kind,
    ).toBe("failed");
    expect(
      nextPollDecision({
        attempt: 1,
        startedAt: 0,
        lastProgressAt: 179_000,
        now: 180_000,
        complete: false,
      }).kind,
    ).toBe("failed");
  });
});
