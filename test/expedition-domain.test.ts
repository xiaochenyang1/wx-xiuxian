import {
  EXPEDITION_STAGE_CONFIGS,
  EXPEDITION_SWEEP_TOKEN_COST,
  evaluateExpeditionStage,
  evaluateExpeditionSweep,
  getExpeditionStageConfig,
  getItemConfig,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";

describe("expedition configuration", () => {
  it("defines a strictly increasing six-stage campaign", () => {
    expect(EXPEDITION_STAGE_CONFIGS.map((stage) => stage.id)).toEqual([
      "greenstone_path",
      "mistwood_forest",
      "blackwater_marsh",
      "swordscar_valley",
      "red_sand_mine",
      "ancient_cultivator_ruins",
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
