// Bright Data Scraper Studio parser code for the official Claude model overview.

function clean(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  const text = clean(value).toLowerCase().replace(/,/g, "");
  const match = text.match(/(\d+(?:\.\d+)?)\s*([km])?/);
  if (!match) return null;
  const multiplier = match[2] === "m" ? 1000000 : match[2] === "k" ? 1000 : 1;
  const parsed = Number(match[1]) * multiplier;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function family(modelId) {
  return clean(modelId).replace(/-\d(?:.*)?$/, "") || "claude";
}

let comparisonTable = null;
$("table").each((_, table) => {
  if (comparisonTable) return;
  const text = $(table).text_sane().toLowerCase();
  if (
    text.includes("claude api id") &&
    text.includes("context window") &&
    text.includes("max output")
  ) {
    comparisonTable = table;
  }
});

if (!comparisonTable) {
  throw new Error("Official model comparison table was not found");
}

const table = $(comparisonTable);
const headers = table.find("thead tr").first().find("th").toArray();
const pageText = $("body").text_sane();
const pageClaim = clean(
  $("p")
    .filter((_, paragraph) =>
      /all current claude models support text and image input/i.test(
        $(paragraph).text_sane(),
      ),
    )
    .first()
    .text_sane(),
);

function valueAt(label, column) {
  let value = "";
  table.find("tbody tr").each((_, row) => {
    if (value) return;
    const cells = $(row).find("td").toArray();
    if (cells.length <= column) return;
    if (clean($(cells[0]).text_sane()).toLowerCase().includes(label)) {
      value = clean($(cells[column]).text_sane());
    }
  });
  return value;
}

const records = [];
const contexts = [];
for (let column = 1; column < headers.length; column += 1) {
  const displayName = clean($(headers[column]).text_sane());
  const modelId = valueAt("claude api id", column);
  if (!displayName || !modelId || !/^claude-/i.test(modelId)) continue;
  const contextText = valueAt("context window", column);
  const outputText = valueAt("max output", column);
  const lifecycleStatus = /limited|preview/i.test(displayName)
    ? "preview"
    : "active";
  records.push({
    kind: "model",
    provider_model_id: modelId,
    display_name: displayName,
    family: family(modelId),
    lifecycle_status: lifecycleStatus,
    modalities: ["text", "image"],
    context_window_tokens: tokens(contextText),
    max_output_tokens: tokens(outputText),
    capabilities: {
      tools: /tool use/i.test(pageText),
      structured_output: /structured output/i.test(pageText),
      vision: true,
      audio: false,
    },
  });
  contexts.push(
    clean(
      `${displayName} ${modelId} Context window ${contextText} Max output ${outputText} ${pageClaim}`,
    ),
  );
}

if (records.length === 0) {
  throw new Error("No official Claude model IDs were found");
}

return {
  schema_version: "ai-infrastructure.source.v1",
  source_type: "catalog",
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
