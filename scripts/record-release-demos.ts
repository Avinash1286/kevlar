import { mkdir, rename, rm } from "node:fs/promises";
import { chromium } from "@playwright/test";

const publicUrl =
  process.env.KEVLAR_PUBLIC_URL ?? "https://kevlar-web.vercel.app";

type DemoSegment = { path: string; minimumDurationMs: number };

async function record(name: string, segments: DemoSegment[]) {
  const temporaryDirectory = `artifacts/demo/.${name}`;
  await rm(temporaryDirectory, { recursive: true, force: true });
  await mkdir(temporaryDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: temporaryDirectory,
      size: { width: 1440, height: 900 },
    },
  });
  const page = await context.newPage();
  const video = page.video();
  for (const { path, minimumDurationMs } of segments) {
    const segmentStartedAt = performance.now();
    const response = await page.goto(new URL(path, publicUrl).toString(), {
      waitUntil: "networkidle",
    });
    if (!response || response.status() !== 200) {
      throw new Error(
        `Demo route ${path} returned ${response?.status() ?? "no response"}`,
      );
    }
    const bodyText = await page.locator("body").innerText();
    if (!bodyText.includes("Kevlar")) {
      throw new Error(`Demo route ${path} did not render the Kevlar shell`);
    }
    await page.waitForTimeout(1_400);
    await page.mouse.wheel(0, 650);
    await page.waitForTimeout(600);
    await page.mouse.wheel(0, -650);
    const remainingMs =
      minimumDurationMs - (performance.now() - segmentStartedAt);
    if (remainingMs > 0) await page.waitForTimeout(remainingMs);
  }
  await context.close();
  await browser.close();
  const recordedPath = await video?.path();
  if (!recordedPath) throw new Error(`Playwright did not produce ${name}`);
  const outputPath = `artifacts/demo/${name}.webm`;
  await rm(outputPath, { force: true });
  await rename(recordedPath, outputPath);
  await rm(temporaryDirectory, { recursive: true, force: true });
  console.log(`Recorded ${outputPath}`);
}

async function main() {
  await mkdir("artifacts/demo", { recursive: true });
  await record("kevlar-core-v1.0.1", [
    { path: "/", minimumDurationMs: 4_000 },
    { path: "/gauntlet", minimumDurationMs: 4_000 },
    { path: "/fleet/repairs", minimumDurationMs: 4_000 },
    { path: "/feed", minimumDurationMs: 4_000 },
    { path: "/evidence", minimumDurationMs: 4_000 },
  ]);
  await record("kevlar-full-platform-v1.0.1", [
    { path: "/", minimumDurationMs: 4_000 },
    { path: "/sources", minimumDurationMs: 4_000 },
    { path: "/entities", minimumDurationMs: 4_000 },
    { path: "/history", minimumDurationMs: 4_000 },
    { path: "/events", minimumDurationMs: 4_000 },
    { path: "/conflicts", minimumDurationMs: 4_000 },
    { path: "/developers", minimumDurationMs: 5_000 },
    { path: "/router", minimumDurationMs: 4_000 },
    { path: "/operations", minimumDurationMs: 5_000 },
    { path: "/security", minimumDurationMs: 4_000 },
  ]);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
