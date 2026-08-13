import {
  EXPEDITION_STAGE_CONFIGS,
  type BootstrapSnapshot,
  type ExpeditionStageId,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import {
  getExpeditionStageDisplay,
  getExpeditionSummary,
} from "../assets/scripts/core/ExpeditionDisplay";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const FUTURE = new Date("2099-01-01T00:00:00.000Z");

function snapshotWith(
  clearedStageIds: ExpeditionStageId[] = [],
  totalPower = "100",
): BootstrapSnapshot {
  const service = new LocalGameService(new FakePlatformAdapter());
  service.initialize(FUTURE);
  return {
    ...service.snapshot,
    expedition: { clearedStageIds },
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
      rewardText: "灵石 300 · 木材x5 · 石材x5",
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
      statusText: "首通完成",
      actionText: "已完成",
      actionEnabled: false,
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

    expect(display.requirementText).toBe("战力 6,500");
    expect(display.rewardText).toBe(
      "灵石 1.2万 · 木材x20 · 石材x20 · 灵土x20 · 灵草x20 · 矿石x20 · 强化石x8",
    );
  });
});

describe("expedition summary", () => {
  it("shows cleared count and formatted current power", () => {
    expect(getExpeditionSummary(snapshotWith())).toBe("已通关 0 关 · 当前战力 100");
    expect(
      getExpeditionSummary(
        snapshotWith([EXPEDITION_STAGE_CONFIGS[0]!.id], "12345"),
      ),
    ).toBe("已通关 1 关 · 当前战力 1.23万");
  });
});
