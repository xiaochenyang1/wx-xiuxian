import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  assetLedger,
  inventoryStacks,
  newcomerTaskProgress,
} from "../../db/schema";
import type { GameDatabase } from "../../infrastructure";

export const BREAKTHROUGH_PILL_ITEM_ID = "breakthrough_pill";
export const REACH_LEVEL_EIGHT_TASK_ID = "newcomer.reach_level_8";

type GameTransaction = Parameters<Parameters<GameDatabase["transaction"]>[0]>[0];

export async function grantLevelEightRewardIfNeeded(
  transaction: GameTransaction,
  playerId: string,
  level: number,
  referenceId: string,
  referenceType: "settlement" | "offline_settlement" | "inventory_operation",
  now: Date,
): Promise<boolean> {
  if (level < 8) return false;

  const [createdTask] = await transaction
    .insert(newcomerTaskProgress)
    .values({
      playerId,
      taskConfigId: REACH_LEVEL_EIGHT_TASK_ID,
      progress: "8",
      completedAt: now,
      claimedAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ playerId: newcomerTaskProgress.playerId });

  if (!createdTask) return false;

  const [pillStack] = await transaction
    .insert(inventoryStacks)
    .values({
      playerId,
      itemConfigId: BREAKTHROUGH_PILL_ITEM_ID,
      quantity: "1",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [inventoryStacks.playerId, inventoryStacks.itemConfigId],
      set: {
        quantity: sql`${inventoryStacks.quantity} + 1`,
        updatedAt: now,
      },
    })
    .returning({ quantity: inventoryStacks.quantity });

  await transaction.insert(assetLedger).values({
    id: randomUUID(),
    playerId,
    assetType: "item",
    assetKey: BREAKTHROUGH_PILL_ITEM_ID,
    delta: "1",
    balanceAfter: pillStack?.quantity ?? "1",
    reason: "newcomer_level_8_reward",
    referenceType,
    referenceId,
    metadata: { taskConfigId: REACH_LEVEL_EIGHT_TASK_ID },
    createdAt: now,
  });
  return true;
}
