export type Capability =
  "structured_text" | "long_context" | "vision" | "fast_classification";

export type ModelRegistration = {
  provider: "groq" | "nvidia" | "cloudflare";
  model: string;
  capabilities: Capability[];
  enabled: boolean;
  maxInputTokens: number;
  timeoutMs: number;
  dailyBudgetUnits: number;
};

export const modelRegistry: ModelRegistration[] = [
  {
    provider: "groq",
    model: "configure-after-live-catalog-check",
    capabilities: ["structured_text", "fast_classification"],
    enabled: false,
    maxInputTokens: 0,
    timeoutMs: 15_000,
    dailyBudgetUnits: 0,
  },
  {
    provider: "nvidia",
    model: "configure-after-live-catalog-check",
    capabilities: ["structured_text", "long_context"],
    enabled: false,
    maxInputTokens: 0,
    timeoutMs: 30_000,
    dailyBudgetUnits: 0,
  },
  {
    provider: "cloudflare",
    model: "configure-after-live-catalog-check",
    capabilities: ["structured_text", "fast_classification"],
    enabled: false,
    maxInputTokens: 0,
    timeoutMs: 20_000,
    dailyBudgetUnits: 0,
  },
];
