import Link from "next/link";
import { loadPhase6Registry } from "../../lib/phase6-data";

export const dynamic = "force-dynamic";

export default async function SchemaRegistryPage() {
  const data = await loadPhase6Registry();
  const revisions = data?.revisions ?? [];
  const stateFor = (revisionId: string) =>
    (data?.states ?? [])
      .filter((state) => state.schemaRevisionId === revisionId)
      .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))[0];

  return (
    <main className="console-shell canonical-console">
      <header className="console-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">K</span>
          <span>Kevlar</span>
        </Link>
        <nav className="fleet-nav">
          <Link href="/schema">Schema</Link>
          <Link href="/mappings">Mappings</Link>
          <Link href="/entities">Entities</Link>
          <Link href="/sources">Sources</Link>
        </nav>
      </header>
      <section className="gauntlet-heading">
        <div>
          <p>CANONICAL SCHEMA REGISTRY · IMMUTABLE REVISIONS</p>
          <h1>Meaning changes by revision, never by mutation.</h1>
        </div>
        <span
          className={`state-pill ${revisions.length ? "verified" : "stale"}`}
        >
          {data ? "LIVE" : "OFFLINE"}
        </span>
      </section>
      <section className="metric-grid">
        <article>
          <span>REVISIONS</span>
          <strong>{revisions.length}</strong>
        </article>
        <article>
          <span>ACTIVE</span>
          <strong>
            {
              revisions.filter(
                (revision) => stateFor(revision._id)?.toStatus === "active",
              ).length
            }
          </strong>
        </article>
        <article>
          <span>COMPATIBILITY CHECKS</span>
          <strong>{data?.compatibility.length ?? 0}</strong>
        </article>
        <article>
          <span>IN-PLACE EDITS</span>
          <strong className="text-good">PROHIBITED</strong>
        </article>
      </section>
      <section className="registry-grid">
        {revisions.map((revision) => {
          const state = stateFor(revision._id);
          return (
            <article key={revision._id}>
              <header>
                <div>
                  <span>REVISION {revision.revision}</span>
                  <h2>{revision.domain}</h2>
                </div>
                <span
                  className={`status ${state?.toStatus === "active" ? "verified" : "pending"}`}
                >
                  <i />
                  {state?.toStatus ?? "draft"}
                </span>
              </header>
              <dl>
                <div>
                  <dt>Definition hash</dt>
                  <dd>{revision.definitionHash}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>
                    {revision.createdAt
                      ? new Date(revision.createdAt).toISOString()
                      : "recorded"}
                  </dd>
                </div>
                <div>
                  <dt>Last transition</dt>
                  <dd>{state?.reason ?? "initial draft"}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </section>
      <section className="compatibility-list">
        <span>COMPATIBILITY CLASSIFICATION</span>
        {(data?.compatibility ?? []).map((item) => (
          <article key={item._id}>
            <strong>{item.classification}</strong>
            <code>
              {item.fromRevisionId.slice(0, 9)} →{" "}
              {item.toRevisionId.slice(0, 9)}
            </code>
            <p>{item.reasons.join(" · ")}</p>
          </article>
        ))}
        {data && data.compatibility.length === 0 ? (
          <p>No cross-revision change has been proposed.</p>
        ) : null}
      </section>
    </main>
  );
}
