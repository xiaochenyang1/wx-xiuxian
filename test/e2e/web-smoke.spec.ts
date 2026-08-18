import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";

const SAVE_KEY = "cultivation-diary.local-save.v1";

test("boots a nonblank game canvas and restores its local save", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const canvas = page.locator("#GameCanvas");
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), SAVE_KEY), {
      timeout: 20_000,
    })
    .not.toBeNull();

  const canvasMetrics = await canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    const bounds = canvasElement.getBoundingClientRect();
    return {
      backingWidth: canvasElement.width,
      backingHeight: canvasElement.height,
      cssWidth: bounds.width,
      cssHeight: bounds.height,
      hasWebGl:
        canvasElement.getContext("webgl2") !== null ||
        canvasElement.getContext("webgl") !== null,
    };
  });
  expect(canvasMetrics.backingWidth).toBeGreaterThan(300);
  expect(canvasMetrics.backingHeight).toBeGreaterThan(500);
  expect(canvasMetrics.cssWidth).toBeGreaterThan(300);
  expect(canvasMetrics.cssHeight).toBeGreaterThan(500);
  expect(canvasMetrics.hasWebGl).toBe(true);

  await page.waitForTimeout(1_000);
  const screenshot = await page.screenshot({
    path: testInfo.outputPath("home.png"),
    animations: "disabled",
  });
  assertScreenshotHasRenderedPixels(screenshot);

  const firstSave = await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
  const firstEnvelope = JSON.parse(firstSave!);
  expect(firstEnvelope.schemaVersion).toBe(1);
  expect(firstEnvelope.snapshot.player.id).toEqual(expect.any(String));
  expect(firstEnvelope.snapshot.progress.level).toBe(1);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), SAVE_KEY), {
      timeout: 20_000,
    })
    .not.toBeNull();
  const restoredSave = await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
  expect(JSON.parse(restoredSave!).snapshot.player.id).toBe(
    firstEnvelope.snapshot.player.id,
  );
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

function assertScreenshotHasRenderedPixels(buffer: Buffer): void {
  const image = PNG.sync.read(buffer);
  const colors = new Set<number>();
  let minLuminance = 255;
  let maxLuminance = 0;
  for (let y = 0; y < image.height; y += 4) {
    for (let x = 0; x < image.width; x += 4) {
      const offset = (image.width * y + x) * 4;
      const red = image.data[offset]!;
      const green = image.data[offset + 1]!;
      const blue = image.data[offset + 2]!;
      colors.add((red << 16) | (green << 8) | blue);
      const luminance = Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);
      minLuminance = Math.min(minLuminance, luminance);
      maxLuminance = Math.max(maxLuminance, luminance);
    }
  }
  expect(colors.size).toBeGreaterThan(100);
  expect(maxLuminance - minLuminance).toBeGreaterThan(100);
}
