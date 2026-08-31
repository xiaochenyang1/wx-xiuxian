import {
  equipmentSalvageReward,
  isAssetQuality,
  type BootstrapSnapshot,
} from "@cultivation-diary/shared";
import { formatLargeNumber } from "./ClientNumber";

type Equipment = BootstrapSnapshot["equipment"][number];

export interface EquipmentManagementDisplay {
  readonly lockActionText: "锁定" | "解锁";
  readonly protectionText: "已锁定" | "可分解" | "已装备" | "待收取";
  readonly salvageActionText: string;
  readonly salvageEnabled: boolean;
}

export function getEquipmentManagementDisplay(
  equipment: Equipment,
): EquipmentManagementDisplay {
  if (!isAssetQuality(equipment.quality)) {
    throw new RangeError(`Unknown equipment quality: ${equipment.quality}`);
  }
  const reward = equipmentSalvageReward(
    equipment.quality,
    equipment.enhanceLevel,
  );
  const equipped =
    equipment.location === "equipped" || equipment.equippedSlot !== null;
  const storedInBag = equipment.location === "bag" && !equipped;
  return {
    lockActionText: equipment.isLocked ? "解锁" : "锁定",
    protectionText:
      equipment.location === "harvest"
        ? "待收取"
        : equipped
          ? "已装备"
          : equipment.isLocked
            ? "已锁定"
            : "可分解",
    salvageActionText: `分解 ${formatLargeNumber(String(reward.spiritStone))}灵石/${formatLargeNumber(String(reward.enhanceStone))}石`,
    salvageEnabled: storedInBag && !equipment.isLocked,
  };
}
