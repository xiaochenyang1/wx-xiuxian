import {
  TREASURE_HUNT_REWARDS,
  TREASURE_HUNT_TOTAL_WEIGHT,
  getItemConfig,
  pickTreasureHuntReward,
} from "@cultivation-diary/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const SAVE_KEY = CLIENT_CONFIG.localSaveStorageKey;
const NOW = new Date("2026-08-13T08:00:00.000Z");
type MutableSave = Record<string, any>;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function serviceWithTokens(quantity: number): LocalGameService {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const platform = new FakePlatformAdapter();
  const writer = new LocalGameService(platform);
  writer.initialize(NOW);
  const raw = platform.raw(SAVE_KEY);
  if (raw === undefined) throw new Error("expected initial save");
  const save = JSON.parse(raw) as MutableSave;
  save.snapshot.inventory.stacks =
    quantity > 0
      ? [
          {
            itemConfigId: "treasure_token",
            displayName: "寻宝令",
            quantity: String(quantity),
          },
        ]
      : [];
  platform.seed(SAVE_KEY, save);
  const service = new LocalGameService(platform);
  expect(service.initialize(NOW).created).toBe(false);
  return service;
}

function quantityOf(service: LocalGameService, itemConfigId: string): string {
  return (
    service.snapshot.inventory.stacks.find(
      (stack) => stack.itemConfigId === itemConfigId,
    )?.quantity ?? "0"
  );
}

describe("treasure hunt configuration", () => {
  it("covers the complete roll range with real rewards", () => {
    expect(TREASURE_HUNT_TOTAL_WEIGHT).toBe(10_000);
    let cursor = 0;
    for (const reward of TREASURE_HUNT_REWARDS) {
      expect(pickTreasureHuntReward(cursor)).toBe(reward);
      cursor += reward.weight;
      if (reward.kind === "item") {
        expect(() => getItemConfig(reward.itemConfigId)).not.toThrow();
      }
    }
    expect(cursor).toBe(TREASURE_HUNT_TOTAL_WEIGHT);
    expect(() => pickTreasureHuntReward(-1)).toThrow(RangeError);
    expect(() => pickTreasureHuntReward(TREASURE_HUNT_TOTAL_WEIGHT)).toThrow(
      RangeError,
    );
  });
});

describe("local treasure hunt", () => {
  it("spends one token and awards the rolled stack item", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.75);
    const service = serviceWithTokens(2);

    const result = service.huntTreasure();

    expect(quantityOf(service, "treasure_token")).toBe("1");
    expect(quantityOf(service, "technique_page")).toBe("5");
    expect(result.message).toBe("寻得 功法残页 x5");
  });

  it("awards spirit stones and lifetime wealth together", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const service = serviceWithTokens(1);

    service.huntTreasure();

    expect(quantityOf(service, "treasure_token")).toBe("0");
    expect(service.snapshot.wallet.spiritStone).toBe("1500");
    expect(service.snapshot.wallet.lifetimeSpiritStoneEarned).toBe("1500");
  });

  it("rejects a hunt without a token", () => {
    const service = serviceWithTokens(0);
    expect(() => service.huntTreasure()).toThrow("寻宝令不足");
  });
});
