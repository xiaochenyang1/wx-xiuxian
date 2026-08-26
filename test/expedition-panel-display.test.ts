import {
  EXPEDITION_STAGE_CONFIGS,
  type BootstrapSnapshot,
  type ExpeditionStageId,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import {
  VISIBLE_EXPEDITION_STAGE_COUNT,
  getExpeditionStageDisplay,
  getExpeditionSummary,
  selectVisibleExpeditionStages,
} from "../assets/scripts/core/ExpeditionDisplay";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const FUTURE = new Date("2099-01-01T00:00:00.000Z");

function snapshotWith(
  clearedStageIds: ExpeditionStageId[] = [],
  totalPower = "100",
  sweepCounts: BootstrapSnapshot["expedition"]["sweepCounts"] = [],
): BootstrapSnapshot {
  const service = new LocalGameService(new FakePlatformAdapter());
  service.initialize(FUTURE);
  return {
    ...service.snapshot,
    expedition: { clearedStageIds, sweepCounts },
    progress: { ...service.snapshot.progress, totalPower },
  };
}

describe("expedition stage display", () => {
  const first = EXPEDITION_STAGE_CONFIGS[0]!;
  const second = EXPEDITION_STAGE_CONFIGS[1]!;

  it("renders the ready frontier and its complete reward quote", () => {
    const display = getExpeditionStageDisplay(snapshotWith(), first);

    expect(display).toEqual({
      status: "ready",
      requirementText: "战力 100",
      rewardText: "灵石 300 · 木材x5 · 石材x5 · 寻宝令x1 · 改名卡x1",
      statusText: "可以挑战",
      actionText: "挑战",
      actionEnabled: true,
    });
  });

  it("distinguishes cleared, locked, and underpowered stages", () => {
    expect(
      getExpeditionStageDisplay(snapshotWith([first.id]), first),
    ).toMatchObject({
      status: "cleared",
      statusText: "已扫荡 0 次",
      actionText: "扫荡",
      actionEnabled: true,
      rewardText: "耗寻宝令x1 · 灵石 100 · 木材x3 · 石材x3",
    });
    expect(getExpeditionStageDisplay(snapshotWith(), second)).toMatchObject({
      status: "locked",
      statusText: "前置未完成",
      actionText: "未解锁",
      actionEnabled: false,
    });
    expect(
      getExpeditionStageDisplay(snapshotWith([first.id], "100"), second),
    ).toMatchObject({
      status: "underpowered",
      statusText: "尚差 300 战力",
      actionText: "尝试",
      actionEnabled: true,
    });
  });

  it("enables the next stage at exactly its required power", () => {
    expect(
      getExpeditionStageDisplay(
        snapshotWith([first.id], second.requiredPower),
        second,
      ),
    ).toMatchObject({
      status: "ready",
      statusText: "可以挑战",
      actionText: "挑战",
      actionEnabled: true,
    });
  });

  it("formats the final stage's large reward and all item names", () => {
    const finalStage = EXPEDITION_STAGE_CONFIGS.at(-1)!;
    const display = getExpeditionStageDisplay(
      snapshotWith(
        EXPEDITION_STAGE_CONFIGS.slice(0, -1).map((stage) => stage.id),
        finalStage.requiredPower,
      ),
      finalStage,
    );

    expect(display.requirementText).toBe("战力 1.2亿");
    expect(display.rewardText).toBe(
      "灵石 500万 · 木材x594 · 石材x330 · 灵土x462 · 灵草x1584 · 矿石x1188 · 强化石x200 · 功法残页x60 · 寻宝令x20",
    );
  });
});

describe("expedition summary", () => {
  it("shows cleared count and formatted current power", () => {
    expect(getExpeditionSummary(snapshotWith())).toBe(
      "首通 0/12 · 扫荡 0 · 战力 100",
    );
    expect(
      getExpeditionSummary(
        snapshotWith(
          [EXPEDITION_STAGE_CONFIGS[0]!.id],
          "12345",
          [{ stageConfigId: EXPEDITION_STAGE_CONFIGS[0]!.id, count: 12 }],
        ),
      ),
    ).toBe("首通 1/12 · 扫荡 12 · 战力 1.23万");
  });
});

describe("the visible stage window", () => {
  const ids = (clearedCount: number): readonly string[] =>
    selectVisibleExpeditionStages(clearedCount).map((stage) => stage.id);

  it("shows the whole first screen until six stages are cleared", () => {
    const firstScreen = EXPEDITION_STAGE_CONFIGS.slice(0, 6).map(
      (stage) => stage.id,
    );
    for (let cleared = 0; cleared <= 5; cleared += 1) {
      expect(ids(cleared)).toEqual(firstScreen);
    }
  });

  it("ends the window on the next stage once the campaign outgrows a screen", () => {
    expect(ids(6)).toEqual([
      "mistwood_forest",
      "blackwater_marsh",
      "swordscar_valley",
      "red_sand_mine",
      "ancient_cultivator_ruins",
      "bonecrypt_wastes",
    ]);
    expect(ids(6).at(-1)).toBe(EXPEDITION_STAGE_CONFIGS[6]!.id);
    expect(ids(9).at(-1)).toBe(EXPEDITION_STAGE_CONFIGS[9]!.id);
  });

  it("stops sliding at the end so the last screen stays full", () => {
    const lastScreen = EXPEDITION_STAGE_CONFIGS.slice(-6).map((stage) => stage.id);
    expect(ids(11)).toEqual(lastScreen);
    expect(ids(12)).toEqual(lastScreen);
    // A save that somehow claims more clears than there are stages still gets a
    // full screen rather than an empty panel.
    expect(ids(99)).toEqual(lastScreen);
  });

  it("never returns more rows than the panel can draw", () => {
    for (let cleared = 0; cleared <= EXPEDITION_STAGE_CONFIGS.length; cleared += 1) {
      expect(ids(cleared)).toHaveLength(VISIBLE_EXPEDITION_STAGE_COUNT);
    }
  });
});
