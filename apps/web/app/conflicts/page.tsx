import Link from "next/link";
import { loadConflicts, loadPhase8Proof } from "../../lib/phase8-data";

export const dynamic = "force-dynamic";

export default async function ConflictsPage() {
  const [queried, proof] = await Promise.all([
    loadConflicts(),
    loadPhase8Proof(),
  ]);
  const conflicts = queried ?? proof?.conflicts ?? [];
  const open = conflicts.filter((conflict) => conflict.status === "open").length;
  return (
    <main className="console-shell cdc-console">
      <header className="console-nav">
        <Link className="brand" href="/"><span className="brand-mark">K</span><span>Kevlar</span></Link>
        <nav className="fleet-nav"><Link href="/events">Events</Link><Link href="/conflicts">Conflicts</Link><Link href="/history">Chronicle</Link><Link href="/sources">Sources</Link></nav>
      </header>
      <section className="gauntlet-heading">
        <div><p>RECONCILIATION · SOURCE CONFLICT COURTROOM</p><h1>Disagreement is evidence, not a coin toss.</h1></div>
        <span className={`state-pill ${open > 0 ? "stale" : "verified"}`}>{open} OPEN</span>
      </section>
      <section className="conflict-grid">
        {conflicts.map((conflict) => (
          <article key={conflict._id}>
            <header><span>{conflict.status}</span><time>{new Date(conflict.openedAt).toISOString()}</time></header>
            <h2>{conflict.predicate}</h2>
            <p>{conflict.reason}</p>
            <dl><div><dt>Entity</dt><dd>{conflict.entityId}</dd></div><div><dt>Verified candidates</dt><dd>{conflict.candidateObservationIds.length}</dd></div><div><dt>Released fact</dt><dd>{conflict.releasedFactVersionId ?? "last-known-good"}</dd></div></dl>
            <Link href={`/conflicts/${conflict._id}`}>Open courtroom →</Link>
          </article>
        ))}
      </section>
    </main>
  );
}
