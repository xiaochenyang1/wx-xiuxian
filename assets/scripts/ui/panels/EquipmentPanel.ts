import type { EquippedEquipmentSlot } from "@cultivation-diary/shared";
import { getEquipmentEnhanceDisplay } from "../../core/AssetUpgradeDisplay";
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

export function drawEquipmentPanel(
  overlay: Node,
  state: Readonly<AppState>,
  actions: AppViewActions,
  paging: PanelPaging,
): void {
  const equipment = state.bootstrap!.equipment;
  const mutationsEnabled = canRunLocalMutation(state);
  const equipmentWindow = paging.window("equipment", equipment.length, 7);
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
    const y = 180 - index * 72;
    const enhance = getEquipmentEnhanceDisplay(state.bootstrap!, item);
    drawBand(overlay, `Equipment-${item.id}`, 0, y, 600, 60, COLORS.panel);
    addLabel(
      overlay,
      item.displayName,
      -230,
      y,
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
      y,
      140,
      32,
      15,
      COLORS.gold,
      false,
      1,
      HorizontalTextAlignment.CENTER,
    );
    addLabel(
      overlay,
      enhance.costText,
      47,
      y,
      140,
      44,
      13,
      enhance.affordable || enhance.maxed ? COLORS.textMuted : COLORS.red,
      false,
      2,
      HorizontalTextAlignment.CENTER,
    );
    createButton(
      overlay,
      enhance.actionText,
      154,
      y,
      64,
      44,
      {
        fill: enhance.affordable ? COLORS.inkGreenLight : COLORS.panel,
        stroke: enhance.affordable ? COLORS.gold : COLORS.goldMuted,
        fontSize: 14,
        enabled: mutationsEnabled && enhance.actionEnabled,
      },
      () => actions.enhanceEquipment(item.id),
    );
    if (item.equippedSlot) {
      createButton(
        overlay,
        "卸下",
        250,
        y,
        86,
        44,
        {
          fill: COLORS.red,
          stroke: COLORS.goldMuted,
          fontSize: 15,
          enabled: mutationsEnabled,
        },
        () => actions.unequipEquipment(item.id),
      );
    } else if (item.slot === "accessory") {
      createButton(
        overlay,
        "装左",
        213,
        y,
        50,
        42,
        {
          fill: COLORS.inkGreenLight,
          stroke: COLORS.goldMuted,
          fontSize: 14,
          enabled: mutationsEnabled,
        },
        () => actions.equipEquipment(item.id, "accessory_left"),
      );
      createButton(
        overlay,
        "装右",
        268,
        y,
        50,
        42,
        {
          fill: COLORS.inkGreenLight,
          stroke: COLORS.goldMuted,
          fontSize: 14,
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
          250,
          y,
          86,
          44,
          {
            fill: COLORS.inkGreenLight,
            stroke: COLORS.goldMuted,
            fontSize: 15,
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
