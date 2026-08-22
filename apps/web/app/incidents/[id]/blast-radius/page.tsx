import Link from "next/link";
import { loadBlastRadius } from "../../../../lib/phase9-data";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
const text = (value: unknown) => value == null ? "—" : String(value);

export default async function BlastRadiusPage({ params }: Props) {
  const { id } = await params;
  const data = await loadBlastRadius(id);
  const assessment = data?.assessment;
  return <main className="console-shell evidence-console">
    <header className="console-nav"><Link className="brand" href="/"><span className="brand-mark">K</span><span>Kevlar</span></Link><nav className="fleet-nav"><Link href="/evidence">Evidence</Link><Link href="/fleet/repairs">Repairs</Link><Link href="/events">Events</Link></nav></header>
    <section className="gauntlet-heading"><div><p>INCIDENT BLAST RADIUS · PRE-APPROVAL CONTEXT</p><h1>{text(assessment?.incidentId ?? id)}</h1><code>{text(assessment?._id)}</code></div><span className="state-pill stale">EVENTS WITHHELD</span></section>
    <section className="metric-grid"><article><span>FIELDS</span><strong>{text(assessment?.affectedFieldCount ?? 0)}</strong></article><article><span>ENTITIES</span><strong>{text(assessment?.affectedEntityCount ?? 0)}</strong></article><article><span>FACTS + EVENTS</span><strong>{Number(assessment?.affectedFactCount ?? 0) + Number(assessment?.affectedEventCount ?? 0)}</strong></article><article><span>CONSUMERS</span><strong>{Number(assessment?.affectedSubscriberCount ?? 0) + Number(assessment?.affectedDownstreamCount ?? 0)}</strong></article></section>
    <section className="impact-ledger"><header><span>TYPE</span><span>SUBJECT</span><span>ACTION</span></header>{(data?.impacts ?? []).map((impact) => <article key={impact._id}><strong>{text(impact.kind)}</strong><code>{text(impact.label ?? impact.targetId)}</code><span>{text(impact.state)}</span></article>)}</section>
    <section className="tribunal-context"><header><span>REPAIR TRIBUNAL CONTEXT</span><strong>pre-approval</strong></header>{(data?.tribunalItems ?? []).map((item) => <article key={item._id}><strong>{text(item.kind)}</strong><p>{text(item.label)}</p><em>{item.details ? "linked" : "pending"}</em></article>)}</section>
  </main>;
}
