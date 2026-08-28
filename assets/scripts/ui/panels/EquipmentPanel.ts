import {
  getStoredEquipment,
  type EquippedEquipmentSlot,
} from "@cultivation-diary/shared";
import {
  getEquipmentAffixDisplay,
  getEquipmentAscendDisplay,
  getEquipmentEnhanceDisplay,
  getEquipmentEnhanceOrderHintText,
  getEquipmentHeaderText,
  getEquipmentRerollDisplay,
  getEquipmentTitleText,
  type AssetUpgradeDisplay,
} from "../../core/AssetUpgradeDisplay";
import { getEquipmentManagementDisplay } from "../../core/EquipmentManagementDisplay";
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
import { formatBasisPoints, qualityColor } from "../primitives/Format";
import { HorizontalTextAlignment, Node } from "cc";

export function drawEquipmentPanel(
  overlay: Node,
  state: Readonly<AppState>,
  actions: AppViewActions,
  paging: PanelPaging,
): void {
  const equipment = getStoredEquipment(state.bootstrap!);
  const mutationsEnabled = canRunLocalMutation(state);
  const equipmentWindow = paging.window("equipment", equipment.length, 4);
  addLabel(
    overlay,
    getEquipmentHeaderText(state.bootstrap!, equipment.length),
    0,
    393,
    590,
    40,
    19,
    COLORS.jade,
  );
  const enhanceOrderHint = getEquipmentEnhanceOrderHintText(equipment);
  if (enhanceOrderHint) {
    addLabel(
      overlay,
      enhanceOrderHint,
      0,
      365,
      590,
      22,
      13,
      COLORS.gold,
      false,
      1,
      HorizontalTextAlignment.CENTER,
    );
  }
  const slots: Array<{ id: EquippedEquipmentSlot; label: string }> = [
    { id: "weapon", label: "武器" },
    { id: "armor", label: "防具" },
    { id: "accessory_left", label: "饰品·左" },
    { id: "accessory_right", label: "饰品·右" },
    { id: "mount", label: "坐骑" },
    { id: "pet", label: "灵宠" },
  ];
  slots.forEach((slot, index) => {
    const x = -205 + (index % 3) * 205;
    const y = index < 3 ? 326 : 260;
    const equipped = equipment.find((item) => item.equippedSlot === slot.id);
    drawBand(overlay, `EquipmentSlot-${slot.id}`, x, y, 188, 54, COLORS.panel, COLORS.goldMuted);
    addLabel(
      overlay,
      `${slot.label} · ${equipped?.displayName ?? "未装备"}`,
      x,
      y,
      170,
      36,
      14,
      equipped ? qualityColor(equipped.quality) : COLORS.textMuted,
    );
  });
  if (equipment.length === 0) {
    addLabel(overlay, "尚无法宝入囊，可先处理挂机收获", 0, 135, 560, 48, 20, COLORS.text);
    return;
  }
  equipment.slice(equipmentWindow.start, equipmentWindow.end).forEach((item, index) => {
    const y = 150 - index * 120;
    const enhance = getEquipmentEnhanceDisplay(state.bootstrap!, item);
    const affix = getEquipmentAffixDisplay(item);
    const reroll = getEquipmentRerollDisplay(state.bootstrap!, item);
    const ascend = getEquipmentAscendDisplay(state.bootstrap!, item);
    const management = getEquipmentManagementDisplay(item);
    drawBand(overlay, `Equipment-${item.id}`, 0, y, 600, 112, COLORS.panel);
    addLabel(
      overlay,
      getEquipmentTitleText(item),
      -230,
      y + 41,
      125,
      30,
      16,
      qualityColor(item.quality),
      true,
      1,
      HorizontalTextAlignment.LEFT,
    );
    addLabel(
      overlay,
      `战力 +${formatBasisPoints(item.powerBonusBp)} · +${item.enhanceLevel}`,
      -95,
      y + 41,
      150,
      28,
      14,
      COLORS.gold,
      false,
      1,
      HorizontalTextAlignment.CENTER,
    );
    addLabel(
      overlay,
      management.protectionText,
      82,
      y + 41,
      92,
      26,
      13,
      item.isLocked ? COLORS.gold : COLORS.textMuted,
    );
    addLabel(
      overlay,
      enhance.costText.replace("\n", " · "),
      207,
      y + 41,
      154,
      26,
      12,
      enhance.affordable || enhance.maxed ? COLORS.textMuted : COLORS.red,
    );
    // The affix line reads as one sentence — the score first, then the rolls it
    // scored — so a player can judge a piece without opening anything.
    addLabel(
      overlay,
      affix.affixText
        ? `${affix.bandScoreText} · ${affix.affixText}`
        : affix.bandScoreText,
      0,
      y + 15,
      570,
      22,
      12,
      affix.hasAffixes ? COLORS.jade : COLORS.textMuted,
      false,
      1,
      HorizontalTextAlignment.LEFT,
    );
    drawUpgradeAction(
      overlay,
      reroll,
      -196,
      -84,
      y - 11,
      mutationsEnabled,
      () => actions.rerollEquipmentAffixes(item.id),
    );
    drawUpgradeAction(
      overlay,
      ascend,
      100,
      212,
      y - 11,
      mutationsEnabled,
      () => actions.ascendEquipment(item.id),
    );
    createButton(
      overlay,
      enhance.actionText,
      -205,
      y - 41,
      86,
      30,
      {
        fill: enhance.affordable ? COLORS.inkGreenLight : COLORS.panel,
        stroke: enhance.affordable ? COLORS.gold : COLORS.goldMuted,
        fontSize: 13,
        enabled: mutationsEnabled && enhance.actionEnabled,
      },
      () => actions.enhanceEquipment(item.id),
    );
    createButton(
      overlay,
      management.lockActionText,
      -106,
      y - 41,
      86,
      30,
      {
        fill: item.isLocked ? COLORS.goldMuted : COLORS.panelStrong,
        stroke: COLORS.goldMuted,
        text: item.isLocked ? COLORS.background : COLORS.gold,
        fontSize: 13,
        enabled: mutationsEnabled,
      },
      () => actions.toggleEquipmentLock(item.id),
    );
    createButton(
      overlay,
      management.salvageActionText,
      20,
      y - 41,
      150,
      30,
      {
        fill: management.salvageEnabled ? COLORS.red : COLORS.panel,
        stroke: COLORS.goldMuted,
        fontSize: 12,
        enabled: mutationsEnabled && management.salvageEnabled,
      },
      () => actions.salvageEquipment(item.id),
    );
    if (item.equippedSlot) {
      createButton(
        overlay,
        "卸下",
        230,
        y - 41,
        100,
        30,
        {
          fill: COLORS.red,
          stroke: COLORS.goldMuted,
          fontSize: 13,
          enabled: mutationsEnabled,
        },
        () => actions.unequipEquipment(item.id),
      );
    } else if (item.slot === "accessory") {
      createButton(
        overlay,
        "装左",
        202,
        y - 41,
        48,
        30,
        {
          fill: COLORS.inkGreenLight,
          stroke: COLORS.goldMuted,
          fontSize: 12,
          enabled: mutationsEnabled,
        },
        () => actions.equipEquipment(item.id, "accessory_left"),
      );
      createButton(
        overlay,
        "装右",
        258,
        y - 41,
        48,
        30,
        {
          fill: COLORS.inkGreenLight,
          stroke: COLORS.goldMuted,
          fontSize: 12,
          enabled: mutationsEnabled,
        },
        () => actions.equipEquipment(item.id, "accessory_right"),
      );
    } else {
      const equippedSlot = regularEquipmentSlot(item.slot);
      if (equippedSlot) {
        createButton(
          overlay,
          equipment.some((candidate) => candidate.equippedSlot === equippedSlot)
            ? "替换"
            : "装备",
          230,
          y - 41,
          100,
          30,
          {
            fill: COLORS.inkGreenLight,
            stroke: COLORS.goldMuted,
            fontSize: 13,
            enabled: mutationsEnabled,
          },
          () => actions.equipEquipment(item.id, equippedSlot),
        );
      }
    }
  });
  drawPagination(
    overlay,
    "EquipmentPager",
    0,
    -330,
    equipmentWindow.page,
    equipmentWindow.pageCount,
    () => paging.show("equipment", equipmentWindow.page - 1),
    () => paging.show("equipment", equipmentWindow.page + 1),
  );
}

/**
 * The cost sits beside the button rather than inside it: the two sinks price
 * themselves in two currencies, and a player deciding between them needs to read
 * both prices without tapping either.
 */
function drawUpgradeAction(
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
    120,
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

function regularEquipmentSlot(value: string): EquippedEquipmentSlot | null {
  if (
    value === "weapon" ||
    value === "armor" ||
    value === "mount" ||
    value === "pet"
  ) {
    return value;
  }
  return null;
}
