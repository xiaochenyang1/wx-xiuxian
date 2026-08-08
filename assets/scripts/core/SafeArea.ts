export const DESIGN_VIEWPORT_WIDTH = 750;
export const DESIGN_VIEWPORT_HEIGHT = 1_334;

const HEADER_HEIGHT = 154;
const HEADER_TOP_MARGIN = 0;
const SYNC_STATUS_OFFSET = 93;
const NAVIGATION_HEIGHT = 174;
const BASELINE_HEADER_CENTER_Y =
  DESIGN_VIEWPORT_HEIGHT / 2 - HEADER_TOP_MARGIN - HEADER_HEIGHT / 2;

export interface RawViewportMetrics {
  readonly windowWidth?: unknown;
  readonly windowHeight?: unknown;
  readonly safeArea?: unknown;
  readonly menuButton?: unknown;
}

export interface DesignRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface DesignSafeAreaLayout {
  readonly scale: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly insets: DesignInsets;
  readonly safeArea: DesignRect;
  readonly menuButton: DesignRect | null;
}

export interface DesignInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface AppChromeGeometry {
  readonly centerX: number;
  readonly width: number;
  readonly headerCenterY: number;
  readonly statusBannerCenterY: number;
  readonly navigationCenterY: number;
  readonly bodyOffsetY: number;
}

interface PhysicalRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export function hasUsableViewportDimensions(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isPositiveFinite(value.windowWidth) && isPositiveFinite(value.windowHeight);
}

export function resolveDesignSafeAreaLayout(
  input: RawViewportMetrics | null | undefined,
): DesignSafeAreaLayout {
  const hasViewport = hasUsableViewportDimensions(input);
  const windowWidth = hasViewport
    ? (input?.windowWidth as number)
    : DESIGN_VIEWPORT_WIDTH;
  const windowHeight = hasViewport
    ? (input?.windowHeight as number)
    : DESIGN_VIEWPORT_HEIGHT;
  const scale = windowWidth / DESIGN_VIEWPORT_WIDTH;
  const viewportWidth = windowWidth / scale;
  const viewportHeight = windowHeight / scale;
  const fullViewport: PhysicalRect = {
    left: 0,
    right: windowWidth,
    top: 0,
    bottom: windowHeight,
  };
  const safeArea = readPhysicalRect(input?.safeArea, windowWidth, windowHeight)
    ?? fullViewport;
  const menuCandidate = readPhysicalRect(
    input?.menuButton,
    windowWidth,
    windowHeight,
  );
  // A WeChat capsule belongs to the upper system chrome. Ignore geometrically
  // valid but misplaced values so corrupted platform data cannot hide the app.
  const menuButton = menuCandidate && menuCandidate.bottom <= windowHeight / 2
    ? menuCandidate
    : null;

  const designSafeArea = toDesignRect(
    safeArea,
    scale,
    viewportWidth,
    viewportHeight,
  );
  return {
    scale,
    viewportWidth,
    viewportHeight,
    insets: {
      top: viewportHeight / 2 - designSafeArea.top,
      right: viewportWidth / 2 - designSafeArea.right,
      bottom: designSafeArea.bottom + viewportHeight / 2,
      left: designSafeArea.left + viewportWidth / 2,
    },
    safeArea: designSafeArea,
    menuButton: menuButton
      ? toDesignRect(menuButton, scale, viewportWidth, viewportHeight)
      : null,
  };
}

export const DEFAULT_DESIGN_SAFE_AREA_LAYOUT =
  resolveDesignSafeAreaLayout({
    windowWidth: DESIGN_VIEWPORT_WIDTH,
    windowHeight: DESIGN_VIEWPORT_HEIGHT,
  });

export function resolveAppChromeGeometry(
  layout: DesignSafeAreaLayout,
): AppChromeGeometry {
  const safeWidth = Math.max(0, layout.safeArea.right - layout.safeArea.left);
  const topBoundary = Math.min(
    layout.safeArea.top,
    layout.menuButton?.bottom ?? layout.safeArea.top,
  );
  const headerCenterY =
    topBoundary - HEADER_TOP_MARGIN - HEADER_HEIGHT / 2;

  return {
    centerX: (layout.safeArea.left + layout.safeArea.right) / 2,
    width: Math.min(DESIGN_VIEWPORT_WIDTH, safeWidth),
    headerCenterY,
    statusBannerCenterY: headerCenterY - SYNC_STATUS_OFFSET,
    navigationCenterY: layout.safeArea.bottom + NAVIGATION_HEIGHT / 2,
    bodyOffsetY: headerCenterY - BASELINE_HEADER_CENTER_Y,
  };
}

export function clampModalButtonCenterY(
  preferredY: number,
  buttonHeight: number,
  layout: DesignSafeAreaLayout,
  margin = 24,
): number {
  if (!Number.isFinite(preferredY) || !isPositiveFinite(buttonHeight)) {
    return 0;
  }
  const topBoundary = Math.min(
    layout.safeArea.top,
    layout.menuButton?.bottom ?? layout.safeArea.top,
  );
  const lower = layout.safeArea.bottom + margin + buttonHeight / 2;
  const upper = topBoundary - margin - buttonHeight / 2;
  if (lower > upper) return (layout.safeArea.bottom + topBoundary) / 2;
  return Math.min(upper, Math.max(lower, preferredY));
}

function readPhysicalRect(
  value: unknown,
  windowWidth: number,
  windowHeight: number,
): PhysicalRect | null {
  if (!isRecord(value)) return null;
  const left = finiteNumber(value.left);
  const top = finiteNumber(value.top);
  const right = finiteNumber(value.right)
    ?? (left !== null ? addFinite(left, value.width) : null);
  const bottom = finiteNumber(value.bottom)
    ?? (top !== null ? addFinite(top, value.height) : null);
  if (left === null || right === null || top === null || bottom === null) {
    return null;
  }
  if (
    left < 0 ||
    top < 0 ||
    right > windowWidth ||
    bottom > windowHeight ||
    right <= left ||
    bottom <= top
  ) {
    return null;
  }
  return { left, right, top, bottom };
}

function toDesignRect(
  rect: PhysicalRect,
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
): DesignRect {
  const left = -viewportWidth / 2 + rect.left / scale;
  const right = -viewportWidth / 2 + rect.right / scale;
  const top = viewportHeight / 2 - rect.top / scale;
  const bottom = viewportHeight / 2 - rect.bottom / scale;
  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: top - bottom,
  };
}

function addFinite(base: number, value: unknown): number | null {
  const addition = finiteNumber(value);
  return addition === null ? null : base + addition;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
