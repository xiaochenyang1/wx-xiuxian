import { describe, expect, it } from "vitest";
import {
  bundleHazardPatterns,
  findSourceHazards,
  formatSourceHazard,
  sourceHazardPatterns,
} from "../scripts/transpile-hazards.mjs";

/**
 * A guard whose regex matches nothing looks exactly like a guard that passes,
 * so the samples below are the real thing: the two source expressions that
 * shipped `undefined` to players, and the two lowered forms taken out of the
 * built bundles they produced.
 */

function matchesSource(line: string): boolean {
  return sourceHazardPatterns.some((hazard) => hazard.pattern.test(line));
}

function matchesBundle(code: string): boolean {
  return bundleHazardPatterns.some((hazard) => hazard.pattern.test(code));
}

describe("source-stage transpile hazards", () => {
  it("catches the two spreads that shipped undefined", () => {
    expect(matchesSource("  return [...counts.entries()]")).toBe(true);
    expect(
      matchesSource("    const clauses = [...savingsByQuality.entries()].map(render);"),
    ).toBe(true);
  });

  it("catches every spread position and collection method", () => {
    expect(matchesSource("const keys = [...map.keys()];")).toBe(true);
    expect(matchesSource("const values = [...this.byId.values()];")).toBe(true);
    expect(matchesSource("Math.max(...tally.values())")).toBe(true);
    expect(matchesSource("const unique = [...new Set(names)];")).toBe(true);
    expect(matchesSource("const paired = [...new Map(pairs)];")).toBe(true);
    expect(matchesSource("const spaced = [... map.entries()];")).toBe(true);
  });

  it("leaves Object.entries and real arrays alone", () => {
    expect(matchesSource("const pairs = [...Object.entries(config)];")).toBe(false);
    expect(matchesSource("const keys = [...Object.keys(config)];")).toBe(false);
    expect(matchesSource("const values = [...Object.values(config)];")).toBe(false);
  });

  it("leaves every array spread the client currently relies on alone", () => {
    // Taken verbatim from the source. `[].concat(array)` expands an array
    // correctly, so flagging these would make the rule unusable.
    for (const line of [
      "for (const child of [...this.contentRoot.children]) child.destroy();",
      "const equipment = [...snapshot.equipment];",
      "const entries = [...snapshot.harvestChest.entries, entry];",
      "...(equipment ? { equipment: [...snapshot.equipment, equipment] } : {}),",
      "const candidates = [...AFFIX_STATS];",
      "return { ...snapshot, wallet: { ...snapshot.wallet } };",
    ]) {
      expect(matchesSource(line), line).toBe(false);
    }
  });

  it("reports the file, the line and the fix", () => {
    const hazards = findSourceHazards(
      ["const ok = [...list];", "", "const bad = [...counts.entries()];"].join("\n"),
      "assets/scripts/Sample.ts",
    );
    expect(hazards).toHaveLength(1);
    expect(hazards[0]!.line).toBe(3);
    expect(formatSourceHazard(hazards[0]!)).toBe(
      "assets/scripts/Sample.ts:3 spread of an iterator — collect with Map/Set forEach, or Array.from(...)\n    const bad = [...counts.entries()];",
    );
  });
});

describe("bundle-stage transpile hazards", () => {
  it("catches the lowered forms the Cocos build actually emitted", () => {
    expect(
      matchesBundle('[].concat(r.entries()).map(function(e){var n=e[0],t=e[1];return m[n]})'),
    ).toBe(true);
    expect(matchesBundle("Math.pow(10n, BigInt(scale))")).toBe(true);
  });

  it("leaves the lowered forms of legitimate spreads alone", () => {
    expect(matchesBundle("[].concat(Object.entries(n))")).toBe(false);
    expect(matchesBundle("[].concat(e.stacks,[{a:1}])")).toBe(false);
    expect(matchesBundle("Math.pow(2, 10)")).toBe(false);
  });
});
