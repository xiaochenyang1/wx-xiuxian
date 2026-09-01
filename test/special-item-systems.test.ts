import {
  TREASURE_HUNT_REWARD_ROWS,
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
    for (const row of TREASURE_HUNT_REWARD_ROWS) {
      const reward = pickTreasureHuntReward(1, cursor);
      expect(reward.kind).toBe(row.kind);
      cursor += row.weight;
      if (row.kind === "item") {
        expect(() => getItemConfig(row.itemConfigId)).not.toThrow();
      }
    }
    expect(cursor).toBe(TREASURE_HUNT_TOTAL_WEIGHT);
    expect(() => pickTreasureHuntReward(1, -1)).toThrow(RangeError);
    expect(() => pickTreasureHuntReward(1, TREASURE_HUNT_TOTAL_WEIGHT)).toThrow(
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
    expect(quantityOf(service, "technique_page")).toBe("15");
    expect(result.message).toBe("寻得 功法残页 x15");
  });

  it("awards spirit stones and lifetime wealth together", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const service = serviceWithTokens(1);

    service.huntTreasure();

    expect(quantityOf(service, "treasure_token")).toBe("0");
    // The fixture is a fresh Lv.1 save, so this is the 凡阶 row.
    expect(service.snapshot.wallet.spiritStone).toBe("3600");
    expect(service.snapshot.wallet.lifetimeSpiritStoneEarned).toBe("3600");
  });

  it("rejects a hunt without a token", () => {
    const service = serviceWithTokens(0);
    expect(() => service.huntTreasure()).toThrow("寻宝令不足");
  });
});
