import { describe, expect, it } from "vitest";
import {
  bagExpansionCostForCapacity,
  validateGameConfig,
} from "../src/config/game-config";

describe("versioned game configuration", () => {
  it("validates all active realm and asset references at startup", () => {
    expect(() => validateGameConfig()).not.toThrow();
  });

  it("uses the quadratic 10-slot bag expansion schedule through 200 slots", () => {
    expect(bagExpansionCostForCapacity(50)).toBe("5000");
    expect(bagExpansionCostForCapacity(60)).toBe("20000");
    expect(bagExpansionCostForCapacity(190)).toBe("1125000");
    expect(bagExpansionCostForCapacity(200)).toBeNull();
    expect(() => bagExpansionCostForCapacity(55)).toThrow(RangeError);
  });
});
