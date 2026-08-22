// Bright Data Scraper Studio parser code. The interaction layer calls parse().

function amount(text) {
  let match = String(text || "")
    .replace(/,/g, "")
    .match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

let purchase = $('[data-testid="purchase-price"]');
let monthly = $('[data-testid="monthly-payment"]');
let purchasePanel = purchase.closest("section");

return {
  schema_version: "1.0",
  source_url: String(location.href),
  captured_at: new Date().toISOString(),
  page_state: "ok",
  product: {
    id: "nova-headphones",
    title: $("h1").text_sane(),
    purchase_price: {
      amount: amount(purchase.text()),
      currency: "USD",
      raw_text: purchase.text_sane(),
      label: $("#purchase-heading").text_sane(),
      nearby_text: purchasePanel.text_sane(),
    },
    monthly_payment: {
      amount: amount(monthly.text()),
      currency: "USD",
      period: "month",
      raw_text: monthly.closest("p").text_sane(),
    },
    availability: $(".stock").text_sane().toLowerCase().includes("in stock")
      ? "in_stock"
      : "unavailable",
  },
  independent_sources: {
    jsonld_price: null,
    public_api_price: null,
  },
  evidence: {
    page_heading: $("h1").text_sane(),
    purchase_context: purchasePanel.text_sane(),
    screenshot_ref: "",
  },
  jsonld: parser.jsonld,
  product_api: parser.product_api,
  product_api_evidence: parser.product_api_evidence,
  page_screenshot: parser.page_screenshot,
};
