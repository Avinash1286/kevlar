import Link from "next/link";
import { AuthBoundary } from "../../components/auth-boundary";
import { loadPhase10Proof } from "../../lib/phase10-data";

export const dynamic = "force-dynamic";
export default async function SubscriptionsPage() {
  const data = await loadPhase10Proof(); const subscription = data?.subscription; const endpoint = data?.endpoint;
  return <main className="console-shell operations-console">
    <header className="console-nav"><Link className="brand" href="/"><span className="brand-mark">K</span><span>Kevlar</span></Link><nav className="fleet-nav"><Link href="/subscriptions">Subscriptions</Link><Link href="/developers">Developers</Link><Link href="/operations">Operations</Link></nav></header>
    <section className="gauntlet-heading"><div><p>FILTERED DELIVERY · SIGNED WEBHOOKS</p><h1>Ship the change once. Keep the proof forever.</h1></div><span className={`state-pill ${subscription ? "verified" : "stale"}`}>{subscription?.status ?? "OFFLINE"}</span></section>
    <section className="metric-grid"><article><span>ACTIVE SUBSCRIPTIONS</span><strong>{subscription?.status === "active" ? 1 : 0}</strong></article><article><span>SECRET VERSIONS</span><strong>{data?.secretVersions.length ?? 0}</strong></article><article><span>DLQ REPLAY</span><strong>{data?.dlqReplaySucceeded ? "PASS" : "—"}</strong></article><article><span>DUPLICATE SAFETY</span><strong>{data?.duplicateSafe ? "PASS" : "—"}</strong></article></section>
    <section className="subscription-card"><header><div><span>{subscription?.status ?? "pending"}</span><h2>{subscription?.name ?? "No subscription"}</h2></div><code>{String(subscription?._id ?? "not-deployed")}</code></header><dl><div><dt>Endpoint</dt><dd>{endpoint?.url ?? "—"}</dd></div><div><dt>Event types</dt><dd>{subscription?.filters.eventTypes.join(", ") || "all released events"}</dd></div><div><dt>Source delivery</dt><dd>{data?.sourceDelivery.status ?? "—"}</dd></div><div><dt>Replay delivery</dt><dd>{data?.replayDelivery.status ?? "—"}</dd></div><div><dt>HMAC input</dt><dd>{data?.hmacVerificationInputValid ? "verified" : "—"}</dd></div></dl></section>
    <AuthBoundary label="Subscription and replay controls"><section className="protected-actions"><span>WRITE SCOPES REQUIRED</span><strong>subscriptions:write · webhooks:write · tenant membership</strong></section></AuthBoundary>
  </main>;
}
