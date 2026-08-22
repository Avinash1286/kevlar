import { describe, expect, it } from "vitest";
import {
  apiFactSchema,
  apiListEnvelopeSchema,
  decodeCursor,
  encodeCursor,
  enqueueDelivery,
  paginate,
  recordDeliveryAttempt,
  replayDelivery,
  requireScope,
  signWebhook,
  verifyWebhook,
} from "../../packages/api-contracts/src/index";
import { KevlarClient } from "../../packages/sdk/src/index";
import { executeKevlarMcpTool } from "../../packages/mcp-server/src/index";

const fact = {
  id: "fact:price:4",
  entity_id: "entity:gpt-4o",
  predicate: "model.input_price_usd_per_million_tokens",
  value: 4,
  value_hash: "fnv1a64:price4",
  valid_from: 1787389311485,
  transaction_from: 1787389313485,
  trust: {
    state: "released",
    freshness: "fresh",
    source_ids: ["source:openai"],
    supporting_source_count: 1,
    evidence_refs: ["evidence:pricing"],
    certificate_ref: "certificate:core",
    observed_at: 1787389311485,
  },
} as const;

describe("Phase 10 API, webhook, SDK, and MCP", () => {
  it("uses opaque stable cursor pagination with a hard maximum", () => {
    const first = paginate([1, 2, 3, 4], { limit: 2 });
    expect(first).toEqual({
      data: [1, 2],
      pagination: { limit: 2, next_cursor: encodeCursor(2) },
    });
    expect(decodeCursor(first.pagination.next_cursor)).toBe(2);
    expect(
      paginate([1, 2, 3, 4], {
        cursor: first.pagination.next_cursor,
        limit: 99,
      }).data,
    ).toEqual([3, 4]);
    expect(() => decodeCursor("not-a-cursor")).toThrow(
      "Invalid pagination cursor",
    );
  });

  it("enforces granular API scopes", () => {
    expect(() => requireScope(["facts:read"], "facts:read")).not.toThrow();
    expect(() => requireScope(["facts:read"], "webhooks:write")).toThrow(
      "Missing API scope",
    );
  });

  it("signs and verifies webhook bodies with timestamped HMAC", () => {
    const payload = JSON.stringify({ event_id: "evt_price" });
    const testSecret = "fixture-only-signing-material";
    const signed = signWebhook({
      payload,
      secret: testSecret,
      timestamp: 1_787_395_000,
    });
    expect(
      verifyWebhook({
        payload,
        secret: testSecret,
        signature: signed.signature,
        now: signed.timestamp,
      }),
    ).toBe(true);
    expect(
      verifyWebhook({
        payload: `${payload} `,
        secret: testSecret,
        signature: signed.signature,
        now: signed.timestamp,
      }),
    ).toBe(false);
    expect(
      verifyWebhook({
        payload,
        secret: testSecret,
        signature: signed.signature,
        now: signed.timestamp + 301,
      }),
    ).toBe(false);
  });

  it("deduplicates deliveries by idempotency key", () => {
    const first = enqueueDelivery([], {
      id: "delivery:1",
      idempotencyKey: "sub:event",
      eventId: "event:1",
    });
    const duplicate = enqueueDelivery(first.store, {
      id: "delivery:2",
      idempotencyKey: "sub:event",
      eventId: "event:1",
    });
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.delivery.id).toBe("delivery:1");
    expect(duplicate.store).toHaveLength(1);
  });

  it("moves exhausted failures to dead letter and supports replay", () => {
    let delivery = enqueueDelivery([], {
      id: "delivery:1",
      idempotencyKey: "sub:event",
      eventId: "event:1",
    }).delivery;
    delivery = recordDeliveryAttempt(delivery, {
      ok: false,
      attemptedAt: 1,
      maxAttempts: 2,
    });
    expect(delivery.state).toBe("retrying");
    delivery = recordDeliveryAttempt(delivery, {
      ok: false,
      attemptedAt: 3_000,
      maxAttempts: 2,
    });
    expect(delivery.state).toBe("dead_letter");
    const replay = replayDelivery(delivery, "delivery:replay");
    expect(replay).toMatchObject({
      state: "pending",
      replayOf: "delivery:1",
      attempts: 0,
    });
    expect(
      recordDeliveryAttempt(replay, { ok: true, attemptedAt: 5_000 }).state,
    ).toBe("delivered");
  });

  it("keeps SDK response types identical to the shared API schema", async () => {
    const envelope = {
      api_version: "v1",
      data: [fact],
      pagination: { next_cursor: null, limit: 25 },
      request_id: "req:1",
    };
    const client = new KevlarClient({
      baseUrl: "https://kevlar.example",
      apiKey: "kv_test",
      fetch: async () =>
        new Response(JSON.stringify(envelope), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    const result = await client.currentFacts("entity:gpt-4o");
    expect(result.data).toEqual(
      apiListEnvelopeSchema(apiFactSchema).parse(envelope).data,
    );
  });

  it("MCP returns only schema-valid evidence-aware released facts", async () => {
    const result = await executeKevlarMcpTool(
      { current: async () => [fact], history: async () => [fact] },
      "kevlar_current_facts",
      { entity_id: "entity:gpt-4o" },
    );
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]?.trust.evidence_refs).toEqual(["evidence:pricing"]);
    await expect(
      executeKevlarMcpTool(
        { current: async () => [], history: async () => [] },
        "kevlar_publish_fact",
        {},
      ),
    ).rejects.toThrow("write-capable");
  });
});
