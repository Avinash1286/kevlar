import Link from "next/link";
import { loadConflictCourtroom } from "../../../lib/phase8-data";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function ConflictCourtroomPage({ params }: Props) {
  const { id } = await params;
  const data = await loadConflictCourtroom(id);
  const conflict = data?.conflict;
  const decision = data?.releaseDecision ?? data?.decision;
  const policy = data?.releasePolicy ?? data?.policy;
  return (
    <main className="console-shell cdc-console">
      <header className="console-nav"><Link className="brand" href="/"><span className="brand-mark">K</span><span>Kevlar</span></Link><nav className="fleet-nav"><Link href="/events">Events</Link><Link href="/conflicts">Conflicts</Link><Link href="/sources">Sources</Link></nav></header>
      <section className="gauntlet-heading"><div><p>CONFLICT COURTROOM · PREDICATE-SPECIFIC AUTHORITY</p><h1>{conflict?.predicate ?? "Conflict unavailable"}</h1><code>{conflict?._id ?? id}</code></div><span className={`state-pill ${conflict?.status === "resolved" ? "verified" : "stale"}`}>{conflict?.status ?? "OFFLINE"}</span></section>
      <section className="courtroom-summary"><article><span>REASON</span><strong>{conflict?.reason ?? "—"}</strong></article><article><span>DECISION</span><strong>{decision?.outcome ?? "continue_last_known_good"}</strong><p>{decision?.reasonCodes?.join(" · ")}</p></article><article><span>POLICY</span><strong>{policy?.name ?? policy?.strategy ?? "—"}</strong><code>{policy?._id}</code></article><article><span>CANDIDATES</span><strong>{conflict?.candidateObservationIds.length ?? 0}</strong><code>{conflict?.releasedFactVersionId ?? "last-known-good retained"}</code></article></section>
      <section className="candidate-courtroom">{(data?.observations ?? []).map((observation) => { const fields = (data?.fields ?? []).filter((field) => field.observationId === observation._id); return <article key={observation._id}><header><span>{observation.trustState ?? "verified"}</span><time>{observation.observedAt ? new Date(observation.observedAt).toISOString() : "—"}</time></header><code>{observation._id}</code><strong>{observation.sourceEntityKey ?? observation.sourceId ?? "official source"}</strong><div>{fields.map((field) => <p key={field._id}>{field.canonicalPath}: {JSON.stringify(field.normalizedValue)}</p>)}</div></article>; })}</section>
      <footer className="integrity-footer"><span>UNRESOLVED DISAGREEMENT WITHHOLDS THE NEW VALUE</span><code>{conflict?.releasedFactVersionId ?? "serving last-known-good"}</code></footer>
    </main>
  );
}
