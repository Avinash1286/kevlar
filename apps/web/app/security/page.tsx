import Link from "next/link";
import { AuthBoundary } from "../../components/auth-boundary";
import { loadPhase11Proof } from "../../lib/phase11-data";

const roles = [
  ["Viewer", "Read released facts, evidence, health, and audit summaries"],
  ["Operator", "Run approved sources and replay dead-letter deliveries"],
  ["Reviewer", "Resolve conflicts and review repair/router proposals"],
  ["Admin", "Manage members, API keys, source policy, and organization settings"],
] as const;

export const dynamic = "force-dynamic";
export default async function SecurityPage() {
  const proof = await loadPhase11Proof();
  return <main className="console-shell operations-console">
    <header className="console-nav"><Link className="brand" href="/"><span className="brand-mark">K</span><span>Kevlar</span></Link><nav className="fleet-nav"><Link href="/operations">Operations</Link><Link href="/router">AI Router</Link><Link href="/developers">Developers</Link><Link href="/security">Security</Link></nav></header>
    <section className="gauntlet-heading"><div><p>ZERO-TRUST OPERATOR PLANE</p><h1>Identity chooses the tenant. Policy chooses the action.</h1></div><span className="state-pill verified">DENY BY DEFAULT</span></section>
    <section className="metric-grid"><article><span>IDENTITY SOURCE</span><strong>Server</strong></article><article><span>TENANT ISOLATION</span><strong>{proof?.tenantIsolationPassed ? "PASS" : "—"}</strong></article><article><span>SECRET REDACTION</span><strong>{proof?.secretRedactionPassed ? "PASS" : "—"}</strong></article><article><span>PROMPT INJECTION</span><strong>{proof?.promptInjectionBlocked ? "BLOCKED" : "—"}</strong></article></section>
    <section className="rbac-grid">{roles.map(([role, detail]) => <article key={role}><span>{role.toUpperCase()}</span><h2>{role}</h2><p>{detail}</p></article>)}</section>
    <section className="security-policies"><article><span>SSRF BOUNDARY</span><h2>HTTPS + approved public hosts</h2><p>Credentials, loopback, link-local, private IPs, and unsafe redirects are rejected.</p></article><article><span>PROMPT BOUNDARY</span><h2>Evidence cannot become instruction</h2><p>Page text is compacted, delimited, and prohibited from authorizing releases or repairs.</p></article><article><span>LOG BOUNDARY</span><h2>Recursive secret redaction</h2><p>Keys, tokens, cookies, passwords, and private key material are removed before persistence.</p></article></section>
    <AuthBoundary label="Protected decisions"><section className="protected-actions"><span>SESSION AUTHORIZED</span><strong>Repair approval · Source approval · Entity merge · Conflict resolution · API keys</strong></section></AuthBoundary>
  </main>;
}
