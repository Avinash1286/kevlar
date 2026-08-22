import Link from "next/link";
import { loadFleet, loadSourceCatalog } from "../../lib/phase5-data";

export const dynamic = "force-dynamic";

function age(timestamp?: number) {
  if (!timestamp) return "never";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;
}

export default async function FleetPage() {
  const [fleet, catalog] = await Promise.all([
    loadFleet(),
    loadSourceCatalog(),
  ]);
  const health = fleet?.health ?? [];
  const healthy = health.filter((item) => item.state === "healthy").length;
  const verified = (fleet?.observations ?? []).filter(
    (item) => item.trust === "verified",
  ).length;
  const sourceName = (sourceId: string) =>
    catalog?.sources.find((source) => source._id === sourceId)?.name ??
    sourceId.slice(0, 12);

  return (
    <main className="console-shell fleet-console">
      <header className="console-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">K</span>
          <span>Kevlar</span>
        </Link>
        <nav className="fleet-nav">
          <Link href="/sources">Sources</Link>
          <Link href="/fleet">Fleet</Link>
          <Link href="/feed">Trust feed</Link>
        </nav>
      </header>

      <section className="gauntlet-heading">
        <div>
          <p>COLLECTOR MESH · FAIR SCHEDULER</p>
          <h1>One failed source cannot starve the fleet.</h1>
        </div>
        <span
          className={`state-pill ${healthy === health.length ? "verified" : "stale"}`}
        >
          {fleet ? "LIVE" : "OFFLINE"}
        </span>
      </section>

      <section className="metric-grid">
        <article>
          <span>HEALTHY SOURCES</span>
          <strong>
            {healthy}/{health.length || 3}
          </strong>
        </article>
        <article>
          <span>DUE WORK</span>
          <strong>{fleet?.due.length ?? 0}</strong>
        </article>
        <article>
          <span>ACTIVE LEASES</span>
          <strong>
            {fleet?.leases.filter((lease) => lease.status === "active")
              .length ?? 0}
          </strong>
        </article>
        <article>
          <span>VERIFIED OBSERVATIONS</span>
          <strong>{verified}</strong>
        </article>
      </section>

      <section className="fleet-table" aria-label="Source health">
        <div className="fleet-row fleet-row-head">
          <span>SOURCE</span>
          <span>STATE</span>
          <span>FAILURES</span>
          <span>QUOTA USED</span>
          <span>LAST SUCCESS</span>
        </div>
        {health.map((item) => (
          <article className="fleet-row" key={item._id}>
            <strong>{sourceName(item.sourceId)}</strong>
            <span
              className={item.state === "healthy" ? "text-good" : "text-warn"}
            >
              {item.state}
            </span>
            <span>{item.consecutiveFailures}</span>
            <span>{item.quotaUsed}</span>
            <span>{age(item.lastSuccessAt)}</span>
            {item.lastError ? <p>{item.lastError}</p> : null}
          </article>
        ))}
        {health.length === 0 ? (
          <article className="fleet-row">
            <strong>Fleet awaiting first seed</strong>
            <span>pending</span>
            <span>0</span>
            <span>0</span>
            <span>never</span>
          </article>
        ) : null}
      </section>

      <section className="observation-strip">
        <span>LATEST CORE DECISIONS</span>
        {(fleet?.observations ?? []).slice(0, 8).map((observation) => (
          <article key={observation._id}>
            <strong>{sourceName(observation.sourceId)}</strong>
            <span>{observation.sourceType}</span>
            <code>{observation.evidenceHash.slice(0, 20)}</code>
            <em
              className={
                observation.trust === "verified" ? "text-good" : "text-warn"
              }
            >
              {observation.trust}
            </em>
          </article>
        ))}
      </section>
    </main>
  );
}
