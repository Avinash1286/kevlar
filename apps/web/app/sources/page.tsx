import Link from "next/link";
import { loadSourceCatalog } from "../../lib/phase5-data";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const data = await loadSourceCatalog();
  const sources = data?.sources ?? [];
  const approved = sources.filter(
    (source) => source.approvalStatus === "approved",
  ).length;
  const publicSources = sources.filter(
    (source) => source.visibility === "public",
  ).length;
  const noBypass = (data?.bindings ?? []).every(
    (binding) => binding.bypassCore === false,
  );

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
          <Link href="/gauntlet">Gauntlet</Link>
        </nav>
      </header>

      <section className="gauntlet-heading">
        <div>
          <p>AI-INFRASTRUCTURE · SOURCE CATALOG</p>
          <h1>Authority is explicit before collection begins.</h1>
        </div>
        <span
          className={`state-pill ${approved === sources.length ? "verified" : "stale"}`}
        >
          {data?.domainPack?.status ?? "OFFLINE"}
        </span>
      </section>

      <section className="metric-grid">
        <article>
          <span>APPROVED SOURCES</span>
          <strong>
            {approved}/{sources.length || 3}
          </strong>
        </article>
        <article>
          <span>PUBLIC DATA</span>
          <strong>
            {publicSources}/{sources.length || 3}
          </strong>
        </article>
        <article>
          <span>CUSTOM BINDINGS</span>
          <strong>{data?.bindings.length ?? 0}</strong>
        </article>
        <article>
          <span>CORE BYPASS</span>
          <strong className={noBypass ? "text-good" : "text-warn"}>
            {noBypass ? "NONE" : "BLOCKED"}
          </strong>
        </article>
      </section>

      <section className="source-grid" aria-label="Governed sources">
        {sources.map((source) => {
          const endpoint = data?.endpoints.find(
            (item) => item.sourceId === source._id,
          );
          const authorities = (data?.authorities ?? []).filter(
            (item) => item.sourceId === source._id && item.active,
          );
          const binding = data?.bindings.find(
            (item) =>
              item.sourceId === source._id &&
              item.lifecycleStatus !== "disabled",
          );
          const schedule = data?.schedules.find(
            (item) => item.bindingId === binding?._id,
          );
          const certification = data?.certifications.find(
            (item) => item.sourceId === source._id,
          );
          return (
            <article key={source._id}>
              <header>
                <div>
                  <span>{source.sourceType.toUpperCase()}</span>
                  <h2>{source.name}</h2>
                </div>
                <span className="status verified">
                  <i />
                  {source.approvalStatus}
                </span>
              </header>
              <dl>
                <div>
                  <dt>Official endpoint</dt>
                  <dd>
                    {endpoint?.host}
                    {endpoint?.pathPrefix}
                  </dd>
                </div>
                <div>
                  <dt>Visibility</dt>
                  <dd>{source.visibility}</dd>
                </div>
                <div>
                  <dt>Collector</dt>
                  <dd>{binding?.lifecycleStatus ?? "pending"}</dd>
                </div>
                <div>
                  <dt>Core certification</dt>
                  <dd>{certification?.status ?? "pending"}</dd>
                </div>
                <div>
                  <dt>Cadence</dt>
                  <dd>
                    {schedule
                      ? `${schedule.intervalMs / 60_000} min`
                      : "pending"}
                  </dd>
                </div>
              </dl>
              <div className="authority-list">
                {authorities.map((authority) => (
                  <code key={authority._id}>
                    {authority.authority} · {authority.predicate}
                  </code>
                ))}
              </div>
            </article>
          );
        })}
        {sources.length === 0 ? (
          <article className="empty-source">
            <h2>Catalog awaiting deployment</h2>
            <p>
              The bounded Convex catalog query will populate this view after
              Phase 5 seeding.
            </p>
          </article>
        ) : null}
      </section>
    </main>
  );
}
