export const allowedMappingTransforms = new Set([
  "trim",
  "normalize_whitespace",
  "normalize_case",
  "normalize_identifier",
  "parse_number",
  "parse_currency",
  "normalize_token_price",
  "convert_token_unit",
  "parse_magnitude",
  "parse_date_utc",
  "normalize_boolean",
  "map_enum",
  "normalize_url",
  "normalize_list",
  "deduplicate",
  "approved_alias_lookup",
  "split",
  "combine",
  "optional_default",
]);

export function assertPhase6Text(
  value: string,
  name: string,
  max = 1_000,
): void {
  if (value.length === 0 || value.length > max)
    throw new Error(`${name} must contain 1-${max} characters`);
}

export function normalizeIdentity(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function assertDeterministicMapping(specification: unknown): void {
  if (
    typeof specification !== "object" ||
    specification === null ||
    Array.isArray(specification)
  )
    throw new Error("Mapping specification must be an object");
  const fields = (specification as { fields?: unknown }).fields;
  if (!Array.isArray(fields) || fields.length === 0 || fields.length > 100)
    throw new Error("Mapping specification requires 1-100 field rules");
  for (const field of fields) {
    if (typeof field !== "object" || field === null || Array.isArray(field))
      throw new Error("Each mapping field rule must be an object");
    const transform = (field as { transform?: unknown }).transform;
    if (
      typeof transform !== "string" ||
      !allowedMappingTransforms.has(transform)
    )
      throw new Error(
        `Mapping transform is not allowlisted: ${String(transform)}`,
      );
  }
}

export function stableHash(value: unknown): string {
  const serialized = stableSerialize(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= BigInt(serialized.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}
