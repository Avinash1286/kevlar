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

  it("decodes multi-row NDJSON dataset responses", async () => {
    const rows = [
      { source_url: "https://fixture.test/gauntlet/m1" },
      { source_url: "https://fixture.test/gauntlet/m2" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(rows.map((row) => JSON.stringify(row)).join("\n"), {
          status: 200,
          headers: { "Content-Type": "application/x-ndjson" },
        }),
      ),
    );

    await expect(runtime.poll("j_ndjson")).resolves.toEqual({
      state: "ready",
      rows,
    });
  });
});

describe("BrightDataRuntime self-healing", () => {
  it("sends the official trigger shape and recognizes pending approval", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "started" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "pending_answer",
            preview_result: { product: { purchase_price: 129 } },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await runtime.triggerSelfHealing({
      prompt: "Fix purchase price semantics",
      customInput: [{ url: "https://fixture.test/nova" }],
    });
    const progress = await runtime.pollSelfHealing();

    expect(progress.state).toBe("preview_ready");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://brightdata.test/dca/collectors/c_test/refactor_template",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          prompt: "Fix purchase price semantics",
          custom_input: [{ url: "https://fixture.test/nova" }],
        }),
      }),
    );
  });

  it("sends an idempotency-safe explicit approval payload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runtime.resumeSelfHealing({ approved: true, autoSave: true }),
    ).resolves.toMatchObject({ collectorId: "c_test", approved: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://brightdata.test/dca/collectors/c_test/resume_automation_job",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: true, auto_save: true }),
      }),
    );
  });

  it("rejects prompts over the documented 1,000 character limit", async () => {
    await expect(
      runtime.triggerSelfHealing({
        prompt: "x".repeat(1_001),
        customInput: [{ url: "https://fixture.test/nova" }],
      }),
    ).rejects.toThrow("limited to 1,000 chars");
  });
});
