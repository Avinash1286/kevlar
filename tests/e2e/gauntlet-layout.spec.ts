import { expect, test, type Page } from "@playwright/test";

async function openGauntlet(page: Page) {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/gauntlet", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", {
      name: "A repair must generalize before data ships.",
    }),
  ).toBeVisible();
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test("centers the Gauntlet console and renders its header at desktop size", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1365, height: 705 });
  await openGauntlet(page);

  const shell = await page.locator("main.console-shell").boundingBox();
  const navigation = await page.locator("header.console-nav").boundingBox();
  const brandMark = await page.locator(".brand-mark").boundingBox();

  expect(shell).not.toBeNull();
  expect(shell!.x).toBeGreaterThan(0);
  expect(shell!.width).toBeLessThanOrEqual(1280);
  expect(navigation?.height).toBeGreaterThanOrEqual(84);
  expect(brandMark?.width).toBe(31);
  expect(brandMark?.height).toBe(31);
  await expectNoHorizontalOverflow(page);

  await page.screenshot({
    path: testInfo.outputPath("gauntlet-desktop.png"),
    fullPage: true,
  });
});

test("stacks the Gauntlet heading and status without mobile overflow", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await openGauntlet(page);

  const headingCopy = await page
    .locator(".gauntlet-heading > div")
    .boundingBox();
  const state = await page
    .locator(".gauntlet-heading .state-pill")
    .boundingBox();

  expect(headingCopy).not.toBeNull();
  expect(state).not.toBeNull();
  expect(state!.y).toBeGreaterThanOrEqual(headingCopy!.y + headingCopy!.height);
  await expect(page.locator(".console-nav .phase-pill")).toBeHidden();

  const firstResult = page
    .locator(".gauntlet-row:not(.gauntlet-row-head)")
    .first();
  const relation = await firstResult
    .locator('[data-label="Relation"]')
    .boundingBox();
  const outcome = await firstResult
    .locator('[data-label="Outcome"]')
    .boundingBox();
  expect(relation).not.toBeNull();
  expect(outcome).not.toBeNull();
  expect(outcome!.y).toBeGreaterThanOrEqual(relation!.y + relation!.height);
  await expectNoHorizontalOverflow(page);

  await page.screenshot({
    path: testInfo.outputPath("gauntlet-mobile.png"),
    fullPage: true,
  });
});
