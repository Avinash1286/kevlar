import { BrightDataRuntime } from "../packages/brightdata-runtime/src/index";
import { verifyAiInfrastructureObservation } from "../domains/ai-infrastructure/src/index";

const sources = {
  "openai-pricing": "https://openai.com/api/pricing/",
  "openai-models": "https://platform.openai.com/docs/models",
  "anthropic-release-notes":
    "https://docs.anthropic.com/en/release-notes/overview",
} as const;

type SourceKey = keyof typeof sources;

function isSourceKey(value: string | undefined): value is SourceKey {
  return Boolean(value && value in sources);
}

async function main() {
  const [sourceKey, collectorId] = process.argv.slice(2);
  if (!isSourceKey(sourceKey) || !collectorId) {
    throw new Error(
      "Usage: verify-phase5-collector <source-key> <collector-id>",
    );
  }
  const apiKey = process.env.BRIGHT_DATA_API_KEY;
  if (!apiKey) throw new Error("BRIGHT_DATA_API_KEY is required");
  const runtime = new BrightDataRuntime({ apiKey, collectorId });
  const { snapshotId } = await runtime.triggerDevelopment({
    url: sources[sourceKey],
  });
  console.log(JSON.stringify({ event: "triggered", sourceKey, snapshotId }));

  for (let attempt = 1; attempt <= 72; attempt += 1) {
    const result = await runtime.poll(snapshotId);
    if (result.state === "pending") {
      if (attempt === 1 || attempt % 6 === 0) {
        console.log(
          JSON.stringify({
            event: "polling",
            sourceKey,
            snapshotId,
            attempt,
            status: result.status,
          }),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      continue;
    }

    const decisions = result.rows.map((row) =>
      verifyAiInfrastructureObservation(row),
    );
    const verified = decisions.filter(
      (decision) => decision.decision === "verified",
    ).length;
    console.log(
      JSON.stringify({
        event: "complete",
        sourceKey,
        snapshotId,
        rows: result.rows.length,
        verified,
        decisions: decisions.map((decision) => ({
          decision: decision.decision,
          evidenceHash: decision.evidenceHash,
          violations: decision.violations,
        })),
      }),
    );
    if (verified !== result.rows.length || verified === 0) {
      process.exitCode = 2;
    }
    return;
  }
  throw new Error(`Snapshot ${snapshotId} did not finish within six minutes`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
