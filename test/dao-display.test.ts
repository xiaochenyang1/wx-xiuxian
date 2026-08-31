import { DAO_MAX_LEVEL, daoLevelCost } from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import { getDaoDisplay } from "../assets/scripts/core/DaoDisplay";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const START = new Date("2026-01-01T00:00:00.000Z");

/** A fresh snapshot rewritten to the state under test, without touching disk. */
function snapshotAt(level: number, daoLevel: number, reserve: string) {
  const service = new LocalGameService(new FakePlatformAdapter());
  service.initialize(START);
  const base = service.snapshot;
  return {
    ...base,
    progress: { ...base.progress, level, cultivationReserve: reserve },
    dao: { level: daoLevel },
  };
}

describe("the dao block", () => {
  it("stays hidden below the level cap", () => {
    expect(getDaoDisplay(snapshotAt(999, 0, "0")).visible).toBe(false);
    expect(getDaoDisplay(snapshotAt(1000, 0, "0")).visible).toBe(true);
  });

  it("reads the three axes as percentages", () => {
    const display = getDaoDisplay(snapshotAt(1000, DAO_MAX_LEVEL, "0"));
    expect(display.titleText).toBe(`道行 Lv.50/${DAO_MAX_LEVEL}`);
    expect(display.bonusText).toBe("修为 +75% · 灵石 +75% · 掉落 +50%");
    expect(display.costText).toBe("道行已至圆满");
    expect(display.actionEnabled).toBe(false);
  });

  it("names the shortfall while the reserve is short", () => {
    const display = getDaoDisplay(snapshotAt(1000, 0, "400000"));
    expect(display.costText).toBe("下一级需 100万，还差 60万");
    expect(display.actionEnabled).toBe(false);
    expect(display.batchActionText).toBe("批量悟道");
  });

  it("offers the batch size the reserve actually covers", () => {
    const display = getDaoDisplay(snapshotAt(1000, 0, "2280000"));
    expect(display.affordableLevels).toBe(2);
    expect(display.batchActionText).toBe("批量悟道 x2");
    expect(display.actionEnabled).toBe(true);
    expect(display.costText).toBe("下一级需 100万");
    expect(daoLevelCost(1)).toBe("1000000");
  });

  it("shows the zero state as zeroes rather than hiding the axes", () => {
    const display = getDaoDisplay(snapshotAt(1000, 0, "0"));
    expect(display.bonusText).toBe("修为 +0% · 灵石 +0% · 掉落 +0%");
    expect(display.reserveText).toBe("修为储备 0");
  });

  it("never offers more levels than the ladder has left", () => {
    // A reserve far past the whole ladder's 819,103,077,163, one step from full.
    const display = getDaoDisplay(snapshotAt(1000, DAO_MAX_LEVEL - 1, "9".repeat(20)));
    expect(display.affordableLevels).toBe(1);
    expect(display.actionText).toBe("悟道");
    expect(display.batchActionText).toBe("批量悟道");
    expect(display.actionEnabled).toBe(true);
  });
});
