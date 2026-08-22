import { afterEach, describe, expect, it, vi } from "vitest";
import { BrightDataRuntime } from "../../packages/brightdata-runtime/src/index";

const runtime = new BrightDataRuntime({
  apiKey: "test-api-key",
  collectorId: "c_test",
  baseUrl: "https://brightdata.test",
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BrightDataRuntime polling", () => {
  it("reports pending collection statuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "building" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(runtime.poll("j_pending")).resolves.toEqual({
      state: "pending",
      status: "building",
    });
  });

  it("normalizes a single-record response into rows", async () => {
    const row = { schema_version: "1.0", page_state: "ok" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(row), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(runtime.poll("j_ready")).resolves.toEqual({
      state: "ready",
      rows: [row],
    });
  });
});
