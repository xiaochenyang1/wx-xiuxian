import { describe, expect, it } from "vitest";
import {
  requiredExperienceForLevel,
  settleCultivation,
  simulateOnlineExperience,
  type PlayerProgress,
} from "../src";

function progress(overrides: Partial<PlayerProgress> = {}): PlayerProgress {
  return {
    level: 1,
    experience: "0",
    cultivationReserve: "0",
    status: "gaining",
    ...overrides,
  };
}

describe("cultivation settlement", () => {
  it("segments online gains at level boundaries and preserves remainders", () => {
    const result = settleCultivation({
      progress: progress(),
      elapsedMilliseconds: 120_000,
      experienceRemainderMicros: 0,
      spiritStoneRemainderMicros: 0,
      dropClockRemainderMicros: 0,
    });

    expect(result.progress).toMatchObject({ level: 2, experience: "26" });
    expect(result.events).toContainEqual({ type: "level_up", fromLevel: 1, toLevel: 2 });
    expect(result.experienceGained).toBe("133");
    expect(result.spiritStoneGained).toBe("2");
    expect(result.dropAttempts).toBe(2);
  });

  it("applies the same offline efficiency to experience, stones, and drops", () => {
    const result = settleCultivation({
      progress: progress(),
      elapsedMilliseconds: 120_000,
      experienceRemainderMicros: 0,
      spiritStoneRemainderMicros: 0,
      dropClockRemainderMicros: 0,
      efficiencyBp: 7_000,
    });

    expect(result.progress).toMatchObject({ level: 1, experience: "84" });
    expect(result.experienceGained).toBe("84");
    expect(result.spiritStoneGained).toBe("1");
    expect(result.spiritStoneRemainderMicros).toBe(400_000);
    expect(result.dropAttempts).toBe(1);
    expect(result.dropClockRemainderMicros).toBe(24_000_000);
  });

  it("stops experience at the first-realm bottleneck while other clocks continue", () => {
    const result = settleCultivation({
      progress: progress({
        level: 10,
        experience: requiredExperienceForLevel(10),
        status: "breakthrough_ready",
      }),
      elapsedMilliseconds: 60_000,
      experienceRemainderMicros: 0,
      spiritStoneRemainderMicros: 0,
      dropClockRemainderMicros: 0,
    });

    expect(result.progress.status).toBe("breakthrough_ready");
    expect(result.experienceGained).toBe("0");
    expect(result.spiritStoneGained).toBe("10");
    expect(result.dropAttempts).toBe(1);
  });

  it("reaches Lv.10 without carrying overflow past the breakthrough wall", () => {
    const result = settleCultivation({
      progress: progress(),
      elapsedMilliseconds: 3 * 60 * 60 * 1_000,
      experienceRemainderMicros: 0,
      spiritStoneRemainderMicros: 0,
      dropClockRemainderMicros: 0,
    });

    expect(result.progress).toEqual({
      level: 10,
      experience: requiredExperienceForLevel(10),
      cultivationReserve: "0",
      status: "breakthrough_ready",
    });
    expect(result.events).toContainEqual({ type: "breakthrough_ready", level: 10 });
    expect(Number(result.experienceDiscarded)).toBeGreaterThanOrEqual(0);
    expect(result.dropAttempts).toBe(180);
  });

  it("simulates an experience pill without returning unrelated idle rewards", () => {
    const result = simulateOnlineExperience({
      progress: progress(),
      elapsedMilliseconds: 60 * 60 * 1_000,
    });

    expect(result.progress).toEqual({
      level: 10,
      experience: requiredExperienceForLevel(10),
      cultivationReserve: "0",
      status: "breakthrough_ready",
    });
    expect(result.events).toContainEqual({ type: "breakthrough_ready", level: 10 });
    expect(BigInt(result.experienceGained)).toBeGreaterThan(0n);
    expect(result.experienceDiscarded).toBe("0");
  });
});
