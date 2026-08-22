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

tag_screenshot("page_screenshot", { filename: "nova-page", full_page: true });
collect(parse());
