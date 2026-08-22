import Link from "next/link";
import { loadEvents, loadPhase8Proof } from "../../lib/phase8-data";

export const dynamic = "force-dynamic";

function eventLabel(value: string) {
  return value.replaceAll("_", " ");
}

export default async function EventsPage() {
  const [events, proof] = await Promise.all([loadEvents(), loadPhase8Proof()]);
  const stream = events ?? proof?.events ?? [];
  const business =
    proof?.businessEventCount ??
    stream.filter((event) => event.businessEvent !== false).length;
  const corrections = stream.filter((event) =>
    event.eventType.includes("correct"),
  ).length;
  const presentation = stream.filter(
    (event) => event.eventType === "presentation_drift",
  ).length;
  return (
    <main className="console-shell cdc-console">
      <header className="console-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">K</span><span>Kevlar</span>
        </Link>
        <nav className="fleet-nav">
          <Link href="/events">Events</Link><Link href="/conflicts">Conflicts</Link><Link href="/history">Chronicle</Link><Link href="/entities">Entities</Link>
        </nav>
      </header>
      <section className="gauntlet-heading">
        <div><p>SEMANTIC CDC · VERIFIED EVENT STREAM</p><h1>Meaningful changes, not noisy page diffs.</h1></div>
        <span className={`state-pill ${proof ? "verified" : "stale"}`}>{proof ? "PROVEN" : "OFFLINE"}</span>
      </section>
      <section className="metric-grid">
        <article><span>EVENTS</span><strong>{stream.length}</strong></article>
        <article><span>BUSINESS EVENTS</span><strong>{business}</strong></article>
        <article><span>CORRECTIONS</span><strong>{corrections}</strong></article>
        <article><span>PRESENTATION ONLY</span><strong>{presentation}</strong></article>
      </section>
      <section className="event-stream">
        <header><span>EVENT ID</span><span>TYPE</span><span>PREDICATE</span><span>STATE</span><span>OBSERVED</span></header>
        {stream.map((event) => (
          <Link href={`/events/${encodeURIComponent(event.eventId)}`} key={event._id}>
            <code>{event.eventId}</code>
            <strong>{eventLabel(event.eventType)}</strong>
            <span>{event.predicate ?? "entity"}</span>
            <em className={event.state}>{event.state}</em>
            <time>{new Date(event.observedAt).toISOString()}</time>
          </Link>
        ))}
      </section>
      <section className="cdc-proof-strip">
        <div><span>LAYOUT-ONLY BUSINESS EVENTS</span><strong>{proof?.layoutBusinessEventCount ?? 0}</strong></div>
        <div><span>VERIFIED PRICE EVENTS</span><strong>{proof?.verifiedPriceEventCount ?? 0}</strong></div>
        <div><span>QUARANTINED EVENTS</span><strong>{proof?.quarantinedEventCount ?? 0}</strong></div>
        <div><span>STABLE RETRY IDS</span><strong>{proof ? (proof.stableEventIds === false ? "NO" : "YES") : "—"}</strong></div>
      </section>
    </main>
  );
}
