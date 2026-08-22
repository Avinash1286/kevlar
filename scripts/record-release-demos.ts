import { mkdir, rename, rm } from "node:fs/promises";
import { chromium } from "@playwright/test";

const publicUrl = process.env.KEVLAR_PUBLIC_URL ?? "https://kevlar-web.vercel.app";

async function record(name: string, paths: string[]) {
  const temporaryDirectory = `artifacts/demo/.${name}`;
  await rm(temporaryDirectory, { recursive: true, force: true });
  await mkdir(temporaryDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: temporaryDirectory, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  const video = page.video();
  for (const path of paths) {
    await page.goto(new URL(path, publicUrl).toString(), { waitUntil: "networkidle" });
    await page.waitForTimeout(1_400);
    await page.mouse.wheel(0, 650);
    await page.waitForTimeout(600);
    await page.mouse.wheel(0, -650);
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
  await record("kevlar-core-v1.0.0", ["/", "/gauntlet", "/fleet/repairs", "/feed", "/evidence"]);
  await record("kevlar-full-platform-v1.0.0", ["/", "/sources", "/entities", "/history", "/events", "/conflicts", "/developers", "/router", "/operations", "/security"]);
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
