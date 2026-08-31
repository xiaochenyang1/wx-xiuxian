import {
  EXPEDITION_STAGE_CONFIGS,
  EXPEDITION_SWEEP_TOKEN_COST,
  calculateTotalPower,
  evaluateExpeditionStage,
  evaluateExpeditionSweep,
  getExpeditionStageConfig,
  getItemConfig,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";

describe("expedition configuration", () => {
  it("defines a strictly increasing twelve-stage campaign", () => {
    expect(EXPEDITION_STAGE_CONFIGS.map((stage) => stage.id)).toEqual([
      "greenstone_path",
      "mistwood_forest",
      "blackwater_marsh",
      "swordscar_valley",
      "red_sand_mine",
      "ancient_cultivator_ruins",
      "bonecrypt_wastes",
      "netherfall_abyss",
      "skyfire_sea",
      "myriad_sword_mound",
      "starfall_battlefield",
      "voidrift_expanse",
    ]);
    for (let index = 1; index < EXPEDITION_STAGE_CONFIGS.length; index += 1) {
      expect(
        BigInt(EXPEDITION_STAGE_CONFIGS[index]!.requiredPower),
      ).toBeGreaterThan(BigInt(EXPEDITION_STAGE_CONFIGS[index - 1]!.requiredPower));
    }
  });

  it("only rewards known items in positive whole quantities", () => {
    for (const stage of EXPEDITION_STAGE_CONFIGS) {
      expect(BigInt(stage.spiritStoneReward)).toBeGreaterThan(0n);
      expect(stage.itemRewards.length).toBeGreaterThan(0);
      for (const reward of stage.itemRewards) {
        expect(() => getItemConfig(reward.itemConfigId)).not.toThrow();
        expect(Number.isInteger(reward.quantity)).toBe(true);
        expect(reward.quantity).toBeGreaterThan(0);
      }
      expect(BigInt(stage.sweepSpiritStoneReward)).toBeGreaterThan(0n);
      expect(stage.sweepItemRewards.length).toBeGreaterThan(0);
      for (const reward of stage.sweepItemRewards) {
        expect(() => getItemConfig(reward.itemConfigId)).not.toThrow();
        expect(reward.itemConfigId).not.toBe("treasure_token");
        expect(Number.isInteger(reward.quantity)).toBe(true);
        expect(reward.quantity).toBeGreaterThan(0);
      }
    }
    expect(EXPEDITION_SWEEP_TOKEN_COST).toBe(1);
  });

  it("rejects an unknown stage id", () => {
    expect(() => getExpeditionStageConfig("missing_stage")).toThrow(
      "Unknown expedition stage config: missing_stage",
    );
    expect(() => evaluateExpeditionStage("missing_stage", [], "100")).toThrow();
  });
});

describe("expedition sweep evaluation", () => {
  const first = EXPEDITION_STAGE_CONFIGS[0]!;
  const second = EXPEDITION_STAGE_CONFIGS[1]!;

  it("requires the stage's first clear before sweeping", () => {
    expect(evaluateExpeditionSweep(first.id, [], "999999")).toEqual({
      status: "locked",
      powerDeficit: "0",
    });
    expect(
      evaluateExpeditionSweep(second.id, [first.id], "999999"),
    ).toEqual({ status: "locked", powerDeficit: "0" });
  });

  it("checks current power and accepts the exact threshold", () => {
    expect(evaluateExpeditionSweep(first.id, [first.id], "99")).toEqual({
      status: "underpowered",
      powerDeficit: "1",
    });
    expect(
      evaluateExpeditionSweep(first.id, [first.id], first.requiredPower),
    ).toEqual({ status: "ready", powerDeficit: "0" });
  });
});

describe("expedition stage evaluation", () => {
  const first = EXPEDITION_STAGE_CONFIGS[0]!;
  const second = EXPEDITION_STAGE_CONFIGS[1]!;
  const third = EXPEDITION_STAGE_CONFIGS[2]!;

  it("makes only the next uncleared stage available", () => {
    expect(evaluateExpeditionStage(first.id, [], first.requiredPower)).toEqual({
      status: "ready",
      powerDeficit: "0",
    });
    expect(evaluateExpeditionStage(second.id, [], "999999")).toEqual({
      status: "locked",
      powerDeficit: "0",
    });
    expect(evaluateExpeditionStage(third.id, [first.id], "999999")).toEqual({
      status: "locked",
      powerDeficit: "0",
    });
  });

  it("marks every stage before the frontier as cleared", () => {
    expect(evaluateExpeditionStage(first.id, [first.id], "0")).toEqual({
      status: "cleared",
      powerDeficit: "0",
    });
    expect(
      evaluateExpeditionStage(first.id, [first.id, second.id], "0"),
    ).toEqual({ status: "cleared", powerDeficit: "0" });
  });

  it("reports the exact deficit and accepts equality at the threshold", () => {
    expect(evaluateExpeditionStage(second.id, [first.id], "399")).toEqual({
      status: "underpowered",
      powerDeficit: "1",
    });
    expect(
      evaluateExpeditionStage(second.id, [first.id], second.requiredPower),
    ).toEqual({ status: "ready", powerDeficit: "0" });
  });
});

describe("the band stages are priced off the band, not off a hunch", () => {
  it("lets bare power open each band's first stage the level the band opens", () => {
    // The entry stage is the band's ticket: reaching the band is enough, gear is
    // not. Its neighbour one stage up is not — that one is the loadout's exit.
    const entries = [
      { level: 61, stageId: "bonecrypt_wastes", nextId: "netherfall_abyss" },
      { level: 151, stageId: "skyfire_sea", nextId: "myriad_sword_mound" },
      { level: 301, stageId: "starfall_battlefield", nextId: "voidrift_expanse" },
    ] as const;
    for (const entry of entries) {
      const bare = BigInt(calculateTotalPower(entry.level));
      expect(bare).toBeGreaterThanOrEqual(
        BigInt(getExpeditionStageConfig(entry.stageId).requiredPower),
      );
      expect(bare).toBeLessThan(
        BigInt(getExpeditionStageConfig(entry.nextId).requiredPower),
      );
      // And the level just below the band cannot reach it bare, so the stage is
      // gated on the band rather than on the level happening to be high enough.
      expect(BigInt(calculateTotalPower(entry.level - 1))).toBeLessThan(
        BigInt(getExpeditionStageConfig(entry.stageId).requiredPower),
      );
    }
  });

  it("pays sweeps in the ratio crafting consumes, scaled per stage", () => {
    // The load-bearing shape of the tier: idle drops spread evenly over the five
    // materials, sweeps pay the bill's own shape. Every new stage is one integer
    // multiple of the same vector, which is what makes a token worth a fixed
    // number of that band's idle hours instead of a flat pile.
    const ratio: Readonly<Record<string, number>> = {
      spiritual_herb: 24,
      ore: 18,
      wood: 9,
      spiritual_soil: 7,
      stone: 5,
    };
    const bandStageIds = EXPEDITION_STAGE_CONFIGS.slice(6).map((stage) => stage.id);
    expect(bandStageIds).toHaveLength(6);
    const multiples = bandStageIds.map((id) => {
      const config = getExpeditionStageConfig(id);
      const herb = config.sweepItemRewards.find(
        (reward) => reward.itemConfigId === "spiritual_herb",
      )!.quantity;
      const multiple = herb / ratio.spiritual_herb!;
      for (const [itemConfigId, share] of Object.entries(ratio)) {
        expect(
          config.sweepItemRewards.find(
            (reward) => reward.itemConfigId === itemConfigId,
          )!.quantity,
        ).toBe(share * multiple);
      }
      return multiple;
    });
    // 2.5 / 4 hours of the band's own material income, and 3 / 5 at 天阶, where a
    // player banks tokens faster than any other band.
    expect(multiples).toEqual([5, 8, 10, 16, 20, 33]);
  });

  it("pays first clears twice the sweep, plus the tokens that start it", () => {
    for (const stage of EXPEDITION_STAGE_CONFIGS.slice(6)) {
      for (const sweep of stage.sweepItemRewards) {
        const firstClear = stage.itemRewards.find(
          (reward) => reward.itemConfigId === sweep.itemConfigId,
        );
        if (sweep.itemConfigId === "technique_page") continue;
        expect(firstClear?.quantity).toBe(sweep.quantity * 2);
      }
      expect(
        stage.itemRewards.find(
          (reward) => reward.itemConfigId === "treasure_token",
        )!.quantity,
      ).toBeGreaterThan(0);
    }
    expect(
      EXPEDITION_STAGE_CONFIGS.slice(6)
        .flatMap((stage) => stage.itemRewards)
        .filter((reward) => reward.itemConfigId === "treasure_token")
        .reduce((total, reward) => total + reward.quantity, 0),
    ).toBe(71);
  });
});
