import Link from "next/link";
import { loadFeed } from "../../lib/semantic-data";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const status = await loadFeed();
  const release = status?.release;
  const violations = status?.violations ?? [];
  const isQuarantined = release?.status === "stale";

  return (
    <main className="console-shell">
      <nav className="console-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">K</span>
          <span>Kevlar</span>
        </Link>
        <span className="phase-pill">
          <span /> Gate B · Semantic trust
        </span>
        <Link className="repo-link" href="/projects/kevlar-core">
          Project detail →
        </Link>
      </nav>

      <header className="console-heading">
        <div>
          <span className="overline">TRUST FEED / LIVE</span>
          <h1>
            Facts with
            <br />
            <em>receipts.</em>
          </h1>
        </div>
        <p>
          Every observed field passes through semantic contracts, independent
          evidence, and release policy before downstream consumers see it.
        </p>
      </header>

      <section className="trust-card">
        <div className="trust-card-head">
          <div>
            <span className="overline">NOVA / PURCHASE PRICE</span>
            <h2>Nova Wireless Headphones</h2>
          </div>
          <span className={`status ${isQuarantined ? "danger" : "verified"}`}>
            <i /> {release?.status ?? "awaiting run"}
          </span>
        </div>

        <div className="release-comparison">
          <div>
            <span>Observed by collector</span>
            <strong>${release?.observedValue?.toFixed(2) ?? "—"}</strong>
            <small>
              {isQuarantined ? "Rejected by semantic gate" : "Candidate value"}
            </small>
          </div>
          <div className="gate-arrow">→</div>
          <div className="released-fact">
            <span>Released fact</span>
            <strong>${release?.releasedValue?.toFixed(2) ?? "—"}</strong>
            <small>
              {isQuarantined ? "Last-known-good · stale" : "Verified"}
            </small>
          </div>
        </div>

        <div className="gate-grid">
          <article>
            <span className="overline">CONTRACT RESULT</span>
            <strong>
              {violations.length
                ? `${violations.length} violations`
                : "All checks passed"}
            </strong>
            <p>
              {violations[0]?.message ??
                "Purchase semantics and independent sources agree."}
            </p>
          </article>
          <article>
            <span className="overline">ALERT CONSUMER</span>
            <strong>{status?.alert?.status ?? "Not triggered"}</strong>
            <p>
              {status?.alert?.reason ?? "No downstream alert was evaluated."}
            </p>
          </article>
          <article>
            <span className="overline">INDEPENDENT SOURCES</span>
            <strong>JSON-LD + public API</strong>
            <p>
              Both channels support $
              {release?.proof.evidence?.jsonLdPrice ?? "—"} USD.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
