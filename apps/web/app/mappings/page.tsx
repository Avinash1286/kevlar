import Link from "next/link";
import { loadPhase6IdentityGraph, loadPhase6Mappings } from "../../lib/phase6-data";
import { MappingWorkbench } from "./mapping-workbench";

export const dynamic = "force-dynamic";

export default async function MappingsPage() {
  const [data, graph] = await Promise.all([loadPhase6Mappings(), loadPhase6IdentityGraph()]);
  const statusFor = (revisionId: string) =>
    (data?.transitions ?? []).filter((item) => item.mappingRevisionId === revisionId)
      .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))[0]?.toStatus ?? "draft";
  const approvalFor = (revisionId: string) =>
    (data?.approvals ?? []).filter((item) => item.mappingRevisionId === revisionId)
      .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))[0];

  return <main className="console-shell canonical-console">
    <header className="console-nav"><Link className="brand" href="/"><span className="brand-mark">K</span><span>Kevlar</span></Link><nav className="fleet-nav"><Link href="/schema">Schema</Link><Link href="/mappings">Mappings</Link><Link href="/entities">Entities</Link><Link href="/fleet">Fleet</Link></nav></header>
    <section className="gauntlet-heading"><div><p>DETERMINISTIC MAPPING ENGINE · FIELD PROVENANCE</p><h1>Every transform is visible, versioned, and replayable.</h1></div><span className={`state-pill ${data ? "verified" : "stale"}`}>{data ? "LIVE" : "OFFLINE"}</span></section>
    <section className="metric-grid"><article><span>MAPPING SPECS</span><strong>{data?.specs.length ?? 0}</strong></article><article><span>ACTIVE REVISIONS</span><strong>{(data?.revisions ?? []).filter((item) => statusFor(item._id) === "active").length}</strong></article><article><span>CANONICAL FIELDS</span><strong>{graph?.fields.length ?? 0}</strong></article><article><span>OPAQUE CODE</span><strong className="text-good">BLOCKED</strong></article></section>
    <MappingWorkbench />
    <section className="mapping-release-grid">
      {(data?.specs ?? []).map((spec) => {
        const revisions = (data?.revisions ?? []).filter((item) => item.mappingSpecId === spec._id);
        return <article key={spec._id}><header><div><span>{spec.entityType.toUpperCase()}</span><h2>{spec.name}</h2></div><code>{spec.key}</code></header>{revisions.map((revision) => { const approval = approvalFor(revision._id); return <div className="mapping-revision" key={revision._id}><strong>r{revision.revision} · {statusFor(revision._id)}</strong><span>{approval?.decision ?? "awaiting review"}</span><code>{revision.specificationHash.slice(0, 28)}</code></div>; })}</article>;
      })}
    </section>
    <section className="provenance-table"><div className="provenance-row provenance-head"><span>CANONICAL FIELD</span><span>SOURCE PATH</span><span>TRANSFORM</span><span>EVIDENCE</span></div>{(graph?.fields ?? []).slice(0, 12).map((field) => <article className="provenance-row" key={field._id}><strong>{field.canonicalPath}</strong><code>{field.sourcePaths.join(", ")}</code><span>{field.transform.name}@{field.transform.version}</span><span>{field.evidenceRefs.length} ref{field.evidenceRefs.length === 1 ? "" : "s"}</span></article>)}</section>
  </main>;
}
