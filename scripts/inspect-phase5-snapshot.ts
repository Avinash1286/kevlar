import { BrightDataRuntime } from "../packages/brightdata-runtime/src/index";
import {
  aiInfrastructureSourceObservationSchema,
  verifyAiInfrastructureObservation,
} from "../domains/ai-infrastructure/src/index";

async function main() {
  const snapshotId = process.argv[2];
  const apiKey = process.env.BRIGHT_DATA_API_KEY;
  const collectorId = process.env.BRIGHT_DATA_COLLECTOR_ID;
  if (!snapshotId || !apiKey || !collectorId) {
    throw new Error(
      "Usage: inspect-phase5-snapshot <snapshot-id> with Bright Data env vars",
    );
  }
  const result = await new BrightDataRuntime({ apiKey, collectorId }).poll(
    snapshotId,
  );
  if (result.state === "pending") {
    console.log(JSON.stringify(result));
    return;
  }
  console.log(
    JSON.stringify({
      snapshotId,
      rows: result.rows.map((row) => {
        const parsed = aiInfrastructureSourceObservationSchema.safeParse(row);
        if (parsed.success) {
          const verified = verifyAiInfrastructureObservation(row);
          return {
            schemaValid: true,
            records: parsed.data.records.length,
            contexts: parsed.data.evidence.contexts.length,
            decision: verified.decision,
            evidenceHash: verified.evidenceHash,
            violations: verified.violations,
          };
        }
        return {
          schemaValid: false,
          issues: parsed.error.issues.slice(0, 20).map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        };
      }),
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
