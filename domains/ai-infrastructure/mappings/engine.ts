import { sha256 } from "@kevlar/hashing";
import { z } from "zod";
import {
  aiInfrastructureSourceObservationSchema,
  type AiInfrastructureSourceObservation,
} from "../src/index";
import {
  durationToMilliseconds,
  normalizeUsdPerMillionTokens,
  parseMagnitude,
} from "../src/units";

export const safeTransformSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("rename") }),
  z.object({ name: z.literal("trim") }),
  z.object({ name: z.literal("normalize_whitespace") }),
  z.object({
    name: z.literal("normalize_case"),
    mode: z.enum(["lower", "upper"]),
  }),
  z.object({ name: z.literal("normalize_identifier") }),
  z.object({
    name: z.literal("parse_number"),
    magnitude: z.boolean().default(false),
  }),
  z.object({ name: z.literal("parse_date"), timezone: z.literal("UTC") }),
  z.object({ name: z.literal("normalize_boolean") }),
  z.object({ name: z.literal("normalize_url") }),
  z.object({
    name: z.literal("normalize_list"),
    deduplicate: z.boolean().default(true),
  }),
  z.object({
    name: z.literal("unit_convert"),
    conversion: z.enum([
      "usd_per_token_to_million",
      "usd_per_thousand_tokens_to_million",
      "duration_to_milliseconds",
      "token_magnitude_to_tokens",
    ]),
  }),
  z.object({
    name: z.literal("enum_map"),
    values: z.record(z.string(), z.string()),
    fallback: z.string().optional(),
  }),
  z.object({
    name: z.literal("split"),
    separator: z.string(),
    index: z.number().int().nonnegative(),
  }),
  z.object({ name: z.literal("combine"), separator: z.string() }),
  z.object({ name: z.literal("default"), value: z.unknown() }),
]);

export type SafeTransform = z.infer<typeof safeTransformSchema>;

export const mappingFieldRuleSchema = z.object({
  target: z.string().min(1),
  source: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  transforms: z.array(safeTransformSchema).default([]),
  required: z.boolean().default(true),
  evidencePaths: z.array(z.string().min(1)).min(1),
});

export const deterministicMappingSpecSchema = z.object({
  mappingId: z.string().min(1),
  revision: z.number().int().positive(),
  status: z.enum(["draft", "shadow", "canary", "active", "rolled_back"]),
  sourceSchema: z.string().min(1),
  sourceType: z.enum(["pricing", "catalog", "documentation", "changelog"]),
  canonicalSchema: z.string().min(1),
  canonicalSchemaRevision: z.number().int().positive(),
  entityType: z.string().min(1),
  sourceKey: z.string().min(1),
  canonicalKey: z.array(z.string().min(1)).min(1),
  fields: z.array(mappingFieldRuleSchema).min(1),
  generatedCode: z.never().optional(),
});

export type DeterministicMappingSpec = z.infer<
  typeof deterministicMappingSpecSchema
>;

export type MappingTransformEvidence = {
  name: SafeTransform["name"];
  version: "1.0.0";
  input: unknown;
  output: unknown;
};

export type CanonicalFieldEvidence = {
  canonicalField: string;
  value: unknown;
  transformations: MappingTransformEvidence[];
  sourceFields: string[];
  evidenceRefs: string[];
  rawSourceHash: string;
};

export type CanonicalMappedObservation = {
  mappingId: string;
  mappingRevision: number;
  canonicalSchemaRevision: number;
  entityType: string;
  sourceEntityKey: string;
  canonicalEntityKey: string;
  sourceUrl: string;
  sourceType: AiInfrastructureSourceObservation["source_type"];
  observedAt: number;
  fields: Record<string, unknown>;
  fieldEvidence: CanonicalFieldEvidence[];
  evidenceHash: string;
  outputHash: string;
};

function objectAt(value: unknown, path: string): unknown {
  return path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((current, segment) => {
      if (
        current === null ||
        current === undefined ||
        typeof current !== "object"
      )
        return undefined;
      return (current as Record<string, unknown>)[segment];
    }, value);
}

function sourceValue(
  observation: AiInfrastructureSourceObservation,
  record: AiInfrastructureSourceObservation["records"][number],
  path: string,
) {
  if (path.startsWith("$observation."))
    return objectAt(observation, path.slice(13));
  if (path === "$observation") return observation;
  return objectAt(record, path);
}

function normalizedBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "yes", "1", "supported"].includes(normalized)) return true;
  if (["false", "no", "0", "unsupported"].includes(normalized)) return false;
  throw new Error(`Cannot normalize boolean: ${String(value)}`);
}

function applyTransform(value: unknown, transform: SafeTransform): unknown {
  switch (transform.name) {
    case "rename":
      return value;
    case "trim":
      return typeof value === "string" ? value.trim() : value;
    case "normalize_whitespace":
      return typeof value === "string"
        ? value.replace(/\s+/g, " ").trim()
        : value;
    case "normalize_case":
      return transform.mode === "lower"
        ? String(value).toLowerCase()
        : String(value).toUpperCase();
    case "normalize_identifier":
      return String(value)
        .normalize("NFKC")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "");
    case "parse_number": {
      if (typeof value === "number") return value;
      return transform.magnitude
        ? parseMagnitude(String(value))
        : Number(
            String(value)
              .replaceAll(",", "")
              .replace(/[^0-9.+-]/g, ""),
          );
    }
    case "parse_date": {
      const timestamp = Date.parse(String(value));
      if (!Number.isFinite(timestamp))
        throw new Error(`Cannot parse UTC date: ${String(value)}`);
      return new Date(timestamp).toISOString();
    }
    case "normalize_boolean":
      return normalizedBoolean(value);
    case "normalize_url": {
      const url = new URL(String(value));
      url.hash = "";
      if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
      return url.toString();
    }
    case "normalize_list": {
      const values = Array.isArray(value) ? value : String(value).split(",");
      const normalized = values
        .map((item) => String(item).trim())
        .filter(Boolean);
      return transform.deduplicate ? [...new Set(normalized)] : normalized;
    }
    case "unit_convert": {
      if (transform.conversion === "token_magnitude_to_tokens")
        return parseMagnitude(String(value));
      if (transform.conversion === "duration_to_milliseconds") {
        if (!value || typeof value !== "object")
          throw new Error("Duration conversion requires a typed object.");
        return durationToMilliseconds(
          value as Parameters<typeof durationToMilliseconds>[0],
        );
      }
      const amount =
        typeof value === "object" && value !== null
          ? Number((value as Record<string, unknown>).amount)
          : Number(value);
      return normalizeUsdPerMillionTokens({
        amount,
        currency: "USD",
        denominator:
          transform.conversion === "usd_per_token_to_million"
            ? "token"
            : "thousand_tokens",
      }).amount;
    }
    case "enum_map": {
      const key = String(value).trim().toLowerCase();
      const mapped = transform.values[key] ?? transform.fallback;
      if (mapped === undefined)
        throw new Error(`No enum mapping for ${String(value)}`);
      return mapped;
    }
    case "split":
      return String(value).split(transform.separator)[transform.index]?.trim();
    case "combine":
      if (!Array.isArray(value))
        throw new Error("Combine requires multiple source paths.");
      return value
        .filter((item) => item !== undefined && item !== null && item !== "")
        .join(transform.separator);
    case "default":
      return value === undefined || value === null || value === ""
        ? transform.value
        : value;
  }
}

function mappingRecordApplies(
  sourceType: DeterministicMappingSpec["sourceType"],
  record: AiInfrastructureSourceObservation["records"][number],
) {
  if (sourceType === "pricing") return record.kind === "pricing";
  if (sourceType === "catalog") return record.kind === "model";
  return record.kind === "notice";
}

export function validateDeterministicMappingSpec(raw: unknown) {
  const parsed = deterministicMappingSpecSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Mapping specification is unsafe or invalid: ${parsed.error.issues[0]?.message ?? "unknown error"}`,
    );
  }
  return parsed.data;
}

export function executeDeterministicMapping(
  rawObservation: unknown,
  rawSpec: unknown,
): CanonicalMappedObservation[] {
  const observation =
    aiInfrastructureSourceObservationSchema.parse(rawObservation);
  const spec = validateDeterministicMappingSpec(rawSpec);
  if (
    observation.schema_version !== spec.sourceSchema ||
    observation.source_type !== spec.sourceType
  ) {
    throw new Error(
      "Mapping source schema or archetype does not match the verified observation.",
    );
  }
  if (
    spec.status !== "shadow" &&
    spec.status !== "canary" &&
    spec.status !== "active"
  ) {
    throw new Error(
      `Mapping revision ${spec.revision} is not executable in ${spec.status} state.`,
    );
  }

  return observation.records.flatMap((record, recordIndex) => {
    if (!mappingRecordApplies(spec.sourceType, record)) return [];
    const sourceKeyValue = sourceValue(observation, record, spec.sourceKey);
    if (
      sourceKeyValue === undefined ||
      sourceKeyValue === null ||
      sourceKeyValue === ""
    ) {
      throw new Error(`Missing source entity key at ${spec.sourceKey}.`);
    }
    const fields: Record<string, unknown> = {};
    const fieldEvidence: CanonicalFieldEvidence[] = [];

    for (const rule of spec.fields) {
      const paths = Array.isArray(rule.source) ? rule.source : [rule.source];
      let value: unknown =
        paths.length === 1
          ? sourceValue(observation, record, paths[0])
          : paths.map((path) => sourceValue(observation, record, path));
      const transformations: MappingTransformEvidence[] = [];
      for (const transform of rule.transforms) {
        const input = value;
        value = applyTransform(value, transform);
        transformations.push({
          name: transform.name,
          version: "1.0.0",
          input,
          output: value,
        });
      }
      if (
        rule.required &&
        (value === undefined || value === null || value === "")
      ) {
        throw new Error(
          `Required canonical field ${rule.target} has no value.`,
        );
      }
      fields[rule.target] = value ?? null;
      const exactSourceFields = paths.map((path) =>
        path.startsWith("$observation.")
          ? path.slice(13)
          : `records[${recordIndex}].${path}`,
      );
      const evidenceSourceFields = rule.evidencePaths.map((path) =>
        path.startsWith("$observation.")
          ? path.slice(13)
          : `records[${recordIndex}].${path}`,
      );
      fieldEvidence.push({
        canonicalField: rule.target,
        value: value ?? null,
        transformations,
        sourceFields: [
          ...new Set([...exactSourceFields, ...evidenceSourceFields]),
        ],
        evidenceRefs: observation.evidence.contexts.map(
          (_context, index) =>
            `${observation.evidence.content_hash}:context:${index}`,
        ),
        rawSourceHash: observation.evidence.content_hash,
      });
    }

    const canonicalEntityKey = spec.canonicalKey
      .map((path) => fields[path] ?? sourceValue(observation, record, path))
      .map((value) => String(value).trim().toLowerCase())
      .join(":");
    const mapped = {
      mappingId: spec.mappingId,
      mappingRevision: spec.revision,
      canonicalSchemaRevision: spec.canonicalSchemaRevision,
      entityType: spec.entityType,
      sourceEntityKey: String(sourceKeyValue),
      canonicalEntityKey,
      sourceUrl: observation.source_url,
      sourceType: observation.source_type,
      observedAt: Date.parse(observation.captured_at),
      fields,
      fieldEvidence,
      evidenceHash: observation.evidence.content_hash,
    };
    return [{ ...mapped, outputHash: sha256(mapped) }];
  });
}
