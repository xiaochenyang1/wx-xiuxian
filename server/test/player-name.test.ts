import { describe, expect, it } from "vitest";
import { PlayerNameGenerator, validatePlayerName } from "../src/modules/auth/player-name";

describe("player names", () => {
  it("normalizes width and compares English letters case-insensitively", () => {
    expect(validatePlayerName("Ａbc")).toEqual({
      displayName: "Abc",
      displayNameKey: "abc",
    });
  });

  it("rejects whitespace, unsupported characters, invalid length, and reserved names", () => {
    expect(() => validatePlayerName(" 青岚")).toThrow("道号首尾不能包含空白");
    expect(() => validatePlayerName("青岚🌙")).toThrow("道号只能包含中文、英文字母和数字");
    expect(() => validatePlayerName("青")).toThrow("道号长度必须为 2 至 12 个字符");
    expect(() => validatePlayerName("系统真人")).toThrow("道号包含系统保留词");
  });

  it("provides distinct valid candidates across the base pool", () => {
    const generator = new PlayerNameGenerator(0);
    const candidates = Array.from({ length: 72 }, (_, attempt) =>
      generator.candidate(attempt),
    );

    expect(new Set(candidates.map((candidate) => candidate.displayNameKey)).size).toBe(72);
    expect(candidates.every((candidate) => candidate.displayName.length >= 2)).toBe(true);
  });
});
