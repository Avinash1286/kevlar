import Link from "next/link";

const metrics = [
  [
    "LABELED CHECKS",
    "24/24",
    "Controlled fixture and deterministic platform cases",
  ],
  ["FALSE RELEASES", "0", "Eight repair-certification cases"],
  ["HELD-OUT REPAIR", "2/2", "Relations excluded from the repair instruction"],
  ["LIVE REQUESTS", "80/80", "Ten concurrent requests across eight routes"],
] as const;

export default function ReleasePage() {
  return (
    <main className="console-shell operations-console">
      <header className="console-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">K</span>
          <span>Kevlar</span>
        </Link>
        <nav className="fleet-nav">
          <Link href="/release">Release</Link>
          <Link href="/operations">Operations</Link>
          <Link href="/developers">Developers</Link>
          <Link href="/security">Security</Link>
        </nav>
      </header>
      <section className="gauntlet-heading">
        <div>
          <p>KEVLAR v1.0.1 · 2026-08-22</p>
          <h1>Measured, documented, and reproducible.</h1>
        </div>
        <span className="state-pill verified">RELEASED</span>
      </section>
      <section className="metric-grid">
        {metrics.map(([label, value, detail]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </section>
      <section className="security-policies">
        <article>
          <span>BENCHMARK</span>
          <h2>Five explicit baselines</h2>
          <p>
            Schema-only, semantic contracts, canonical mapping, Kevlar without
            held-out cases, and full Kevlar are evaluated from committed cases.
          </p>
        </article>
        <article>
          <span>FULL FLOW</span>
          <h2>Seven live assertions</h2>
          <p>
            Repair certification, facts, events, API delivery, MCP, AI routing,
            security, and chaos remain queryable.
          </p>
        </article>
        <article>
          <span>CLAIM BOUNDARY</span>
          <h2>Controlled evidence only</h2>
          <p>
            Results describe this fixture-backed release suite and are not
            presented as general web accuracy.
          </p>
        </article>
      </section>
      <section className="protected-actions">
        <span>PUBLIC ARTIFACTS</span>
        <strong>
          <a href="https://github.com/Avinash1286/kevlar/tree/main/benchmarks/results">
            Raw JSON reports
          </a>{" "}
          ·{" "}
          <a href="https://github.com/Avinash1286/kevlar/blob/main/docs/BENCHMARK.md">
            Benchmark method
          </a>{" "}
          ·{" "}
          <a href="https://github.com/Avinash1286/kevlar/blob/main/docs/LIMITATIONS.md">
            Limitations
          </a>
        </strong>
      </section>
    </main>
  );
}
