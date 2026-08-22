import type { Metadata } from "next";
import Link from "next/link";
import { getNovaFixtureState } from "../../../lib/fixture-state";
import { PublicApiProbe } from "./public-api-probe";

export const metadata: Metadata = {
  title: "Nova Wireless Headphones — Fixture V1",
  description:
    "Stable Kevlar product-price fixture with visible, JSON-LD, and public API evidence.",
};

const fixtureOrigin =
  process.env.FIXTURE_BASE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3001");

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  "@id": `${fixtureOrigin}/product-pricing/nova#product`,
  name: "Nova Wireless Headphones",
  sku: "nova-headphones",
  offers: {
    "@type": "Offer",
    price: "129.00",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    url: `${fixtureOrigin}/product-pricing/nova`,
  },
};

export const dynamic = "force-dynamic";

function PurchasePanel({ isV2 }: { isV2: boolean }) {
  return (
    <section className="purchase-panel" aria-labelledby="purchase-heading">
      <div>
        <h2 id="purchase-heading">{isV2 ? "Pay in full" : "Purchase price"}</h2>
        <span className="stock">
          <i /> In stock · ships tomorrow
        </span>
      </div>
      <div className="purchase-value">
        <strong
          data-testid={isV2 ? "one-time-price" : "purchase-price"}
          aria-label="Purchase price 129 US dollars"
        >
          $129.00
        </strong>
        <span>USD · one-time</span>
      </div>
      <button type="button">
        Buy now <span>→</span>
      </button>
    </section>
  );
}

function FinancingPanel({ isV2 }: { isV2: boolean }) {
  return (
    <section
      className={`financing-panel${isV2 ? " financing-prominent" : ""}`}
      aria-labelledby="financing-heading"
    >
      <div>
        <span>{isV2 ? "MOST POPULAR" : "OR PAY MONTHLY"}</span>
        <h2 id="financing-heading">
          {isV2 ? "Monthly financing" : "Split the total over 12 months"}
        </h2>
        {isV2 ? <small>Split the total with no upfront payment</small> : null}
      </div>
      <p>
        <strong data-testid="monthly-payment">
          {isV2 ? <span data-testid="purchase-price">$10.75</span> : "$10.75"}
        </strong>{" "}
        per month
      </p>
    </section>
  );
}

export default async function NovaFixture() {
  const state = await getNovaFixtureState();
  const publicApiResponse = await fetch(
    new URL("/api/public-product/nova", fixtureOrigin),
    { cache: "no-store" },
  );
  if (!publicApiResponse.ok) {
    throw new Error("Public product evidence endpoint is unavailable");
  }
  const publicApiEvidence: unknown = await publicApiResponse.json();
  const isV2 = state.version === "v2";
  return (
    <main
      className={`product-shell fixture-${state.version}`}
      data-product-page="true"
      data-fixture-version={state.version}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <script
        type="application/json"
        data-public-api-evidence="true"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(publicApiEvidence).replace(/</g, "\\u003c"),
        }}
      />
      <header className="store-header">
        <Link className="store-brand" href="/">
          ORBIT / AUDIO
        </Link>
        <nav aria-label="Store navigation">
          <a href="#details">Details</a>
          <a href="#delivery">Delivery</a>
        </nav>
        <span className="edition">NOVA · 01</span>
      </header>

      <section className="product-hero" aria-labelledby="nova-heading">
        <div
          className="product-art"
          role="img"
          aria-label="Graphite Nova wireless over-ear headphones"
        >
          <span className="halo halo-one" />
          <span className="halo halo-two" />
          <div className="headband" />
          <div className="cup cup-left" />
          <div className="cup cup-right" />
          <span className="art-label">GRAPHITE / N-01</span>
        </div>

        <div className="product-copy">
          <span className="kicker">SPATIAL WIRELESS AUDIO</span>
          <h1 id="nova-heading">
            Nova Wireless
            <br />
            Headphones
          </h1>
          <p className="description">
            Forty hours of detailed listening. Machined aluminium, soft memory
            foam, and silence when you need it.
          </p>

          {isV2 ? <FinancingPanel isV2 /> : <PurchasePanel isV2={false} />}
          {isV2 ? <PurchasePanel isV2 /> : <FinancingPanel isV2={false} />}

          <PublicApiProbe />
        </div>
      </section>

      <section className="details" id="details">
        <div>
          <span>01</span>
          <strong>40 hour battery</strong>
          <p>Two working days between charges.</p>
        </div>
        <div>
          <span>02</span>
          <strong>Adaptive silence</strong>
          <p>Noise control tuned to your surroundings.</p>
        </div>
        <div id="delivery">
          <span>03</span>
          <strong>2 year care</strong>
          <p>Repair-first coverage is included.</p>
        </div>
      </section>

      <footer className="fixture-note">
        Controlled public fixture · {state.version.toUpperCase()} · The
        underlying purchase price remains represented through visible text,
        JSON-LD, and a public API.
      </footer>
    </main>
  );
}
