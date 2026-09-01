import { ALCHEMY_RECIPE_CONFIGS } from "@cultivation-diary/shared";
import {
  getAlchemyHeaderText,
  getAlchemyRecipeDisplay,
} from "../../core/AlchemyDisplay";
import type { AppState } from "../../core/ClientTypes";
import type { AppViewActions } from "../AppView";
import { COLORS } from "../primitives/Colors";
import { addLabel, createButton, drawBand } from "../primitives/Draw";
import { HorizontalTextAlignment, Node } from "cc";

export function drawAlchemyPanel(
  overlay: Node,
  state: Readonly<AppState>,
  actions: AppViewActions,
): void {
  const snapshot = state.bootstrap!;
  addLabel(
    overlay,
    getAlchemyHeaderText(snapshot),
    0,
    397,
    590,
    38,
    18,
    COLORS.jade,
  );

  ALCHEMY_RECIPE_CONFIGS.forEach((recipe, index) => {
    const display = getAlchemyRecipeDisplay(snapshot, recipe);
    const y = 315 - index * 165;
    drawBand(
      overlay,
      `Alchemy-${recipe.id}`,
      0,
      y,
      610,
      140,
      display.affordable ? COLORS.inkGreenLight : COLORS.panel,
      COLORS.goldMuted,
    );
    addLabel(
      overlay,
      recipe.displayName,
      -190,
      y + 42,
      210,
      32,
      20,
      COLORS.gold,
      true,
      1,
      HorizontalTextAlignment.LEFT,
    );
    addLabel(
      overlay,
      display.roomRequirementText,
      110,
      y + 42,
      180,
      30,
      15,
      display.affordable ? COLORS.jade : COLORS.textMuted,
    );
    addLabel(
      overlay,
      display.outputText,
      -190,
      y + 7,
      360,
      30,
      16,
      COLORS.text,
      false,
      1,
      HorizontalTextAlignment.LEFT,
    );
    addLabel(
      overlay,
      display.materialText,
      -190,
      y - 30,
      390,
      42,
      14,
      display.affordable ? COLORS.textMuted : COLORS.red,
      false,
      2,
      HorizontalTextAlignment.LEFT,
      "fixed",
    );
    addLabel(overlay, display.costText, 132, y - 34, 140, 28, 14, COLORS.textMuted);
    createButton(
      overlay,
      "炼制",
      246,
      y + 26,
      84,
      44,
      {
        fill: display.affordable ? COLORS.inkGreen : COLORS.panel,
        stroke: display.affordable ? COLORS.gold : COLORS.goldMuted,
        text: display.affordable ? COLORS.gold : COLORS.textMuted,
        fontSize: 16,
      },
      () => actions.brewAlchemy(recipe.id),
    );
    createButton(
      overlay,
      "批量炼制",
      246,
      y - 26,
      84,
      44,
      {
        fill: display.affordable ? COLORS.inkGreenLight : COLORS.panel,
        stroke: display.affordable ? COLORS.gold : COLORS.goldMuted,
        text: display.affordable ? COLORS.gold : COLORS.textMuted,
        fontSize: 14,
        enabled: display.affordable,
      },
      () => actions.brewAlchemyBatch(recipe.id),
    );
  });

  // The header only has room for the band and its two multipliers, so the prose
  // it used to carry lands here — together with the one thing the numbers cannot
  // say for themselves: 炼丹房 goes to Lv.40 but stops unlocking recipes at Lv.4,
  // and the remaining levels pay in drop rate.
  addLabel(
    overlay,
    "按方消耗材料，丹药直接收入行囊　炼丹房 Lv.4 以上不再解锁新配方，其余等级提升掉落效率",
    0,
    -292,
    590,
    42,
    13,
    COLORS.textMuted,
    false,
    2,
  );
}
