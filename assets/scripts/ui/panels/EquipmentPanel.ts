import {
  getStoredEquipment,
  type EquippedEquipmentSlot,
} from "@cultivation-diary/shared";
import { getEquipmentEnhanceDisplay } from "../../core/AssetUpgradeDisplay";
import { formatLargeNumber } from "../../core/ClientNumber";
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
import { qualityColor } from "../primitives/Format";
import { HorizontalTextAlignment, Node } from "cc";

export function drawEquipmentPanel(
  overlay: Node,
  state: Readonly<AppState>,
  actions: AppViewActions,
  paging: PanelPaging,
): void {
  const equipment = getStoredEquipment(state.bootstrap!);
  const mutationsEnabled = canRunLocalMutation(state);
  const equipmentWindow = paging.window("equipment", equipment.length, 5);
  addLabel(
    overlay,
    `法宝 ${equipment.length} 件 · 强化石 ${formatLargeNumber(
      state.bootstrap!.inventory.stacks.find(
        (stack) => stack.itemConfigId === "enhance_stone",
      )?.quantity ?? "0",
    )} · 装备影响战力与挂机效率`,
    0,
    393,
    590,
    40,
    19,
    COLORS.jade,
  );
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
    const y = 172 - index * 91;
    const enhance = getEquipmentEnhanceDisplay(state.bootstrap!, item);
    const management = getEquipmentManagementDisplay(item);
    drawBand(overlay, `Equipment-${item.id}`, 0, y, 600, 82, COLORS.panel);
    addLabel(
      overlay,
      item.displayName,
      -230,
      y + 18,
      125,
      34,
      17,
      qualityColor(item.quality),
      true,
      1,
      HorizontalTextAlignment.LEFT,
    );
    addLabel(
      overlay,
      `战力 +${formatLargeNumber(item.fixedPower)} · +${item.enhanceLevel}`,
      -95,
      y + 18,
      150,
      32,
      15,
      COLORS.gold,
      false,
      1,
      HorizontalTextAlignment.CENTER,
    );
    addLabel(
      overlay,
      management.protectionText,
      82,
      y + 18,
      92,
      28,
      14,
      item.isLocked ? COLORS.gold : COLORS.textMuted,
    );
    addLabel(
      overlay,
      enhance.costText.replace("\n", " · "),
      207,
      y + 18,
      154,
      28,
      13,
      enhance.affordable || enhance.maxed ? COLORS.textMuted : COLORS.red,
    );
    createButton(
      overlay,
      enhance.actionText,
      -205,
      y - 22,
      86,
      34,
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
      y - 22,
      86,
      34,
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
      y - 22,
      150,
      34,
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
        y - 22,
        100,
        34,
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
        y - 22,
        48,
        34,
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
        y - 22,
        48,
        34,
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
          y - 22,
          100,
          34,
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
