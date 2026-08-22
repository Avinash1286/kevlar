import Link from "next/link";
import { loadFleetProof, loadPhase9Proof } from "../../../lib/phase9-data";

export const dynamic = "force-dynamic";
const text = (value: unknown) => value == null ? "—" : String(value);

export default async function RepairCanariesPage() {
  const [fleet, proof] = await Promise.all([loadFleetProof(), loadPhase9Proof()]);
  const active = (fleet?.canaries ?? []).filter((item) => item.status === "active" || item.status === "fully_released").length;
  const rolledBack = (fleet?.canaries ?? []).filter((item) => item.status === "rolled_back" || item.status === "stopped").length;
  return <main className="console-shell evidence-console">
    <header className="console-nav"><Link className="brand" href="/"><span className="brand-mark">K</span><span>Kevlar</span></Link><nav className="fleet-nav"><Link href="/fleet/repairs">Repairs</Link><Link href="/fleet/gauntlet">Fleet Gauntlet</Link><Link href="/evidence">Evidence</Link><Link href="/fleet">Fleet</Link></nav></header>
    <section className="gauntlet-heading"><div><p>FLEET REPAIR · CANARY ACTIVATION</p><h1>No repair jumps straight to production.</h1></div><span className={`state-pill ${proof ? "verified" : "stale"}`}>{proof ? "GATED" : "OFFLINE"}</span></section>
    <section className="metric-grid"><article><span>CANARIES</span><strong>{fleet?.canaries.length ?? 0}</strong></article><article><span>ACTIVE</span><strong>{active}</strong></article><article><span>ROLLED BACK</span><strong>{rolledBack}</strong></article><article><span>EVENT HOLDS</span><strong>{fleet?.eventHolds.length ?? 0}</strong></article></section>
    <section className="canary-grid">{(fleet?.canaries ?? []).map((canary) => <article key={canary._id}><header><span>{text(canary.status)}</span><code>{canary._id}</code></header><h2>{text(canary.repairId ?? canary.incidentId)}</h2><div className="stage-track">{(fleet?.stages ?? []).filter((stage) => stage.canaryRunId === canary._id).map((stage) => <span className={text(stage.status)} key={stage._id}>{text(stage.stage)}</span>)}</div><p>{text(canary.automaticStopReason ?? canary.currentStage)}</p></article>)}</section>
    <section className="event-holds"><span>AFFECTED EVENTS REMAIN WITHHELD ON FAILURE</span>{(fleet?.eventHolds ?? []).map((hold) => <article key={hold._id}><code>{text(hold.eventId)}</code><strong>withheld</strong><span>{text(hold.reason)}</span></article>)}</section>
  </main>;
}
