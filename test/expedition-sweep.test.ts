import {
  EXPEDITION_STAGE_CONFIGS,
  EXPEDITION_SWEEP_MAX_COUNT,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const FUTURE = new Date("2099-01-01T00:00:00.000Z");
// The lowest level whose bare power clears each stage. Past the sixth the jumps
// are realm boundaries: the three band-entry stages land exactly on Lv.61, 151
// and 301, and each band's second stage becomes bare-clearable partway in.
const STAGE_LEVELS = [1, 4, 8, 11, 18, 31, 61, 101, 151, 221, 301, 401] as const;

type MutableSave = Record<string, any>;

function serviceWithClears(
  clearedCount: number,
  level: number,
  tokenCount = 2,
): { service: LocalGameService; platform: FakePlatformAdapter } {
  const writer = new FakePlatformAdapter();
  new LocalGameService(writer).initialize(FUTURE);
  const save = JSON.parse(writer.raw(SAVE_KEY)!) as MutableSave;
  save.savedAt = FUTURE.toISOString();
  save.snapshot.progress.level = level;
  save.snapshot.progress.experience = "0";
  save.snapshot.progress.cultivationReserve = "0";
  save.snapshot.progress.status = "gaining";
  save.snapshot.progress.settledAt = FUTURE.toISOString();
  save.snapshot.expedition.clearedStageIds = EXPEDITION_STAGE_CONFIGS.slice(
    0,
    clearedCount,
  ).map((stage) => stage.id);
  save.snapshot.expedition.sweepCounts = [];
  save.snapshot.inventory.stacks = tokenCount > 0
    ? [
        {
          itemConfigId: "treasure_token",
          displayName: "寻宝令",
          quantity: String(tokenCount),
        },
      ]
    : [];

  const platform = new FakePlatformAdapter();
  platform.seed(SAVE_KEY, save);
  const service = new LocalGameService(platform);
  const loaded = service.initialize(FUTURE);
  if (loaded.created) throw new Error("expected sweep fixture to load");
  // The level milestones this fixture has already passed settle on the first
  // tick; getting them out of the way keeps their spirit stone out of the reward
  // deltas measured around the sweep itself.
  service.checkpoint(new Date(FUTURE.getTime() + 1_000));
  return { service, platform };
}

function stackQuantity(service: LocalGameService, itemConfigId: string): bigint {
  return BigInt(
    service.snapshot.inventory.stacks.find(
      (stack) => stack.itemConfigId === itemConfigId,
    )?.quantity ?? "0",
  );
}

describe("expedition sweep rewards", () => {
  it("sweeps every cleared stage for its exact configured rewards", () => {
    EXPEDITION_STAGE_CONFIGS.forEach((stage, index) => {
      const { service, platform } = serviceWithClears(
        index + 1,
        STAGE_LEVELS[index]!,
      );
      expect(BigInt(service.snapshot.progress.totalPower)).toBeGreaterThanOrEqual(
        BigInt(stage.requiredPower),
      );
      const stonesBefore = BigInt(service.snapshot.wallet.spiritStone);
      const lifetimeBefore = BigInt(
        service.snapshot.wallet.lifetimeSpiritStoneEarned,
      );
      const itemAmountsBefore = stage.sweepItemRewards.map((reward) =>
        stackQuantity(service, reward.itemConfigId),
      );

      const result = service.sweepExpedition(stage.id);

      expect(result.message).toBe(
        `扫荡${stage.displayName}，获得 ${stage.sweepSpiritStoneReward} 灵石和历练物资`,
      );
      expect(stackQuantity(service, "treasure_token")).toBe(1n);
      expect(BigInt(service.snapshot.wallet.spiritStone)).toBe(
        stonesBefore + BigInt(stage.sweepSpiritStoneReward),
      );
      expect(BigInt(service.snapshot.wallet.lifetimeSpiritStoneEarned)).toBe(
        lifetimeBefore + BigInt(stage.sweepSpiritStoneReward),
      );
      stage.sweepItemRewards.forEach((reward, rewardIndex) => {
        expect(stackQuantity(service, reward.itemConfigId)).toBe(
          itemAmountsBefore[rewardIndex]! + BigInt(reward.quantity),
        );
      });
      expect(service.snapshot.expedition.sweepCounts).toContainEqual({
        stageConfigId: stage.id,
        count: 1,
      });

      const reloaded = new LocalGameService(platform);
      expect(reloaded.initialize(new Date(service.savedAt)).created).toBe(false);
      expect(reloaded.snapshot.expedition.sweepCounts).toEqual(
        service.snapshot.expedition.sweepCounts,
      );
    });
  });

  it("increments the same stage counter without duplicating its record", () => {
    const { service } = serviceWithClears(1, 1, 2);

    service.sweepExpedition(EXPEDITION_STAGE_CONFIGS[0]!.id);
    service.sweepExpedition(EXPEDITION_STAGE_CONFIGS[0]!.id);

    expect(service.snapshot.expedition.sweepCounts).toEqual([
      { stageConfigId: EXPEDITION_STAGE_CONFIGS[0]!.id, count: 2 },
    ]);
    expect(stackQuantity(service, "treasure_token")).toBe(0n);
  });
});

describe("expedition sweep rejections", () => {
  it("rejects unknown, uncleared, underpowered, tokenless, and capped sweeps", () => {
    expect(() => serviceWithClears(1, 1).service.sweepExpedition("missing")).toThrow(
      "未知的历练关卡",
    );
    expect(() =>
      serviceWithClears(0, 1).service.sweepExpedition(
        EXPEDITION_STAGE_CONFIGS[0]!.id,
      ),
    ).toThrow("完成该关首通后才能扫荡");
    expect(() =>
      serviceWithClears(2, 1).service.sweepExpedition(
        EXPEDITION_STAGE_CONFIGS[1]!.id,
      ),
    ).toThrow("当前战力不足，还需 300");
    expect(() =>
      serviceWithClears(1, 1, 0).service.sweepExpedition(
        EXPEDITION_STAGE_CONFIGS[0]!.id,
      ),
    ).toThrow("寻宝令不足，无法扫荡");

    const capped = serviceWithClears(1, 1).service;
    capped.snapshot.expedition.sweepCounts.push({
      stageConfigId: EXPEDITION_STAGE_CONFIGS[0]!.id,
      count: EXPEDITION_SWEEP_MAX_COUNT,
    });
    expect(() =>
      capped.sweepExpedition(EXPEDITION_STAGE_CONFIGS[0]!.id),
    ).toThrow("该关扫荡次数已达到本地存档上限");
  });

  it("rolls back the token, rewards, wallet, and counter when the bag is full", () => {
    const { service } = serviceWithClears(1, 1, 1);
    service.snapshot.inventory.bagCapacity = 1;
    const before = JSON.stringify({
      inventory: service.snapshot.inventory,
      wallet: service.snapshot.wallet,
      expedition: service.snapshot.expedition,
    });

    expect(() =>
      service.sweepExpedition(EXPEDITION_STAGE_CONFIGS[0]!.id),
    ).toThrow("行囊空间不足，无法领取扫荡奖励");

    expect(
      JSON.stringify({
        inventory: service.snapshot.inventory,
        wallet: service.snapshot.wallet,
        expedition: service.snapshot.expedition,
      }),
    ).toBe(before);
  });
});
