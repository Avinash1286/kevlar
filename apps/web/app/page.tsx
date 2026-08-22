const pipeline = [
  { label: "Acquire", detail: "Custom Browser collector", state: "ready" },
  { label: "Persist", detail: "Raw row + evidence refs", state: "ready" },
  { label: "Verify", detail: "Semantic contract gate", state: "ready" },
  { label: "Release", detail: "Proof-carrying field", state: "ready" },
] as const;

const evidence = [
  ["Visible context", "Purchase price · $129.00 · Buy now"],
  ["JSON-LD offer", "USD 129.00"],
  ["Public product API", "purchase_price: 129"],
] as const;

type BaselineRun = {
  run: { _id: string; status: string };
  row: { rawPayload: unknown } | null;
  evidence: Array<unknown>;
  collector: { collectorId: string } | null;
};

const latestBaseline = makeFunctionReference<
  "query",
  Record<string, never>,
  BaselineRun | null
>("runs:latestBaseline");

async function loadBaseline() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return null;
  try {
    return await new ConvexHttpClient(convexUrl).query(latestBaseline, {});
  } catch {
    return null;
  }
}

function observedPrice(baseline: BaselineRun | null) {
  const payload = baseline?.row?.rawPayload;
  if (!payload || typeof payload !== "object") return 129;
  const product = "product" in payload ? payload.product : null;
  if (!product || typeof product !== "object") return 129;
  const purchasePrice =
    "purchase_price" in product ? product.purchase_price : null;
  if (!purchasePrice || typeof purchasePrice !== "object") return 129;
  const amount = "amount" in purchasePrice ? purchasePrice.amount : null;
  return typeof amount === "number" ? amount : 129;
}

export default async function Home() {
  const baseline = await loadBaseline();
  const price = observedPrice(baseline).toFixed(2).split(".");
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Kevlar home">
          <span className="brand-mark">K</span>
          <span>Kevlar</span>
        </a>
        <div className="phase-pill">
          <span /> Gate D · Certification
        </div>
        <a className="repo-link" href="https://github.com/Avinash1286/kevlar">
          GitHub ↗
        </a>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">VERIFIED LIVE-WEB INTELLIGENCE</div>
        <h1>
          Trust the fact.
          <br />
          <em>Question the repair.</em>
        </h1>
        <p className="lede">
          Kevlar sits between self-healing collectors and production systems,
          releasing web data only when contracts and independent evidence
          support it.
        </p>
        <div className="hero-actions">
          <a className="primary-action" href="/feed">
            Open trust feed <span>→</span>
          </a>
          <a className="repo-link" href="/gauntlet">
            Inspect Gauntlet →
          </a>
          <span className="quiet-label">
            Week 4 of 12 · Repair certification firewall
          </span>
        </div>
      </section>

      <section className="pipeline" aria-label="Kevlar release pipeline">
        {pipeline.map((step, index) => (
          <div
            className={`pipeline-step pipeline-${step.state}`}
            key={step.label}
          >
            <div className="step-number">0{index + 1}</div>
            <div>
              <strong>{step.label}</strong>
              <span>{step.detail}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="run-grid" id="baseline">
        <article className="run-card">
          <div className="card-heading">
            <div>
              <span className="overline">BASELINE OBSERVATION</span>
              <h2>Nova Wireless Headphones</h2>
            </div>
            <span className="status verified">
              <i /> {baseline ? "Live row persisted" : "Schema valid"}
            </span>
          </div>

          <div className="price-block">
            <span className="price-label">Observed purchase price</span>
            <div className="price">
              ${price[0]}
              <span>.{price[1]}</span>
            </div>
            <span className="currency">USD · one-time</span>
          </div>

          <div className="evidence-list">
            {evidence.map(([kind, value]) => (
              <div className="evidence-row" key={kind}>
                <span>{kind}</span>
                <strong>{value}</strong>
                <i aria-label="Supported">✓</i>
              </div>
            ))}
          </div>
        </article>

        <aside className="timeline-card">
          <div className="card-heading compact">
            <div>
              <span className="overline">RUN TIMELINE</span>
              <h2>Initial proof path</h2>
            </div>
            <span className="run-id">
              {baseline?.run._id ?? "run_local_v1"}
            </span>
          </div>

          <ol className="timeline">
            <li className="done">
              <span />
              <div>
                <strong>Fixture ready</strong>
                <small>V1 evidence channels active</small>
              </div>
              <time>{baseline ? "LIVE" : "LOCAL"}</time>
            </li>
            <li className="done">
              <span />
              <div>
                <strong>Schema accepted</strong>
                <small>Collector envelope validates</small>
              </div>
              <time>PASS</time>
            </li>
            <li className={baseline ? "done" : "pending"}>
              <span />
              <div>
                <strong>Live collector run</strong>
                <small>Requires Scraper Studio setup</small>
              </div>
              <time>{baseline ? "PASS" : "PENDING"}</time>
            </li>
            <li className={baseline ? "done" : "pending"}>
              <span />
              <div>
                <strong>Convex persistence</strong>
                <small>Requires linked deployment</small>
              </div>
              <time>{baseline ? "PASS" : "PENDING"}</time>
            </li>
          </ol>

          <div className="boundary-note">
            <span>Trust boundary</span>
            <p>
              Schema validity is not verification. Semantic contracts and
              independent evidence now control every release.
            </p>
          </div>
        </aside>
      </section>

      <footer>
        <span>Bright Data keeps collectors alive.</span>
        <strong>Kevlar keeps the facts honest.</strong>
      </footer>
    </main>
  );
}
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

export const dynamic = "force-dynamic";
