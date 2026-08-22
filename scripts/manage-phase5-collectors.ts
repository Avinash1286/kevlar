import {
  BrightDataRuntime,
  BrightDataStudioAdmin,
  type WebhookDelivery,
} from "../packages/brightdata-runtime/src/index";

const sourceSpecs = {
  "openai-pricing": {
    name: "kevlar-openai-api-pricing",
    url: "https://openai.com/api/pricing/",
    description:
      "Create a custom scraper with required string input url. From the official page extract pricing records only. Return one object: schema_version='ai-infrastructure.source.v1', source_type='pricing', source_url, captured_at ISO, provider{id:'openai',name:'OpenAI'}, records with kind='pricing' and typed input/output USD prices per million tokens, and evidence{page_heading,contexts,screenshot_ref,content_hash as sha256: plus 64 lowercase hex}. Never infer missing facts.",
  },
  "openai-models": {
    name: "kevlar-openai-model-catalog",
    url: "https://platform.openai.com/docs/models",
    description:
      "Create a single-stage custom scraper with required string input url; do not use next_stage. Return one ai-infrastructure.source.v1 object with source_type=catalog, the input source_url, provider object id=openai/name=OpenAI, canonical model records with typed lifecycle/modalities/token limits/capabilities, and evidence contexts plus real deterministic SHA-256 of JSON.stringify(contexts). Use null/unknown when absent; never infer or use placeholder hashes.",
  },
  "anthropic-release-notes": {
    name: "kevlar-anthropic-release-notes",
    url: "https://docs.anthropic.com/en/release-notes/overview",
    description:
      "Create a custom scraper with required string input url. Extract dated official release-note facts only. Return one object: schema_version='ai-infrastructure.source.v1', source_type='changelog', source_url, captured_at ISO, provider{id:'anthropic',name:'Anthropic'}, notice records with stable id,type,dates,affected_models,summary, plus evidence{page_heading,contexts,screenshot_ref,content_hash as sha256: plus 64 lowercase hex}. Never infer absent dates or models.",
  },
  "anthropic-pricing": {
    name: "kevlar-anthropic-api-pricing",
    url: "https://platform.claude.com/docs/en/about-claude/pricing",
    description:
      "ONE collect() call only. Return ONE envelope, never one row/model or source/model_pricing wrappers: schema_version=ai-infrastructure.source.v1; source_type=pricing; source_url; captured_at; provider anthropic; records array of kind=pricing with unique provider_model_id, display_name, plan, typed USD input_price/output_price per million tokens and region; evidence with page_heading, contexts, screenshot_ref and real sha256: plus 64 hex. First-party model table only; never infer.",
  },
  "anthropic-models": {
    name: "kevlar-anthropic-model-catalog",
    url: "https://platform.claude.com/docs/en/about-claude/models/overview",
    description:
      "ONE collect() call only. Return ONE envelope, never one row/model: schema_version=ai-infrastructure.source.v1; source_type=catalog; source_url; captured_at; provider anthropic; records array of kind=model with unique provider_model_id, display_name, family, lifecycle_status, modalities, nullable context_window_tokens/max_output_tokens, boolean tools/structured_output/vision/audio; evidence with page_heading, contexts, screenshot_ref and real sha256: plus 64 hex. Never infer.",
  },
} as const;

const healingPrompts: Record<SourceKey, string> = {
  "openai-pricing":
    "Make every collected row exactly match ai-infrastructure.source.v1. Keep schema_version, source_type=pricing, source_url, captured_at, provider. Rename the output array to records. Each record must have a unique provider_model_id and use kind=pricing, display_name, plan, input_price and output_price with positive amount, USD, exact million token denominator, original value/unit, and nullable region. Put one top-level evidence object with page_heading, contexts, nullable screenshot_ref, and content_hash equal to the real deterministic SHA-256 of JSON.stringify(contexts), prefixed sha256:. Compute it synchronously in parser JavaScript; never insert a placeholder or random digest. Max 200 records.",
  "openai-models":
    "Emit exact ai-infrastructure.source.v1 rows. Always set source_url to https://platform.openai.com/docs/models and provider to an object with id=openai and name=OpenAI. Each records item must have only kind=model, unique provider_model_id, display_name, family, lifecycle_status, modalities, context_window_tokens, max_output_tokens, and capabilities containing boolean tools, structured_output, vision, audio. Status must be preview, active, deprecated, retired, or unknown. Modalities must be a nonempty subset of text, image, audio, video. Token limits are positive integers or null. evidence has page_heading, contexts, screenshot_ref=null, and content_hash equal to real SHA-256 of JSON.stringify(contexts), prefixed sha256:, computed synchronously in pure JS. Never use placeholder or random hashes.",
  "anthropic-release-notes":
    "Fix only the duplicate notice IDs. Inside nextUl.find('> li').each((idx, li) => ...), set every record notice_id to `${noticeId}-${idx + 1}` instead of noticeId. The first item under august-19-2026 must be august-19-2026-1, the second august-19-2026-2, etc. Preserve the current exact schema, real deterministic SHA-256, evidence, records, values, and max-200 limit. Preview output must show the numeric suffix on every notice_id.",
  "anthropic-pricing":
    "Replace the output with one object containing schema_version, source_type, source_url, captured_at, provider, records, and evidence. Put every first-party model price in records, follow the repository output schema exactly, and compute the full SHA-256 evidence hash. Do not return a row per model or marketplace prices.",
  "anthropic-models":
    "Replace the output with one object containing schema_version, source_type, source_url, captured_at, provider, records, and evidence. Put every model in records, follow the repository output schema exactly, and compute the full SHA-256 evidence hash. Do not return a row per model and do not infer missing facts.",
};

type SourceKey = keyof typeof sourceSpecs;

function usage(): never {
  throw new Error(
    "Usage: manage-phase5-collectors <create|inspect|automate|status|trigger|snapshot|heal|heal-status|heal-approve|heal-reject> <source-key> [collector-id|snapshot-id]",
  );
}

function sourceKey(value: string | undefined): SourceKey {
  if (value && value in sourceSpecs) return value as SourceKey;
  return usage();
}

async function main() {
  const [command, rawSourceKey, collectorId] = process.argv.slice(2);
  const key = sourceKey(rawSourceKey);
  const spec = sourceSpecs[key];
  const apiKey = process.env.BRIGHT_DATA_API_KEY;
  if (!apiKey) throw new Error("BRIGHT_DATA_API_KEY is required");
  const admin = new BrightDataStudioAdmin({ apiKey });

  if (command === "create") {
    const deliver: WebhookDelivery = {
      type: "webhook",
      endpoint: "https://kevlar-web.vercel.app/api/brightdata/phase5",
      flatten_csv: false,
      delivery_type: "deliver_results",
    };
    const created = await admin.createCollector({ name: spec.name, deliver });
    console.log(
      JSON.stringify({ sourceKey: key, collectorId: created.id, created }),
    );
    return;
  }

  if (!collectorId) return usage();
  if (command === "inspect") {
    const collectors = await admin.listCollectors();
    const collector = collectors.data.find((item) => item.id === collectorId);
    if (!collector) throw new Error(`Collector ${collectorId} was not found`);
    console.log(
      JSON.stringify({
        sourceKey: key,
        collectorId,
        name: collector.name,
        active: collector.active,
        lastRun: collector.last_run ?? null,
        hasOutputSchema: collector.output_schema != null,
      }),
    );
    return;
  }
  if (command === "trigger") {
    const runtime = new BrightDataRuntime({ apiKey, collectorId });
    const trigger = await runtime.triggerDevelopment({ url: spec.url });
    console.log(JSON.stringify({ sourceKey: key, collectorId, trigger }));
    return;
  }
  if (command === "heal") {
    const runtime = new BrightDataRuntime({ apiKey, collectorId });
    const response = await runtime.triggerSelfHealing({
      prompt: healingPrompts[key],
      customInput: [{ url: spec.url }],
    });
    console.log(JSON.stringify({ sourceKey: key, collectorId, response }));
    return;
  }
  if (command === "heal-status") {
    const runtime = new BrightDataRuntime({ apiKey, collectorId });
    const progress = await runtime.pollSelfHealing();
    console.log(JSON.stringify({ sourceKey: key, collectorId, progress }));
    return;
  }
  if (command === "heal-approve") {
    const runtime = new BrightDataRuntime({ apiKey, collectorId });
    const response = await runtime.resumeSelfHealing({
      approved: true,
      autoSave: true,
    });
    console.log(JSON.stringify({ sourceKey: key, collectorId, response }));
    return;
  }
  if (command === "heal-reject") {
    const runtime = new BrightDataRuntime({ apiKey, collectorId });
    const response = await runtime.resumeSelfHealing({ approved: false });
    console.log(JSON.stringify({ sourceKey: key, collectorId, response }));
    return;
  }
  if (command === "snapshot") {
    const runtimeCollectorId = process.env.BRIGHT_DATA_COLLECTOR_ID;
    if (!runtimeCollectorId) {
      throw new Error(
        "BRIGHT_DATA_COLLECTOR_ID is required for snapshot polling",
      );
    }
    const runtime = new BrightDataRuntime({
      apiKey,
      collectorId: runtimeCollectorId,
    });
    const snapshot = await runtime.poll(collectorId);
    console.log(
      JSON.stringify({ sourceKey: key, snapshotId: collectorId, snapshot }),
    );
    return;
  }
  if (command === "automate") {
    const response = await admin.automateTemplate(collectorId, spec);
    console.log(JSON.stringify({ sourceKey: key, collectorId, response }));
    return;
  }
  if (command === "status") {
    const progress = await admin.pollAutomation(collectorId);
    console.log(JSON.stringify({ sourceKey: key, collectorId, progress }));
    return;
  }
  return usage();
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
