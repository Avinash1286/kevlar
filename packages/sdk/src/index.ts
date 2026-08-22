import {
  API_VERSION,
  apiCertificateSchema,
  apiConflictSchema,
  apiEntitySchema,
  apiEventSchema,
  apiFactSchema,
  apiListEnvelopeSchema,
  apiSourceHealthSchema,
  signWebhook,
  verifyWebhook,
  type ApiCertificate,
  type ApiConflict,
  type ApiEntity,
  type ApiEvent,
  type ApiFact,
  type ApiSourceHealth,
} from "@kevlar/api-contracts";
import type { z } from "zod";

export type KevlarClientOptions = {
  baseUrl?: string;
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  maxReadRetries?: number;
};

export class KevlarApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId: string | null,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "KevlarApiError";
  }
}

type ListOptions = { cursor?: string; limit?: number };
type Page<T> = { data: T[]; nextCursor: string | null; requestId: string };

export class KevlarClient {
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly request: typeof globalThis.fetch;
  private readonly maxReadRetries: number;

  readonly entities = {
    list: (options: ListOptions & { type?: string; status?: string } = {}) =>
      this.list("/entities", apiEntitySchema, options),
    get: (id: string) =>
      this.getOne(`/entities/${encodeURIComponent(id)}`, apiEntitySchema),
  };
  readonly facts = {
    list: (
      options: ListOptions & { entityId?: string; predicate?: string } = {},
    ) => this.list("/facts", apiFactSchema, options),
    history: (
      options: ListOptions & {
        entityId: string;
        predicate?: string;
        validAt?: number;
        knownAt?: number;
      },
    ) => this.list("/history", apiFactSchema, options),
  };
  readonly events = {
    list: (
      options: ListOptions & {
        entityId?: string;
        type?: string;
        from?: number;
      } = {},
    ) => this.list("/events", apiEventSchema, options),
    get: (id: string) =>
      this.getOne(`/events/${encodeURIComponent(id)}`, apiEventSchema),
  };
  readonly conflicts = {
    list: (
      options: ListOptions & { entityId?: string; status?: string } = {},
    ) => this.list("/conflicts", apiConflictSchema, options),
  };
  readonly sources = {
    list: (options: ListOptions & { status?: string } = {}) =>
      this.list("/sources", apiSourceHealthSchema, options),
  };
  readonly certificates = {
    get: (id: string) =>
      this.getOne(
        `/certificates/${encodeURIComponent(id)}`,
        apiCertificateSchema,
      ),
  };

  constructor(options: KevlarClientOptions) {
    this.baseUrl = (
      options.baseUrl ?? "https://kevlar-web.vercel.app/api"
    ).replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.request = options.fetch ?? globalThis.fetch;
    this.maxReadRetries = Math.min(Math.max(options.maxReadRetries ?? 2, 0), 4);
    if (
      !this.baseUrl.startsWith("https://") &&
      !this.baseUrl.startsWith("http://localhost")
    )
      throw new Error("Kevlar API requires HTTPS.");
    if (!this.apiKey) throw new Error("Kevlar API key is required.");
  }

  private async rawGet(path: string) {
    let response: Response | null = null;
    for (let attempt = 0; attempt <= this.maxReadRetries; attempt += 1) {
      response = await this.request(`${this.baseUrl}/${API_VERSION}${path}`, {
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          accept: "application/json",
        },
      });
      if (
        response.ok ||
        ![429, 502, 503, 504].includes(response.status) ||
        attempt === this.maxReadRetries
      )
        break;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(100 * 2 ** attempt, 800)),
      );
    }
    if (!response?.ok) {
      const requestId = response?.headers.get("x-request-id") ?? null;
      let code: string | null = null;
      let message = `Kevlar API ${response?.status ?? 0}`;
      try {
        const body = (await response?.json()) as {
          error?: { code?: string; message?: string };
        };
        code = body?.error?.code ?? null;
        message = body?.error?.message ?? message;
      } catch {
        /* keep the safe status-only message */
      }
      throw new KevlarApiError(message, response?.status ?? 0, requestId, code);
    }
    return response.json();
  }

  private async list<T extends z.ZodType>(
    path: string,
    schema: T,
    options: Record<string, unknown>,
  ): Promise<Page<z.infer<T>>> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(options))
      if (value !== undefined)
        query.set(
          key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
          String(value),
        );
    const raw = await this.rawGet(`${path}${query.size ? `?${query}` : ""}`);
    const parsed = apiListEnvelopeSchema(schema).parse(raw);
    return {
      data: parsed.data,
      nextCursor: parsed.pagination.next_cursor,
      requestId: parsed.request_id,
    };
  }

  private async getOne<T extends z.ZodType>(
    path: string,
    schema: T,
  ): Promise<z.infer<T>> {
    const raw = await this.rawGet(path);
    return schema.parse((raw as { data?: unknown }).data ?? raw);
  }

  currentFacts(
    entityId: string,
    options: ListOptions = {},
  ): Promise<Page<ApiFact>> {
    return this.facts.list({ ...options, entityId });
  }
  async historicalFacts(
    entityId: string,
    options: { predicate?: string; validAt?: number; knownAt?: number } = {},
  ): Promise<ApiFact[]> {
    return (await this.facts.history({ entityId, ...options })).data;
  }

  static webhooks = { sign: signWebhook, verify: verifyWebhook };
}

export { KevlarClient as Kevlar };
export type {
  ApiCertificate,
  ApiConflict,
  ApiEntity,
  ApiEvent,
  ApiFact,
  ApiSourceHealth,
};
