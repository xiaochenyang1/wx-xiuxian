import { EXPEDITION_STAGE_CONFIGS } from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const FUTURE = new Date("2099-01-01T00:00:00.000Z");
const STAGE_LEVELS = [1, 4, 8, 11, 18, 31] as const;

type MutableSave = Record<string, any>;

function serviceAtFrontier(
  clearedCount: number,
  level: number,
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

  const platform = new FakePlatformAdapter();
  platform.seed(SAVE_KEY, save);
  const service = new LocalGameService(platform);
  const loaded = service.initialize(FUTURE);
  if (loaded.created) throw new Error("expected expedition fixture to load");
  // The level milestones this fixture has already passed settle on the first
  // tick; getting them out of the way keeps their spirit stone out of the reward
  // deltas measured around the expedition itself.
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

describe("expedition challenge rewards", () => {
  it("clears every configured stage at an attainable power and grants exact rewards", () => {
    EXPEDITION_STAGE_CONFIGS.forEach((stage, index) => {
      const { service, platform } = serviceAtFrontier(index, STAGE_LEVELS[index]!);
      expect(BigInt(service.snapshot.progress.totalPower)).toBeGreaterThanOrEqual(
        BigInt(stage.requiredPower),
      );
      const stonesBefore = BigInt(service.snapshot.wallet.spiritStone);
      const lifetimeBefore = BigInt(
        service.snapshot.wallet.lifetimeSpiritStoneEarned,
      );
      const itemAmountsBefore = stage.itemRewards.map((reward) =>
        stackQuantity(service, reward.itemConfigId),
      );

      const result = service.challengeExpedition(stage.id);

      expect(result.message).toBe(
        `首通${stage.displayName}，获得 ${stage.spiritStoneReward} 灵石和历练物资`,
      );
      expect(service.snapshot.expedition.clearedStageIds).toEqual(
        EXPEDITION_STAGE_CONFIGS.slice(0, index + 1).map((item) => item.id),
      );
      expect(BigInt(service.snapshot.wallet.spiritStone)).toBe(
        stonesBefore + BigInt(stage.spiritStoneReward),
      );
      expect(BigInt(service.snapshot.wallet.lifetimeSpiritStoneEarned)).toBe(
        lifetimeBefore + BigInt(stage.spiritStoneReward),
      );
      stage.itemRewards.forEach((reward, rewardIndex) => {
        expect(stackQuantity(service, reward.itemConfigId)).toBe(
          itemAmountsBefore[rewardIndex]! + BigInt(reward.quantity),
        );
      });

      const reloaded = new LocalGameService(platform);
      const load = reloaded.initialize(new Date(service.savedAt));
      expect(load.created).toBe(false);
      expect(reloaded.snapshot.expedition.clearedStageIds).toEqual(
        service.snapshot.expedition.clearedStageIds,
      );
    });
  });
});

describe("expedition challenge rejections", () => {
  it("rejects unknown, locked, cleared, and underpowered stages", () => {
    const unknown = serviceAtFrontier(0, 1).service;
    expect(() => unknown.challengeExpedition("missing_stage")).toThrow(
      "未知的历练关卡",
    );

    const locked = serviceAtFrontier(0, 1).service;
    expect(() => locked.challengeExpedition("mistwood_forest")).toThrow(
      "需先完成青石山道",
    );

    const cleared = serviceAtFrontier(1, 1).service;
    expect(() => cleared.challengeExpedition("greenstone_path")).toThrow(
      "首通奖励不可重复领取",
    );

    const underpowered = serviceAtFrontier(1, 1).service;
    expect(() => underpowered.challengeExpedition("mistwood_forest")).toThrow(
      "战力不足，还需 300",
    );
  });

  it("does not change rewards or progress after a rejected challenge", () => {
    const { service } = serviceAtFrontier(1, 1);
    const before = JSON.stringify({
      expedition: service.snapshot.expedition,
      inventory: service.snapshot.inventory,
      wallet: service.snapshot.wallet,
    });

    expect(() => service.challengeExpedition("mistwood_forest")).toThrow();

    expect(
      JSON.stringify({
        expedition: service.snapshot.expedition,
        inventory: service.snapshot.inventory,
        wallet: service.snapshot.wallet,
      }),
    ).toBe(before);
  });

  it("refuses a first clear when its new reward stacks do not fit", () => {
    const { service } = serviceAtFrontier(0, 1);
    // Shrink the capacity to isolate the slot gate without manufacturing dozens
    // of unrelated equipment fixtures.
    service.snapshot.inventory.bagCapacity = 1;

    expect(() => service.challengeExpedition("greenstone_path")).toThrow(
      "行囊空间不足",
    );
    expect(service.snapshot.expedition.clearedStageIds).toEqual([]);
    expect(service.snapshot.wallet.spiritStone).toBe("0");
    expect(service.snapshot.inventory.stacks).toEqual([]);
  });
});
