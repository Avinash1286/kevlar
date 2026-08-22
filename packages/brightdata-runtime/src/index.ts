import { z } from "zod";

const triggerResponseSchema = z.object({ collection_id: z.string().min(1) });
const pendingResponseSchema = z.object({ status: z.string().min(1) });

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
    const response = await fetch(
      `${this.#baseUrl}/dca/trigger?collector=${encodeURIComponent(this.#collectorId)}&queue_next=1`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([input]),
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
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(
      `Bright Data request failed (${response.status}): ${detail}`,
    );
  }
  return response.json() as Promise<unknown>;
}
