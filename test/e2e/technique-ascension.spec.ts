import {
  TECHNIQUE_ASCEND_REQUIRED_SECLUSION_ROOM_LEVEL,
  techniqueAscendCost,
} from "@cultivation-diary/shared";
import { expect, test } from "@playwright/test";
import { bootWithSave, clickNode, readSave, waitForNode } from "./canvas";

const SOURCE_ID = "quiet_breathing_art";
const TARGET_ID = "azure_cloud_heart_manual";
const ASCEND_COST = techniqueAscendCost(1);

test("ascends a technique through the real canvas UI", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await bootWithSave(page, (envelope) => {
    const snapshot = envelope.snapshot;
    snapshot.progress.level = 1;
    snapshot.wallet.spiritStone = String(ASCEND_COST.spiritStone + 1_000);
    snapshot.inventory.stacks = [];
    snapshot.equipment = [];
    snapshot.techniques = [
      {
        techniqueConfigId: SOURCE_ID,
        displayName: "静息诀",
        quality: "common",
        slot: "mind",
        star: 6,
        duplicateCount: ASCEND_COST.duplicateCount,
        equippedSlot: "mind",
        powerBonusBp: 0,
        experienceBonusBp: 0,
        spiritStoneBonusBp: 0,
        dropBonusBp: 0,
        configVersion: "local-idle-drop-v1",
      },
    ];
    snapshot.cave.buildings = snapshot.cave.buildings.map((building: any) => ({
      ...building,
      level:
        building.buildingConfigId === "seclusion_room"
          ? TECHNIQUE_ASCEND_REQUIRED_SECLUSION_ROOM_LEVEL
          : 0,
    }));
    snapshot.harvestChest = { pendingCount: 0, entries: [] };
    snapshot.unlocks.cave = true;
    snapshot.settings.selectedTab = "cultivation";
  });

  await waitForNode(page, "BottomFeature-功法");
  await clickNode(page, "BottomFeature-功法");
  await waitForNode(page, "Button-升华");

  await clickNode(page, "Button-升华");
  await expect
    .poll(async () => {
      const save = await readSave(page);
      const source = save.snapshot.techniques.find(
        (item: { techniqueConfigId: string }) => item.techniqueConfigId === SOURCE_ID,
      );
      const target = save.snapshot.techniques.find(
        (item: { techniqueConfigId: string }) => item.techniqueConfigId === TARGET_ID,
      );
      return {
        sourcePresent: source !== undefined,
        targetStar: target?.star,
        targetQuality: target?.quality,
        targetEquippedSlot: target?.equippedSlot,
        spiritStone: save.snapshot.wallet.spiritStone,
      };
    })
    .toEqual({
      sourcePresent: false,
      targetStar: 6,
      targetQuality: "uncommon",
      targetEquippedSlot: "mind",
      spiritStone: "1000",
    });

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
