import { sha256 } from "@kevlar/hashing";
import { z } from "zod";

export * from "../schema/compatibility";
export * from "../schema/registry";
export * from "../mappings/engine";
export * from "../mappings/specs";
export * from "../identity/index";
export * from "../history/index";
export * from "../events/index";
export * from "../fleet/index";
export * from "./units";

export const AI_INFRASTRUCTURE_SCHEMA_REVISION = 1 as const;
export const AI_INFRASTRUCTURE_SOURCE_SCHEMA_VERSION =
  "ai-infrastructure.source.v1" as const;

export const canonicalEntityTypeSchema = z.enum([
  "provider",
  "model",
  "endpoint",
  "pricing_plan",
  "region",
  "capability",
  "limit",
  "deprecation_notice",
]);

export const sourceTypeSchema = z.enum([
  "pricing",
  "catalog",
  "documentation",
  "changelog",
]);

export const tokenPriceSchema = z.object({
  amount: z.number().positive(),
  currency: z.literal("USD"),
  denominator: z.enum(["million_input_tokens", "million_output_tokens"]),
  original: z.object({
    value: z.string().min(1),
    unit: z.string().min(1),
  }),
});

export const rateLimitSchema = z.object({
  amount: z.number().positive(),
  period: z.enum(["minute", "day"]),
  dimension: z.enum(["requests", "tokens"]),
  scope: z.enum(["account", "project", "model", "unknown"]),
  original: z.object({
    value: z.string().min(1),
    unit: z.string().min(1),
  }),
});

export const pricingRecordSchema = z.object({
  kind: z.literal("pricing"),
  provider_model_id: z.string().min(1),
  display_name: z.string().min(1),
  plan: z.string().min(1).default("standard"),
  input_price: tokenPriceSchema.extend({
    denominator: z.literal("million_input_tokens"),
  }),
  output_price: tokenPriceSchema.extend({
    denominator: z.literal("million_output_tokens"),
  }),
  region: z.string().min(1).nullable().default(null),
});

export const catalogRecordSchema = z.object({
  kind: z.literal("model"),
  provider_model_id: z.string().min(1),
  display_name: z.string().min(1),
  family: z.string().min(1),
  lifecycle_status: z.enum([
    "preview",
    "active",
    "deprecated",
    "retired",
    "unknown",
  ]),
  modalities: z.array(z.enum(["text", "image", "audio", "video"])).min(1),
  context_window_tokens: z.number().int().positive().nullable().default(null),
  max_output_tokens: z.number().int().positive().nullable().default(null),
  capabilities: z.object({
    tools: z.boolean(),
    structured_output: z.boolean(),
    vision: z.boolean(),
    audio: z.boolean(),
  }),
});

export const noticeRecordSchema = z.object({
  kind: z.literal("notice"),
  notice_id: z.string().min(1),
  title: z.string().min(1),
  notice_type: z.enum([
    "launch",
    "update",
    "migration",
    "deprecation",
    "retirement",
  ]),
  published_at: z.iso.datetime().nullable().default(null),
  effective_at: z.iso.datetime().nullable().default(null),
  affected_models: z.array(z.string().min(1)),
  summary: z.string().min(1),
});

export const aiInfrastructureRecordSchema = z.discriminatedUnion("kind", [
  pricingRecordSchema,
  catalogRecordSchema,
  noticeRecordSchema,
]);

export const sourceEvidenceSchema = z.object({
  page_heading: z.string().min(1),
  contexts: z.array(z.string().min(1)).min(1),
  screenshot_ref: z.string().min(1).nullable().default(null),
  content_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
});

export const aiInfrastructureSourceObservationSchema = z.object({
  schema_version: z.literal(AI_INFRASTRUCTURE_SOURCE_SCHEMA_VERSION),
  source_type: sourceTypeSchema,
  source_url: z.url(),
  captured_at: z.iso.datetime(),
  provider: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
  }),
  records: z.array(aiInfrastructureRecordSchema).min(1).max(200),
  evidence: sourceEvidenceSchema,
});

export type AiInfrastructureSourceObservation = z.infer<
  typeof aiInfrastructureSourceObservationSchema
>;

export const OFFICIAL_SOURCE_POLICIES = {
  pricing: [
    { host: "openai.com", pathPrefix: "/api/pricing" },
    { host: "docs.anthropic.com", pathPrefix: "/en/docs/about-claude/pricing" },
    {
      host: "platform.claude.com",
      pathPrefix: "/docs/en/about-claude/pricing",
    },
  ],
  catalog: [
    { host: "platform.openai.com", pathPrefix: "/docs/models" },
    { host: "docs.anthropic.com", pathPrefix: "/en/docs/about-claude/models" },
    {
      host: "platform.claude.com",
      pathPrefix: "/docs/en/about-claude/models",
    },
  ],
  documentation: [
    { host: "platform.openai.com", pathPrefix: "/docs" },
    { host: "docs.anthropic.com", pathPrefix: "/en/docs" },
  ],
  changelog: [
    { host: "platform.openai.com", pathPrefix: "/docs/changelog" },
    { host: "docs.anthropic.com", pathPrefix: "/en/release-notes" },
  ],
} as const;

export type AiInfrastructureViolation = {
  code:
    | "schema_invalid"
    | "source_policy_mismatch"
    | "record_type_mismatch"
    | "duplicate_source_key"
    | "evidence_hash_mismatch";
  severity: "critical";
  message: string;
};

function sourcePolicyMatches(observation: AiInfrastructureSourceObservation) {
  const url = new URL(observation.source_url);
  return OFFICIAL_SOURCE_POLICIES[observation.source_type].some(
    (policy) =>
      url.hostname === policy.host &&
      url.pathname.startsWith(policy.pathPrefix),
  );
}

function recordMatchesSource(
  sourceType: AiInfrastructureSourceObservation["source_type"],
  record: AiInfrastructureSourceObservation["records"][number],
) {
  if (sourceType === "pricing") return record.kind === "pricing";
  if (sourceType === "catalog") return record.kind === "model";
  return record.kind === "notice";
}

export function verifyAiInfrastructureObservation(raw: unknown) {
  const parsed = aiInfrastructureSourceObservationSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      decision: "invalid" as const,
      normalized: null,
      evidenceHash: sha256(raw),
      violations: [
        {
          code: "schema_invalid" as const,
          severity: "critical" as const,
          message: "Source output failed AI-infrastructure schema revision 1.",
        },
      ],
    };
  }

  const violations: AiInfrastructureViolation[] = [];
  if (!sourcePolicyMatches(parsed.data))
    violations.push({
      code: "source_policy_mismatch",
      severity: "critical",
      message: "Source URL is outside the approved official host/path policy.",
    });
  if (
    parsed.data.records.some(
      (record) => !recordMatchesSource(parsed.data.source_type, record),
    )
  )
    violations.push({
      code: "record_type_mismatch",
      severity: "critical",
      message: "Record kinds do not match the source archetype.",
    });

  const keys = parsed.data.records.map((record) =>
    record.kind === "pricing" || record.kind === "model"
      ? `${record.kind}:${record.provider_model_id}`
      : `${record.kind}:${record.notice_id}`,
  );
  if (new Set(keys).size !== keys.length)
    violations.push({
      code: "duplicate_source_key",
      severity: "critical",
      message: "A collector output contains duplicate source entity keys.",
    });

  const computedContentHash = sha256(parsed.data.evidence.contexts);
  if (parsed.data.evidence.content_hash !== computedContentHash)
    violations.push({
      code: "evidence_hash_mismatch",
      severity: "critical",
      message:
        "Evidence content_hash does not match the canonical SHA-256 of contexts.",
    });

  return {
    decision:
      violations.length === 0
        ? ("verified" as const)
        : ("quarantined" as const),
    normalized: parsed.data,
    evidenceHash: sha256(parsed.data),
    violations,
  };
}

export const canonicalFieldRegistry = {
  "provider.status": { entity: "provider", unit: "status" },
  "provider.api_base_url": { entity: "provider", unit: "url" },
  "model.provider_id": { entity: "model", unit: "identifier" },
  "model.provider_model_id": { entity: "model", unit: "identifier" },
  "model.display_name": { entity: "model", unit: "text" },
  "model.family": { entity: "model", unit: "identifier" },
  "model.status": { entity: "model", unit: "status" },
  "model.context_window_tokens": { entity: "model", unit: "tokens" },
  "model.max_output_tokens": { entity: "model", unit: "tokens" },
  "model.pricing_plan": { entity: "pricing_plan", unit: "identifier" },
  "model.input_price_usd_per_million_tokens": {
    entity: "pricing_plan",
    unit: "usd_per_million_input_tokens",
  },
  "model.output_price_usd_per_million_tokens": {
    entity: "pricing_plan",
    unit: "usd_per_million_output_tokens",
  },
  "model.supports_tools": { entity: "capability", unit: "boolean" },
  "model.supports_structured_output": {
    entity: "capability",
    unit: "boolean",
  },
  "notice.deprecation_date": {
    entity: "deprecation_notice",
    unit: "iso_datetime",
  },
} as const;
