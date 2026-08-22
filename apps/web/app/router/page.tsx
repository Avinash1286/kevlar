import Link from "next/link";
import { AuthBoundary } from "../../components/auth-boundary";
import { loadEvents } from "../../lib/phase8-data";
import { loadPhase11Proof } from "../../lib/phase11-data";

export const dynamic = "force-dynamic";
export default async function RouterPage() {
  const [events, proof] = await Promise.all([loadEvents({ state: "released" }), loadPhase11Proof()]); const candidate = events?.find((event) => event.businessEvent) ?? events?.[0];
  return <main className="console-shell operations-console">
    <header className="console-nav"><Link className="brand" href="/"><span className="brand-mark">K</span><span>Kevlar</span></Link><nav className="fleet-nav"><Link href="/router">AI Router</Link><Link href="/events">Events</Link><Link href="/operations">Operations</Link><Link href="/security">Security</Link></nav></header>
    <section className="gauntlet-heading"><div><p>VERIFIED EVENT CONSUMER</p><h1>Web evidence can propose a route. It cannot change one.</h1></div><span className={`state-pill ${candidate ? "verified" : "stale"}`}>{candidate ? "EVENT VERIFIED" : "OFFLINE"}</span></section>
    <section className="metric-grid"><article><span>EVENT STATE</span><strong>{candidate?.state ?? "—"}</strong></article><article><span>EVIDENCE REFS</span><strong>{proof?.routerIngestion.evidenceRefs.length ?? candidate?.evidenceRefs.length ?? 0}</strong></article><article><span>VERIFIED CONSUMER</span><strong>{proof?.verifiedRouterEventOnly ? "PASS" : "—"}</strong></article><article><span>RAW PAGE TRUST</span><strong>{proof?.routerIngestion.rawPageAccepted === false ? "NEVER" : "—"}</strong></article></section>
    <section className="router-flow"><article><span>01 · INPUT</span><h2>{candidate?.eventType ?? "Awaiting released event"}</h2><code>{candidate?.eventId ?? "—"}</code></article><i>→</i><article><span>02 · PROPOSAL</span><h2>Update provider metadata</h2><code>{proof?.routerIngestion.status ?? "awaiting_review"}</code></article><i>→</i><article><span>03 · CONFIG</span><h2>Production router</h2><code>{proof?.routerIngestion.approvedByUserId ? "reviewed application" : "unchanged"}</code></article></section>
    <AuthBoundary label="Router configuration review"><section className="protected-actions"><span>REVIEW REQUIRED</span><strong>Only evidence-backed proposals approved by a human or explicit policy can be applied.</strong></section></AuthBoundary>
  </main>;
}
