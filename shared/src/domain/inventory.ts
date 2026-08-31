import type { BootstrapSnapshot } from "../contracts/bootstrap";

type InventoryState = Pick<BootstrapSnapshot, "inventory" | "equipment">;

export function getStoredEquipment(
  snapshot: InventoryState,
): BootstrapSnapshot["equipment"] {
  return snapshot.equipment.filter((equipment) => equipment.location !== "harvest");
}

export function countOccupiedBagSlots(snapshot: InventoryState): number {
  return snapshot.inventory.stacks.length + getStoredEquipment(snapshot).length;
}
