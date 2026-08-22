// Bright Data Scraper Studio Browser-worker interaction code.
// Paste into the Interaction editor and verify against the live fixture before production save.

tag_script("jsonld", 'script[type="application/ld+json"]');
tag_response("product_api", /\/api\/public-product\/nova/);

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
wait_for_parser_value("product_api");
tag_screenshot("page_screenshot", { filename: "nova_page", full_page: true });
wait_for_parser_value("page_screenshot");

let result = parse();
collect({
  schema_version: result.schema_version,
  source_url: result.source_url,
  captured_at: result.captured_at,
  page_state: result.page_state,
  product: result.product,
  independent_sources: result.independent_sources,
  evidence: result.evidence,
});
