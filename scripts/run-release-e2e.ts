import { mkdir, writeFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const publicUrl = process.env.KEVLAR_PUBLIC_URL ?? "https://kevlar-web.vercel.app";
const convexUrl = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;

const phase4Ref = makeFunctionReference<"query", { incidentId?: string }, any>("phase4Queries:gauntlet");
const phase4CourtroomRef = makeFunctionReference<"query", { incidentId: string }, any>("phase4Queries:incidentCourtroom");
const phase7Ref = makeFunctionReference<"query", { key?: string }, any>("phase7Queries:proof");
const phase8Ref = makeFunctionReference<"query", { key?: string }, any>("phase8Queries:proof");
const phase10Ref = makeFunctionReference<"query", { key?: string }, any>("phase10Proof:proof");
const phase11Ref = makeFunctionReference<"query", { key?: string }, any>("phase11Proof:proof");

async function main() {
  if (!convexUrl) throw new Error("CONVEX_URL is required for the release E2E proof");
  const paths = ["/", "/feed", "/history", "/events", "/evidence", "/developers", "/operations", "/router", "/security", "/subscriptions", "/sign-in", "/release"];
  const pages = await Promise.all(paths.map(async (path) => {
    const response = await fetch(new URL(path, publicUrl));
    const body = await response.text();
    return { path, status: response.status, bytes: body.length, kevlarShell: body.includes("Kevlar") };
  }));
  const convex = new ConvexHttpClient(convexUrl);
  const [phase4, phase7, phase8, phase10, phase11] = await Promise.all([
    convex.query(phase4Ref, {}), convex.query(phase7Ref, {}), convex.query(phase8Ref, {}), convex.query(phase10Ref, {}), convex.query(phase11Ref, {}),
  ]);
  const phase4Courtroom = phase4?.benchmarkRun?.incidentId
    ? await convex.query(phase4CourtroomRef, { incidentId: phase4.benchmarkRun.incidentId })
    : null;
  const assertions = {
    public_pages_healthy: pages.every((page) => page.status === 200 && page.kevlarShell),
    repair_certificate_available: Boolean(phase4?.benchmarkRun?.status === "completed" && phase4?.results?.length === 8 && phase4Courtroom?.certificates?.some((item: any) => item.status === "certified")),
    multi_source_history_queryable: Boolean(phase7?.proof && (phase7?.facts?.length ?? 0) > 0 && (phase7?.currentFacts?.length ?? 0) > 0),
    semantic_events_queryable: Boolean(phase8?.proof && (phase8?.events?.length ?? 0) > 0),
    api_webhook_sdk_mcp_proved: Boolean(phase10?.proof && phase10?.duplicateSafe && phase10?.dlqReplaySucceeded && phase10?.hmacVerificationInputValid && phase10?.mcpReleasedEvidenceAware),
    ai_router_verified_event_only: Boolean(phase11?.verifiedRouterEventOnly && phase11?.promptInjectionBlocked),
    security_and_chaos_proved: Boolean(phase11?.tenantIsolationPassed && phase11?.secretRedactionPassed && phase11?.allChaosPassed),
  };
  const failed = Object.entries(assertions).filter(([, passed]) => !passed).map(([name]) => name);
  const report = { schema_version: "kevlar.release-e2e.v1", measured_at: new Date().toISOString(), public_url: publicUrl, pages, assertions, proof_ids: { phase4: phase4?.benchmarkRun?._id ?? null, phase7: phase7?.proof?._id ?? null, phase8: phase8?.proof?._id ?? null, phase10: phase10?.proof?._id ?? null, phase11: phase11?.proof?._id ?? null } };
  await mkdir("benchmarks/results", { recursive: true });
  await writeFile("benchmarks/results/v1.0.0-e2e.json", `${JSON.stringify(report, null, 2)}\n`);
  if (failed.length) throw new Error(`Release E2E assertions failed: ${failed.join(", ")}`);
  console.log(`E2E proof: ${Object.keys(assertions).length}/${Object.keys(assertions).length} assertions and ${pages.length}/${pages.length} live pages passed.`);
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
