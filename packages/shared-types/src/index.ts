import { z } from "zod";

export const moneySchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
  raw_text: z.string().min(1),
});

export const collectorProductSchema = z.object({
  schema_version: z.literal("1.0"),
  source_url: z.url(),
  captured_at: z.iso.datetime(),
  page_state: z.enum(["ok", "blocked", "not_found", "unavailable"]),
  product: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    purchase_price: moneySchema.extend({
      label: z.string().min(1),
      nearby_text: z.string().min(1),
    }),
    monthly_payment: moneySchema.extend({
      period: z.literal("month"),
    }),
    availability: z.enum(["in_stock", "out_of_stock", "unavailable"]),
  }),
  independent_sources: z.object({
    jsonld_price: z.number().positive(),
    public_api_price: z.number().positive(),
  }),
  evidence: z.object({
    page_heading: z.string().min(1),
    purchase_context: z.string().min(1),
    screenshot_ref: z.string().min(1),
  }),
});

export type CollectorProduct = z.infer<typeof collectorProductSchema>;

export type RunStatus =
  | "created"
  | "triggering"
  | "collecting"
  | "normalizing"
  | "validating"
  | "verified"
  | "quarantined"
  | "failed";

export type EvidenceReference = {
  kind: "visible_context" | "jsonld" | "public_api" | "screenshot";
  ref: string;
  capturedAt: string;
};
