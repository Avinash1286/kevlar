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
  "collectors/ai-infrastructure/anthropic-pricing/source.json",
  "collectors/ai-infrastructure/anthropic-models/source.json",
] as const;

const collectorIdPaths = [
  "collectors/product-pricing/nova/collector-id.txt",
  "collectors/ai-infrastructure/openai-pricing/collector-id.txt",
  "collectors/ai-infrastructure/openai-models/collector-id.txt",
  "collectors/ai-infrastructure/anthropic-release-notes/collector-id.txt",
  "collectors/ai-infrastructure/anthropic-pricing/collector-id.txt",
  "collectors/ai-infrastructure/anthropic-models/collector-id.txt",
] as const;

const pendingCertificationArtifacts = [
  "collectors/ai-infrastructure/anthropic-pricing",
  "collectors/ai-infrastructure/anthropic-models",
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

  it("contains five public AI sources across three archetypes", () => {
    expect(sources).toHaveLength(5);
    expect(sources.every((source) => source.public_data)).toBe(true);
    expect(new Set(sources.map((source) => source.archetype)).size).toBe(3);
    expect(new Set(sources.map((source) => source.source_key)).size).toBe(5);
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

  it("records six distinct stable collector IDs without conflating IDs with activation", () => {
    const collectorIds = collectorIdPaths.map((path) =>
      readFileSync(path, "utf8").trim(),
    );
    expect(collectorIds).toHaveLength(6);
    expect(new Set(collectorIds).size).toBe(6);
    expect(collectorIds.every((id) => /^c_[A-Za-z0-9_-]+$/.test(id))).toBe(
      true,
    );
  });

  it("ships deterministic repair code and records failed certification honestly", () => {
    for (const root of pendingCertificationArtifacts) {
      const interaction = readFileSync(`${root}/interaction.js`, "utf8");
      const parser = readFileSync(`${root}/parser.js`, "utf8");
      const evidence = JSON.parse(
        readFileSync(`${root}/verification-evidence.json`, "utf8"),
      ) as {
        bright_data_active: boolean;
        kevlar_core_certified: boolean;
        self_heal_decision: string;
      };
      expect(interaction.match(/\bcollect\s*\(/g)).toHaveLength(1);
      expect(interaction).toContain(
        'hash(JSON.stringify(result.evidence.contexts), "sha256")',
      );
      expect(parser).toContain("ai-infrastructure.source.v1");
      expect(parser).toMatch(
        /provider:\s*\{\s*id:\s*["']anthropic["'],\s*name:\s*["']Anthropic["']\s*\}/,
      );
      expect(evidence).toMatchObject({
        bright_data_active: true,
        kevlar_core_certified: false,
        self_heal_decision: "rejected",
      });
    }
  });
});
