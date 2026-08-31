import { describe, expect, it } from "vitest";
import {
  DESIGN_VIEWPORT_HEIGHT,
  DESIGN_VIEWPORT_WIDTH,
  resolveDesignResolutionMode,
  resolveDesignSafeAreaLayout,
} from "../assets/scripts/core/SafeArea";

describe("design viewport resolution", () => {
  it("keeps narrow phone screens fixed to the design width", () => {
    const layout = resolveDesignSafeAreaLayout({
      windowWidth: 390,
      windowHeight: 844,
    });

    expect(layout.viewportWidth).toBeCloseTo(DESIGN_VIEWPORT_WIDTH);
    expect(layout.viewportHeight).toBeGreaterThan(DESIGN_VIEWPORT_HEIGHT);
    expect(resolveDesignResolutionMode(layout)).toBe("fixed-width");
  });

  it("keeps wide browser screens fixed to the design height", () => {
    const layout = resolveDesignSafeAreaLayout({
      windowWidth: 900,
      windowHeight: 1_200,
    });

    expect(layout.viewportWidth).toBeCloseTo(1_000.5, 1);
    expect(layout.viewportHeight).toBeCloseTo(DESIGN_VIEWPORT_HEIGHT);
    expect(resolveDesignResolutionMode(layout)).toBe("fixed-height");
  });

  it("preserves the baseline design viewport exactly", () => {
    const layout = resolveDesignSafeAreaLayout({
      windowWidth: DESIGN_VIEWPORT_WIDTH,
      windowHeight: DESIGN_VIEWPORT_HEIGHT,
    });

    expect(layout.viewportWidth).toBe(DESIGN_VIEWPORT_WIDTH);
    expect(layout.viewportHeight).toBe(DESIGN_VIEWPORT_HEIGHT);
    expect(resolveDesignResolutionMode(layout)).toBe("fixed-width");
  });
});
