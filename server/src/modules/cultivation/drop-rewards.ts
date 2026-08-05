import { randomInt as secureRandomInt, randomUUID } from "node:crypto";
import {
  ASSET_QUALITY_ORDER,
  EQUIPMENT_CONFIGS,
  TECHNIQUE_CONFIGS,
  getEquipmentConfig,
  getRealmConfigForLevel,
  getTechniqueConfig,
  isAssetQuality,
  type AssetQuality,
  type DropRewardSummary,
} from "@cultivation-diary/shared";
import { and, eq, sql } from "drizzle-orm";
import { ACTIVE_IDLE_DROP_TABLE } from "../../config/game-config";
import {
  assetLedger,
  equipmentInstances,
  harvestChestEntries,
  inventoryStacks,
  playerWallets,
  techniqueProgress,
} from "../../db/schema";
import type { GameDatabase } from "../../infrastructure";

export type DropRandomInt = (maxExclusive: number) => number;
export type GameTransaction = Parameters<Parameters<GameDatabase["transaction"]>[0]>[0];

export interface GeneratedEquipmentDrop {
  equipmentConfigId: string;
  quality: AssetQuality;
  valueScore: string;
  rolledAffixes: Array<{ stat: string; valueBp: number }>;
}

export interface GeneratedTechniqueDrop {
  techniqueConfigId: string;
  quality: AssetQuality;
  valueScore: string;
}

export interface GeneratedIdleDrops {
  configVersion: string;
  stackItems: Array<{ itemConfigId: string; quantity: string }>;
  equipment: GeneratedEquipmentDrop[];
  techniques: GeneratedTechniqueDrop[];
}

export interface PersistIdleDropsInput {
  playerId: string;
  level: number;
  attempts: number;
  referenceId: string;
  referenceType: "settlement" | "offline_settlement" | "breakthrough";
  reason: string;
  now: Date;
  randomInt?: DropRandomInt;
}

interface PendingHarvestEntry {
  id: string;
  entryType: "equipment" | "technique";
  equipmentInstanceId: string | null;
  techniqueConfigId: string | null;
  quality: AssetQuality;
  valueScore: string;
  configVersion: string;
  acquiredAt: Date;
}

interface HarvestCandidate {
  entryType: "equipment" | "technique";
  equipmentInstanceId: string | null;
  techniqueConfigId: string | null;
  quality: AssetQuality;
  valueScore: string;
  configVersion: string;
  acquiredAt: Date;
}

interface SalvageAccumulator {
  count: number;
  spiritStone: bigint;
  enhanceStone: bigint;
}

export function generateIdleDrops(
  attempts: number,
  level: number,
  randomInt: DropRandomInt = secureRandomInt,
): GeneratedIdleDrops {
  if (!Number.isSafeInteger(attempts) || attempts < 0) {
    throw new RangeError("Drop attempts must be a non-negative safe integer");
  }
  getRealmConfigForLevel(level);

  const table = ACTIVE_IDLE_DROP_TABLE;
  const stackItems = new Map<string, bigint>();
  const equipment: GeneratedEquipmentDrop[] = [];
  const techniques: GeneratedTechniqueDrop[] = [];
  const availableEquipment = EQUIPMENT_CONFIGS.filter(
    (config) => level >= config.minLevel && level <= config.maxLevel,
  );
  if (availableEquipment.length === 0) {
    throw new Error(`No equipment drop config is available at level ${level}`);
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (roll(table.pools.material.chance, table.probabilityScale, randomInt)) {
      const itemConfigId = choose(table.pools.material.itemConfigIds, randomInt);
      const quantity =
        table.pools.material.minimumQuantity +
        randomInt(
          table.pools.material.maximumQuantity -
            table.pools.material.minimumQuantity +
            1,
        );
      addStackedReward(stackItems, itemConfigId, BigInt(quantity));
    }
    if (roll(table.pools.enhanceStone.chance, table.probabilityScale, randomInt)) {
      addStackedReward(
        stackItems,
        table.pools.enhanceStone.itemConfigId,
        BigInt(table.pools.enhanceStone.quantity),
      );
    }
    if (roll(table.pools.equipment.chance, table.probabilityScale, randomInt)) {
      const quality = roll(
        table.pools.equipment.commonWeight,
        table.pools.equipment.qualityWeightScale,
        randomInt,
      )
        ? "common"
        : "uncommon";
      const equipmentConfig = choose(availableEquipment, randomInt);
      const qualityMultiplierBp = quality === "common" ? 10_000 : 15_000;
      const valueScore = Math.floor(
        (equipmentConfig.basePower * qualityMultiplierBp) / 10_000,
      ).toString();
      equipment.push({
        equipmentConfigId: equipmentConfig.id,
        quality,
        valueScore,
        rolledAffixes:
          quality === "common"
            ? []
            : [
                choose(
                  [
                    { stat: "experience_bonus", valueBp: 100 },
                    { stat: "spirit_stone_bonus", valueBp: 100 },
                    { stat: "drop_bonus", valueBp: 50 },
                  ] as const,
                  randomInt,
                ),
              ],
      });
    }
    if (roll(table.pools.technique.chance, table.probabilityScale, randomInt)) {
      const quality = roll(
        table.pools.technique.commonWeight,
        table.pools.technique.qualityWeightScale,
        randomInt,
      )
        ? "common"
        : "uncommon";
      const candidates = TECHNIQUE_CONFIGS.filter(
        (config) => config.quality === quality,
      );
      const techniqueConfig = choose(candidates, randomInt);
      techniques.push({
        techniqueConfigId: techniqueConfig.id,
        quality,
        valueScore: techniqueConfig.valueScore.toString(),
      });
    }
    if (roll(table.pools.breakthroughPill.chance, table.probabilityScale, randomInt)) {
      addStackedReward(
        stackItems,
        table.pools.breakthroughPill.itemConfigId,
        BigInt(table.pools.breakthroughPill.quantity),
      );
    }
  }

  return {
    configVersion: table.version,
    stackItems: [...stackItems.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([itemConfigId, quantity]) => ({
        itemConfigId,
        quantity: quantity.toString(),
      })),
    equipment,
    techniques,
  };
}

export function emptyDropRewardSummary(): DropRewardSummary {
  return {
    configVersion: ACTIVE_IDLE_DROP_TABLE.version,
    stackItems: [],
    equipmentCount: 0,
    techniqueCount: 0,
    harvestChestAdded: 0,
    techniqueDuplicates: 0,
    autoSalvagedCount: 0,
    mailedCount: 0,
    autoSalvageSpiritStone: "0",
    autoSalvageEnhanceStone: "0",
  };
}

export async function persistIdleDrops(
  transaction: GameTransaction,
  input: PersistIdleDropsInput,
): Promise<DropRewardSummary> {
  const generated = generateIdleDrops(
    input.attempts,
    input.level,
    input.randomInt,
  );
  const summary = emptyDropRewardSummary();
  summary.configVersion = generated.configVersion;
  summary.stackItems = generated.stackItems;
  summary.equipmentCount = generated.equipment.length;
  summary.techniqueCount = generated.techniques.length;

  for (const reward of generated.stackItems) {
    const balanceAfter = await addInventoryStack(
      transaction,
      input.playerId,
      reward.itemConfigId,
      BigInt(reward.quantity),
      input.now,
    );
    await transaction.insert(assetLedger).values({
      id: randomUUID(),
      playerId: input.playerId,
      assetType: "item",
      assetKey: reward.itemConfigId,
      delta: reward.quantity,
      balanceAfter,
      reason: input.reason,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      metadata: {
        dropTableVersion: generated.configVersion,
        dropAttempts: input.attempts,
      },
      createdAt: input.now,
    });
  }

  const pendingRows = await transaction
    .select({
      id: harvestChestEntries.id,
      entryType: harvestChestEntries.entryType,
      equipmentInstanceId: harvestChestEntries.equipmentInstanceId,
      techniqueConfigId: harvestChestEntries.techniqueConfigId,
      quality: harvestChestEntries.quality,
      valueScore: harvestChestEntries.valueScore,
      configVersion: harvestChestEntries.configVersion,
      acquiredAt: harvestChestEntries.acquiredAt,
    })
    .from(harvestChestEntries)
    .where(
      and(
        eq(harvestChestEntries.playerId, input.playerId),
        eq(harvestChestEntries.status, "pending"),
      ),
    )
    .for("update");
  const pending: PendingHarvestEntry[] = pendingRows.map((row) => ({
    ...row,
    entryType: parseEntryType(row.entryType),
    quality: parseQuality(row.quality),
  }));
  if (pending.length > ACTIVE_IDLE_DROP_TABLE.harvestChestCapacity) {
    throw new Error(`Harvest chest capacity is corrupted for player ${input.playerId}`);
  }

  const salvage: SalvageAccumulator = {
    count: 0,
    spiritStone: 0n,
    enhanceStone: 0n,
  };
  for (const equipment of generated.equipment) {
    const instanceId = randomUUID();
    await transaction.insert(equipmentInstances).values({
      id: instanceId,
      playerId: input.playerId,
      equipmentConfigId: equipment.equipmentConfigId,
      quality: equipment.quality,
      rolledAffixes: equipment.rolledAffixes,
      location: "harvest",
      configVersion: generated.configVersion,
      acquiredAt: input.now,
      updatedAt: input.now,
    });
    const candidate: HarvestCandidate = {
      entryType: "equipment",
      equipmentInstanceId: instanceId,
      techniqueConfigId: null,
      quality: equipment.quality,
      valueScore: equipment.valueScore,
      configVersion: generated.configVersion,
      acquiredAt: input.now,
    };
    const destination = await placeHarvestCandidate(
      transaction,
      input,
      candidate,
      pending,
      salvage,
    );
    updateDestinationSummary(summary, destination);
    await transaction.insert(assetLedger).values({
      id: randomUUID(),
      playerId: input.playerId,
      assetType: "equipment",
      assetKey: instanceId,
      delta: "1",
      balanceAfter: null,
      reason: input.reason,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      metadata: {
        equipmentConfigId: equipment.equipmentConfigId,
        quality: equipment.quality,
        dropTableVersion: generated.configVersion,
        destination,
        rolledAffixes: equipment.rolledAffixes,
      },
      createdAt: input.now,
    });
  }

  const ownedTechniqueRows = await transaction
    .select({ techniqueConfigId: techniqueProgress.techniqueConfigId })
    .from(techniqueProgress)
    .where(eq(techniqueProgress.playerId, input.playerId))
    .for("update");
  const ownedTechniques = new Set(
    ownedTechniqueRows.map((row) => row.techniqueConfigId),
  );

  for (const technique of generated.techniques) {
    if (ownedTechniques.has(technique.techniqueConfigId)) {
      const [updated] = await transaction
        .update(techniqueProgress)
        .set({
          duplicateCount: sql`${techniqueProgress.duplicateCount} + 1`,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(techniqueProgress.playerId, input.playerId),
            eq(techniqueProgress.techniqueConfigId, technique.techniqueConfigId),
          ),
        )
        .returning({ duplicateCount: techniqueProgress.duplicateCount });
      if (!updated) throw new Error("Owned technique disappeared while awarding a duplicate");
      summary.techniqueDuplicates += 1;
      await transaction.insert(assetLedger).values({
        id: randomUUID(),
        playerId: input.playerId,
        assetType: "technique",
        assetKey: technique.techniqueConfigId,
        delta: "1",
        balanceAfter: updated.duplicateCount.toString(),
        reason: input.reason,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        metadata: {
          quality: technique.quality,
          dropTableVersion: generated.configVersion,
          destination: "technique_duplicate",
        },
        createdAt: input.now,
      });
      continue;
    }

    const candidate: HarvestCandidate = {
      entryType: "technique",
      equipmentInstanceId: null,
      techniqueConfigId: technique.techniqueConfigId,
      quality: technique.quality,
      valueScore: technique.valueScore,
      configVersion: generated.configVersion,
      acquiredAt: input.now,
    };
    const destination = await placeHarvestCandidate(
      transaction,
      input,
      candidate,
      pending,
      salvage,
    );
    updateDestinationSummary(summary, destination);
    await transaction.insert(assetLedger).values({
      id: randomUUID(),
      playerId: input.playerId,
      assetType: "technique",
      assetKey: technique.techniqueConfigId,
      delta: "1",
      balanceAfter: null,
      reason: input.reason,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      metadata: {
        quality: technique.quality,
        dropTableVersion: generated.configVersion,
        destination,
      },
      createdAt: input.now,
    });
  }

  if (salvage.spiritStone > 0n) {
    const [wallet] = await transaction
      .update(playerWallets)
      .set({
        spiritStone: sql`${playerWallets.spiritStone} + ${salvage.spiritStone.toString()}`,
        lifetimeSpiritStoneEarned: sql`${playerWallets.lifetimeSpiritStoneEarned} + ${salvage.spiritStone.toString()}`,
        updatedAt: input.now,
      })
      .where(eq(playerWallets.playerId, input.playerId))
      .returning({ spiritStone: playerWallets.spiritStone });
    if (!wallet) throw new Error("Player wallet disappeared during automatic salvage");
    await transaction.insert(assetLedger).values({
      id: randomUUID(),
      playerId: input.playerId,
      assetType: "currency",
      assetKey: "spirit_stone",
      delta: salvage.spiritStone.toString(),
      balanceAfter: wallet.spiritStone,
      reason: "harvest_auto_salvage",
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      metadata: {
        dropTableVersion: generated.configVersion,
        salvagedCount: salvage.count,
      },
      createdAt: input.now,
    });
  }
  if (salvage.enhanceStone > 0n) {
    const balanceAfter = await addInventoryStack(
      transaction,
      input.playerId,
      "enhance_stone",
      salvage.enhanceStone,
      input.now,
    );
    await transaction.insert(assetLedger).values({
      id: randomUUID(),
      playerId: input.playerId,
      assetType: "item",
      assetKey: "enhance_stone",
      delta: salvage.enhanceStone.toString(),
      balanceAfter,
      reason: "harvest_auto_salvage",
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      metadata: {
        dropTableVersion: generated.configVersion,
        salvagedCount: salvage.count,
      },
      createdAt: input.now,
    });
  }

  summary.autoSalvagedCount = salvage.count;
  summary.autoSalvageSpiritStone = salvage.spiritStone.toString();
  summary.autoSalvageEnhanceStone = salvage.enhanceStone.toString();
  return summary;
}

export function getSalvageYield(
  entryType: "equipment" | "technique",
  quality: AssetQuality,
): { spiritStone: bigint; enhanceStone: bigint } {
  if (quality === "common" || quality === "uncommon") {
    const configured = ACTIVE_IDLE_DROP_TABLE.salvage[entryType][quality];
    return {
      spiritStone: BigInt(configured.spiritStone),
      enhanceStone: BigInt(configured.enhanceStone),
    };
  }

  const qualityMultiplier = [1n, 2n, 5n, 12n, 30n, 80n, 200n][
    ASSET_QUALITY_ORDER[quality]
  ];
  if (qualityMultiplier === undefined) throw new Error(`Unknown quality: ${quality}`);
  return {
    spiritStone: BigInt(entryType === "equipment" ? 100 : 80) * qualityMultiplier,
    enhanceStone:
      entryType === "equipment"
        ? BigInt(ASSET_QUALITY_ORDER[quality] + 1)
        : 0n,
  };
}

async function placeHarvestCandidate(
  transaction: GameTransaction,
  input: PersistIdleDropsInput,
  candidate: HarvestCandidate,
  pending: PendingHarvestEntry[],
  salvage: SalvageAccumulator,
): Promise<"harvest" | "auto_salvaged" | "mail"> {
  if (pending.length < ACTIVE_IDLE_DROP_TABLE.harvestChestCapacity) {
    const inserted = await insertHarvestEntry(
      transaction,
      input.playerId,
      candidate,
      "pending",
      input.now,
    );
    pending.push(inserted);
    return "harvest";
  }

  const lowestExisting = [...pending]
    .filter((entry) => entry.quality === "common" || entry.quality === "uncommon")
    .sort(compareHarvestValue)[0];
  const candidateCanSalvage =
    candidate.quality === "common" || candidate.quality === "uncommon";

  if (
    candidateCanSalvage &&
    (!lowestExisting || compareHarvestValue(candidate, lowestExisting) <= 0)
  ) {
    await consumeIncomingCandidate(
      transaction,
      input,
      candidate,
      salvage,
    );
    return "auto_salvaged";
  }

  if (lowestExisting) {
    await salvagePendingEntry(transaction, input, lowestExisting, salvage);
    const index = pending.findIndex((entry) => entry.id === lowestExisting.id);
    if (index >= 0) pending.splice(index, 1);
    const inserted = await insertHarvestEntry(
      transaction,
      input.playerId,
      candidate,
      "pending",
      input.now,
    );
    pending.push(inserted);
    return "harvest";
  }

  if (candidate.equipmentInstanceId) {
    await transaction
      .update(equipmentInstances)
      .set({ location: "mail", updatedAt: input.now })
      .where(eq(equipmentInstances.id, candidate.equipmentInstanceId));
  }
  await insertHarvestEntry(
    transaction,
    input.playerId,
    candidate,
    "mailed",
    input.now,
  );
  return "mail";
}

async function consumeIncomingCandidate(
  transaction: GameTransaction,
  input: PersistIdleDropsInput,
  candidate: HarvestCandidate,
  salvage: SalvageAccumulator,
): Promise<void> {
  if (candidate.equipmentInstanceId) {
    await transaction
      .update(equipmentInstances)
      .set({ location: "consumed", updatedAt: input.now })
      .where(eq(equipmentInstances.id, candidate.equipmentInstanceId));
  }
  await insertHarvestEntry(
    transaction,
    input.playerId,
    candidate,
    "salvaged",
    input.now,
  );
  await recordSalvagedAsset(transaction, input, candidate, salvage);
}

async function salvagePendingEntry(
  transaction: GameTransaction,
  input: PersistIdleDropsInput,
  entry: PendingHarvestEntry,
  salvage: SalvageAccumulator,
): Promise<void> {
  await transaction
    .update(harvestChestEntries)
    .set({ status: "salvaged", processedAt: input.now })
    .where(eq(harvestChestEntries.id, entry.id));
  if (entry.equipmentInstanceId) {
    await transaction
      .update(equipmentInstances)
      .set({ location: "consumed", updatedAt: input.now })
      .where(eq(equipmentInstances.id, entry.equipmentInstanceId));
  }
  await recordSalvagedAsset(transaction, input, entry, salvage);
}

async function recordSalvagedAsset(
  transaction: GameTransaction,
  input: PersistIdleDropsInput,
  entry: Pick<
    HarvestCandidate,
    "entryType" | "equipmentInstanceId" | "techniqueConfigId" | "quality"
  >,
  salvage: SalvageAccumulator,
): Promise<void> {
  const reward = getSalvageYield(entry.entryType, entry.quality);
  salvage.count += 1;
  salvage.spiritStone += reward.spiritStone;
  salvage.enhanceStone += reward.enhanceStone;
  await transaction.insert(assetLedger).values({
    id: randomUUID(),
    playerId: input.playerId,
    assetType: entry.entryType,
    assetKey: entry.equipmentInstanceId ?? entry.techniqueConfigId ?? "unknown",
    delta: "-1",
    balanceAfter: null,
    reason: "harvest_auto_salvage",
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    metadata: {
      quality: entry.quality,
      dropTableVersion: ACTIVE_IDLE_DROP_TABLE.version,
      spiritStoneReturned: reward.spiritStone.toString(),
      enhanceStoneReturned: reward.enhanceStone.toString(),
    },
    createdAt: input.now,
  });
}

async function insertHarvestEntry(
  transaction: GameTransaction,
  playerId: string,
  candidate: HarvestCandidate,
  status: "pending" | "salvaged" | "mailed",
  now: Date,
): Promise<PendingHarvestEntry> {
  const id = randomUUID();
  await transaction.insert(harvestChestEntries).values({
    id,
    playerId,
    entryType: candidate.entryType,
    equipmentInstanceId: candidate.equipmentInstanceId,
    techniqueConfigId: candidate.techniqueConfigId,
    quality: candidate.quality,
    valueScore: candidate.valueScore,
    configVersion: candidate.configVersion,
    status,
    acquiredAt: candidate.acquiredAt,
    processedAt: status === "pending" ? null : now,
  });
  return { id, ...candidate };
}

async function addInventoryStack(
  transaction: GameTransaction,
  playerId: string,
  itemConfigId: string,
  quantity: bigint,
  now: Date,
): Promise<string> {
  if (quantity <= 0n) throw new RangeError("Stack reward quantity must be positive");
  const [stack] = await transaction
    .insert(inventoryStacks)
    .values({
      playerId,
      itemConfigId,
      quantity: quantity.toString(),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [inventoryStacks.playerId, inventoryStacks.itemConfigId],
      set: {
        quantity: sql`${inventoryStacks.quantity} + ${quantity.toString()}`,
        updatedAt: now,
      },
    })
    .returning({ quantity: inventoryStacks.quantity });
  if (!stack) throw new Error("Inventory stack upsert did not return a row");
  return stack.quantity;
}

function updateDestinationSummary(
  summary: DropRewardSummary,
  destination: "harvest" | "auto_salvaged" | "mail",
): void {
  if (destination === "harvest") summary.harvestChestAdded += 1;
  if (destination === "mail") summary.mailedCount += 1;
}

function compareHarvestValue(
  left: Pick<HarvestCandidate, "quality" | "valueScore" | "acquiredAt">,
  right: Pick<HarvestCandidate, "quality" | "valueScore" | "acquiredAt">,
): number {
  const qualityDifference =
    ASSET_QUALITY_ORDER[left.quality] - ASSET_QUALITY_ORDER[right.quality];
  if (qualityDifference !== 0) return qualityDifference;
  const leftValue = BigInt(left.valueScore);
  const rightValue = BigInt(right.valueScore);
  if (leftValue !== rightValue) return leftValue < rightValue ? -1 : 1;
  return left.acquiredAt.getTime() - right.acquiredAt.getTime();
}

function roll(
  chance: number,
  scale: number,
  randomInt: DropRandomInt,
): boolean {
  return validatedRandomInt(randomInt, scale) < chance;
}

function choose<T>(values: readonly T[], randomInt: DropRandomInt): T {
  if (values.length === 0) throw new Error("Cannot choose from an empty drop pool");
  const value = values[validatedRandomInt(randomInt, values.length)];
  if (value === undefined) throw new Error("Drop random source selected an invalid value");
  return value;
}

function validatedRandomInt(
  randomInt: DropRandomInt,
  maxExclusive: number,
): number {
  const result = randomInt(maxExclusive);
  if (!Number.isInteger(result) || result < 0 || result >= maxExclusive) {
    throw new RangeError(
      `Drop random source returned ${result} outside [0, ${maxExclusive})`,
    );
  }
  return result;
}

function addStackedReward(
  rewards: Map<string, bigint>,
  itemConfigId: string,
  quantity: bigint,
): void {
  rewards.set(itemConfigId, (rewards.get(itemConfigId) ?? 0n) + quantity);
}

function parseQuality(value: string): AssetQuality {
  if (!isAssetQuality(value)) throw new Error(`Unknown stored asset quality: ${value}`);
  return value;
}

function parseEntryType(value: string): "equipment" | "technique" {
  if (value !== "equipment" && value !== "technique") {
    throw new Error(`Unknown harvest entry type: ${value}`);
  }
  return value;
}
