import { describe, expect, it } from "vitest";
import {
  getFeatureMessageDisplay,
  getMainFeatureMessageGeometry,
  type FeatureMessageDisplayContext,
} from "../assets/scripts/core/FeatureMessageDisplay";
import type { MainTab } from "../assets/scripts/core/ClientTypes";

function context(
  overrides: Partial<FeatureMessageDisplayContext> = {},
): FeatureMessageDisplayContext {
  return {
    message: "操作已完成",
    selectedTab: "cultivation",
    activeFeatureOpen: false,
    offlineSettlementOpen: false,
    partnerUnlockNoticeOpen: false,
    ...overrides,
  };
}

describe("feature message display decision", () => {
  it("places feedback on every main view and reserves a separate cultivation lane", () => {
    const tabs: readonly MainTab[] = [
      "cultivation",
      "cave",
      "partner",
      "ranking",
    ];

    expect(
      tabs.map((selectedTab) =>
        getFeatureMessageDisplay(context({ selectedTab })),
      ),
    ).toEqual([
      {
        surface: "main",
        tab: "cultivation",
        text: "操作已完成",
        maxLines: 2,
      },
      {
        surface: "main",
        tab: "cave",
        text: "操作已完成",
        maxLines: 2,
      },
      {
        surface: "main",
        tab: "partner",
        text: "操作已完成",
        maxLines: 2,
      },
      {
        surface: "main",
        tab: "ranking",
        text: "操作已完成",
        maxLines: 2,
      },
    ]);
  });

  it("routes an open feature panel to exactly one local feedback surface", () => {
    expect(
      getFeatureMessageDisplay(context({ activeFeatureOpen: true })),
    ).toEqual({
      surface: "feature-panel",
      text: "操作已完成",
      maxLines: 2,
    });
  });

  it("keeps the unlock notice local and hides feedback behind offline settlement", () => {
    expect(
      getFeatureMessageDisplay(context({ partnerUnlockNoticeOpen: true })),
    ).toEqual({
      surface: "partner-unlock",
      text: "操作已完成",
      maxLines: 1,
    });
    expect(
      getFeatureMessageDisplay(context({ offlineSettlementOpen: true })),
    ).toBeNull();
  });

  it("ignores blank messages and bounds normalized long text", () => {
    expect(getFeatureMessageDisplay(context({ message: " \n\t " }))).toBeNull();

    const display = getFeatureMessageDisplay(
      context({
        message: `  ${"反馈".repeat(40)}\n请稍候  `,
        activeFeatureOpen: true,
      }),
    );
    expect(display?.text).not.toContain("\n");
    expect(Array.from(display?.text ?? "")).toHaveLength(64);
    expect(display?.text.endsWith("...")).toBe(true);
  });

  it("keeps the single-line partner unlock message within its label width", () => {
    const display = getFeatureMessageDisplay(
      context({
        message: "行囊空间不足，请先整理行囊后再领取这份突破奖励".repeat(2),
        partnerUnlockNoticeOpen: true,
      }),
    );

    expect(display?.surface).toBe("partner-unlock");
    expect(Array.from(display?.text ?? "")).toHaveLength(28);
    expect(display?.text.endsWith("...")).toBe(true);
  });

  it("uses page-local slots that stay clear of controls across safe-area shifts", () => {
    const layouts = [
      { bodyOffsetY: 0, navigationCenterY: -580 },
      { bodyOffsetY: -40, navigationCenterY: -580 },
      { bodyOffsetY: -40, navigationCenterY: -540 },
    ] as const;
    const mainControls = {
      cultivation: { y: -267, height: 62 },
      cave: { y: -95, height: 44 },
      partner: { y: -60, height: 44 },
      ranking: { y: -275, height: 86 },
    } as const;

    for (const selectedTab of [
      "cultivation",
      "cave",
      "partner",
      "ranking",
    ] as const) {
      const geometry = getMainFeatureMessageGeometry(selectedTab);
      for (const layout of layouts) {
        const message = verticalBounds(
          geometry.y + layout.bodyOffsetY,
          geometry.height,
        );
        const control = verticalBounds(
          mainControls[selectedTab].y + layout.bodyOffsetY,
          mainControls[selectedTab].height,
        );
        const bottomNavigation = verticalBounds(layout.navigationCenterY, 174);

        expect(overlaps(message, control)).toBe(false);
        expect(overlaps(message, bottomNavigation)).toBe(false);
      }
    }
  });
});

function verticalBounds(centerY: number, height: number) {
  return { bottom: centerY - height / 2, top: centerY + height / 2 };
}

function overlaps(
  first: ReturnType<typeof verticalBounds>,
  second: ReturnType<typeof verticalBounds>,
): boolean {
  return first.bottom < second.top && second.bottom < first.top;
}
