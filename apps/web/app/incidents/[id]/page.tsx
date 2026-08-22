import Link from "next/link";
import { notFound } from "next/navigation";
import { loadIncident } from "../../../lib/incident-data";

export const dynamic = "force-dynamic";

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  }).format(timestamp);
}

export default async function IncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const loaded = await loadIncident(id);
  if (!loaded) notFound();

  const { incident, events } = loaded;
  const triage = incident.latestTriage;
  return (
    <main className="console-shell incident-shell">
      <nav className="console-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">K</span>
          <span>Kevlar</span>
        </Link>
        <span className="phase-pill">
          <span /> Gate C · Reliability
        </span>
        <Link className="repo-link" href="/feed">
          ← Trust feed
        </Link>
      </nav>

      <header className="incident-heading">
        <div>
          <span className="overline">INCIDENT / {id.slice(0, 12)}</span>
          <h1>The failure is persistent. The response is controlled.</h1>
        </div>
        <span className="incident-state">{incident.incident.state}</span>
      </header>

      <section className="courtroom-grid">
        <article className="courtroom-card">
          <span className="step-number">01</span>
          <span className="overline">THE WEBSITE CHANGED</span>
          <h2>{incident.incident.failureSummary}</h2>
          <p>
            Run {incident.failingRun?._id ?? "—"} · collector{" "}
            {incident.collector?.name ?? "—"}
          </p>
        </article>
        <article className="courtroom-card danger-card">
          <span className="step-number">02</span>
          <span className="overline">DETERMINISTIC TRIAGE</span>
          <h2>{triage?.classification?.replaceAll("_", " ") ?? "pending"}</h2>
          <strong>{triage?.recommendedAction ?? "await evidence"}</strong>
          <ul>
            {(triage?.signals ?? []).map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>
        </article>
        <article className="courtroom-card">
          <span className="step-number">03</span>
          <span className="overline">AI RELIABILITY ROUTER</span>
          <h2>
            {incident.modelCalls.length
              ? `${incident.modelCalls.length} audited attempts`
              : "AI not required"}
          </h2>
          <p>
            Providers run sequentially. Invalid, timed-out, or over-budget
            responses cannot make a release decision.
          </p>
        </article>
        <article className="courtroom-card acid-card">
          <span className="step-number">04</span>
          <span className="overline">SAFE OUTCOME</span>
          <h2>{incident.latestReview?.status ?? incident.incident.state}</h2>
          <p>
            {incident.latestReview
              ? "All-provider failure reached a durable human-review queue."
              : "The workflow remains inside the audited state machine."}
          </p>
        </article>
      </section>

      <section className="timeline-section">
        <header>
          <span className="overline">WORKFLOW + MODEL ROUTING TIMELINE</span>
          <strong>{events.length} audited events</strong>
        </header>
        <ol className="incident-timeline">
          {events.map((event) => (
            <li key={event.id}>
              <span>{event.kind}</span>
              <strong>{event.label}</strong>
              <time>{formatTime(event.at)} UTC</time>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
