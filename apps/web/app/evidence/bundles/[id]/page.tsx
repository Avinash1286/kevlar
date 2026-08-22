import Link from "next/link";
import { loadEvidenceBundle } from "../../../../lib/phase9-data";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
const text = (value: unknown) => value == null ? "—" : String(value);

export default async function EvidenceBundlePage({ params }: Props) {
  const { id } = await params;
  const data = await loadEvidenceBundle(decodeURIComponent(id));
  const bundle = data?.bundle;
  return <main className="console-shell evidence-console">
    <header className="console-nav"><Link className="brand" href="/"><span className="brand-mark">K</span><span>Kevlar</span></Link><nav className="fleet-nav"><Link href="/evidence">Evidence</Link><Link href="/events">Events</Link></nav></header>
    <section className="gauntlet-heading"><div><p>EVIDENCE BUNDLE · INTEGRITY MANIFEST</p><h1>{text(bundle?.status ?? "Verified evidence bundle")}</h1><code>{text(bundle?._id ?? id)}</code></div><span className={`state-pill ${bundle ? "verified" : "stale"}`}>{bundle ? "DIGESTED" : "OFFLINE"}</span></section>
    <section className="bundle-manifest"><div><span>SUBJECT</span><strong>{text(bundle?.eventId ?? bundle?.incidentId)}</strong></div><div><span>MANIFEST DIGEST</span><code>{text(bundle?.manifestDigest ?? bundle?.digest)}</code></div><a href={`/api/evidence-bundles/${encodeURIComponent(id)}`}>Download bundle JSON ↓</a></section>
    <section className="artifact-grid">{(data?.artifacts ?? []).map((artifact) => <article key={artifact._id}><header><span>{text(artifact.kind)}</span><strong>{text(artifact.reference)}</strong></header><code>{text(artifact.contentDigest)}</code><p>{text(artifact.metadata ? JSON.stringify(artifact.metadata) : "embedded payload")}</p></article>)}</section>
  </main>;
}
