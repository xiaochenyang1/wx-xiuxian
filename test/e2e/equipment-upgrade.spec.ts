import { expect, test } from "@playwright/test";
import {
  assertScreenshotHasRenderedPixels,
  bootWithSave,
  clickNode,
  labelTexts,
  readSave,
  waitForNode,
} from "./canvas";

const TARGET_ID = "00000000-0000-4000-8000-000000000701";
const SPARE_IDS = [
  "00000000-0000-4000-8000-000000000702",
  "00000000-0000-4000-8000-000000000703",
] as const;

const AFFIXES = [
  { stat: "experience_bonus", valueBp: 350 },
  { stat: "spirit_stone_bonus", valueBp: 350 },
  { stat: "drop_bonus", valueBp: 350 },
];

function legendaryWeapon(id: string): Record<string, unknown> {
  return {
    id,
    equipmentConfigId: "ironwood_sword",
    displayName: "玄木剑",
    quality: "legendary",
    slot: "weapon",
    powerBonusBp: 0,
    enhanceLevel: 0,
    rolledAffixes: AFFIXES,
    location: "bag",
    equippedSlot: null,
    isLocked: false,
    configVersion: "local-idle-drop-v1",
  };
}

function enhanceStones(save: { snapshot: Record<string, any> }): bigint {
  const stack = save.snapshot.inventory.stacks.find(
    (entry: { itemConfigId: string }) => entry.itemConfigId === "enhance_stone",
  );
  return BigInt(stack?.quantity ?? "0");
}

test("enhances and ascends an equipment piece through the real canvas UI", async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await bootWithSave(page, (envelope) => {
    const snapshot = envelope.snapshot;
    snapshot.progress.level = 11;
    snapshot.wallet.spiritStone = "2000000";
    snapshot.inventory.stacks = [
      { itemConfigId: "enhance_stone", displayName: "强化石", quantity: "1000" },
    ];
    snapshot.equipment = [
      legendaryWeapon(TARGET_ID),
      ...SPARE_IDS.map(legendaryWeapon),
    ];
    snapshot.harvestChest = { pendingCount: 0, entries: [] };
    snapshot.cave.buildings = snapshot.cave.buildings.map((building: any) => ({
      ...building,
      level: building.buildingConfigId === "crafting_room" ? 8 : 0,
    }));
    snapshot.unlocks.cave = true;
    snapshot.settings.selectedTab = "cultivation";
  });

  await waitForNode(page, "Feature-法宝");
  expect((await readSave(page)).snapshot.progress.level).toBe(11);

  await clickNode(page, "Feature-法宝");
  await waitForNode(page, "Button-强化");
  assertScreenshotHasRenderedPixels(
    await page.screenshot({
      path: testInfo.outputPath("equipment-panel.png"),
      animations: "disabled",
    }),
  );

  // Reading the rendered string, not just the node, is what catches a hint that
  // computes correctly in unit tests but renders placeholders once built.
  expect(await labelTexts(page, "强化顺序提示：")).toEqual([
    "强化顺序提示：传说法宝先强化至 +20 再升华，单件最多可省 1,430 枚强化石",
  ]);

  const beforeEnhance = await readSave(page);
  const beforeWallet = BigInt(beforeEnhance.snapshot.wallet.spiritStone);
  const beforeStones = enhanceStones(beforeEnhance);

  await clickNode(page, "Button-强化");
  await expect
    .poll(async () => {
      const save = await readSave(page);
      return save.snapshot.equipment.find(
        (item: { id: string }) => item.id === TARGET_ID,
      )?.enhanceLevel;
    })
    .toBe(1);

  const afterEnhance = await readSave(page);
  expect(BigInt(afterEnhance.snapshot.wallet.spiritStone)).toBeLessThan(beforeWallet);
  expect(enhanceStones(afterEnhance)).toBeLessThan(beforeStones);
  expect(afterEnhance.snapshot.equipment).toHaveLength(3);

  await clickNode(page, "Button-升华");
  await expect
    .poll(async () => {
      const save = await readSave(page);
      const target = save.snapshot.equipment.find(
        (item: { id: string }) => item.id === TARGET_ID,
      );
      return {
        quality: target?.quality,
        enhanceLevel: target?.enhanceLevel,
        isLocked: target?.isLocked,
        equipmentCount: save.snapshot.equipment.length,
      };
    })
    .toEqual({
      quality: "mythic",
      enhanceLevel: 1,
      isLocked: true,
      equipmentCount: 1,
    });

  expect(pageErrors).toEqual([]);
});
