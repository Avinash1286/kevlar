import Link from "next/link";
import { loadFleetProof, loadPhase9Proof } from "../../../lib/phase9-data";

export const dynamic = "force-dynamic";
const text = (value: unknown) => (value == null ? "—" : String(value));

export default async function FleetGauntletPage() {
  const [fleet, proof] = await Promise.all([
    loadFleetProof(),
    loadPhase9Proof(),
  ]);
  const passed = (fleet?.results ?? []).filter(
    (item) =>
      item.passed === true || item.status === "pass" || item.outcome === "pass",
  ).length;
  const heldOut = (fleet?.cases ?? []).filter(
    (item) => item.heldOut === true || item.visibility === "held_out",
  ).length;
  return (
    <main className="console-shell evidence-console">
      <header className="console-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">K</span>
          <span>Kevlar</span>
        </Link>
        <nav className="fleet-nav">
          <Link href="/fleet/gauntlet">Fleet Gauntlet</Link>
          <Link href="/fleet/repairs">Repairs</Link>
          <Link href="/evidence">Evidence</Link>
          <Link href="/gauntlet">Core Gauntlet</Link>
        </nav>
      </header>
      <section className="gauntlet-heading">
        <div>
          <p>FLEET GAUNTLET · EXTRACTION × EVENT BEHAVIOR</p>
          <h1>Mutate the page. Preserve the truth boundary.</h1>
        </div>
        <span className={`state-pill ${proof ? "verified" : "stale"}`}>
          {proof ? "CERTIFIED" : "OFFLINE"}
        </span>
      </section>
      <section className="metric-grid">
        <article>
          <span>CASES</span>
          <strong>{fleet?.cases.length ?? 0}</strong>
        </article>
        <article>
          <span>PASSED</span>
          <strong>{passed}</strong>
        </article>
        <article>
          <span>HELD OUT</span>
          <strong>{heldOut}</strong>
        </article>
        <article>
          <span>FALSE EVENTS</span>
          <strong>
            {
              (fleet?.results ?? []).filter(
                (item) =>
                  item.eventAssertionPassed === false ||
                  item.falseEvent === true ||
                  Number(item.falseEvents) > 0,
              ).length
            }
          </strong>
        </article>
      </section>
      <section className="mutation-matrix">
        <header>
          <span>MUTATION</span>
          <span>ARCHETYPE</span>
          <span>EXTRACTION</span>
          <span>EVENT ASSERTION</span>
          <span>RESULT</span>
        </header>
        {(fleet?.cases ?? []).map((testCase) => {
          const result = (fleet?.results ?? []).find(
            (item) =>
              item.caseId === testCase._id ||
              item.mutationCaseId === testCase._id,
          );
          return (
            <article key={testCase._id}>
              <strong>
                {text(
                  testCase.category ?? testCase.mutationKind ?? testCase.kind,
                )}
              </strong>
              <span>
                {text(testCase.archetype ?? testCase.sourceArchetype)}
              </span>
              <em>
                {text(
                  result?.extractionAssertionPassed ??
                    result?.extractionPassed ??
                    result?.extractionStatus,
                )}
              </em>
              <em>
                {text(result?.eventAssertionPassed ?? result?.eventStatus)}
              </em>
              <b>
                {text(
                  result?.outcome ??
                    result?.status ??
                    (result?.passed ? "pass" : "—"),
                )}
              </b>
            </article>
          );
        })}
      </section>
      <section className="benchmark-strip">
        <span>FLEET BENCHMARK</span>
        {(fleet?.metrics ?? []).flatMap((metric) =>
          [
            ["Semantic event precision", metric.semanticEventPrecision],
            ["Semantic event recall", metric.semanticEventRecall],
            ["Silent corruption catch", metric.silentCorruptionCatchRate],
            ["Held-out repair pass", metric.heldOutRepairPassRate],
            ["Verified recovery (ms)", metric.timeToVerifiedRecoveryMs],
          ].map(([name, value]) => (
            <div key={`${metric._id}-${name}`}>
              <strong>{text(name)}</strong>
              <b>{text(value)}</b>
              <code>{metric._id}</code>
            </div>
          )),
        )}
      </section>
    </main>
  );
}
