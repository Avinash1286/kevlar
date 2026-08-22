import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OFFICIAL_SOURCE_POLICIES,
  sourceTypeSchema,
} from "../../domains/ai-infrastructure/src/index";

const sourcePaths = [
  "collectors/ai-infrastructure/openai-pricing/source.json",
  "collectors/ai-infrastructure/openai-models/source.json",
  "collectors/ai-infrastructure/anthropic-release-notes/source.json",
] as const;

type SourceDescriptor = {
  source_key: string;
  archetype: string;
  url: string;
  public_data: boolean;
  approved_host: string;
  approved_path_prefix: string;
  predicate_authority: string[];
  schedule: {
    cadence_minutes: number;
    max_concurrency: number;
    daily_quota: number;
  };
};

function loadSource(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as SourceDescriptor;
}

describe("Phase 5 governed source catalog", () => {
  const sources = sourcePaths.map(loadSource);

  it("contains three public sources across three archetypes", () => {
    expect(sources).toHaveLength(3);
    expect(sources.every((source) => source.public_data)).toBe(true);
    expect(new Set(sources.map((source) => source.archetype)).size).toBe(3);
  });

  it("matches the domain pack's official host and path policies", () => {
    for (const source of sources) {
      const sourceType = sourceTypeSchema.parse(source.archetype);
      const url = new URL(source.url);
      expect(url.hostname).toBe(source.approved_host);
      expect(url.pathname.startsWith(source.approved_path_prefix)).toBe(true);
      expect(
        OFFICIAL_SOURCE_POLICIES[sourceType].some(
          (policy) =>
            policy.host === url.hostname &&
            url.pathname.startsWith(policy.pathPrefix),
        ),
      ).toBe(true);
    }
  });

  it("persists authority, schedule, concurrency, and quota policy", () => {
    for (const source of sources) {
      expect(source.predicate_authority.length).toBeGreaterThan(0);
      expect(source.schedule.cadence_minutes).toBeGreaterThan(0);
      expect(source.schedule.max_concurrency).toBe(1);
      expect(source.schedule.daily_quota).toBeGreaterThan(0);
    }
  });
});
