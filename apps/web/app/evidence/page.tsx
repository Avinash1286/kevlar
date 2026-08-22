import Link from "next/link";
import {
  loadEvidenceBundle,
  loadEvidenceGraph,
  loadPhase9Proof,
} from "../../lib/phase9-data";

export const dynamic = "force-dynamic";
const text = (value: unknown) => (value == null ? "—" : String(value));

export default async function EvidencePage() {
  const [graph, bundle, proof] = await Promise.all([
    loadEvidenceGraph(),
    loadEvidenceBundle(),
    loadPhase9Proof(),
  ]);
  const root = graph?.root;
  const bundleId = text(bundle?.bundle.bundleId ?? bundle?.bundle._id);
  return (
    <main className="console-shell evidence-console">
      <header className="console-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">K</span>
          <span>Kevlar</span>
        </Link>
        <nav className="fleet-nav">
          <Link href="/evidence">Evidence</Link>
          <Link href="/fleet/repairs">Repairs</Link>
          <Link href="/fleet/gauntlet">Fleet Gauntlet</Link>
          <Link href="/events">Events</Link>
        </nav>
      </header>
      <section className="gauntlet-heading">
        <div>
          <p>EVIDENCE GRAPH · TAMPER-EVIDENT PROVENANCE</p>
          <h1>Every released event can show its work.</h1>
        </div>
        <span className={`state-pill ${proof ? "verified" : "stale"}`}>
          {proof ? "NAVIGABLE" : "OFFLINE"}
        </span>
      </section>
      <section className="metric-grid">
        <article>
          <span>NODES</span>
          <strong>{graph?.nodes.length ?? 0}</strong>
        </article>
        <article>
          <span>EDGES</span>
          <strong>{graph?.edges.length ?? 0}</strong>
        </article>
        <article>
          <span>ARTIFACTS</span>
          <strong>{bundle?.artifacts.length ?? 0}</strong>
        </article>
        <article>
          <span>ARCHIVED EVIDENCE</span>
          <strong>{bundle?.evidence.length ?? 0}</strong>
        </article>
      </section>
      <section className="evidence-root">
        <div>
          <span>ROOT</span>
          <strong>{text(root?.nodeType ?? root?.kind)}</strong>
          <code>{text(root?.refId ?? root?._id)}</code>
        </div>
        <div>
          <span>INTEGRITY</span>
          <strong>{text(root?.label)}</strong>
          <code>{text(root?.integrityDigest ?? root?.digest)}</code>
        </div>
        <Link href={`/evidence/bundles/${encodeURIComponent(bundleId)}`}>
          Open downloadable evidence bundle →
        </Link>
      </section>
      <section className="graph-ledger">
        <header>
          <span>NODE</span>
          <span>TYPE</span>
          <span>INTEGRITY</span>
        </header>
        {(graph?.nodes ?? []).map((node) => (
          <article key={node._id}>
            <code>{text(node.refId ?? node._id)}</code>
            <strong>{text(node.nodeType ?? node.kind)}</strong>
            <code>{text(node.integrityDigest ?? node.digest)}</code>
          </article>
        ))}
      </section>
      <section className="edge-ledger">
        <span>PROVENANCE EDGES</span>
        {(graph?.edges ?? []).map((edge) => (
          <article key={edge._id}>
            <code>{text(edge.fromNodeId ?? edge.fromId)}</code>
            <strong>{text(edge.relationship)}</strong>
            <code>{text(edge.toNodeId ?? edge.toId)}</code>
          </article>
        ))}
      </section>
    </main>
  );
}
