import { expect, test } from "@playwright/test";
import {
  assertScreenshotHasRenderedPixels,
  clickNode,
  SAVE_KEY,
  waitForNode,
} from "./canvas";

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

test("keeps the profile input on its application-owned labels", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForNode(page, "HeaderAvatarButton");
  await clickNode(page, "HeaderAvatarButton");
  await waitForNode(page, "ProfileNameInput");

  const profileInput = await page.evaluate(() => {
    const cc = (window as unknown as { cc?: any }).cc;
    const scene = cc?.director?.getScene?.();
    if (!scene) return null;
    let target: any = null;
    const walk = (node: any): void => {
      if (node.name === "ProfileNameInput" && node.activeInHierarchy) target = node;
      for (const child of node.children) walk(child);
    };
    walk(scene);
    if (!target) return null;
    return target.children.map((child: any) => ({
      name: child.name,
      label: child.getComponent?.(cc.Label)?.string ?? null,
    }));
  });

  expect(profileInput).not.toBeNull();
  const childNames = profileInput!.map(
    (child: { name: string; label: string | null }) => child.name,
  );
  expect(childNames).not.toContain("TEXT_LABEL");
  expect(childNames).not.toContain("PLACEHOLDER_LABEL");
  const labels = profileInput!
    .map((child: { name: string; label: string | null }) => child.label)
    .filter(
      (label: string | null): label is string => typeof label === "string",
    );
  expect(labels).toEqual(expect.arrayContaining(["青岚子", "输入新的道号"]));
  expect(labels).toHaveLength(2);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
