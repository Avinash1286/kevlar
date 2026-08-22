import Link from "next/link";
import { loadSourceCatalog } from "../../lib/phase5-data";

export const dynamic = "force-dynamic";
export default async function CollectorsPage() {
  const data = await loadSourceCatalog();
  const bindings = data?.bindings ?? [];
  return (
    <main className="console-shell operations-console">
      <header className="console-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">K</span>
          <span>Kevlar</span>
        </Link>
        <nav className="fleet-nav">
          <Link href="/sources">Sources</Link>
          <Link href="/collectors">Collectors</Link>
          <Link href="/fleet">Fleet</Link>
          <Link href="/fleet/gauntlet">Gauntlet</Link>
        </nav>
      </header>
      <section className="gauntlet-heading">
        <div>
          <p>COLLECTOR REGISTRY</p>
          <h1>Every binding inherits the Core gate.</h1>
        </div>
        <span className="state-pill verified">NO BYPASS</span>
      </section>
      <section className="metric-grid">
        <article>
          <span>BINDINGS</span>
          <strong>{bindings.length}</strong>
        </article>
        <article>
          <span>ACTIVE</span>
          <strong>
            {
              bindings.filter((item) => item.lifecycleStatus === "active")
                .length
            }
          </strong>
        </article>
        <article>
          <span>CORE CERTIFIED</span>
          <strong>
            {bindings.filter((item) => item.coreGateStatus === "passed").length}
          </strong>
        </article>
        <article>
          <span>BYPASS</span>
          <strong>
            {bindings.some((item) => item.bypassCore) ? "BLOCKED" : "NONE"}
          </strong>
        </article>
      </section>
      <section className="collector-list">
        {bindings.map((binding) => (
          <article key={binding._id}>
            <div>
              <span>{binding.bindingKind}</span>
              <h2>
                {data?.sources.find((source) => source._id === binding.sourceId)
                  ?.name ?? "Collector binding"}
              </h2>
            </div>
            <strong>{binding.lifecycleStatus}</strong>
            <code>{binding.coreGateStatus}</code>
          </article>
        ))}
      </section>
    </main>
  );
}
