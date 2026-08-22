export const novaBaseline = {
  schema_version: "1.0",
  source_url: "http://localhost:3001/product-pricing/nova",
  captured_at: "2026-08-22T00:00:00.000Z",
  page_state: "ok",
  product: {
    id: "nova-headphones",
    title: "Nova Wireless Headphones",
    purchase_price: {
      amount: 129,
      currency: "USD",
      raw_text: "$129.00",
      label: "Purchase price",
      nearby_text: "Purchase price $129.00 USD one-time Buy now",
    },
    monthly_payment: {
      amount: 10.75,
      currency: "USD",
      period: "month",
      raw_text: "$10.75 per month",
    },
    availability: "in_stock",
  },
  independent_sources: { jsonld_price: 129, public_api_price: 129 },
  evidence: {
    page_heading: "Nova Wireless Headphones",
    purchase_context: "Purchase price $129.00 USD one-time Buy now",
    screenshot_ref: "pending-live-collector-run",
  },
} as const;

export const novaSemanticSwap = {
  ...novaBaseline,
  captured_at: "2026-08-22T01:00:00.000Z",
  product: {
    ...novaBaseline.product,
    purchase_price: {
      amount: 10.75,
      currency: "USD",
      raw_text: "$10.75",
      label: "Monthly financing",
      nearby_text: "Monthly financing Split the total $10.75 per month",
    },
  },
} as const;
