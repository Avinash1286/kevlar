// Bright Data Scraper Studio parser code for the official Claude pricing page.

function clean(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function amount(value) {
  const match = clean(value)
    .replace(/,/g, "")
    .match(/\$\s*(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function sourceKey(displayName) {
  return clean(displayName)
    .replace(/\s*\([^)]*\)\s*$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

let pricingTable = null;
$("table").each((_, table) => {
  if (pricingTable) return;
  const heading = $(table).find("thead").text_sane().toLowerCase();
  if (
    heading.includes("base input tokens") &&
    heading.includes("output tokens")
  ) {
    pricingTable = table;
  }
});

const records = [];
const contexts = [];
if (pricingTable) {
  $(pricingTable)
    .find("tbody tr")
    .each((_, row) => {
      const cells = $(row).find("td").toArray();
      if (cells.length < 6) return;
      const displayName = clean($(cells[0]).text_sane());
      const inputText = clean($(cells[1]).text_sane());
      const outputText = clean($(cells[5]).text_sane());
      const inputAmount = amount(inputText);
      const outputAmount = amount(outputText);
      if (
        !/^Claude\s/i.test(displayName) ||
        !(inputAmount > 0) ||
        !(outputAmount > 0)
      ) {
        return;
      }
      records.push({
        kind: "pricing",
        provider_model_id: sourceKey(displayName),
        display_name: displayName,
        plan: "standard",
        input_price: {
          amount: inputAmount,
          currency: "USD",
          denominator: "million_input_tokens",
          original: { value: inputText, unit: "MTok" },
        },
        output_price: {
          amount: outputAmount,
          currency: "USD",
          denominator: "million_output_tokens",
          original: { value: outputText, unit: "MTok" },
        },
        region: null,
      });
      contexts.push(
        `${displayName} Base Input Tokens ${inputText} Output Tokens ${outputText}`,
      );
    });
}

if (records.length === 0) {
  throw new Error("Official model pricing table was not found");
}

return {
  schema_version: "ai-infrastructure.source.v1",
  source_type: "pricing",
  source_url: String(input.url),
  captured_at: new Date().toISOString(),
  provider: { id: "anthropic", name: "Anthropic" },
  records,
  evidence: {
    page_heading: $("h1").first().text_sane(),
    contexts,
    screenshot_ref: null,
    content_hash: "",
  },
};
