import Link from "next/link";
import { loadEventCourtroom } from "../../../lib/phase8-data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };
function show(value: unknown) {
  if (value === undefined || value === null) return "—";
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : JSON.stringify(value);
}

export default async function EventCourtroomPage({ params }: Props) {
  const { id } = await params;
  const data = await loadEventCourtroom(decodeURIComponent(id));
  const event = data?.event;
  const decision = data?.releaseDecision ?? data?.decision;
  const policy = data?.releasePolicy ?? data?.policy;
  const facts = data?.factVersions ?? data?.facts ?? [];
  return (
    <main className="console-shell cdc-console">
      <header className="console-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">K</span>
          <span>Kevlar</span>
        </Link>
        <nav className="fleet-nav">
          <Link href="/events">Events</Link>
          <Link href="/conflicts">Conflicts</Link>
          <Link href="/history">Chronicle</Link>
        </nav>
      </header>
      <section className="gauntlet-heading">
        <div>
          <p>EVENT COURTROOM · RELEASE EVIDENCE</p>
          <h1>
            {event?.eventType.replaceAll("_", " ") ?? "Event unavailable"}
          </h1>
          <code>{event?.eventId ?? id}</code>
        </div>
        <span
          className={`state-pill ${event?.state === "released" ? "verified" : "stale"}`}
        >
          {event?.state ?? "OFFLINE"}
        </span>
      </section>
      <section className="courtroom-summary">
        <article>
          <span>PREDICATE</span>
          <strong>{event?.predicate ?? "entity"}</strong>
          <code>{event?.entityId}</code>
        </article>
        <article>
          <span>RELEASE DECISION</span>
          <strong>{decision?.outcome ?? "—"}</strong>
          <p>{decision?.reasonCodes?.join(" · ")}</p>
        </article>
        <article>
          <span>POLICY</span>
          <strong>{policy?.name ?? policy?.strategy ?? "—"}</strong>
          <code>{policy?._id}</code>
        </article>
        <article>
          <span>INTEGRITY</span>
          <strong>{event?.evidenceRefs.length ?? 0} evidence links</strong>
          <code>{event?.eventHash}</code>
        </article>
      </section>
      <section className="courtroom-chain">
        <div>
          <span>FACT VERSIONS</span>
          {facts.map((fact) => (
            <article key={fact._id}>
              <strong>{fact.changeKind ?? "fact"}</strong>
              <code>{fact._id}</code>
              <b>{show(fact.value)}</b>
            </article>
          ))}
        </div>
        <div>
          <span>VERIFIED OBSERVATIONS</span>
          {(data?.observations ?? []).map((observation) => (
            <article key={observation._id}>
              <strong>{observation.trustState ?? "verified"}</strong>
              <code>{observation._id}</code>
              <b>{observation.sourceEntityKey ?? observation.sourceId}</b>
            </article>
          ))}
        </div>
        <div>
          <span>CANONICAL FIELDS</span>
          {(data?.fields ?? []).map((field) => (
            <article key={field._id}>
              <strong>{field.state ?? "verified"}</strong>
              <code>{field.canonicalPath}</code>
              <b>{show(field.normalizedValue)}</b>
            </article>
          ))}
        </div>
      </section>
      <footer className="integrity-footer">
        <span>
          {event?.businessEvent === false
            ? "PRESENTATION AUDIT ONLY · NOT RELEASED AS BUSINESS CHANGE"
            : "VERIFIED SEMANTIC CHANGE"}
        </span>
        <code>
          {event?.correctionOfEventId
            ? `corrects ${event.correctionOfEventId}`
            : event?.eventId}
        </code>
      </footer>
    </main>
  );
}
