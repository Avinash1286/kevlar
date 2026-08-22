// Bright Data Scraper Studio Browser-worker interaction code.
// Paste into the Interaction editor and verify against the live fixture before production save.

function jsonLdOfferPrice(value) {
  let node = value;
  if (typeof node === "string") {
    try {
      node = JSON.parse(node);
    } catch (_) {
      return null;
    }
  }
  if (Array.isArray(node))
    node = node.find((item) => item && item.offers) || node[0];
  return node && node.offers ? Number(node.offers.price) : null;
}

function productApiPrice(value) {
  let node = value;
  if (typeof node === "string") {
    try {
      node = JSON.parse(node);
    } catch (_) {
      return null;
    }
  }
  if (node && typeof node.response_body === "string") {
    try {
      node = JSON.parse(node.response_body);
    } catch (_) {
      return null;
    }
  }
  return node && node.purchase_price
    ? Number(node.purchase_price.amount)
    : null;
}

function fileReference(value) {
  if (typeof value === "string") return value;
  return value && (value.id || value.filename)
    ? String(value.id || value.filename)
    : "";
}

tag_script("jsonld", 'script[type="application/ld+json"]');
tag_script("product_api_evidence", 'script[data-public-api-evidence="true"]');
tag_response("product_api", (req, res) => {
  if (req.url.includes("/api/public-product/nova")) {
    return { response_body: res.body };
  }
});

navigate(input.url, { wait_until: "domcontentloaded", timeout: 30000 });
wait_any([
  '[data-product-page="true"]',
  '[data-page-state="not-found"]',
  '[data-page-state="blocked"]',
]);
wait_page_idle();

if (el_exists('[data-page-state="blocked"]'))
  blocked("Fixture soft-block case");
if (el_exists('[data-page-state="not-found"]'))
  dead_page("Fixture product not found");

wait_for_parser_value("jsonld");
wait_for_parser_value("product_api_evidence");
tag_screenshot("page_screenshot", { filename: "nova_page", full_page: true });
wait_for_parser_value("page_screenshot");

let result = parse();
result.independent_sources = {
  jsonld_price: jsonLdOfferPrice(result.jsonld),
  public_api_price: productApiPrice(
    result.product_api || result.product_api_evidence,
  ),
};
result.evidence.screenshot_ref = fileReference(result.page_screenshot);
collect({
  schema_version: result.schema_version,
  source_url: result.source_url,
  captured_at: result.captured_at,
  page_state: result.page_state,
  product: result.product,
  independent_sources: result.independent_sources,
  evidence: result.evidence,
});
