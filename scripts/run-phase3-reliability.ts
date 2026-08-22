import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

type Scenario =
  | "semantic_swap"
  | "transport_failure"
  | "soft_block"
  | "legitimate_empty"
  | "all_provider_failure";

type ScenarioResult = {
  scenarioRunId: string;
  incidentId: string;
  incidentDuplicate: boolean;
  classification: string;
  recommendedAction: string;
  workflowRunId: string | null;
  durableWorkflowId: string | null;
  durableWorkflowStatus:
    "inProgress" | "completed" | "canceled" | "failed" | null;
  modelCallIds: string[];
  reviewId: string | null;
};

type IncidentDetail = {
  incident: { _id: string; state: string };
  latestWorkflow: {
    status: string;
    durableWorkflowId?: string;
  } | null;
  latestReview: { status: string; reason: string } | null;
  modelCalls: Array<{
    provider: string;
    fallbackIndex: number;
    status: string;
    promptIsolationApplied: boolean;
  }>;
};

const feed = makeFunctionReference<
  "query",
  Record<string, never>,
  { run?: { _id: string } | null } | null
>("semanticGate:feed");

const runScenario = makeFunctionReference<
  "action",
  {
    ingestKey: string;
    failingRunId: string;
    scenario: Scenario;
    scenarioKey: string;
  },
  ScenarioResult
>("phase3Scenario:run");

const incidentDetail = makeFunctionReference<
  "query",
  { incidentId: string },
  IncidentDetail | null
>("incidents:detail");

const expectations: Record<
  Scenario,
  { classification: string; action: string }
> = {
  semantic_swap: { classification: "semantic_swap", action: "heal" },
  transport_failure: {
    classification: "transport_failure",
    action: "retry",
  },
  soft_block: { classification: "soft_block", action: "quarantine" },
  legitimate_empty: {
    classification: "legitimate_empty",
    action: "do_not_heal",
  },
  all_provider_failure: {
    classification: "unknown",
    action: "gather_evidence",
  },
};

function requireEnvironment() {
  const convexUrl = process.env.CONVEX_URL;
  const ingestKey = process.env.KEVLAR_BASELINE_INGEST_KEY;
  if (!convexUrl)
    throw new Error("Missing required environment variable: CONVEX_URL");
  if (!ingestKey)
    throw new Error(
      "Missing required environment variable: KEVLAR_BASELINE_INGEST_KEY",
    );
  return { convexUrl, ingestKey };
}

async function waitForDurableCompletion(
  convex: ConvexHttpClient,
  result: ScenarioResult,
) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const detail = await convex.query(incidentDetail, {
      incidentId: result.incidentId,
    });
    if (detail?.latestWorkflow?.status === "completed") return detail;
    if (detail?.latestWorkflow?.status === "failed") {
      throw new Error("Durable transport workflow failed");
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    "Durable transport workflow did not complete within 10 seconds",
  );
}

async function main() {
  const { convexUrl, ingestKey } = requireEnvironment();
  const convex = new ConvexHttpClient(convexUrl);
  const current = await convex.query(feed, {});
  const failingRunId = current?.run?._id;
  if (!failingRunId) {
    throw new Error("Run Phase 2 first so Phase 3 has a verified source run");
  }

  const scenarios = Object.keys(expectations) as Scenario[];
  const results = new Map<Scenario, ScenarioResult>();
  for (const scenario of scenarios) {
    const result = await convex.action(runScenario, {
      ingestKey,
      failingRunId,
      scenario,
      scenarioKey: `phase3-v1-${scenario}`,
    });
    const expected = expectations[scenario];
    if (
      result.classification !== expected.classification ||
      result.recommendedAction !== expected.action
    ) {
      throw new Error(
        `${scenario} returned ${result.classification}/${result.recommendedAction}`,
      );
    }
    results.set(scenario, result);
    console.log(
      `${scenario}: ${result.classification} -> ${result.recommendedAction}`,
    );
  }

  const transport = results.get("transport_failure");
  if (!transport?.workflowRunId || !transport.durableWorkflowId) {
    throw new Error("Transport failure did not start a durable workflow");
  }
  const recovered = await waitForDurableCompletion(convex, transport);
  if (
    recovered.latestWorkflow?.durableWorkflowId !== transport.durableWorkflowId
  ) {
    throw new Error("Durable workflow audit link was not preserved");
  }

  const providerFailure = results.get("all_provider_failure");
  if (!providerFailure?.reviewId || providerFailure.modelCallIds.length !== 3) {
    throw new Error("All-provider failure did not reach human review");
  }
  const providerDetail = await convex.query(incidentDetail, {
    incidentId: providerFailure.incidentId,
  });
  if (
    providerDetail?.latestReview?.status !== "pending" ||
    providerDetail.modelCalls.length !== 3 ||
    providerDetail.modelCalls.some(
      (call) =>
        !call.promptIsolationApplied || call.status !== "provider_error",
    )
  ) {
    throw new Error("Provider fallback audit trail is incomplete");
  }

  const firstSemantic = results.get("semantic_swap");
  if (!firstSemantic) throw new Error("Semantic-swap scenario result missing");
  const duplicate = await convex.action(runScenario, {
    ingestKey,
    failingRunId,
    scenario: "semantic_swap",
    scenarioKey: "phase3-v1-semantic_swap",
  });
  if (
    !duplicate.incidentDuplicate ||
    duplicate.incidentId !== firstSemantic.incidentId
  ) {
    throw new Error("Duplicate trigger created a second incident");
  }

  console.log("Phase 3 reliability proof complete:");
  console.log("- semantic_swap -> heal");
  console.log("- transport_failure -> retry -> durable recovery completed");
  console.log("- N1 soft_block -> quarantine (never heal)");
  console.log("- N2 legitimate_empty -> do_not_heal");
  console.log("- all three model providers failed -> human review");
  console.log("- duplicate trigger -> original incident reused");
  console.log(`- incident courtroom: /incidents/${providerFailure.incidentId}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
