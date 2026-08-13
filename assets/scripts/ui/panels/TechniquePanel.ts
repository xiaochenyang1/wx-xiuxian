import { getTechniqueUpgradeDisplay } from "../../core/AssetUpgradeDisplay";
import { formatLargeNumber } from "../../core/ClientNumber";
import type { AppState } from "../../core/ClientTypes";
import { canRunLocalMutation } from "../../core/ClientTypes";
import type { AppViewActions, PanelPaging } from "../AppView";
import { COLORS } from "../primitives/Colors";
import {
  addLabel,
  createButton,
  drawBand,
  drawPagination,
} from "../primitives/Draw";
import { qualityColor } from "../primitives/Format";
import { HorizontalTextAlignment, Node } from "cc";

export interface TechniqueSlotLabelLayout {
  readonly text: string;
  readonly maxLines: 2;
  readonly sizing: "fixed";
}

export function getTechniqueSlotLabelLayout(
  slotLabel: string,
  equippedName: string | null,
): TechniqueSlotLabelLayout {
  return {
    text: `${slotLabel}\n${equippedName ?? "未装备"}`,
    maxLines: 2,
    sizing: "fixed",
  };
}

export function drawTechniquePanel(
  overlay: Node,
  state: Readonly<AppState>,
  actions: AppViewActions,
  paging: PanelPaging,
): void {
  const techniques = state.bootstrap!.techniques;
  const mutationsEnabled = canRunLocalMutation(state);
  const techniqueWindow = paging.window("techniques", techniques.length, 8);
  addLabel(
    overlay,
    `功法 ${techniques.length} 本 · 装备战力 +${formatLargeNumber(state.bootstrap!.progress.loadoutFixedPower)} · 修炼 +${formatBasisPoints(state.bootstrap!.progress.experienceBonusBp)}`,
    0,
    393,
    590,
    50,
    17,
    COLORS.jade,
    false,
    2,
    HorizontalTextAlignment.CENTER,
    "fixed",
  );
  const slots = [
    { id: "mind", label: "心法" },
    { id: "movement", label: "身法" },
    { id: "divine", label: "神通" },
    { id: "secret", label: "秘术" },
  ];
  slots.forEach((slot, index) => {
    const x = -225 + index * 150;
    const equipped = techniques.find((technique) => technique.equippedSlot === slot.id);
    const labelLayout = getTechniqueSlotLabelLayout(
      slot.label,
      equipped?.displayName ?? null,
    );
    drawBand(overlay, `TechniqueSlot-${slot.id}`, x, 320, 132, 64, COLORS.panel, COLORS.goldMuted);
    addLabel(
      overlay,
      labelLayout.text,
      x,
      320,
      116,
      54,
      15,
      equipped ? qualityColor(equipped.quality) : COLORS.textMuted,
      false,
      labelLayout.maxLines,
      HorizontalTextAlignment.CENTER,
      labelLayout.sizing,
    );
  });
  if (techniques.length === 0) {
    addLabel(overlay, "尚未收录功法，可从挂机收获箱中收取", 0, 170, 570, 50, 20, COLORS.text);
    return;
  }
  techniques.slice(techniqueWindow.start, techniqueWindow.end).forEach((technique, index) => {
    const y = 222 - index * 75;
    const upgrade = getTechniqueUpgradeDisplay(technique);
    drawBand(overlay, `Technique-${technique.techniqueConfigId}`, 0, y, 600, 62, COLORS.panel);
    addLabel(
      overlay,
      technique.displayName,
      -225,
      y,
      135,
      34,
      17,
      qualityColor(technique.quality),
      true,
      1,
      HorizontalTextAlignment.LEFT,
    );
    addLabel(
      overlay,
      `${technique.star}星 · 战力 +${formatLargeNumber(technique.fixedPower)}`,
      -90,
      y,
      130,
      32,
      15,
      COLORS.gold,
      false,
      1,
      HorizontalTextAlignment.CENTER,
    );
    addLabel(
      overlay,
      upgrade.costText,
      52,
      y,
      142,
      32,
      14,
      upgrade.affordable || upgrade.maxed ? COLORS.textMuted : COLORS.red,
    );
    createButton(
      overlay,
      upgrade.actionText,
      158,
      y,
      64,
      44,
      {
        fill: upgrade.affordable ? COLORS.inkGreenLight : COLORS.panel,
        stroke: upgrade.affordable ? COLORS.gold : COLORS.goldMuted,
        fontSize: 14,
        enabled: mutationsEnabled && upgrade.actionEnabled,
      },
      () => actions.upgradeTechnique(technique.techniqueConfigId),
    );
    const equipped = technique.equippedSlot !== null;
    createButton(
      overlay,
      equipped
        ? "卸下"
        : techniques.some((candidate) => candidate.equippedSlot === technique.slot)
          ? "替换"
          : "装备",
      255,
      y,
      78,
      44,
      {
        fill: equipped ? COLORS.red : COLORS.inkGreenLight,
        stroke: COLORS.goldMuted,
        fontSize: 15,
        enabled: mutationsEnabled,
      },
      () =>
        equipped
          ? actions.unequipTechnique(technique.techniqueConfigId)
          : actions.equipTechnique(technique.techniqueConfigId),
    );
  });
  drawPagination(
    overlay,
    "TechniquePager",
    0,
    -382,
    techniqueWindow.page,
    techniqueWindow.pageCount,
    () => paging.show("techniques", techniqueWindow.page - 1),
    () => paging.show("techniques", techniqueWindow.page + 1),
  );
}

function formatBasisPoints(value: number): string {
  const percent = value / 100;
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(2)}%`;
}
