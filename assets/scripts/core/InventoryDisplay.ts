export function isDirectlyUsableInventoryItem(itemConfigId: string): boolean {
  return itemConfigId === "exp_pill_small" || itemConfigId === "exp_pill_large";
}
