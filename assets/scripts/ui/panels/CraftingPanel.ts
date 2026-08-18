import { CRAFTING_RECIPE_CONFIGS } from "@cultivation-diary/shared";
import {
  craftingOddsSummary,
  getCraftingRecipeDisplay,
} from "../../core/CraftingDisplay";
import type { AppState } from "../../core/ClientTypes";
import type { AppViewActions } from "../AppView";
import { COLORS } from "../primitives/Colors";
import { addLabel, createButton, drawBand } from "../primitives/Draw";
import { HorizontalTextAlignment, Node } from "cc";

export function drawCraftingPanel(
  overlay: Node,
  state: Readonly<AppState>,
  actions: AppViewActions,
): void {
  const snapshot = state.bootstrap!;
  const roomLevel =
    snapshot.cave.buildings.find(
      (building) => building.buildingConfigId === "crafting_room",
    )?.level ?? 0;
  addLabel(
    overlay,
    `炼器室 Lv.${roomLevel}　${craftingOddsSummary(roomLevel)}`,
    0,
    397,
    590,
    38,
    18,
    COLORS.jade,
  );

  CRAFTING_RECIPE_CONFIGS.forEach((recipe, index) => {
    const display = getCraftingRecipeDisplay(snapshot, recipe);
    const y = 315 - index * 154;
    drawBand(
      overlay,
      `Crafting-${recipe.id}`,
      0,
      y,
      610,
      126,
      display.affordable ? COLORS.inkGreenLight : COLORS.panel,
      COLORS.goldMuted,
    );
    addLabel(
      overlay,
      recipe.displayName,
      -190,
      y + 35,
      240,
      30,
      18,
      COLORS.gold,
      true,
      1,
      HorizontalTextAlignment.LEFT,
    );
    addLabel(
      overlay,
      display.roomRequirementText,
      88,
      y + 35,
      180,
      28,
      14,
      display.affordable ? COLORS.jade : COLORS.textMuted,
    );
    addLabel(
      overlay,
      `${display.costText}　${display.materialText}`,
      -190,
      y - 18,
      430,
      44,
      13,
      display.affordable ? COLORS.textMuted : COLORS.red,
      false,
      2,
      HorizontalTextAlignment.LEFT,
      "fixed",
    );
    createButton(
      overlay,
      "打造",
      246,
      y + 23,
      84,
      42,
      {
        fill: display.affordable ? COLORS.inkGreen : COLORS.panel,
        stroke: display.affordable ? COLORS.gold : COLORS.goldMuted,
        text: display.affordable ? COLORS.gold : COLORS.textMuted,
        fontSize: 16,
      },
      () => actions.craftEquipment(recipe.id),
    );
    createButton(
      overlay,
      "批量打造",
      246,
      y - 23,
      84,
      42,
      {
        fill: display.affordable ? COLORS.inkGreenLight : COLORS.panel,
        stroke: display.affordable ? COLORS.gold : COLORS.goldMuted,
        text: display.affordable ? COLORS.gold : COLORS.textMuted,
        fontSize: 14,
        enabled: display.affordable,
      },
      () => actions.craftEquipmentBatch(recipe.id),
    );
  });
}
