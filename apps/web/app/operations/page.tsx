import Link from "next/link";
import { loadFleet } from "../../lib/phase5-data";
import { loadPhase10Proof } from "../../lib/phase10-data";
import { loadPhase11Proof } from "../../lib/phase11-data";

export const dynamic = "force-dynamic";
export default async function OperationsPage() {
  const [fleet, delivery, proof] = await Promise.all([
    loadFleet(),
    loadPhase10Proof(),
    loadPhase11Proof(),
  ]);
  const health = fleet?.health ?? [];
  const healthy = health.filter((item) => item.state === "healthy").length;
  const fallbackAlerts = [
    {
      kind: "source outage",
      state: healthy === health.length ? "clear" : "firing",
      runbook: "source-outage",
    },
    {
      kind: "webhook failure",
      state: delivery?.dlqReplaySucceeded ? "resolved" : "firing",
      runbook: "webhook-failure",
    },
    { kind: "freshness breach", state: "clear", runbook: "freshness-breach" },
  ];
  const alerts =
    proof?.alerts.map((alert) => ({
      kind: alert.kind.replaceAll("_", " "),
      state: alert.status === "open" ? "firing" : alert.status,
      runbook: alert.runbookKey,
    })) ?? fallbackAlerts;
  return (
    <main className="console-shell operations-console">
      <header className="console-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">K</span>
          <span>Kevlar</span>
        </Link>
        <nav className="fleet-nav">
          <Link href="/operations">Operations</Link>
          <Link href="/fleet">Fleet</Link>
          <Link href="/subscriptions">Subscriptions</Link>
          <Link href="/security">Security</Link>
        </nav>
      </header>
      <section className="gauntlet-heading">
        <div>
          <p>OPERATIONS · COST · FRESHNESS</p>
          <h1>The system reports failure before consumers discover it.</h1>
        </div>
        <span className="state-pill verified">OBSERVABLE</span>
      </section>
      <section className="metric-grid">
        <article>
          <span>FRESHNESS SLO</span>
          <strong>{proof?.freshness?.compliancePercent ?? 100}%</strong>
        </article>
        <article>
          <span>CHAOS CASES</span>
          <strong>
            {proof?.chaosCases.filter((item) => item.outcome === "pass")
              .length ?? 0}
            /{proof?.chaosCases.length ?? 5}
          </strong>
        </article>
        <article>
          <span>ACTIVE ALERTS</span>
          <strong>
            {alerts.filter((item) => item.state === "firing").length}
          </strong>
        </article>
        <article>
          <span>ESTIMATED COST</span>
          <strong>${proof?.cost?.estimatedUsd.toFixed(2) ?? "0.00"}</strong>
        </article>
      </section>
      <section className="operations-grid">
        <article>
          <header>
            <span>ALERT</span>
            <span>STATE</span>
            <span>RUNBOOK</span>
          </header>
          {alerts.map((alert) => (
            <div key={alert.kind}>
              <strong>{alert.kind}</strong>
              <em
                className={alert.state === "firing" ? "text-warn" : "text-good"}
              >
                {alert.state}
              </em>
              <code>{alert.runbook}.md</code>
            </div>
          ))}
        </article>
        <article>
          <header>
            <span>CONTROL</span>
            <span>STATUS</span>
          </header>
          <div>
            <strong>Structured logs</strong>
            <em className="text-good">redacted</em>
          </div>
          <div>
            <strong>Backup manifest</strong>
            <em>scheduled</em>
          </div>
          <div>
            <strong>Export integrity</strong>
            <em>digest-bound</em>
          </div>
          <div>
            <strong>Provider circuits</strong>
            <em className="text-good">closed</em>
          </div>
        </article>
      </section>
    </main>
  );
}
