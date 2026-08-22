import Link from "next/link";
import { notFound } from "next/navigation";
import { loadProject } from "../../../lib/semantic-data";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const status = await loadProject(id);
  if (!status) notFound();

  const release = status.release;
  const violations = status.violations ?? [];
  return (
    <main className="console-shell">
      <nav className="console-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">K</span>
          <span>Kevlar</span>
        </Link>
        <Link className="repo-link" href="/feed">
          ← Trust feed
        </Link>
      </nav>

      <header className="project-heading">
        <span className="overline">PROJECT / {status.project.slug}</span>
        <h1>{status.project.name}</h1>
        <p>
          Semantic contract enforcement for the Nova product-price collector.
        </p>
      </header>

      <section className="project-grid">
        <article className="detail-card accent-card">
          <span className="overline">RELEASE POLICY</span>
          <h2>{release?.status ?? "No release"}</h2>
          <dl>
            <div>
              <dt>Observed</dt>
              <dd>${release?.observedValue?.toFixed(2) ?? "—"}</dd>
            </div>
            <div>
              <dt>Released</dt>
              <dd>${release?.releasedValue?.toFixed(2) ?? "—"}</dd>
            </div>
            <div>
              <dt>Alert</dt>
              <dd>{status.alert?.status ?? "—"}</dd>
            </div>
          </dl>
        </article>

        <article className="detail-card">
          <span className="overline">ACTIVE CONTRACT</span>
          <h2>{status.contract?.key ?? "Awaiting initialization"}</h2>
          <p>
            Version {status.contract?.version ?? "—"} · critical field ·
            independent-source agreement required.
          </p>
        </article>

        <article className="detail-card wide-card">
          <span className="overline">VIOLATION LEDGER</span>
          {violations.length ? (
            <ul className="violation-list">
              {violations.map((item) => (
                <li key={item._id}>
                  <span>{item.severity}</span>
                  <strong>{item.code.replaceAll("_", " ")}</strong>
                  <p>{item.message}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">No violations on the latest run.</p>
          )}
        </article>

        <article className="detail-card wide-card proof-card">
          <span className="overline">PROOF-CARRYING FIELD</span>
          <code>product.purchase_price.amount</code>
          <p>
            {release?.proof.evidence?.visibleContext ??
              "Evidence will appear after the first semantic run."}
          </p>
          <small>
            Run {status.run?._id ?? "—"} · record{" "}
            {status.row?.recordHash?.slice(0, 16) ?? "—"}
          </small>
        </article>
      </section>
    </main>
  );
}
