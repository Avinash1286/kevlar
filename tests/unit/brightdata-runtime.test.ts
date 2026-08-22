import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BrightDataRuntime,
  BrightDataStudioAdmin,
} from "../../packages/brightdata-runtime/src/index";

const runtime = new BrightDataRuntime({
  apiKey: "test-api-key",
  collectorId: "c_test",
  baseUrl: "https://brightdata.test",
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BrightDataRuntime polling", () => {
  it("can explicitly trigger the development template created by AI Flow", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ collection_id: "j_dev" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runtime.triggerDevelopment({ url: "https://example.com" }),
    ).resolves.toEqual({ snapshotId: "j_dev" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://brightdata.test/dca/trigger?collector=c_test&queue_next=1&version=dev&override_incompatible_schema=1",
      expect.objectContaining({ method: "POST" }),
    );
  });

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

  it("treats a transient empty dataset response as still collecting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );

    await expect(runtime.poll("j_empty")).resolves.toEqual({
      state: "pending",
      status: "collecting",
    });
  });

  it("terminates an empty dataset once the job log is done", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 200 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: "done", lines: 0 }), {
            status: 200,
          }),
        ),
    );

    await expect(runtime.poll("j_empty_done")).resolves.toEqual({
      state: "ready",
      rows: [],
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

describe("BrightDataStudioAdmin", () => {
  const admin = new BrightDataStudioAdmin({
    apiKey: "test-api-key",
    baseUrl: "https://brightdata.test",
  });

  it("creates a custom webhook collector with the documented request shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "c_pricing",
          name: "Kevlar pricing",
          active: false,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      admin.createCollector({
        name: "Kevlar pricing",
        deliver: {
          type: "webhook",
          endpoint: "https://kevlar.test/api/brightdata/phase5",
          flatten_csv: false,
          delivery_type: "deliver_results",
        },
      }),
    ).resolves.toMatchObject({ id: "c_pricing", active: false });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://brightdata.test/dca/collector",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Kevlar pricing",
          deliver: {
            type: "webhook",
            endpoint: "https://kevlar.test/api/brightdata/phase5",
            flatten_csv: false,
            delivery_type: "deliver_results",
          },
        }),
      }),
    );
  });

  it("starts and polls the documented AI automation flow", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "started" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "done" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await admin.automateTemplate("c_pricing", {
      description: "Extract typed pricing observations with evidence.",
      url: "https://example.com/pricing",
    });
    await expect(admin.pollAutomation("c_pricing")).resolves.toMatchObject({
      state: "completed",
      status: "done",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://brightdata.test/dca/collectors/c_pricing/automate_template",
      expect.objectContaining({
        body: JSON.stringify({
          description: "Extract typed pricing observations with evidence.",
          urls: ["https://example.com/pricing"],
        }),
      }),
    );
  });

  it("enforces the AI flow description limit before making a request", async () => {
    await expect(
      admin.automateTemplate("c_pricing", {
        description: "x".repeat(501),
        url: "https://example.com/pricing",
      }),
    ).rejects.toThrow("limited to 500 chars");
  });
});
