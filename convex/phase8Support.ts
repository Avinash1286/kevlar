import { stableHash } from "./phase6Support";

export type EquivalenceRule =
  "exact" | "numeric_tolerance" | "normalized_whitespace" | "unordered_set";

function normalizeWhitespace(value: unknown): unknown {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").toLowerCase()
    : value;
}

function normalizeSet(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return [...value].map((item) => stableHash(normalizeWhitespace(item))).sort();
}

export function valuesEquivalent(args: {
  left: unknown;
  right: unknown;
  rule: EquivalenceRule;
  numericTolerancePercent?: number;
}): boolean {
  if (args.rule === "normalized_whitespace")
    return (
      stableHash(normalizeWhitespace(args.left)) ===
      stableHash(normalizeWhitespace(args.right))
    );
  if (args.rule === "unordered_set")
    return (
      stableHash(normalizeSet(args.left)) ===
      stableHash(normalizeSet(args.right))
    );
  if (args.rule === "numeric_tolerance") {
    if (typeof args.left !== "number" || typeof args.right !== "number")
      return false;
    if (!Number.isFinite(args.left) || !Number.isFinite(args.right))
      return false;
    const tolerance = args.numericTolerancePercent ?? 0;
    const scale = Math.max(Math.abs(args.left), Math.abs(args.right), 1);
    return Math.abs(args.left - args.right) <= scale * (tolerance / 100);
  }
  return stableHash(args.left) === stableHash(args.right);
}

export function semanticValueHash(args: {
  value: unknown;
  rule: EquivalenceRule;
}): string {
  if (args.rule === "normalized_whitespace")
    return stableHash(normalizeWhitespace(args.value));
  if (args.rule === "unordered_set")
    return stableHash(normalizeSet(args.value));
  return stableHash(args.value);
}

export function deterministicEventId(input: {
  projectId: string;
  entityId: string;
  predicate?: string;
  previousValueHash?: string;
  nextValueHash?: string;
  validFrom?: number;
  eventType: string;
}): string {
  const digest = stableHash({
    projectId: input.projectId,
    entityId: input.entityId,
    predicate: input.predicate ?? null,
    previousValueHash: input.previousValueHash ?? null,
    nextValueHash: input.nextValueHash ?? null,
    validFrom: input.validFrom ?? null,
    eventType: input.eventType,
  }).replace("fnv1a64:", "");
  return `evt_${digest}`;
}
