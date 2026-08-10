import type { EquippedEquipmentSlot } from "@cultivation-diary/shared";
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
    `法宝 ${equipment.length} 件 · 装备影响战力与挂机效率`,
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
    drawBand(overlay, `Equipment-${item.id}`, 0, y, 600, 60, COLORS.panel);
    addLabel(
      overlay,
      item.displayName,
      -190,
      y,
      205,
      34,
      18,
      qualityColor(item.quality),
      true,
      1,
      HorizontalTextAlignment.LEFT,
    );
    addLabel(
      overlay,
      `战力 +${formatLargeNumber(item.fixedPower)} · +${item.enhanceLevel}`,
      25,
      y,
      170,
      32,
      17,
      COLORS.gold,
      false,
      1,
      HorizontalTextAlignment.CENTER,
    );
    if (item.equippedSlot) {
      createButton(
        overlay,
        "卸下",
        245,
        y,
        92,
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
        211,
        y,
        58,
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
        273,
        y,
        58,
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
          245,
          y,
          92,
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
