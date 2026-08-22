import { z } from "zod";

export const currencyAmountSchema = z.object({
  amount: z.number().finite(),
  currency: z.literal("USD"),
  original: z.object({ value: z.string().min(1), unit: z.string().min(1) }),
});

export const tokenQuantitySchema = z.object({
  amount: z.number().int().nonnegative(),
  unit: z.enum([
    "tokens",
    "thousand_tokens",
    "million_tokens",
    "billion_tokens",
  ]),
  original: z.object({ value: z.string().min(1), unit: z.string().min(1) }),
});

export const durationSchema = z.object({
  amount: z.number().nonnegative(),
  unit: z.enum(["milliseconds", "seconds", "minutes", "hours", "days"]),
  original: z.object({ value: z.string().min(1), unit: z.string().min(1) }),
});

export const canonicalRateSchema = z.object({
  amount: z.number().nonnegative(),
  numerator: z.enum(["requests", "tokens", "USD"]),
  denominator: z.enum(["second", "minute", "hour", "day", "million_tokens"]),
  scope: z.enum(["account", "project", "model", "region", "unknown"]),
  original: z.object({ value: z.string().min(1), unit: z.string().min(1) }),
});

export const regionSchema = z.object({
  code: z.string().min(2),
  scope: z.enum([
    "global",
    "country",
    "cloud_region",
    "provider_region",
    "unknown",
  ]),
  original: z.string().min(1),
});

export const lifecycleStatusSchema = z.enum([
  "preview",
  "active",
  "deprecated",
  "retired",
  "unknown",
]);

export type CurrencyAmount = z.infer<typeof currencyAmountSchema>;
export type TokenQuantity = z.infer<typeof tokenQuantitySchema>;
export type Duration = z.infer<typeof durationSchema>;
export type CanonicalRate = z.infer<typeof canonicalRateSchema>;
export type Region = z.infer<typeof regionSchema>;

const magnitudes: Record<string, number> = {
  token: 1,
  tokens: 1,
  k: 1_000,
  thousand_tokens: 1_000,
  m: 1_000_000,
  million_tokens: 1_000_000,
  b: 1_000_000_000,
  billion_tokens: 1_000_000_000,
};

export function parseMagnitude(value: string): number {
  const match = value
    .trim()
    .replaceAll(",", "")
    .match(/^(-?\d+(?:\.\d+)?)\s*([KMB])?$/i);
  if (!match) throw new Error(`Cannot parse numeric magnitude: ${value}`);
  return Number(match[1]) * magnitudes[(match[2] ?? "tokens").toLowerCase()];
}

export function tokenQuantityToTokens(quantity: TokenQuantity): number {
  return quantity.amount * magnitudes[quantity.unit];
}

export function durationToMilliseconds(duration: Duration): number {
  const factors: Record<Duration["unit"], number> = {
    milliseconds: 1,
    seconds: 1_000,
    minutes: 60_000,
    hours: 3_600_000,
    days: 86_400_000,
  };
  return duration.amount * factors[duration.unit];
}

export type TokenPriceInput = {
  amount: number;
  currency: "USD";
  denominator:
    | "token"
    | "thousand_tokens"
    | "million_tokens"
    | "million_input_tokens"
    | "million_output_tokens";
};

export function normalizeUsdPerMillionTokens(input: TokenPriceInput) {
  const multiplier =
    input.denominator === "token"
      ? 1_000_000
      : input.denominator === "thousand_tokens"
        ? 1_000
        : 1;
  return {
    amount: input.amount * multiplier,
    currency: input.currency,
    denominator: "million_tokens" as const,
    original: { value: String(input.amount), unit: input.denominator },
  };
}
