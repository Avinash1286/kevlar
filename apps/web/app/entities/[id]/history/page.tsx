import Link from "next/link";
import { loadEntityTimeline, loadFactHistory } from "../../../../lib/phase7-data";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ predicate?: string; validAt?: string; believedAt?: string }>;
};

function parseTime(value?: string) {
  if (!value) return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
function display(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value);
}

export default async function EntityHistoryPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const timeline = await loadEntityTimeline(id, query.predicate);
  const predicate = query.predicate ?? timeline?.currentFacts[0]?.predicate ?? timeline?.versions[0]?.predicate;
  const validAt = parseTime(query.validAt);
  const believedAt = parseTime(query.believedAt);
  const history = predicate ? await loadFactHistory(id, predicate, { ...(validAt ? { validAt } : {}), ...(believedAt ? { believedAt } : {}) }) : null;
  const relationFor = (versionId: string) => history?.relations.find((item) => item.toFactVersionId === versionId);

  return <main className="console-shell chronicle-console">
    <header className="console-nav"><Link className="brand" href="/"><span className="brand-mark">K</span><span>Kevlar</span></Link><nav className="fleet-nav"><Link href="/history">Chronicle</Link><Link href="/entities">Entities</Link><Link href="/mappings">Mappings</Link></nav></header>
    <section className="gauntlet-heading"><div><p>ENTITY HISTORY · VALID TIME × TRANSACTION TIME</p><h1>{timeline?.entity.displayName ?? "Entity history unavailable"}</h1><code>{timeline?.entity.canonicalKey}</code></div><span className={`state-pill ${timeline ? "verified" : "stale"}`}>{timeline ? "HISTORICAL" : "OFFLINE"}</span></section>
    <form className="time-query" method="get"><label>Predicate<select name="predicate" defaultValue={predicate}>{[...new Set(timeline?.versions.map((item) => item.predicate) ?? [])].map((item) => <option key={item}>{item}</option>)}</select></label><label>Externally valid at<input name="validAt" type="datetime-local" defaultValue={query.validAt} /></label><label>Kevlar believed at<input name="believedAt" type="datetime-local" defaultValue={query.believedAt} /></label><button type="submit">Query history</button></form>
    <section className="historical-answer"><div><span>EFFECTIVE EXTERNAL FACT</span><strong>{history?.effectiveFactVersion ? display(history.effectiveFactVersion.value) : "—"}</strong><small>{validAt ? new Date(validAt).toISOString() : "latest valid time"}</small></div><div><span>RECORDED BELIEF</span><strong>{history?.decisionVersion ? display(history.decisionVersion.value) : "—"}</strong><small>{believedAt ? new Date(believedAt).toISOString() : "latest transaction"}</small></div><div><span>RELEASE DECISION</span><strong>{history?.decision?.outcome ?? "—"}</strong><small>{history?.decision?.reasonCodes.join(" · ")}</small></div></section>
    <section className="entity-timeline">{(history?.versions ?? []).map((fact) => { const relation = relationFor(fact._id); return <article key={fact._id}><div className={`timeline-node ${fact.changeKind}`} /><time>{new Date(fact.transactionFrom).toISOString()}</time><div><span>{relation?.kind ?? fact.changeKind}</span><h2>{display(fact.value)} {fact.unit ?? ""}</h2><p>{relation?.reason ?? fact.validTimeSource}</p><code>{fact.valueHash}</code></div></article>; })}</section>
    <section className="provenance-chain"><span>CURRENT FACT → VERIFIED OBSERVATION → SOURCE RUN</span><div>{(history?.fields ?? []).map((field) => <article key={field._id}><strong>{field.canonicalPath}</strong><code>{field.sourcePaths.join(", ")}</code><span>{field.transform.name}@{field.transform.version}</span><em>{field.state}</em></article>)}</div><footer><code>mapping {history?.mappingRevision?._id ?? "—"}</code><code>binding {history?.collectorBinding?._id ?? "—"}</code><code>run {history?.run?._id ?? "—"}</code><code>certificate {history?.certificate?._id ?? "—"}</code></footer></section>
  </main>;
}
