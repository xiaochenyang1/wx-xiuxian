import {
  getTechniqueAscendDisplay,
  getTechniqueBandName,
  getTechniqueInheritDisplay,
  getTechniqueUpgradeDisplay,
  type AssetUpgradeDisplay,
} from "../../core/AssetUpgradeDisplay";
import type { AssetIconArtSet } from "../../core/AppArt";
import { pickAssetIcon } from "../../core/AppArtConfig";
import { formatLargeNumber } from "../../core/ClientNumber";
import type { AppState } from "../../core/ClientTypes";
import { canRunLocalMutation } from "../../core/ClientTypes";
import type { AppViewActions, PanelPaging } from "../AppView";
import { drawRowIcon } from "../AppViewHelpers";
import { COLORS } from "../primitives/Colors";
import {
  addLabel,
  createButton,
  drawBand,
  drawPagination,
} from "../primitives/Draw";
import { formatBasisPoints, qualityColor } from "../primitives/Format";
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
  icons: AssetIconArtSet,
): void {
  const techniques = state.bootstrap!.techniques;
  const mutationsEnabled = canRunLocalMutation(state);
  // Five rows rather than six: each row carries three upgrade pairs (升星, 传承,
  // 升华) on two lines, and the third line is what took the sixth row's pitch.
  const techniqueWindow = paging.window("techniques", techniques.length, 5);
  addLabel(
    overlay,
    `功法 ${techniques.length} 本 · 残页 ${formatLargeNumber(state.bootstrap!.inventory.stacks.find((stack) => stack.itemConfigId === "technique_page")?.quantity ?? "0")} · 装备战力 +${formatBasisPoints(state.bootstrap!.progress.loadoutPowerBonusBp)}`,
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
    const y = 205 - index * 116;
    const upgrade = getTechniqueUpgradeDisplay(state.bootstrap!, technique);
    const inherit = getTechniqueInheritDisplay(state.bootstrap!, technique);
    const ascend = getTechniqueAscendDisplay(state.bootstrap!, technique);
    drawBand(overlay, `Technique-${technique.techniqueConfigId}`, 0, y, 600, 108, COLORS.panel);
    drawRowIcon(
      overlay,
      `TechniqueIcon-${technique.techniqueConfigId}`,
      pickAssetIcon(icons.technique, [
        technique.techniqueConfigId,
        technique.slot,
      ]),
      y,
    );
    addLabel(
      overlay,
      technique.displayName,
      -225,
      y + 34,
      144,
      28,
      16,
      qualityColor(technique.quality),
      true,
      1,
      HorizontalTextAlignment.LEFT,
    );
    addLabel(
      overlay,
      `${getTechniqueBandName(technique.techniqueConfigId)} · ${technique.star}星 · 战力 +${formatBasisPoints(technique.powerBonusBp)}`,
      40,
      y + 34,
      300,
      26,
      14,
      COLORS.gold,
      false,
      1,
      HorizontalTextAlignment.CENTER,
    );
    drawTechniqueAction(
      overlay,
      upgrade,
      -218,
      -78,
      y,
      mutationsEnabled,
      () => actions.upgradeTechnique(technique.techniqueConfigId),
    );
    drawTechniqueAction(
      overlay,
      inherit,
      42,
      164,
      y,
      mutationsEnabled,
      () =>
        actions.inheritTechnique(
          technique.techniqueConfigId,
          inherit.targetTechniqueConfigId ?? technique.techniqueConfigId,
        ),
    );
    // 升华 sits under 升星 because they compete for the same duplicates: stars
    // now, or the 优秀 book later. Reading them in one column is the point.
    drawTechniqueAction(
      overlay,
      ascend,
      -218,
      -78,
      y - 34,
      mutationsEnabled,
      () => actions.ascendTechnique(technique.techniqueConfigId),
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
      y - 17,
      78,
      56,
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

/**
 * One cost label plus its button, the same pairing the equipment rows use — the
 * technique rows now carry three of them (升星, 传承 and 升华) across two lines,
 * and the two in the left column have to line up.
 */
function drawTechniqueAction(
  overlay: Node,
  display: AssetUpgradeDisplay,
  costX: number,
  buttonX: number,
  y: number,
  mutationsEnabled: boolean,
  onClick: () => void,
): void {
  addLabel(
    overlay,
    display.costText,
    costX,
    y,
    130,
    26,
    11,
    display.actionEnabled && !display.affordable
      ? COLORS.red
      : COLORS.textMuted,
    false,
    2,
    HorizontalTextAlignment.LEFT,
  );
  createButton(
    overlay,
    display.actionText,
    buttonX,
    y,
    84,
    28,
    {
      fill: display.affordable ? COLORS.inkGreenLight : COLORS.panel,
      stroke: display.affordable ? COLORS.gold : COLORS.goldMuted,
      fontSize: 12,
      enabled: mutationsEnabled && display.actionEnabled,
    },
    onClick,
  );
}
