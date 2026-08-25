import type { BootstrapSnapshot } from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import {
  getEquipmentAffixDisplay,
  getEquipmentAscendDisplay,
  getEquipmentEnhanceDisplay,
  getEquipmentRerollDisplay,
  getEquipmentTitleText,
  getTechniqueUpgradeDisplay,
} from "../assets/scripts/core/AssetUpgradeDisplay";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const START = new Date("2026-01-01T00:00:00.000Z");

function snapshotWithBalances(
  spiritStone: number,
  enhanceStone: number,
): BootstrapSnapshot {
  const service = new LocalGameService(new FakePlatformAdapter());
  service.initialize(START);
  return {
    ...service.snapshot,
    wallet: {
      ...service.snapshot.wallet,
      spiritStone: String(spiritStone),
    },
    inventory: {
      ...service.snapshot.inventory,
      stacks:
        enhanceStone > 0
          ? [
              {
                itemConfigId: "enhance_stone",
                displayName: "强化石",
                quantity: String(enhanceStone),
              },
            ]
          : [],
    },
  };
}

function equipment(
  enhanceLevel: number,
  quality = "common",
  rolledAffixes: BootstrapSnapshot["equipment"][number]["rolledAffixes"] = [],
): BootstrapSnapshot["equipment"][number] {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    equipmentConfigId: "ironwood_sword",
    displayName: "玄木剑",
    quality,
    slot: "weapon",
    powerBonusBp: 0,
    enhanceLevel,
    rolledAffixes,
    location: "bag",
    equippedSlot: null,
    isLocked: false,
    configVersion: "local-idle-drop-v1",
  };
}

/** The three-stat roll a legendary carries, at the value it used to be fixed at. */
const LEGENDARY_CENTER_AFFIXES = [
  { stat: "experience_bonus", valueBp: 350 },
  { stat: "spirit_stone_bonus", valueBp: 350 },
  { stat: "drop_bonus", valueBp: 350 },
];

/**
 * A spare copy ascension may eat: same config, same quality, sitting unlocked in
 * the bag. `overrides` exists so a test can break exactly one of those rules.
 */
function spareCopy(
  id: string,
  overrides: Partial<BootstrapSnapshot["equipment"][number]> = {},
): BootstrapSnapshot["equipment"][number] {
  return { ...equipment(0, "legendary"), id, ...overrides };
}

function snapshotForAscension(options: {
  spiritStone: number;
  craftingRoomLevel: number;
  equipment: BootstrapSnapshot["equipment"];
}): BootstrapSnapshot {
  const snapshot = snapshotWithBalances(options.spiritStone, 0);
  return {
    ...snapshot,
    equipment: options.equipment,
    cave: {
      ...snapshot.cave,
      buildings: [
        { buildingConfigId: "crafting_room", level: options.craftingRoomLevel },
      ],
    },
  };
}

function technique(
  star: number,
  duplicateCount: number,
): BootstrapSnapshot["techniques"][number] {
  return {
    techniqueConfigId: "quiet_breathing_art",
    displayName: "静息诀",
    quality: "common",
    slot: "mind",
    star,
    duplicateCount,
    equippedSlot: null,
    powerBonusBp: 0,
    experienceBonusBp: 200,
    spiritStoneBonusBp: 0,
    dropBonusBp: 0,
    configVersion: "local-idle-drop-v1",
  };
}

describe("equipment enhancement display", () => {
  it("shows an affordable quote with owned and required enhancement stones", () => {
    const display = getEquipmentEnhanceDisplay(
      snapshotWithBalances(10_000, 3),
      equipment(0),
    );

    expect(display).toEqual({
      maxed: false,
      affordable: true,
      costText: "强化石 3/1\n灵石 250",
      actionText: "强化",
      actionEnabled: true,
    });
  });

  it("stays actionable when resources are short so the service can explain why", () => {
    const display = getEquipmentEnhanceDisplay(
      snapshotWithBalances(249, 0),
      equipment(0),
    );

    expect(display.affordable).toBe(false);
    expect(display.actionEnabled).toBe(true);
    expect(display.costText).toBe("强化石 0/1\n灵石 250");
  });

  it("formats large owned quantities without changing the quoted cost", () => {
    const display = getEquipmentEnhanceDisplay(
      snapshotWithBalances(10_000, 12_345),
      equipment(0),
    );

    expect(display.costText).toBe("强化石 1.23万/1\n灵石 250");
  });

  it("disables enhancement at +20", () => {
    expect(
      getEquipmentEnhanceDisplay(
        snapshotWithBalances(1_000_000, 1_000),
        equipment(20),
      ),
    ).toEqual({
      maxed: true,
      affordable: false,
      costText: "强化已满",
      actionText: "满级",
      actionEnabled: false,
    });
  });

  it("rejects an unknown equipment quality", () => {
    expect(() =>
      getEquipmentEnhanceDisplay(
        snapshotWithBalances(10_000, 10),
        equipment(0, "unknown"),
      ),
    ).toThrow(RangeError);
  });
});

describe("equipment affix display", () => {
  it("scores a legacy centre roll against the best the quality can give", () => {
    expect(
      getEquipmentAffixDisplay(
        equipment(0, "legendary", LEGENDARY_CENTER_AFFIXES),
      ),
    ).toEqual({
      hasAffixes: true,
      bandName: "凡阶",
      scoreText: "词条 71%",
      bandScoreText: "凡阶 词条 71%",
      affixText: "修为 +3.50%  灵石 +3.50%  掉落 +3.50%",
    });
  });

  it("scores a maximum roll at 100%", () => {
    const display = getEquipmentAffixDisplay(
      equipment(0, "legendary", [
        { stat: "experience_bonus", valueBp: 490 },
        { stat: "spirit_stone_bonus", valueBp: 490 },
        { stat: "drop_bonus", valueBp: 490 },
      ]),
    );

    expect(display.scoreText).toBe("词条 100%");
    expect(display.affixText).toBe("修为 +4.90%  灵石 +4.90%  掉落 +4.90%");
  });

  it("keeps the stored order instead of sorting the line", () => {
    expect(
      getEquipmentAffixDisplay(
        equipment(0, "legendary", [
          { stat: "drop_bonus", valueBp: 420 },
          { stat: "experience_bonus", valueBp: 210 },
          { stat: "spirit_stone_bonus", valueBp: 490 },
        ]),
      ).affixText,
    ).toBe("掉落 +4.20%  修为 +2.10%  灵石 +4.90%");
  });

  it("separates a quality that rolls nothing from a zero score", () => {
    expect(getEquipmentAffixDisplay(equipment(0))).toEqual({
      hasAffixes: false,
      bandName: "凡阶",
      scoreText: "无词条",
      bandScoreText: "无词条",
      affixText: "",
    });
  });

  it("measures a piece against its own band's ceiling", () => {
    // The same three 4.90% rolls: a full 凡阶 roll, and a mediocre 天阶 one. The
    // band has to lead the percentage or the two rows read as identical.
    const display = getEquipmentAffixDisplay({
      ...equipment(0, "legendary", [
        { stat: "experience_bonus", valueBp: 490 },
        { stat: "spirit_stone_bonus", valueBp: 490 },
        { stat: "drop_bonus", valueBp: 490 },
      ]),
      equipmentConfigId: "void_immortal_sword",
      displayName: "太虚斩仙剑",
    });

    expect(display.bandName).toBe("天阶");
    expect(display.bandScoreText).toBe("天阶 词条 57%");
    expect(display.affixText).toBe("修为 +4.90%  灵石 +4.90%  掉落 +4.90%");
  });

  it("rejects an unknown equipment quality", () => {
    expect(() => getEquipmentAffixDisplay(equipment(0, "unknown"))).toThrow(
      RangeError,
    );
  });
});

describe("equipment title line", () => {
  it("puts the band in front of the piece", () => {
    expect(getEquipmentTitleText(equipment(0, "legendary"))).toBe("凡阶 · 玄木剑");
    expect(
      getEquipmentTitleText({
        equipmentConfigId: "void_immortal_sword",
        displayName: "太虚斩仙剑",
      }),
    ).toBe("天阶 · 太虚斩仙剑");
  });

  it("rejects a piece whose config is not in the game", () => {
    expect(() =>
      getEquipmentTitleText({ equipmentConfigId: "no_such_sword", displayName: "无" }),
    ).toThrow(RangeError);
  });
});

describe("equipment reroll display", () => {
  it("quotes both currencies against what the player owns", () => {
    expect(
      getEquipmentRerollDisplay(
        snapshotWithBalances(10_000, 30),
        equipment(0, "legendary", LEGENDARY_CENTER_AFFIXES),
      ),
    ).toEqual({
      maxed: false,
      affordable: true,
      costText: "强化石 30/21\n灵石 5,600",
      actionText: "洗练",
      actionEnabled: true,
    });
  });

  it("stays actionable when either currency is short so the service can explain why", () => {
    const shortStones = getEquipmentRerollDisplay(
      snapshotWithBalances(10_000, 20),
      equipment(0, "legendary", LEGENDARY_CENTER_AFFIXES),
    );
    const shortSpiritStone = getEquipmentRerollDisplay(
      snapshotWithBalances(5_599, 30),
      equipment(0, "legendary", LEGENDARY_CENTER_AFFIXES),
    );

    expect(shortStones.affordable).toBe(false);
    expect(shortStones.actionEnabled).toBe(true);
    expect(shortSpiritStone.affordable).toBe(false);
    expect(shortSpiritStone.actionEnabled).toBe(true);
  });

  it("disables a common piece because there is nothing to roll", () => {
    expect(
      getEquipmentRerollDisplay(
        snapshotWithBalances(1_000_000, 999),
        equipment(0),
      ),
    ).toEqual({
      maxed: true,
      affordable: false,
      costText: "普通品质没有词条",
      actionText: "无词条",
      actionEnabled: false,
    });
  });

  it("disables a piece already at the best roll the quality can give", () => {
    expect(
      getEquipmentRerollDisplay(
        snapshotWithBalances(1_000_000, 999),
        equipment(0, "legendary", [
          { stat: "experience_bonus", valueBp: 490 },
          { stat: "spirit_stone_bonus", valueBp: 490 },
          { stat: "drop_bonus", valueBp: 490 },
        ]),
      ),
    ).toEqual({
      maxed: true,
      affordable: false,
      costText: "词条已满",
      actionText: "洗练",
      actionEnabled: false,
    });
  });

  it("rejects an unknown equipment quality", () => {
    expect(() =>
      getEquipmentRerollDisplay(
        snapshotWithBalances(10_000, 30),
        equipment(0, "unknown"),
      ),
    ).toThrow(RangeError);
  });
});

describe("equipment ascension display", () => {
  it("quotes the spare copies it will eat alongside the spirit stone", () => {
    expect(
      getEquipmentAscendDisplay(
        snapshotForAscension({
          spiritStone: 240_000,
          craftingRoomLevel: 5,
          equipment: [
            equipment(3, "legendary", LEGENDARY_CENTER_AFFIXES),
            spareCopy("00000000-0000-4000-8000-000000000002"),
            spareCopy("00000000-0000-4000-8000-000000000003"),
          ],
        }),
        equipment(3, "legendary", LEGENDARY_CENTER_AFFIXES),
      ),
    ).toEqual({
      maxed: false,
      affordable: true,
      costText: "同款 2/2\n灵石 24万",
      actionText: "升华",
      actionEnabled: true,
    });
  });

  it("counts only the copies ascension is allowed to eat", () => {
    const display = getEquipmentAscendDisplay(
      snapshotForAscension({
        spiritStone: 240_000,
        craftingRoomLevel: 5,
        equipment: [
          equipment(0, "legendary", LEGENDARY_CENTER_AFFIXES),
          spareCopy("00000000-0000-4000-8000-000000000002", { isLocked: true }),
          spareCopy("00000000-0000-4000-8000-000000000003", {
            equippedSlot: "weapon",
            location: "equipped",
          }),
          spareCopy("00000000-0000-4000-8000-000000000004", { quality: "epic" }),
          spareCopy("00000000-0000-4000-8000-000000000005", {
            equipmentConfigId: "cloudweave_robe",
          }),
          spareCopy("00000000-0000-4000-8000-000000000006", {
            location: "harvest",
          }),
        ],
      }),
      equipment(0, "legendary", LEGENDARY_CENTER_AFFIXES),
    );

    expect(display.costText).toBe("同款 0/2\n灵石 24万");
    expect(display.affordable).toBe(false);
    expect(display.actionEnabled).toBe(true);
  });

  it("disables ascension until the crafting room reaches the required level", () => {
    expect(
      getEquipmentAscendDisplay(
        snapshotForAscension({
          spiritStone: 1_000_000,
          craftingRoomLevel: 4,
          equipment: [
            equipment(0, "legendary", LEGENDARY_CENTER_AFFIXES),
            spareCopy("00000000-0000-4000-8000-000000000002"),
            spareCopy("00000000-0000-4000-8000-000000000003"),
          ],
        }),
        equipment(0, "legendary", LEGENDARY_CENTER_AFFIXES),
      ),
    ).toEqual({
      maxed: false,
      affordable: false,
      costText: "炼器室 Lv.4/5",
      actionText: "升华",
      actionEnabled: false,
    });
  });

  it("prices the primordial step off the higher room and the higher bill", () => {
    const mythicPiece = equipment(0, "mythic", LEGENDARY_CENTER_AFFIXES);
    const snapshot = snapshotForAscension({
      spiritStone: 1_000_000,
      craftingRoomLevel: 8,
      equipment: [
        mythicPiece,
        spareCopy("00000000-0000-4000-8000-000000000002", { quality: "mythic" }),
        spareCopy("00000000-0000-4000-8000-000000000003", { quality: "mythic" }),
      ],
    });

    expect(getEquipmentAscendDisplay(snapshot, mythicPiece).costText).toBe(
      "同款 2/2\n灵石 40万",
    );
    expect(
      getEquipmentAscendDisplay(
        {
          ...snapshot,
          cave: {
            buildings: [{ buildingConfigId: "crafting_room", level: 7 }],
          },
        },
        mythicPiece,
      ).costText,
    ).toBe("炼器室 Lv.7/8");
  });

  it("explains that only legendary and mythic pieces can ascend", () => {
    expect(
      getEquipmentAscendDisplay(
        snapshotWithBalances(1_000_000, 0),
        equipment(0, "epic"),
      ),
    ).toEqual({
      maxed: false,
      affordable: false,
      costText: "仅传说与神话可升华",
      actionText: "升华",
      actionEnabled: false,
    });
  });

  it("reports the top quality as finished rather than blocked", () => {
    expect(
      getEquipmentAscendDisplay(
        snapshotWithBalances(1_000_000, 0),
        equipment(0, "primordial"),
      ),
    ).toEqual({
      maxed: true,
      affordable: false,
      costText: "已是最高品质",
      actionText: "升华",
      actionEnabled: false,
    });
  });

  it("rejects an unknown equipment quality", () => {
    expect(() =>
      getEquipmentAscendDisplay(
        snapshotWithBalances(1_000_000, 0),
        equipment(0, "unknown"),
      ),
    ).toThrow(RangeError);
  });
});

describe("technique star-up display", () => {
  it("shows an affordable same-name duplicate quote", () => {
    expect(
      getTechniqueUpgradeDisplay(snapshotWithBalances(0, 0), technique(3, 2)),
    ).toEqual({
      maxed: false,
      affordable: true,
      costText: "副本 2/2",
      actionText: "升星",
      actionEnabled: true,
    });
  });

  it("keeps an unaffordable star-up actionable", () => {
    const display = getTechniqueUpgradeDisplay(
      snapshotWithBalances(0, 0),
      technique(8, 6),
    );

    expect(display.affordable).toBe(false);
    expect(display.actionEnabled).toBe(true);
    expect(display.costText).toBe("副本 6/7\n残页 0/5");
  });

  it("disables star-up at ten stars", () => {
    expect(
      getTechniqueUpgradeDisplay(
        snapshotWithBalances(0, 0),
        technique(10, 999),
      ),
    ).toEqual({
      maxed: true,
      affordable: false,
      costText: "已满星",
      actionText: "满星",
      actionEnabled: false,
    });
  });

  it("quotes technique pages as a substitute for missing copies", () => {
    const snapshot = snapshotWithBalances(0, 0);
    snapshot.inventory.stacks = [
      {
        itemConfigId: "technique_page",
        displayName: "功法残页",
        quantity: "5",
      },
    ];

    expect(getTechniqueUpgradeDisplay(snapshot, technique(1, 0))).toEqual({
      maxed: false,
      affordable: true,
      costText: "副本 0/1\n残页 5/5",
      actionText: "升星",
      actionEnabled: true,
    });
  });
});
