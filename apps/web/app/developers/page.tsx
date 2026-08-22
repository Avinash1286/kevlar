import Link from "next/link";

const apiBase = "/api/v1";

const curlExample = `curl "https://kevlar-web.vercel.app${apiBase}/facts?entity_id=qs79dceshc71enmf9q6pr6r1q18cyeqb" \\
  -H "Authorization: Bearer kv_live_..."`;

const sdkExample = `import { KevlarClient } from "@kevlar/sdk";

const kevlar = new KevlarClient({
  baseUrl: "https://kevlar-web.vercel.app/api",
  apiKey: process.env.KEVLAR_API_KEY!,
});

const page = await kevlar.currentFacts("qs79dceshc71enmf9q6pr6r1q18cyeqb");`;

const webhookExample = `verifyWebhook({
  payload: rawRequestBody,
  secret: process.env.KEVLAR_WEBHOOK_SECRET!,
  signature: request.headers.get("kevlar-signature")!,
});`;

export default function DevelopersPage() {
  return (
    <main className="console-shell">
      <header className="console-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">K</span>
          <span>Kevlar</span>
        </Link>
        <nav className="fleet-nav">
          <Link href="/entities">Entities</Link>
          <Link href="/events">Events</Link>
          <Link href="/evidence">Evidence</Link>
          <Link href="/developers">Developers</Link>
        </nav>
      </header>

      <section className="gauntlet-heading developer-hero">
        <div>
          <p>DEVELOPER PLANE · API VERSION V1</p>
          <h1>Released intelligence, with its proof attached.</h1>
          <span>
            REST, signed webhooks, TypeScript, and read-only MCP share one trust
            contract.
          </span>
        </div>
        <span className="state-pill verified">LIVE CONTRACT</span>
      </section>

      <section className="metric-grid developer-metrics">
        <article>
          <span>API VERSION</span>
          <strong>v1</strong>
        </article>
        <article>
          <span>AUTH</span>
          <strong>Bearer</strong>
        </article>
        <article>
          <span>MAX PAGE</span>
          <strong>50</strong>
        </article>
        <article>
          <span>MCP POLICY</span>
          <strong>Read only</strong>
        </article>
      </section>

      <section className="developer-grid">
        <article>
          <header>
            <span>01 · REST QUICK START</span>
            <b>facts:read</b>
          </header>
          <h2>Fetch verified current facts</h2>
          <p>
            API keys are shown once. Kevlar stores only a SHA-256 hash and
            visible prefix.
          </p>
          <pre>
            <code>{curlExample}</code>
          </pre>
        </article>
        <article>
          <header>
            <span>02 · TYPESCRIPT SDK</span>
            <b>@kevlar/sdk</b>
          </header>
          <h2>Parse the exact public schema</h2>
          <p>
            The SDK validates every response against the same Zod contract used
            by the API.
          </p>
          <pre>
            <code>{sdkExample}</code>
          </pre>
        </article>
        <article>
          <header>
            <span>03 · SIGNED WEBHOOKS</span>
            <b>HMAC-SHA256</b>
          </header>
          <h2>Verify the raw request body</h2>
          <p>
            Reject stale timestamps, deduplicate event IDs, and process
            corrections idempotently.
          </p>
          <pre>
            <code>{webhookExample}</code>
          </pre>
        </article>
        <article>
          <header>
            <span>04 · MCP</span>
            <b>Evidence required</b>
          </header>
          <h2>Ground agents in released facts</h2>
          <p>
            Tools cannot scrape arbitrary pages, reveal secrets, approve
            repairs, or bypass release policy.
          </p>
          <pre>
            <code>{`kevlar_current_facts({ entity_id: "..." })\nkevlar_fact_history({ entity_id: "...", predicate: "..." })`}</code>
          </pre>
        </article>
      </section>

      <section className="developer-policy">
        <div>
          <span>TRUST FIELDS ON EVERY FACT</span>
          <h2>State · freshness · sources · evidence · certificate</h2>
        </div>
        <p>
          Quarantined candidates are never returned as normal current facts.
          Last-known-good and stale results keep their labels.
        </p>
      </section>
    </main>
  );
}
