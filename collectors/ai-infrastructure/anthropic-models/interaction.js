// Bright Data Scraper Studio interaction code.
// The parser extracts source facts; this layer adds the platform SHA-256 digest.

navigate(input.url, { wait_until: "domcontentloaded", timeout: 30000 });

const result = parse();
result.evidence.content_hash =
  "sha256:" + hash(JSON.stringify(result.evidence.contexts), "sha256");
collect(result);
