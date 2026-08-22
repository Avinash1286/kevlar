import { z } from "zod";

const triggerResponseSchema = z.object({ collection_id: z.string().min(1) });
const pendingResponseSchema = z.object({ status: z.string().min(1) });
const selfHealProgressSchema = z
  .object({
    status: z.string().optional(),
    state: z.string().optional(),
    preview_result: z.unknown().optional(),
    previewResult: z.unknown().optional(),
    result: z.unknown().optional(),
    error: z.unknown().optional(),
  })
  .passthrough();

export type BrightDataRuntimeConfig = {
  apiKey: string;
  collectorId: string;
  baseUrl?: string;
};

export class BrightDataRuntime {
  readonly #apiKey: string;
  readonly #collectorId: string;
  readonly #baseUrl: string;

  constructor(config: BrightDataRuntimeConfig) {
    if (!config.apiKey.trim())
      throw new Error("Bright Data API key is required");
    if (!/^c_[A-Za-z0-9_-]+$/.test(config.collectorId)) {
      throw new Error("A valid custom Scraper Studio collector ID is required");
    }
    this.#apiKey = config.apiKey;
    this.#collectorId = config.collectorId;
    this.#baseUrl = config.baseUrl ?? "https://api.brightdata.com";
  }

  async trigger(input: Record<string, unknown>, signal?: AbortSignal) {
    return this.triggerBatch([input], signal);
  }

  async triggerBatch(inputs: Record<string, unknown>[], signal?: AbortSignal) {
    if (inputs.length === 0) {
      throw new Error("At least one collector input is required");
    }
    const response = await fetch(
      `${this.#baseUrl}/dca/trigger?collector=${encodeURIComponent(this.#collectorId)}&queue_next=1`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(inputs),
        signal,
      },
    );
    const result = triggerResponseSchema.parse(await readJson(response));
    return { snapshotId: result.collection_id };
  }

  async poll(snapshotId: string, signal?: AbortSignal) {
    const response = await fetch(
      `${this.#baseUrl}/dca/dataset?id=${encodeURIComponent(snapshotId)}`,
      { headers: { Authorization: `Bearer ${this.#apiKey}` }, signal },
    );
    const payload = await readJson(response);
    if (Array.isArray(payload))
      return { state: "ready" as const, rows: payload };
    const pending = pendingResponseSchema.safeParse(payload);
    if (!pending.success) return { state: "ready" as const, rows: [payload] };
    return {
      state: "pending" as const,
      status: pending.data.status,
    };
  }

  async triggerSelfHealing(
    input: { prompt: string; customInput: Record<string, unknown>[] },
    signal?: AbortSignal,
  ) {
    if (!input.prompt.trim()) throw new Error("A self-heal prompt is required");
    if (input.prompt.length > 1_000) {
      throw new Error(
        "Bright Data self-heal prompts are limited to 1,000 chars",
      );
    }
    if (input.customInput.length === 0) {
      throw new Error("At least one self-heal input is required");
    }
    const response = await fetch(
      `${this.#baseUrl}/dca/collectors/${encodeURIComponent(this.#collectorId)}/refactor_template`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: input.prompt,
          custom_input: input.customInput,
        }),
        signal,
      },
    );
    return {
      collectorId: this.#collectorId,
      response: await readJsonOrNull(response),
    };
  }

  async pollSelfHealing(signal?: AbortSignal) {
    const response = await fetch(
      `${this.#baseUrl}/dca/collectors/${encodeURIComponent(this.#collectorId)}/refactor_template/progress`,
      {
        headers: { Authorization: `Bearer ${this.#apiKey}` },
        signal,
      },
    );
    const raw = await readJson(response);
    const payload = selfHealProgressSchema.parse(raw);
    const status = String(payload.status ?? payload.state ?? "unknown");
    const normalized = status.toLowerCase().replace(/[\s-]+/g, "_");
    const previewResult =
      payload.preview_result ?? payload.previewResult ?? payload.result ?? null;

    if (normalized === "pending_answer") {
      return {
        state: "preview_ready" as const,
        status,
        previewResult,
        raw,
      };
    }
    if (
      ["completed", "complete", "done", "success", "succeeded"].includes(
        normalized,
      )
    ) {
      return {
        state: "completed" as const,
        status,
        previewResult,
        raw,
      };
    }
    if (["failed", "error", "cancelled", "canceled"].includes(normalized)) {
      return {
        state: "failed" as const,
        status,
        previewResult,
        raw,
      };
    }
    return {
      state: "pending" as const,
      status,
      previewResult,
      raw,
    };
  }

  async resumeSelfHealing(
    input: { approved: boolean; autoSave?: boolean },
    signal?: AbortSignal,
  ) {
    const response = await fetch(
      `${this.#baseUrl}/dca/collectors/${encodeURIComponent(this.#collectorId)}/resume_automation_job`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: input.approved,
          auto_save: input.approved && (input.autoSave ?? false),
        }),
        signal,
      },
    );
    return {
      collectorId: this.#collectorId,
      approved: input.approved,
      response: await readJsonOrNull(response),
    };
  }
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(
      `Bright Data request failed (${response.status}): ${detail}`,
    );
  }
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > 1) {
      try {
        return lines.map((line) => JSON.parse(line) as unknown);
      } catch {
        // Preserve the original JSON error below for malformed payloads.
      }
    }
    throw error;
  }
}

async function readJsonOrNull(response: Response): Promise<unknown> {
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(
      `Bright Data request failed (${response.status}): ${detail}`,
    );
  }
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { text: text.slice(0, 500) };
  }
}
