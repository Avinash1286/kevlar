import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = process.env.KEVLAR_PUBLIC_URL ?? "https://kevlar-web.vercel.app";
const paths = ["/", "/feed", "/evidence", "/events", "/operations", "/router", "/security", "/developers"];
const requestCount = 80;
const concurrency = 10;

type Sample = { path: string; status: number; latencyMs: number; bytes: number };

async function fetchSample(index: number): Promise<Sample> {
  const path = paths[index % paths.length]!;
  const started = performance.now();
  const response = await fetch(new URL(path, baseUrl), { redirect: "follow" });
  const body = await response.arrayBuffer();
  return {
    path,
    status: response.status,
    latencyMs: Number((performance.now() - started).toFixed(2)),
    bytes: body.byteLength,
  };
}

async function main() {
  const samples: Sample[] = [];
  for (let offset = 0; offset < requestCount; offset += concurrency) {
    samples.push(...await Promise.all(Array.from({ length: Math.min(concurrency, requestCount - offset) }, (_, index) => fetchSample(offset + index))));
  }
  const sorted = samples.map((sample) => sample.latencyMs).sort((a, b) => a - b);
  const percentile = (value: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)]!;
  const report = {
    schema_version: "kevlar.release-load.v1",
    measured_at: new Date().toISOString(),
    target: baseUrl,
    requests: requestCount,
    concurrency,
    successful_requests: samples.filter((sample) => sample.status >= 200 && sample.status < 400).length,
    status_counts: Object.fromEntries([...new Set(samples.map((sample) => sample.status))].sort().map((status) => [status, samples.filter((sample) => sample.status === status).length])),
    latency_ms: { min: sorted[0], median: percentile(0.5), p95: percentile(0.95), max: sorted.at(-1) },
    transferred_bytes: samples.reduce((total, sample) => total + sample.bytes, 0),
    samples,
  };
  if (report.successful_requests !== requestCount) throw new Error(`Load check failed: ${report.successful_requests}/${requestCount} requests succeeded`);
  await mkdir("benchmarks/results", { recursive: true });
  await writeFile("benchmarks/results/v1.0.0-load.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Load proof: ${requestCount}/${requestCount} successful, p95 ${report.latency_ms.p95} ms.`);
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
