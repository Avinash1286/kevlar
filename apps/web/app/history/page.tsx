import Link from "next/link";
import { loadPhase7Proof } from "../../lib/phase7-data";

export const dynamic = "force-dynamic";

function value(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : JSON.stringify(value);
}

export default async function ChroniclePage() {
  const data = await loadPhase7Proof();
  const corrections = (data?.facts ?? []).filter(
    (fact) => fact.changeKind === "correction",
  ).length;
  const lkg = (data?.currentFacts ?? []).filter(
    (fact) => fact.servingLabel === "last_known_good",
  ).length;
  return (
    <main className="console-shell chronicle-console">
      <header className="console-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">K</span>
          <span>Kevlar</span>
        </Link>
        <nav className="fleet-nav">
          <Link href="/events">Events</Link>
          <Link href="/conflicts">Conflicts</Link>
          <Link href="/history">Chronicle</Link>
          <Link href="/entities">Entities</Link>
          <Link href="/mappings">Mappings</Link>
          <Link href="/fleet">Fleet</Link>
        </nav>
      </header>
      <section className="gauntlet-heading">
        <div>
          <p>BITEMPORAL CHRONICLE · APPEND-ONLY FACTS</p>
          <h1>What was true. What Kevlar believed. Both survive.</h1>
        </div>
        <span
          className={`state-pill ${data?.projectionMatches ? "verified" : "stale"}`}
        >
          {data?.projectionMatches
            ? "REGENERATED"
            : data
              ? "MISMATCH"
              : "OFFLINE"}
        </span>
      </section>
      <section className="metric-grid">
        <article>
          <span>FACT VERSIONS</span>
          <strong>{data?.facts.length ?? 0}</strong>
        </article>
        <article>
          <span>CORRECTIONS</span>
          <strong>{corrections}</strong>
        </article>
        <article>
          <span>LAST-KNOWN-GOOD</span>
          <strong>{lkg}</strong>
        </article>
        <article>
          <span>PROVENANCE LINKS</span>
          <strong>
            {(data?.evidence.length ?? 0) + (data?.observations.length ?? 0)}
          </strong>
        </article>
      </section>
      <section className="current-fact-grid">
        {(data?.currentFacts ?? []).map((fact) => {
          const version = data?.facts.find(
            (item) => item._id === fact.factVersionId,
          );
          return (
            <article key={fact._id}>
              <header>
                <span>{fact.servingLabel.replaceAll("_", " ")}</span>
                <strong>{fact.state}</strong>
              </header>
              <h2>{fact.predicate}</h2>
              <div className="fact-value">{value(version?.value)}</div>
              <dl>
                <div>
                  <dt>Last verified</dt>
                  <dd>{new Date(fact.lastVerifiedAt).toISOString()}</dd>
                </div>
                <div>
                  <dt>Fresh until</dt>
                  <dd>{new Date(fact.freshnessDeadline).toISOString()}</dd>
                </div>
              </dl>
              <Link
                href={`/entities/${fact.entityId}/history?predicate=${encodeURIComponent(fact.predicate)}`}
              >
                Open historical query →
              </Link>
            </article>
          );
        })}
      </section>
      <section className="chronicle-ledger">
        <span>APPEND-ONLY VERSION LEDGER</span>
        {(data?.facts ?? [])
          .sort((a, b) => b.transactionFrom - a.transactionFrom)
          .map((fact) => (
            <article key={fact._id}>
              <div>
                <strong>{fact.changeKind}</strong>
                <code>{fact.predicate}</code>
              </div>
              <b>{value(fact.value)}</b>
              <time>{new Date(fact.transactionFrom).toISOString()}</time>
              <span>
                {fact.validFrom
                  ? `valid ${new Date(fact.validFrom).toISOString()}`
                  : fact.validTimeSource}
              </span>
              <code>{fact._id}</code>
            </article>
          ))}
      </section>
    </main>
  );
}
