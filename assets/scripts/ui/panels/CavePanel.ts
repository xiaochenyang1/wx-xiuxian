import { CAVE_BUILDING_CONFIGS } from "@cultivation-diary/shared";
import {
  getCaveBuildingDisplay,
  getCaveSummary,
} from "../../core/CaveDisplay";
import type { AppState } from "../../core/ClientTypes";
import { COLORS } from "../primitives/Colors";
import { addLabel, createButton, drawBand } from "../primitives/Draw";
import { Color, HorizontalTextAlignment, Node } from "cc";

export function drawCavePanel(
  overlay: Node,
  state: Readonly<AppState>,
  actions: { upgradeCaveBuilding(buildingConfigId: string): void },
  panelColor: Color,
): void {
  const snapshot = state.bootstrap!;
  addLabel(overlay, getCaveSummary(snapshot), -56, 355, 480, 36, 18, COLORS.jade);

  CAVE_BUILDING_CONFIGS.forEach((config, index) => {
    const display = getCaveBuildingDisplay(snapshot, config);
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = column === 0 ? -205 : 95;
    const y = 225 - row * 145;
    drawBand(overlay, `Building${config.id}`, x, y, 292, 112, panelColor, COLORS.goldMuted);
    addLabel(
      overlay,
      display.displayName,
      x - 84,
      y + 36,
      124,
      30,
      19,
      COLORS.text,
      true,
      1,
      HorizontalTextAlignment.LEFT,
    );
    addLabel(
      overlay,
      display.levelText,
      x + 46,
      y + 36,
      110,
      30,
      15,
      display.level === 0 ? COLORS.textMuted : COLORS.jade,
      false,
      1,
      HorizontalTextAlignment.RIGHT,
      "fixed",
    );
    addLabel(
      overlay,
      display.maxed ? display.bonusText : display.nextBonusText,
      x - 84,
      y + 6,
      230,
      26,
      14,
      COLORS.gold,
      false,
      1,
      HorizontalTextAlignment.LEFT,
      "fixed",
    );

    if (display.maxed) {
      addLabel(
        overlay,
        display.actionText,
        x + 84,
        y - 34,
        104,
        30,
        15,
        COLORS.goldMuted,
        true,
        1,
        HorizontalTextAlignment.RIGHT,
        "fixed",
      );
      return;
    }

    addLabel(
      overlay,
      display.costText,
      x - 84,
      y - 22,
      160,
      24,
      13,
      display.affordable ? COLORS.textMuted : COLORS.red,
      false,
      1,
      HorizontalTextAlignment.LEFT,
      "fixed",
    );
    addLabel(
      overlay,
      display.materialText,
      x - 84,
      y - 44,
      190,
      24,
      12,
      display.materialsSufficient ? COLORS.textMuted : COLORS.red,
      false,
      1,
      HorizontalTextAlignment.LEFT,
      "fixed",
    );
    // Kept clickable while unaffordable so the tap explains what is missing
    // instead of doing nothing.
    createButton(
      overlay,
      display.actionText,
      x + 96,
      y - 30,
      82,
      44,
      {
        fill: display.affordable ? COLORS.inkGreenLight : COLORS.panel,
        stroke: display.affordable ? COLORS.gold : COLORS.goldMuted,
        text: display.affordable ? COLORS.gold : COLORS.textMuted,
        fontSize: 16,
      },
      () => actions.upgradeCaveBuilding(config.id),
    );
  });
}
