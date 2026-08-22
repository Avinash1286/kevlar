import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicApiProbe } from "../../product-pricing/nova/public-api-probe";
import { DelayedPrice } from "./delayed-price";

const cases = {
  m1: { id: "M1", name: "Class rename", visibility: "visible" },
  m2: { id: "M2", name: "Wrapper insertion", visibility: "visible" },
  m3: { id: "M3", name: "Section reorder", visibility: "visible" },
  m4: { id: "M4", name: "Financing decoy", visibility: "visible" },
  h1: { id: "H1", name: "Label split", visibility: "held_out" },
  h2: { id: "H2", name: "Delayed rendering", visibility: "held_out" },
} as const;

type CaseKey = keyof typeof cases;

export const metadata: Metadata = {
  title: "Kevlar Core Gauntlet",
  description: "Controlled metamorphic product-page fixtures.",
};

export const dynamic = "force-dynamic";

const fixtureOrigin =
  process.env.FIXTURE_BASE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3001");

function JsonLd({ caseKey }: { caseKey: CaseKey }) {
  const payload = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${fixtureOrigin}/gauntlet/${caseKey}#product`,
    name: "Nova Wireless Headphones",
    sku: "nova-headphones",
    offers: {
      "@type": "Offer",
      price: "129.00",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: `${fixtureOrigin}/gauntlet/${caseKey}`,
    },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(payload).replace(/</g, "\\u003c"),
      }}
    />
  );
}

function PurchaseValue({ caseKey }: { caseKey: CaseKey }) {
  const price =
    caseKey === "h2" ? (
      <DelayedPrice />
    ) : (
      <strong
        aria-label="Purchase price 129 US dollars"
        data-testid="one-time-price"
      >
        $129.00
      </strong>
    );

  if (caseKey === "m2") {
    return (
      <div data-wrapper="outer">
        <div data-wrapper="inner">{price}</div>
      </div>
    );
  }
  return price;
}

function PurchasePanel({ caseKey }: { caseKey: CaseKey }) {
  if (caseKey === "h1") {
    return (
      <section
        className="gauntlet-purchase"
        aria-label="One-time purchase checkout"
      >
        <div data-label-branch="true">
          <h2 id="purchase-heading">Purchase price</h2>
          <p>Pay in full at checkout.</p>
        </div>
        <aside data-value-branch="true">
          <PurchaseValue caseKey={caseKey} />
          <span>USD · one-time</span>
        </aside>
        <button type="button">Buy now →</button>
      </section>
    );
  }
  return (
    <section
      className={caseKey === "m1" ? "g-x91" : "gauntlet-purchase"}
      aria-labelledby="purchase-heading"
    >
      <div>
        <h2 id="purchase-heading">Purchase price</h2>
        <span className={caseKey === "m1" ? "g-x92" : "stock"}>
          In stock · ships tomorrow
        </span>
      </div>
      <div data-price-branch="one-time">
        <PurchaseValue caseKey={caseKey} />
        <span>USD · one-time</span>
      </div>
      <button type="button">Buy now →</button>
    </section>
  );
}

function FinancingPanel({ decoy }: { decoy: boolean }) {
  return (
    <section
      className={decoy ? "gauntlet-financing decoy" : "gauntlet-financing"}
    >
      <div>
        <span>{decoy ? "MOST POPULAR" : "OR PAY MONTHLY"}</span>
        <h2 id="financing-heading">Monthly financing</h2>
      </div>
      <p>
        <strong data-testid="monthly-payment">
          {decoy ? <span data-testid="purchase-price">$10.75</span> : "$10.75"}
        </strong>{" "}
        per month
      </p>
    </section>
  );
}

export default async function GauntletFixture({
  params,
}: {
  params: Promise<{ case: string }>;
}) {
  const requestedCase = (await params).case.toLowerCase();
  if (!(requestedCase in cases)) notFound();
  const caseKey = requestedCase as CaseKey;
  const testCase = cases[caseKey];
  const financeFirst = caseKey === "m3" || caseKey === "m4";

  const publicApiResponse = await fetch(
    new URL("/api/public-product/nova", fixtureOrigin),
    { cache: "no-store" },
  );
  if (!publicApiResponse.ok) {
    throw new Error("Public product evidence endpoint is unavailable");
  }
  const publicApiEvidence: unknown = await publicApiResponse.json();

  return (
    <main
      className={caseKey === "m1" ? "g-x90" : "gauntlet-fixture"}
      data-product-page="true"
      data-gauntlet-case={testCase.id}
      data-gauntlet-visibility={testCase.visibility}
    >
      <JsonLd caseKey={caseKey} />
      <script
        type="application/json"
        data-public-api-evidence="true"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(publicApiEvidence).replace(/</g, "\\u003c"),
        }}
      />
      <header>
        <span>KEVLAR CORE GAUNTLET</span>
        <strong>{testCase.id}</strong>
      </header>
      <article>
        <p>{testCase.visibility === "visible" ? "VISIBLE CASE" : "HELD OUT"}</p>
        <h1>Nova Wireless Headphones</h1>
        {financeFirst ? <FinancingPanel decoy={caseKey === "m4"} /> : null}
        <PurchasePanel caseKey={caseKey} />
        {!financeFirst ? <FinancingPanel decoy={false} /> : null}
        <PublicApiProbe />
      </article>
      <footer>
        {testCase.id} · {testCase.name} · expected purchase price $129.00
      </footer>
    </main>
  );
}
