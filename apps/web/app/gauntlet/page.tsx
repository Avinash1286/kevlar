import Link from "next/link";
import { loadGauntlet } from "../../lib/phase4-data";

export const dynamic = "force-dynamic";

function rate(value: number, total: number) {
  return total === 0 ? "—" : `${Math.round((value / total) * 100)}%`;
}

export default async function GauntletPage({
  searchParams,
}: {
  searchParams: Promise<{ incident?: string }>;
}) {
  const { incident } = await searchParams;
  const data = await loadGauntlet(incident);
  const results = data?.results ?? [];
  const passed = results.filter((item) => item.outcome === "pass").length;
  const heldOut = results.filter((item) => item.visibility === "held_out");
  const falseHeals = results.filter((item) => item.falseHeal).length;
  const falseReleases = results.filter((item) => item.falseRelease).length;

  return (
    <main className="console-page gauntlet-page">
      <header className="console-header">
        <Link className="console-brand" href="/">
          <span>K</span> Kevlar
        </Link>
        <span className="phase-tag">GATE D · METAMORPHIC CERTIFICATION</span>
      </header>

      <section className="gauntlet-heading">
        <div>
          <p>HELD-OUT GAUNTLET</p>
          <h1>A repair must generalize before data ships.</h1>
        </div>
        <span className={`state-pill ${passed === 8 ? "verified" : "stale"}`}>
          {data?.benchmarkRun?.status ?? "NOT RUN"}
        </span>
      </section>

      <section className="metric-grid">
        <article>
          <span>CASES PASSED</span>
          <strong>
            {passed}/{results.length || 8}
          </strong>
        </article>
        <article>
          <span>HELD-OUT PASS</span>
          <strong>
            {rate(
              heldOut.filter((item) => item.outcome === "pass").length,
              heldOut.length,
            )}
          </strong>
        </article>
        <article>
          <span>FALSE HEALS</span>
          <strong>{falseHeals}</strong>
        </article>
        <article>
          <span>FALSE RELEASES</span>
          <strong>{falseReleases}</strong>
        </article>
      </section>

      <section className="gauntlet-table" aria-label="Metamorphic case results">
        <div className="gauntlet-row gauntlet-row-head">
          <span>CASE</span>
          <span>VISIBILITY</span>
          <span>RELATION</span>
          <span>OUTCOME</span>
          <span>EVIDENCE</span>
        </div>
        {(results.length > 0 ? results : (data?.catalog ?? [])).map((item) => {
          const result = "outcome" in item ? item : null;
          const code = "code" in item ? item.code : item.caseId;
          return (
            <article className="gauntlet-row" key={item._id}>
              <strong>{code}</strong>
              <span>{item.visibility.replaceAll("_", " ")}</span>
              <span>{item.expectedRelation.replaceAll("_", " ")}</span>
              <span
                className={
                  result?.outcome === "pass" ? "text-good" : "text-warn"
                }
              >
                {result?.outcome ?? "not run"}
              </span>
              <code>{result?.evidenceHash.slice(0, 18) ?? "pending"}</code>
              {result ? <p>{result.reason}</p> : null}
            </article>
          );
        })}
      </section>
    </main>
  );
}
