import { expect, type Page } from "@playwright/test";
import { PNG } from "pngjs";

export const SAVE_KEY = "cultivation-diary.local-save.v1";

export type SaveEnvelope = {
  schemaVersion: number;
  savedAt: string;
  snapshot: Record<string, any>;
};

export async function readSave(page: Page): Promise<SaveEnvelope> {
  const raw = await readRawSave(page);
  if (!raw) throw new Error("local save disappeared");
  return JSON.parse(raw) as SaveEnvelope;
}

function readRawSave(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
}

/**
 * Boots once so the app writes a baseline save, then reboots with `mutate`
 * applied to it. The seed goes in as an init script rather than a write plus a
 * reload: navigating fires `pagehide`, and the outgoing page checkpoints its own
 * in-memory snapshot on the way out, overwriting anything written beforehand.
 * An init script runs after that checkpoint and before the bundle boots, so the
 * seeded save is what the app actually restores.
 */
export async function bootWithSave(
  page: Page,
  mutate: (envelope: SaveEnvelope) => void,
): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect.poll(() => readRawSave(page), { timeout: 20_000 }).not.toBeNull();
  const envelope = await readSave(page);
  mutate(envelope);
  envelope.savedAt = new Date().toISOString();
  const seed = JSON.stringify(envelope);
  await page.addInitScript(
    ({ key, value }: { key: string; value: string }) =>
      localStorage.setItem(key, value),
    { key: SAVE_KEY, value: seed },
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
}

type ScenePoint = { readonly x: number; readonly y: number; readonly nodeY: number };

/**
 * Resolves a named scene node to a click point in CSS pixels. Going through the
 * camera keeps the tests independent of the resolution policy: the design box is
 * pinned to the width on a tall viewport and to the height on a wide one, so a
 * hand-computed design-to-pixel mapping lands on the wrong control on at least
 * one of the two viewports the suite runs.
 */
async function scenePoints(page: Page, name: string): Promise<ScenePoint[]> {
  const found = await page.evaluate((nodeName) => {
    const cc = (window as unknown as { cc?: any }).cc;
    const scene = cc?.director?.getScene?.();
    const camera = cc?.find?.("Canvas")?.getComponentInChildren?.(cc.Camera);
    const canvas = document.getElementById("GameCanvas") as HTMLCanvasElement | null;
    if (!scene || !camera || !canvas) return null;
    const hits: Array<{ sx: number; sy: number; nodeY: number }> = [];
    const walk = (node: any): void => {
      if (node.name === nodeName && node.activeInHierarchy) {
        const screen = camera.worldToScreen(node.worldPosition);
        hits.push({ sx: screen.x, sy: screen.y, nodeY: node.worldPosition.y });
      }
      for (const child of node.children) walk(child);
    };
    walk(scene);
    return { hits, width: canvas.width, height: canvas.height };
  }, name);
  if (!found) return [];
  const bounds = await page.locator("#GameCanvas").boundingBox();
  if (!bounds) return [];
  return found.hits.map((hit) => ({
    x: bounds.x + (hit.sx / found.width) * bounds.width,
    y: bounds.y + (1 - hit.sy / found.height) * bounds.height,
    nodeY: hit.nodeY,
  }));
}

/**
 * The real boot gate. A visible canvas and a non-null save are both true while
 * the engine still shows its splash, but a named node only exists once the view
 * has drawn the restored state.
 */
export async function waitForNode(page: Page, name: string): Promise<void> {
  await expect
    .poll(async () => (await scenePoints(page, name)).length, { timeout: 30_000 })
    .toBeGreaterThan(0);
}

/**
 * Clicks a named node, topmost first. Every button is named after its label, so
 * a repeated row renders several nodes under one name; the topmost one belongs
 * to the first row, which is the piece these tests seed at the head of the list.
 */
export async function clickNode(page: Page, name: string): Promise<void> {
  await waitForNode(page, name);
  const points = [...(await scenePoints(page, name))].sort(
    (left, right) => right.nodeY - left.nodeY,
  );
  const target = points[0]!;
  await page.mouse.click(target.x, target.y);
}

/** Reads the rendered string of every label whose text starts with `prefix`. */
export async function labelTexts(page: Page, prefix: string): Promise<string[]> {
  return page.evaluate((wanted) => {
    const cc = (window as unknown as { cc?: any }).cc;
    const scene = cc?.director?.getScene?.();
    if (!scene) return [];
    const strings: string[] = [];
    const walk = (node: any): void => {
      const label = node.getComponent?.(cc.Label);
      const text: unknown = label?.string;
      if (typeof text === "string" && text.startsWith(wanted)) strings.push(text);
      for (const child of node.children) walk(child);
    };
    walk(scene);
    return strings;
  }, prefix);
}

/**
 * Guards against a screenshot that merely proves the file is a PNG. The engine
 * splash is a near-flat frame, so demanding many distinct colours and a wide
 * luminance range is what separates a drawn UI from a loading screen.
 */
export function assertScreenshotHasRenderedPixels(buffer: Buffer): void {
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
