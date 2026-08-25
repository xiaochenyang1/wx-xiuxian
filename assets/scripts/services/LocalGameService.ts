import {
  AFFIX_STATS,
  ASSET_QUALITY_DISPLAY_NAMES,
  ASSET_QUALITY_MULTIPLIER_BP,
  ASSET_QUALITY_ORDER,
  BASIS_POINTS,
  CRAFTING_QUALITY_WEIGHTS,
  CAVE_BUILDING_CONFIGS,
  CAVE_MAX_LEVEL,
  CAVE_UNLOCK_LEVEL,
  ENHANCE_STONE_OVERFLOW_SPIRIT_STONE_VALUE,
  EQUIPMENT_MAX_ENHANCE_LEVEL,
  EXPEDITION_STAGE_CONFIGS,
  EXPEDITION_SWEEP_MAX_COUNT,
  EXPEDITION_SWEEP_TOKEN_COST,
  PARTNER_MAX_LEVEL,
  PARTNER_UNLOCK_LEVEL,
  SECT_MAX_LEVEL,
  MAX_LEVEL,
  PROGRESSION_TASK_CONFIGS,
  TRIAL_TOWER_MAX_FLOOR,
  TRIAL_TOWER_UNLOCK_LEVEL,
  evaluateTrialFloor,
  trialFloorRewards,
  TECHNIQUE_MAX_STAR,
  TECHNIQUE_PAGES_PER_DUPLICATE,
  TECHNIQUE_CONFIGS,
  TREASURE_HUNT_TOTAL_WEIGHT,
  applyWholeExperience,
  addLoadoutBonuses,
  affixScorePercent,
  calculatePartnerBonuses,
  calculateSectBonuses,
  calculateCaveBonuses,
  calculateEquipmentContribution,
  calculateLoadoutBonuses,
  calculateOnlineExperiencePerSecond,
  calculateSpiritStonePerMinute,
  calculateTechniqueContribution,
  calculateTotalPower,
  caveUpgradeCost,
  caveBuildingLevel,
  canAscendEquipmentQuality,
  craftingQualityWeight,
  craftingSpiritStoneCost,
  completeBreakthrough,
  countOccupiedBagSlots,
  createEmptyCaveBuildings,
  decimal,
  equipmentAffixScoreBp,
  equipmentAscendCost,
  equipmentBandForLevel,
  equipmentConfigsForBand,
  equipmentDropQualityWeights,
  equipmentEnhanceCost,
  equipmentRerollCost,
  equipmentSalvageReward,
  evaluateExpeditionStage,
  evaluateExpeditionSweep,
  getCaveBuildingConfig,
  getAlchemyRecipeConfig,
  getCraftingRecipeConfig,
  getEquipmentConfig,
  getExpeditionStageConfig,
  getItemConfig,
  getPartnerConfig,
  getRealmConfigForLevel,
  getRealmStage,
  getRealmTitle,
  getTechniqueConfig,
  getSectConfig,
  isAssetQuality,
  nextAssetQuality,
  partnerBondRequirement,
  pickTreasureHuntReward,
  requiredExperienceForLevel,
  readRolledAffixes,
  resolveCraftingEquipmentConfig,
  rollEquipmentAffixes,
  settleCultivation,
  sectContributionRequirement,
  shouldAutoLockEquipment,
  simulateOnlineExperience,
  techniqueStarUpgradeCost,
  type AssetQuality,
  type AutoSalvageQuality,
  type BootstrapSnapshot,
  type ChosenAvatarVariant,
  type DebugGrantTarget,
  type DropRewardSummary,
  type EquipmentBand,
  type EquippedEquipmentSlot,
  type ProgressionEvent,
} from "@cultivation-diary/shared";
import { CLIENT_CONFIG } from "../core/ClientConfig";
import type { PlatformAdapter } from "../platform/PlatformAdapter";
import {
  DROP_CONFIG_VERSION,
  GAME_CONFIG_VERSION,
  GAME_CONFIG_VERSION_PRE_AFFIX_ROLL,
  GAME_CONFIG_VERSION_PRE_CAVE,
  GAME_CONFIG_VERSION_PRE_EQUIPMENT_MANAGEMENT,
  GAME_CONFIG_VERSION_PRE_EXPEDITION,
  GAME_CONFIG_VERSION_PRE_EXPEDITION_SWEEPS,
  GAME_CONFIG_VERSION_PRE_FEATURE_COMPLETION,
  GAME_CONFIG_VERSION_PRE_ITEM_COMPLETION,
  GAME_CONFIG_VERSION_PRE_POWER_MODEL,
  GAME_CONFIG_VERSION_PRE_TRIAL_TOWER,
  LOCAL_SAVE_SCHEMA_VERSION,
  createInitialSave,
  refreshSnapshot,
  syncProgressionTasks,
  type LocalGameSave,
} from "./local-game-snapshot";

const OFFLINE_NOTICE_MIN_SECONDS = 60;
const HARVEST_CHEST_CAPACITY = 100;
const BAG_INITIAL_CAPACITY = 50;
const BAG_MAX_CAPACITY = 200;
const BAG_EXPANSION_SIZE = 10;
const BAG_EXPANSION_BASE_COST = 5_000;
const IDLE_STACK_OVERFLOW_SPIRIT_STONE_VALUE = 100;
const DROP_CLOCK_MAX_REMAINDER = 60_000_000;
const LOCAL_BACKUP_PREFIX = "XIUXIAN_SAVE_V1:";
const LOCAL_BACKUP_CHECKSUM_LENGTH = 8;
const LOCAL_BACKUP_MAX_LENGTH = 1_000_000;
const LOCAL_BATCH_ACTION_CAP = 100;

export interface LocalMutationResult {
  readonly previous: BootstrapSnapshot;
  readonly snapshot: BootstrapSnapshot;
  readonly events: readonly ProgressionEvent[];
  readonly sourceId: string;
  readonly message?: string;
}

export interface LocalLoadResult {
  readonly previous: BootstrapSnapshot;
  readonly snapshot: BootstrapSnapshot;
  readonly savedAt: string;
  readonly persisted: boolean;
  readonly events: readonly ProgressionEvent[];
  readonly sourceId: string;
  readonly created: boolean;
}

export interface LocalBackupExportResult extends LocalLoadResult {
  readonly backupCode: string;
}

export class LocalGameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalGameError";
  }
}

export class LocalGameService {
  private saveData: LocalGameSave | null = null;
  private lastPersistSucceeded = true;

  constructor(private readonly platform: PlatformAdapter) {}

  get snapshot(): BootstrapSnapshot {
    if (!this.saveData) throw new Error("Local game has not been initialized");
    return this.saveData.snapshot;
  }

  get savedAt(): string {
    return this.requireSave().savedAt;
  }

  get persistenceAvailable(): boolean {
    return this.lastPersistSucceeded;
  }

  initialize(now = new Date()): LocalLoadResult {
    const stored = this.platform.load<unknown>(CLIENT_CONFIG.localSaveStorageKey);
    const restored = parseLocalGameSave(stored);
    const created = restored === null;
    this.saveData = restored ?? createInitialSave(now);
    const previous = this.snapshot;

    const settlement = created
      ? emptyMutation(this.snapshot)
      : this.settleTo(now, CLIENT_CONFIG.offlineEfficiencyBp, true);
    const persisted = this.persist();
    return {
      previous,
      snapshot: this.snapshot,
      savedAt: this.saveData.savedAt,
      persisted,
      events: settlement.events,
      sourceId: settlement.sourceId,
      created,
    };
  }

  checkpoint(now = new Date()): LocalLoadResult {
    const previous = this.snapshot;
    const settlement = this.settleTo(now, BASIS_POINTS, false);
    const persisted = this.persist();
    return {
      previous,
      snapshot: this.snapshot,
      savedAt: this.requireSave().savedAt,
      persisted,
      events: settlement.events,
      sourceId: settlement.sourceId,
      created: false,
    };
  }

  resume(now = new Date()): LocalLoadResult {
    const previous = this.snapshot;
    const settlement = this.settleTo(
      now,
      CLIENT_CONFIG.offlineEfficiencyBp,
      true,
    );
    const persisted = this.persist();
    return {
      previous,
      snapshot: this.snapshot,
      savedAt: this.requireSave().savedAt,
      persisted,
      events: settlement.events,
      sourceId: settlement.sourceId,
      created: false,
    };
  }

  dismissOfflineSettlement(): LocalMutationResult {
    return this.mutate((snapshot) => ({
      snapshot: { ...snapshot, offlineSettlement: null },
      events: [],
    }));
  }

  breakthrough(): LocalMutationResult {
    return this.mutate((snapshot) => {
      const completed = completeBreakthrough(snapshot.progress);
      const pills = stackQuantity(snapshot, "breakthrough_pill");
      if (decimal(pills).lessThan(completed.requiredPills)) {
        throw new LocalGameError(
          `突破丹不足，需要 ${completed.requiredPills} 枚`,
        );
      }
      const inventory = setStackQuantity(
        snapshot.inventory,
        "breakthrough_pill",
        decimal(pills).minus(completed.requiredPills).toFixed(0),
      );
      return {
        snapshot: refreshSnapshot({
          ...snapshot,
          inventory,
          progress: {
            ...snapshot.progress,
            ...completed.progress,
            settledAt: new Date().toISOString(),
          },
        }),
        events: [],
        message: `消耗 ${completed.requiredPills} 枚突破丹，突破成功`,
      };
    });
  }

  chooseAvatar(avatarVariant: ChosenAvatarVariant): LocalMutationResult {
    return this.mutate((snapshot) => {
      if (snapshot.player.avatarVariant !== "neutral") {
        throw new LocalGameError("主角形象已经确定，当前版本不能再次修改");
      }
      return {
        snapshot: {
          ...snapshot,
          player: { ...snapshot.player, avatarVariant },
        },
        events: [],
        message: "主角形象已保存到本地",
      };
    });
  }

  renamePlayer(rawDisplayName: string): LocalMutationResult {
    return this.mutate((snapshot) => {
      const displayName = rawDisplayName.trim();
      if (!/^[\u3400-\u9fffA-Za-z0-9]{2,12}$/.test(displayName)) {
        throw new LocalGameError("道号需为 2 至 12 个中文、英文字母或数字");
      }
      if (displayName === snapshot.player.displayName) {
        throw new LocalGameError("新道号与当前道号相同");
      }

      let inventory = snapshot.inventory;
      if (!snapshot.player.freeRenameAvailable) {
        const cards = stackQuantity(snapshot, "rename_card");
        if (decimal(cards).lessThan(1)) {
          throw new LocalGameError("改名卡不足，暂时无法修改道号");
        }
        inventory = setStackQuantity(
          inventory,
          "rename_card",
          decimal(cards).minus(1).toFixed(0),
        );
      }
      return {
        snapshot: {
          ...snapshot,
          inventory,
          player: {
            ...snapshot.player,
            displayName,
            freeRenameAvailable: false,
          },
        },
        events: [],
        message: "道号已保存到本地",
      };
    });
  }

  markPartnerUnlockNoticeSeen(): LocalMutationResult {
    return this.mutate((snapshot) => ({
      snapshot: {
        ...snapshot,
        settings: { ...snapshot.settings, partnerUnlockNoticeSeen: true },
      },
      events: [],
    }));
  }

  toggleAutoSalvage(quality: AutoSalvageQuality): LocalMutationResult {
    return this.mutate((snapshot) => {
      if (quality !== "common" && quality !== "uncommon") {
        throw new LocalGameError("该品质不支持自动分解");
      }
      const settingKey =
        quality === "common" ? "autoSalvageCommon" : "autoSalvageUncommon";
      const enabled = !snapshot.settings[settingKey];
      const qualityName = quality === "common" ? "普通" : "优秀";
      return {
        snapshot: {
          ...snapshot,
          settings: { ...snapshot.settings, [settingKey]: enabled },
        },
        events: [],
        message: `${qualityName}品质自动分解已${enabled ? "开启" : "关闭"}，仅影响后续新收获`,
      };
    });
  }

  expandInventory(): LocalMutationResult {
    return this.mutate((snapshot) => {
      const capacity = snapshot.inventory.bagCapacity;
      if (capacity >= BAG_MAX_CAPACITY) {
        throw new LocalGameError("行囊容量已达到上限");
      }
      const purchaseIndex =
        (capacity - BAG_INITIAL_CAPACITY) / BAG_EXPANSION_SIZE + 1;
      const cost = BAG_EXPANSION_BASE_COST * purchaseIndex * purchaseIndex;
      const stones = decimal(snapshot.wallet.spiritStone);
      if (stones.lessThan(cost)) throw new LocalGameError("灵石不足，无法扩展行囊");
      return {
        snapshot: {
          ...snapshot,
          inventory: {
            ...snapshot.inventory,
            bagCapacity: capacity + BAG_EXPANSION_SIZE,
          },
          wallet: {
            ...snapshot.wallet,
            spiritStone: stones.minus(cost).toFixed(0),
          },
        },
        events: [],
        message: `消耗 ${cost} 灵石，行囊扩展 ${BAG_EXPANSION_SIZE} 格`,
      };
    });
  }

  upgradeCaveBuilding(buildingConfigId: string): LocalMutationResult {
    return this.mutate((snapshot) => {
      if (!snapshot.unlocks.cave) {
        throw new LocalGameError(
          `修为达到 Lv.${CAVE_UNLOCK_LEVEL} 才能开辟洞府`,
        );
      }
      const config = getCaveBuildingConfig(buildingConfigId);
      const building = snapshot.cave.buildings.find(
        (item) => item.buildingConfigId === buildingConfigId,
      );
      if (!building) throw new LocalGameError("洞府中没有这座建筑");
      if (building.level >= config.maxLevel) {
        throw new LocalGameError(`${config.displayName}已满级`);
      }

      const cost = caveUpgradeCost(buildingConfigId, building.level);
      const stones = decimal(snapshot.wallet.spiritStone);
      if (stones.lessThan(cost.spiritStone)) {
        throw new LocalGameError(
          `灵石不足，还需 ${decimal(cost.spiritStone).minus(stones).toFixed(0)} 灵石`,
        );
      }
      for (const material of cost.materials) {
        const owned = decimal(stackQuantity(snapshot, material.itemConfigId));
        if (owned.lessThan(material.quantity)) {
          const missing = decimal(material.quantity).minus(owned).toFixed(0);
          throw new LocalGameError(
            `${getItemConfig(material.itemConfigId).displayName}不足，还需 ${missing} 个`,
          );
        }
      }

      let inventory = snapshot.inventory;
      for (const material of cost.materials) {
        const remaining = decimal(stackQuantity(snapshot, material.itemConfigId))
          .minus(material.quantity)
          .toFixed(0);
        inventory = setStackQuantity(inventory, material.itemConfigId, remaining);
      }
      const buildings = snapshot.cave.buildings.map((item) =>
        item.buildingConfigId === buildingConfigId
          ? { ...item, level: item.level + 1 }
          : item,
      );
      return {
        snapshot: refreshSnapshot({
          ...snapshot,
          inventory,
          cave: { buildings },
          wallet: {
            ...snapshot.wallet,
            spiritStone: stones.minus(cost.spiritStone).toFixed(0),
          },
        }),
        events: [],
        message: `消耗 ${cost.spiritStone} 灵石，${config.displayName}提升至 Lv.${building.level + 1}`,
      };
    });
  }

  challengeExpedition(stageConfigId: string): LocalMutationResult {
    return this.mutate((snapshot) => {
      let config: ReturnType<typeof getExpeditionStageConfig>;
      try {
        config = getExpeditionStageConfig(stageConfigId);
      } catch {
        throw new LocalGameError("未知的历练关卡");
      }
      const evaluation = evaluateExpeditionStage(
        config.id,
        snapshot.expedition.clearedStageIds,
        snapshot.progress.totalPower,
      );
      if (evaluation.status === "cleared") {
        throw new LocalGameError("该关卡已经完成，首通奖励不可重复领取");
      }
      if (evaluation.status === "locked") {
        const previous = EXPEDITION_STAGE_CONFIGS[
          Math.max(0, snapshot.expedition.clearedStageIds.length)
        ];
        throw new LocalGameError(
          previous ? `需先完成${previous.displayName}` : "前置关卡尚未完成",
        );
      }
      if (evaluation.status === "underpowered") {
        throw new LocalGameError(`战力不足，还需 ${evaluation.powerDeficit}`);
      }

      const inventory = addStackRewards(
        snapshot,
        snapshot.inventory,
        config.itemRewards,
        "行囊空间不足，无法领取历练首通奖励",
      );
      const spiritStone = decimal(snapshot.wallet.spiritStone).plus(
        config.spiritStoneReward,
      );
      return {
        snapshot: {
          ...snapshot,
          inventory,
          expedition: {
            ...snapshot.expedition,
            clearedStageIds: [
              ...snapshot.expedition.clearedStageIds,
              config.id,
            ],
          },
          wallet: {
            ...snapshot.wallet,
            spiritStone: spiritStone.toFixed(0),
            lifetimeSpiritStoneEarned: decimal(
              snapshot.wallet.lifetimeSpiritStoneEarned,
            )
              .plus(config.spiritStoneReward)
              .toFixed(0),
          },
        },
        events: [],
        message: `首通${config.displayName}，获得 ${config.spiritStoneReward} 灵石和历练物资`,
      };
    });
  }

  sweepExpedition(stageConfigId: string): LocalMutationResult {
    return this.mutate((snapshot) => {
      let config: ReturnType<typeof getExpeditionStageConfig>;
      try {
        config = getExpeditionStageConfig(stageConfigId);
      } catch {
        throw new LocalGameError("未知的历练关卡");
      }

      const evaluation = evaluateExpeditionSweep(
        config.id,
        snapshot.expedition.clearedStageIds,
        snapshot.progress.totalPower,
      );
      if (evaluation.status === "locked") {
        throw new LocalGameError("完成该关首通后才能扫荡");
      }
      if (evaluation.status === "underpowered") {
        throw new LocalGameError(`当前战力不足，还需 ${evaluation.powerDeficit}`);
      }

      const existingSweep = snapshot.expedition.sweepCounts.find(
        (entry) => entry.stageConfigId === config.id,
      );
      if ((existingSweep?.count ?? 0) >= EXPEDITION_SWEEP_MAX_COUNT) {
        throw new LocalGameError("该关扫荡次数已达到本地存档上限");
      }

      const tokens = decimal(stackQuantity(snapshot, "treasure_token"));
      if (tokens.lessThan(EXPEDITION_SWEEP_TOKEN_COST)) {
        throw new LocalGameError("寻宝令不足，无法扫荡");
      }
      let inventory = setStackQuantity(
        snapshot.inventory,
        "treasure_token",
        tokens.minus(EXPEDITION_SWEEP_TOKEN_COST).toFixed(0),
      );
      inventory = addStackRewards(
        snapshot,
        inventory,
        config.sweepItemRewards,
        "行囊空间不足，无法领取扫荡奖励",
      );

      const sweepCounts = existingSweep
        ? snapshot.expedition.sweepCounts.map((entry) =>
            entry.stageConfigId === config.id
              ? { ...entry, count: entry.count + 1 }
              : entry,
          )
        : [
            ...snapshot.expedition.sweepCounts,
            { stageConfigId: config.id, count: 1 },
          ];
      return {
        snapshot: {
          ...snapshot,
          inventory,
          expedition: { ...snapshot.expedition, sweepCounts },
          wallet: {
            ...snapshot.wallet,
            spiritStone: decimal(snapshot.wallet.spiritStone)
              .plus(config.sweepSpiritStoneReward)
              .toFixed(0),
            lifetimeSpiritStoneEarned: decimal(
              snapshot.wallet.lifetimeSpiritStoneEarned,
            )
              .plus(config.sweepSpiritStoneReward)
              .toFixed(0),
          },
        },
        events: [],
        message: `扫荡${config.displayName}，获得 ${config.sweepSpiritStoneReward} 灵石和历练物资`,
      };
    });
  }

  /**
   * The tower is climbed one floor at a time and never swept: the whole point of
   * a power ladder is that each rung is checked against the current loadout, and
   * a sweep would hand out the rewards without ever making that check.
   */
  challengeTrialTower(floor: number): LocalMutationResult {
    return this.mutate((snapshot) => {
      if (!snapshot.unlocks.trialTower) {
        throw new LocalGameError(
          `修为达到 Lv.${TRIAL_TOWER_UNLOCK_LEVEL} 才能进入试炼塔`,
        );
      }
      if (!isIntegerBetween(floor, 1, TRIAL_TOWER_MAX_FLOOR)) {
        throw new LocalGameError("未知的试炼塔层数");
      }
      const evaluation = evaluateTrialFloor(
        snapshot.trialTower.highestFloor,
        floor,
        snapshot.progress.totalPower,
      );
      if (evaluation.status === "cleared") {
        throw new LocalGameError("该层已经通过，奖励不可重复领取");
      }
      if (evaluation.status === "locked") {
        throw new LocalGameError(
          `需先通过第 ${snapshot.trialTower.highestFloor + 1} 层`,
        );
      }
      if (evaluation.status === "underpowered") {
        throw new LocalGameError(`战力不足，还需 ${evaluation.powerDeficit}`);
      }

      const rewards = trialFloorRewards(floor);
      // Checked before the floor is recorded, so a full bag leaves the climb
      // exactly where it was rather than banking the floor and dropping the loot.
      const inventory = addStackRewards(
        snapshot,
        snapshot.inventory,
        rewards.itemRewards,
        "行囊空间不足，无法领取试炼塔奖励",
      );
      return {
        snapshot: {
          ...snapshot,
          inventory,
          trialTower: { highestFloor: floor },
          wallet: {
            ...snapshot.wallet,
            spiritStone: decimal(snapshot.wallet.spiritStone)
              .plus(rewards.spiritStone)
              .toFixed(0),
            lifetimeSpiritStoneEarned: decimal(
              snapshot.wallet.lifetimeSpiritStoneEarned,
            )
              .plus(rewards.spiritStone)
              .toFixed(0),
          },
        },
        events: [],
        message: `登临试炼塔第 ${floor} 层，获得 ${rewards.spiritStone} 灵石和试炼奖励`,
      };
    });
  }

  huntTreasure(): LocalMutationResult {
    return this.mutate((snapshot) => {
      const tokens = decimal(stackQuantity(snapshot, "treasure_token"));
      if (tokens.lessThan(1)) throw new LocalGameError("寻宝令不足");

      let inventory = setStackQuantity(
        snapshot.inventory,
        "treasure_token",
        tokens.minus(1).toFixed(0),
      );
      const reward = pickTreasureHuntReward(
        randomInteger(TREASURE_HUNT_TOTAL_WEIGHT),
      );
      if (reward.kind === "spirit_stone") {
        return {
          snapshot: {
            ...snapshot,
            inventory,
            wallet: {
              ...snapshot.wallet,
              spiritStone: decimal(snapshot.wallet.spiritStone)
                .plus(reward.amount)
                .toFixed(0),
              lifetimeSpiritStoneEarned: decimal(
                snapshot.wallet.lifetimeSpiritStoneEarned,
              )
                .plus(reward.amount)
                .toFixed(0),
            },
          },
          events: [],
          message: `寻得 ${reward.amount} 灵石`,
        };
      }

      const itemConfigId =
        reward.kind === "random_material"
          ? ["wood", "stone", "spiritual_soil", "spiritual_herb", "ore"][
              randomInteger(5)
            ]!
          : reward.itemConfigId;
      const quantity = reward.quantity;
      ensureStackOutputCapacity(
        { ...snapshot, inventory },
        itemConfigId,
        "行囊空间不足，无法领取寻宝奖励",
      );
      inventory = addStack(inventory, itemConfigId, quantity);
      return {
        snapshot: { ...snapshot, inventory },
        events: [],
        message: `寻得 ${getItemConfig(itemConfigId).displayName} x${quantity}`,
      };
    });
  }

  brewAlchemy(recipeId: string): LocalMutationResult {
    return this.brewAlchemyInternal(recipeId, false);
  }

  brewAlchemyBatch(recipeId: string): LocalMutationResult {
    return this.brewAlchemyInternal(recipeId, true);
  }

  private brewAlchemyInternal(
    recipeId: string,
    useAll: boolean,
  ): LocalMutationResult {
    return this.mutate((snapshot) => {
      let recipe: ReturnType<typeof getAlchemyRecipeConfig>;
      try {
        recipe = getAlchemyRecipeConfig(recipeId);
      } catch {
        throw new LocalGameError("未知的炼丹配方");
      }
      const alchemyRoomLevel = caveBuildingLevel(snapshot.cave.buildings, "alchemy_room");
      if (alchemyRoomLevel < recipe.requiredAlchemyRoomLevel) {
        throw new LocalGameError(
          `炼丹房需达到 Lv.${recipe.requiredAlchemyRoomLevel}`,
        );
      }
      const stones = decimal(snapshot.wallet.spiritStone);
      if (stones.lessThan(recipe.spiritStoneCost)) {
        throw new LocalGameError(
          `灵石不足，还需 ${decimal(recipe.spiritStoneCost).minus(stones).toFixed(0)} 灵石`,
        );
      }
      for (const ingredient of recipe.ingredients) {
        const owned = decimal(stackQuantity(snapshot, ingredient.itemConfigId));
        if (owned.lessThan(ingredient.quantity)) {
          throw new LocalGameError(
            `${getItemConfig(ingredient.itemConfigId).displayName}不足，还需 ${decimal(ingredient.quantity).minus(owned).toFixed(0)} 个`,
          );
        }
      }
      const batchCount = useAll
        ? maxAffordableBatchCount(
            snapshot.wallet.spiritStone,
            recipe.spiritStoneCost,
            recipe.ingredients.map((ingredient) => ({
              owned: stackQuantity(snapshot, ingredient.itemConfigId),
              cost: ingredient.quantity,
            })),
          )
        : 1;
      let inventory = snapshot.inventory;
      for (const ingredient of recipe.ingredients) {
        inventory = setStackQuantity(
          inventory,
          ingredient.itemConfigId,
          decimal(stackQuantity(snapshot, ingredient.itemConfigId))
            .minus(decimal(ingredient.quantity).times(batchCount))
            .toFixed(0),
        );
      }
      ensureStackOutputCapacity(
        { ...snapshot, inventory },
        recipe.outputItemConfigId,
      );
      inventory = addStack(
        inventory,
        recipe.outputItemConfigId,
        recipe.outputQuantity * batchCount,
      );
      return {
        snapshot: {
          ...snapshot,
          inventory,
          wallet: {
            ...snapshot.wallet,
            spiritStone: stones
              .minus(decimal(recipe.spiritStoneCost).times(batchCount))
              .toFixed(0),
          },
        },
        events: [],
        message: useAll
          ? `批量炼成 ${recipe.displayName} x${recipe.outputQuantity * batchCount}`
          : `炼成 ${recipe.displayName} x${recipe.outputQuantity}`,
      };
    });
  }

  craftEquipment(recipeId: string): LocalMutationResult {
    return this.craftEquipmentInternal(recipeId, false);
  }

  craftEquipmentBatch(recipeId: string): LocalMutationResult {
    return this.craftEquipmentInternal(recipeId, true);
  }

  private craftEquipmentInternal(
    recipeId: string,
    useAll: boolean,
  ): LocalMutationResult {
    return this.mutate((snapshot) => {
      let recipe: ReturnType<typeof getCraftingRecipeConfig>;
      try {
        recipe = getCraftingRecipeConfig(recipeId);
      } catch {
        throw new LocalGameError("未知的炼器图谱");
      }
      const craftingRoomLevel = caveBuildingLevel(snapshot.cave.buildings, "crafting_room");
      if (craftingRoomLevel < recipe.requiredCraftingRoomLevel) {
        throw new LocalGameError(
          `炼器室需达到 Lv.${recipe.requiredCraftingRoomLevel}`,
        );
      }
      // Crafting produces the crafter's own band, at that band's spirit stone
      // price. Materials are deliberately flat across bands.
      const band = equipmentBandForLevel(snapshot.progress.level);
      const product = resolveCraftingEquipmentConfig(recipe.slot, snapshot.progress.level);
      const spiritStoneCost = craftingSpiritStoneCost(recipe, band);
      const stones = decimal(snapshot.wallet.spiritStone);
      if (stones.lessThan(spiritStoneCost)) {
        throw new LocalGameError(
          `灵石不足，还需 ${decimal(spiritStoneCost).minus(stones).toFixed(0)} 灵石`,
        );
      }
      for (const material of recipe.materials) {
        const owned = decimal(stackQuantity(snapshot, material.itemConfigId));
        if (owned.lessThan(material.quantity)) {
          throw new LocalGameError(
            `${getItemConfig(material.itemConfigId).displayName}不足，还需 ${decimal(material.quantity).minus(owned).toFixed(0)} 个`,
          );
        }
      }
      const availableSlots =
        snapshot.inventory.bagCapacity - countOccupiedBagSlots(snapshot);
      if (availableSlots <= 0) {
        throw new LocalGameError("行囊空间不足，无法炼器");
      }
      const batchCount = useAll
        ? Math.min(
            availableSlots,
            maxAffordableBatchCount(
              snapshot.wallet.spiritStone,
              spiritStoneCost,
              recipe.materials.map((material) => ({
                owned: stackQuantity(snapshot, material.itemConfigId),
                cost: material.quantity,
              })),
            ),
          )
        : 1;
      let inventory = snapshot.inventory;
      for (const material of recipe.materials) {
        inventory = setStackQuantity(
          inventory,
          material.itemConfigId,
          decimal(stackQuantity(snapshot, material.itemConfigId))
            .minus(decimal(material.quantity).times(batchCount))
            .toFixed(0),
        );
      }
      ensureEquipmentCapacity({ ...snapshot, inventory });
      const equipment = [...snapshot.equipment];
      const craftedQualities: AssetQuality[] = [];
      const qualityCounts = new Map<AssetQuality, number>();
      for (let index = 0; index < batchCount; index += 1) {
        const quality = rollCraftingQuality(craftingRoomLevel, band, randomInteger);
        craftedQualities.push(quality);
        equipment.push(createCraftedEquipment(product.id, quality));
        qualityCounts.set(quality, (qualityCounts.get(quality) ?? 0) + 1);
      }
      return {
        snapshot: refreshSnapshot({
          ...snapshot,
          inventory,
          equipment,
          wallet: {
            ...snapshot.wallet,
            spiritStone: stones
              .minus(decimal(spiritStoneCost).times(batchCount))
              .toFixed(0),
          },
        }),
        events: [],
        message: useAll
          ? `批量${recipe.displayName} x${batchCount}，品质：${formatQualityCounts(qualityCounts)}`
          : `${recipe.displayName}成功，获得${qualityDisplayName(craftedQualities[0])}品质${product.displayName}`,
      };
    });
  }

  choosePartner(partnerId: string): LocalMutationResult {
    return this.mutate((snapshot) => {
      if (!snapshot.unlocks.partner) {
        throw new LocalGameError(
          `修为达到 Lv.${PARTNER_UNLOCK_LEVEL} 才能结识道侣`,
        );
      }
      if (snapshot.partner.partnerId !== null) {
        throw new LocalGameError("道侣已经确定，不能再次选择");
      }
      let config: ReturnType<typeof getPartnerConfig>;
      try {
        config = getPartnerConfig(partnerId);
      } catch {
        throw new LocalGameError("未知的道侣");
      }
      return {
        snapshot: refreshSnapshot({
          ...snapshot,
          partner: { partnerId: config.id, level: 1, bond: 0 },
        }),
        events: [],
        message: `已与${config.displayName}结为道侣`,
      };
    });
  }

  cultivateWithPartner(): LocalMutationResult {
    return this.mutate((snapshot) => {
      const partnerId = snapshot.partner.partnerId;
      if (partnerId === null) throw new LocalGameError("请先选择一位道侣");
      if (snapshot.partner.level >= PARTNER_MAX_LEVEL) {
        throw new LocalGameError("道侣亲密等级已满");
      }
      const pills = decimal(stackQuantity(snapshot, "dual_cultivation_pill"));
      if (pills.lessThan(1)) throw new LocalGameError("双修丹不足");
      const targetLevel = snapshot.partner.level + 1;
      const gainedBond = 100;
      const nextBond = snapshot.partner.bond + gainedBond;
      const required = partnerBondRequirement(targetLevel);
      const level = nextBond >= required ? targetLevel : snapshot.partner.level;
      const bond =
        level >= PARTNER_MAX_LEVEL
          ? 0
          : nextBond >= required
            ? nextBond - required
            : nextBond;
      const inventory = setStackQuantity(
        snapshot.inventory,
        "dual_cultivation_pill",
        pills.minus(1).toFixed(0),
      );
      const config = getPartnerConfig(partnerId);
      return {
        snapshot: refreshSnapshot({
          ...snapshot,
          inventory,
          partner: { partnerId, level, bond },
        }),
        events: [],
        message:
          level > snapshot.partner.level
            ? `${config.displayName}亲密提升至 Lv.${level}`
            : `与${config.displayName}双修，亲密 +${gainedBond}`,
      };
    });
  }

  joinSect(sectId: string): LocalMutationResult {
    return this.mutate((snapshot) => {
      if (snapshot.progress.level < 11) {
        throw new LocalGameError("修为达到 Lv.11 才能拜入宗门");
      }
      if (snapshot.sect.sectId !== null) {
        throw new LocalGameError("已经加入宗门，当前不能改投他派");
      }
      let config: ReturnType<typeof getSectConfig>;
      try {
        config = getSectConfig(sectId);
      } catch {
        throw new LocalGameError("未知的宗门");
      }
      return {
        snapshot: refreshSnapshot({
          ...snapshot,
          sect: { sectId: config.id, level: 1, contribution: 0 },
        }),
        events: [],
        message: `已拜入${config.displayName}`,
      };
    });
  }

  donateToSect(): LocalMutationResult {
    return this.mutate((snapshot) => {
      const sectId = snapshot.sect.sectId;
      if (sectId === null) throw new LocalGameError("请先加入宗门");
      if (snapshot.sect.level >= SECT_MAX_LEVEL) {
        throw new LocalGameError("宗门声望已满级");
      }
      const donation = [
        { itemConfigId: "wood", quantity: 5 },
        { itemConfigId: "stone", quantity: 5 },
        { itemConfigId: "spiritual_herb", quantity: 5 },
      ] as const;
      for (const material of donation) {
        const owned = decimal(stackQuantity(snapshot, material.itemConfigId));
        if (owned.lessThan(material.quantity)) {
          throw new LocalGameError(
            `${getItemConfig(material.itemConfigId).displayName}不足，还需 ${decimal(material.quantity).minus(owned).toFixed(0)} 个`,
          );
        }
      }
      let inventory = snapshot.inventory;
      for (const material of donation) {
        inventory = setStackQuantity(
          inventory,
          material.itemConfigId,
          decimal(stackQuantity(snapshot, material.itemConfigId))
            .minus(material.quantity)
            .toFixed(0),
        );
      }
      const contributionGain = 100;
      const targetLevel = snapshot.sect.level + 1;
      const totalContribution = snapshot.sect.contribution + contributionGain;
      const required = sectContributionRequirement(targetLevel);
      const level = totalContribution >= required ? targetLevel : snapshot.sect.level;
      const contribution =
        level >= SECT_MAX_LEVEL
          ? 0
          : totalContribution >= required
            ? totalContribution - required
            : totalContribution;
      const config = getSectConfig(sectId);
      return {
        snapshot: refreshSnapshot({
          ...snapshot,
          inventory,
          sect: { sectId, level, contribution },
        }),
        events: [],
        message:
          level > snapshot.sect.level
            ? `${config.displayName}声望提升至 Lv.${level}`
            : `向${config.displayName}捐献物资，贡献 +${contributionGain}`,
      };
    });
  }

  useInventoryItem(itemConfigId: string): LocalMutationResult {
    return this.useExperienceItems(itemConfigId, false);
  }

  useAllInventoryItems(itemConfigId: string): LocalMutationResult {
    return this.useExperienceItems(itemConfigId, true);
  }

  private useExperienceItems(
    itemConfigId: string,
    useAll: boolean,
  ): LocalMutationResult {
    return this.mutate((snapshot) => {
      const config = getItemConfig(itemConfigId);
      const quantity = stackQuantity(snapshot, itemConfigId);
      if (decimal(quantity).lessThan(1)) throw new LocalGameError("物品数量不足");
      if (!config.useEffect) throw new LocalGameError("该物品当前版本暂不可使用");
      if (snapshot.progress.status === "breakthrough_ready") {
        throw new LocalGameError("当前处于突破瓶颈，请先完成突破再使用经验丹");
      }

      const requested = useAll ? decimal(quantity) : decimal(1);
      let consumed = decimal(0);
      let progress = snapshot.progress;
      let experienceGained = decimal(0);
      const events: ProgressionEvent[] = [];
      while (consumed.lessThan(requested) && progress.status !== "breakthrough_ready") {
        const simulated = simulateOnlineExperience({
          progress,
          elapsedMilliseconds: config.useEffect.durationSeconds * 1_000,
          experienceBonusBp: progress.experienceBonusBp,
        });
        progress = { ...progress, ...simulated.progress };
        experienceGained = experienceGained.plus(simulated.experienceGained);
        events.push(...simulated.events);
        consumed = consumed.plus(1);
      }
      if (consumed.isZero()) {
        throw new LocalGameError("当前处于突破瓶颈，请先完成突破再使用经验丹");
      }
      const inventory = setStackQuantity(
        snapshot.inventory,
        itemConfigId,
        decimal(quantity).minus(consumed).toFixed(0),
      );
      const progressed = refreshSnapshot({
        ...snapshot,
        inventory,
        progress: {
          ...progress,
          settledAt: new Date().toISOString(),
        },
      });
      const withTasks = syncProgressionTasks(progressed);
      const consumedText = consumed.equals(1)
        ? ""
        : ` x${consumed.toFixed(0)}`;
      const bottleneckText =
        useAll && progress.status === "breakthrough_ready" &&
        decimal(quantity).greaterThan(consumed)
          ? "，已到突破瓶颈"
          : "";
      return {
        snapshot: withTasks.snapshot,
        events,
        message: `${useAll ? "批量使用" : "使用"} ${config.displayName}${consumedText}，获得 ${experienceGained.toFixed(0)} 修为${bottleneckText}`,
      };
    });
  }

  transferHarvest(entryId: string): LocalMutationResult {
    return this.mutate((snapshot) => {
      const entry = snapshot.harvestChest.entries.find((item) => item.id === entryId);
      if (!entry) throw new LocalGameError("该收获已经处理");
      let equipment = snapshot.equipment;
      let techniques = snapshot.techniques;
      let message: string;

      if (entry.entryType === "equipment") {
        if (countOccupiedBagSlots(snapshot) >= snapshot.inventory.bagCapacity) {
          throw new LocalGameError("行囊空间不足，请先整理或扩容");
        }
        equipment = equipment.map((item) =>
          item.id === entry.equipmentInstanceId
            ? { ...item, location: "bag", equippedSlot: null }
            : item,
        );
        message = `已将 ${entry.displayName} 收入行囊`;
      } else {
        const existing = techniques.find(
          (item) => item.techniqueConfigId === entry.techniqueConfigId,
        );
        if (existing) {
          techniques = techniques.map((item) =>
            item.techniqueConfigId === entry.techniqueConfigId
              ? { ...item, duplicateCount: item.duplicateCount + 1 }
              : item,
          );
          message = `${entry.displayName} 同名副本 +1`;
        } else if (entry.techniqueConfigId) {
          techniques = [
            ...techniques,
            createTechniqueSnapshot(entry.techniqueConfigId),
          ];
          message = `已收录功法 ${entry.displayName}`;
        } else {
          throw new LocalGameError("收获数据不完整，无法收取");
        }
      }
      const entries = snapshot.harvestChest.entries.filter((item) => item.id !== entryId);
      return {
        snapshot: refreshSnapshot({
          ...snapshot,
          equipment,
          techniques,
          harvestChest: { pendingCount: entries.length, entries },
        }),
        events: [],
        message,
      };
    });
  }

  collectAllHarvest(): LocalMutationResult {
    return this.mutate((snapshot) => {
      const collectedEquipmentIds = new Set<string>();
      const remainingEntries: BootstrapSnapshot["harvestChest"]["entries"] = [];
      const techniques = [...snapshot.techniques];
      const techniqueIndexes = new Map(
        techniques.map((item, index) => [item.techniqueConfigId, index] as const),
      );
      let occupiedSlots = countOccupiedBagSlots(snapshot);
      let equipmentCollected = 0;
      let techniqueCollected = 0;
      let newTechniques = 0;
      let duplicateTechniques = 0;

      for (const entry of snapshot.harvestChest.entries) {
        if (entry.entryType === "equipment") {
          if (occupiedSlots >= snapshot.inventory.bagCapacity) {
            remainingEntries.push(entry);
            continue;
          }
          if (
            !entry.equipmentInstanceId ||
            !snapshot.equipment.some(
              (item) =>
                item.id === entry.equipmentInstanceId &&
                item.location === "harvest",
            )
          ) {
            throw new LocalGameError("收获数据不完整，无法批量收取");
          }
          collectedEquipmentIds.add(entry.equipmentInstanceId);
          occupiedSlots += 1;
          equipmentCollected += 1;
          continue;
        }

        if (!entry.techniqueConfigId) {
          throw new LocalGameError("收获数据不完整，无法批量收取");
        }
        const existingIndex = techniqueIndexes.get(entry.techniqueConfigId);
        if (existingIndex === undefined) {
          techniques.push(createTechniqueSnapshot(entry.techniqueConfigId));
          techniqueIndexes.set(entry.techniqueConfigId, techniques.length - 1);
          newTechniques += 1;
        } else {
          const existing = techniques[existingIndex]!;
          techniques[existingIndex] = {
            ...existing,
            duplicateCount: existing.duplicateCount + 1,
          };
          duplicateTechniques += 1;
        }
        techniqueCollected += 1;
      }

      const collectedCount = equipmentCollected + techniqueCollected;
      if (collectedCount === 0) {
        throw new LocalGameError("行囊空间不足，暂无可批量收取的收获");
      }
      const equipment = snapshot.equipment.map((item) =>
        collectedEquipmentIds.has(item.id)
          ? { ...item, location: "bag", equippedSlot: null }
          : item,
      );
      const techniqueDetail =
        techniqueCollected > 0
          ? `（新录 ${newTechniques}、副本 ${duplicateTechniques}）`
          : "";
      const blockedNotice =
        remainingEntries.length > 0 ? "，请整理或扩容行囊" : "";
      return {
        snapshot: refreshSnapshot({
          ...snapshot,
          equipment,
          techniques,
          harvestChest: {
            pendingCount: remainingEntries.length,
            entries: remainingEntries,
          },
        }),
        events: [],
        message: `批量收取 ${collectedCount} 件：法宝 ${equipmentCollected}、功法 ${techniqueCollected}${techniqueDetail}；剩余 ${remainingEntries.length} 件${blockedNotice}`,
      };
    });
  }

  salvageHarvest(entryId: string): LocalMutationResult {
    return this.mutate((snapshot) => {
      const entry = snapshot.harvestChest.entries.find((item) => item.id === entryId);
      if (!entry) throw new LocalGameError("该收获已经处理");
      if (!isAssetQuality(entry.quality)) throw new LocalGameError("收获品质数据无效");
      const salvage = salvageValue(entry.entryType, entry.quality);
      const applied = resolveSalvageReward(snapshot, salvage, {
        releasesBagSlot: false,
        accountLifetimeImmediately: true,
      });
      const entries = snapshot.harvestChest.entries.filter((item) => item.id !== entryId);
      const equipment = entry.equipmentInstanceId
        ? snapshot.equipment.filter((item) => item.id !== entry.equipmentInstanceId)
        : snapshot.equipment;
      return {
        snapshot: {
          ...snapshot,
          equipment,
          inventory: applied.inventory,
          wallet: applied.wallet,
          harvestChest: { pendingCount: entries.length, entries },
        },
        events: [],
        message: salvageRewardMessage(entry.displayName, applied),
      };
    });
  }

  salvageLowQualityHarvest(): LocalMutationResult {
    return this.mutate((snapshot) => {
      const salvageEntries = snapshot.harvestChest.entries.filter(
        (entry) =>
          entry.quality === "common" || entry.quality === "uncommon",
      );
      if (salvageEntries.length === 0) {
        throw new LocalGameError("收获箱中没有可批量分解的普通或优秀物品");
      }

      let spiritStone = 0;
      let enhanceStone = 0;
      const salvagedEntryIds = new Set<string>();
      const salvagedEquipmentIds = new Set<string>();
      for (const entry of salvageEntries) {
        if (!isAssetQuality(entry.quality)) {
          throw new LocalGameError("收获品质数据无效");
        }
        const reward = salvageValue(entry.entryType, entry.quality);
        spiritStone += reward.spiritStone;
        enhanceStone += reward.enhanceStone;
        salvagedEntryIds.add(entry.id);
        if (entry.equipmentInstanceId) {
          salvagedEquipmentIds.add(entry.equipmentInstanceId);
        }
      }

      const applied = resolveSalvageReward(
        snapshot,
        { spiritStone, enhanceStone },
        {
          releasesBagSlot: false,
          accountLifetimeImmediately: true,
        },
      );
      const entries = snapshot.harvestChest.entries.filter(
        (entry) => !salvagedEntryIds.has(entry.id),
      );
      const equipment = snapshot.equipment.filter(
        (item) => !salvagedEquipmentIds.has(item.id),
      );
      const enhancementReward =
        applied.enhanceStone > 0
          ? `、强化石 ${applied.enhanceStone}`
          : "";
      const conversionNotice =
        applied.convertedEnhanceStone > 0
          ? `（${applied.convertedEnhanceStone} 枚强化石因行囊已满折为灵石）`
          : "";
      return {
        snapshot: refreshSnapshot({
          ...snapshot,
          equipment,
          inventory: applied.inventory,
          wallet: applied.wallet,
          harvestChest: { pendingCount: entries.length, entries },
        }),
        events: [],
        message: `批量分解 ${salvageEntries.length} 件：获得灵石 ${applied.spiritStone}${enhancementReward}${conversionNotice}；剩余 ${entries.length} 件`,
      };
    });
  }

  upgradeTechnique(techniqueConfigId: string): LocalMutationResult {
    return this.mutate((snapshot) => {
      const target = snapshot.techniques.find(
        (item) => item.techniqueConfigId === techniqueConfigId,
      );
      if (!target) throw new LocalGameError("尚未收录该功法");
      if (target.star >= TECHNIQUE_MAX_STAR) {
        throw new LocalGameError(`${target.displayName}已达到最高星级`);
      }

      const cost = techniqueStarUpgradeCost(target.star);
      const duplicateCount = Math.min(
        target.duplicateCount,
        cost.duplicateCount,
      );
      const missingDuplicates = cost.duplicateCount - duplicateCount;
      const requiredPages = missingDuplicates * TECHNIQUE_PAGES_PER_DUPLICATE;
      const ownedPages = decimal(stackQuantity(snapshot, "technique_page"));
      if (ownedPages.lessThan(requiredPages)) {
        throw new LocalGameError(
          `同名副本不足，可用功法残页补足，还需 ${decimal(requiredPages).minus(ownedPages).toFixed(0)} 张`,
        );
      }
      const inventory =
        requiredPages > 0
          ? setStackQuantity(
              snapshot.inventory,
              "technique_page",
              ownedPages.minus(requiredPages).toFixed(0),
            )
          : snapshot.inventory;
      const techniques = snapshot.techniques.map((item) =>
        item.techniqueConfigId === techniqueConfigId
          ? {
              ...item,
              star: cost.targetStar,
              duplicateCount: item.duplicateCount - duplicateCount,
            }
          : item,
      );
      return {
        snapshot: refreshSnapshot({ ...snapshot, inventory, techniques }),
        events: [],
        message:
          requiredPages > 0
            ? `消耗 ${duplicateCount} 本同名副本和 ${requiredPages} 张残页，${target.displayName}升至 ${cost.targetStar} 星`
            : `消耗 ${duplicateCount} 本同名副本，${target.displayName}升至 ${cost.targetStar} 星`,
      };
    });
  }

  equipTechnique(techniqueConfigId: string): LocalMutationResult {
    return this.mutate((snapshot) => {
      const target = snapshot.techniques.find(
        (item) => item.techniqueConfigId === techniqueConfigId,
      );
      if (!target) throw new LocalGameError("尚未收录该功法");
      const techniques = snapshot.techniques.map((item) => ({
        ...item,
        equippedSlot:
          item.techniqueConfigId === techniqueConfigId
            ? target.slot
            : item.equippedSlot === target.slot
              ? null
              : item.equippedSlot,
      }));
      return {
        snapshot: refreshSnapshot({ ...snapshot, techniques }),
        events: [],
        message: `已装备 ${target.displayName}`,
      };
    });
  }

  unequipTechnique(techniqueConfigId: string): LocalMutationResult {
    return this.mutate((snapshot) => {
      const target = snapshot.techniques.find(
        (item) => item.techniqueConfigId === techniqueConfigId,
      );
      if (!target?.equippedSlot) throw new LocalGameError("该功法当前未装备");
      return {
        snapshot: refreshSnapshot({
          ...snapshot,
          techniques: snapshot.techniques.map((item) =>
            item.techniqueConfigId === techniqueConfigId
              ? { ...item, equippedSlot: null }
              : item,
          ),
        }),
        events: [],
        message: `已卸下 ${target.displayName}`,
      };
    });
  }

  enhanceEquipment(equipmentInstanceId: string): LocalMutationResult {
    return this.mutate((snapshot) => {
      const target = snapshot.equipment.find(
        (item) => item.id === equipmentInstanceId,
      );
      if (!target || target.location === "harvest") {
        throw new LocalGameError("该法宝不在行囊中");
      }
      if (!isAssetQuality(target.quality)) {
        throw new LocalGameError("法宝品质数据无效");
      }
      if (target.enhanceLevel >= EQUIPMENT_MAX_ENHANCE_LEVEL) {
        throw new LocalGameError(`${target.displayName}已强化至上限`);
      }

      const cost = equipmentEnhanceCost(target.quality, target.enhanceLevel);
      const spiritStone = decimal(snapshot.wallet.spiritStone);
      if (spiritStone.lessThan(cost.spiritStone)) {
        throw new LocalGameError(
          `灵石不足，还需 ${decimal(cost.spiritStone).minus(spiritStone).toFixed(0)} 灵石`,
        );
      }
      const ownedEnhanceStone = decimal(
        stackQuantity(snapshot, "enhance_stone"),
      );
      if (ownedEnhanceStone.lessThan(cost.enhanceStone)) {
        throw new LocalGameError(
          `强化石不足，还需 ${decimal(cost.enhanceStone).minus(ownedEnhanceStone).toFixed(0)} 枚`,
        );
      }

      const inventory = setStackQuantity(
        snapshot.inventory,
        "enhance_stone",
        ownedEnhanceStone.minus(cost.enhanceStone).toFixed(0),
      );
      const equipment = snapshot.equipment.map((item) =>
        item.id === equipmentInstanceId
          ? { ...item, enhanceLevel: cost.targetLevel }
          : item,
      );
      return {
        snapshot: refreshSnapshot({
          ...snapshot,
          equipment,
          inventory,
          wallet: {
            ...snapshot.wallet,
            spiritStone: spiritStone.minus(cost.spiritStone).toFixed(0),
          },
        }),
        events: [],
        message: `消耗 ${cost.spiritStone} 灵石和 ${cost.enhanceStone} 枚强化石，${target.displayName}强化至 +${cost.targetLevel}`,
      };
    });
  }

  rerollEquipmentAffixes(equipmentInstanceId: string): LocalMutationResult {
    return this.mutate((snapshot) => {
      const target = snapshot.equipment.find(
        (item) => item.id === equipmentInstanceId,
      );
      if (!target || target.location === "harvest") {
        throw new LocalGameError("该法宝不在行囊中");
      }
      if (!isAssetQuality(target.quality)) {
        throw new LocalGameError("法宝品质数据无效");
      }
      if (target.quality === "common") {
        throw new LocalGameError(`${target.displayName}没有词条，无法洗练`);
      }

      const cost = equipmentRerollCost(target.quality);
      const ownedEnhanceStone = decimal(
        stackQuantity(snapshot, "enhance_stone"),
      );
      if (ownedEnhanceStone.lessThan(cost.enhanceStone)) {
        throw new LocalGameError(
          `强化石不足，还需 ${decimal(cost.enhanceStone).minus(ownedEnhanceStone).toFixed(0)} 枚`,
        );
      }
      const spiritStone = decimal(snapshot.wallet.spiritStone);
      if (spiritStone.lessThan(cost.spiritStone)) {
        throw new LocalGameError(
          `灵石不足，还需 ${decimal(cost.spiritStone).minus(spiritStone).toFixed(0)} 灵石`,
        );
      }

      // Only the better roll is kept, so a reroll can never ruin a finished
      // piece. The cost is charged either way, which is what keeps the sink
      // from being free.
      const currentScoreBp = equipmentAffixScoreBp(
        target.quality,
        readRolledAffixes(target.rolledAffixes),
      );
      const rolled = rollEquipmentAffixes(target.quality, randomInteger);
      const rolledScoreBp = equipmentAffixScoreBp(target.quality, rolled);
      const improved = rolledScoreBp > currentScoreBp;

      return {
        snapshot: refreshSnapshot({
          ...snapshot,
          equipment: improved
            ? snapshot.equipment.map((item) =>
                item.id === equipmentInstanceId
                  ? { ...item, rolledAffixes: rolled }
                  : item,
              )
            : snapshot.equipment,
          inventory: setStackQuantity(
            snapshot.inventory,
            "enhance_stone",
            ownedEnhanceStone.minus(cost.enhanceStone).toFixed(0),
          ),
          wallet: {
            ...snapshot.wallet,
            spiritStone: spiritStone.minus(cost.spiritStone).toFixed(0),
          },
        }),
        events: [],
        message: improved
          ? `洗练完成：词条评分 ${formatAffixScore(currentScoreBp)} → ${formatAffixScore(rolledScoreBp)}`
          : `洗练结果 ${formatAffixScore(rolledScoreBp)} 未超过当前 ${formatAffixScore(currentScoreBp)}，词条保持不变`,
      };
    });
  }

  ascendEquipment(equipmentInstanceId: string): LocalMutationResult {
    return this.mutate((snapshot) => {
      const target = snapshot.equipment.find(
        (item) => item.id === equipmentInstanceId,
      );
      if (!target || target.location === "harvest") {
        throw new LocalGameError("该法宝不在行囊中");
      }
      if (!isAssetQuality(target.quality)) {
        throw new LocalGameError("法宝品质数据无效");
      }
      if (!nextAssetQuality(target.quality)) {
        throw new LocalGameError(`${target.displayName}已是最高品质`);
      }
      if (!canAscendEquipmentQuality(target.quality)) {
        throw new LocalGameError("只有传说与神话法宝可以升华");
      }

      const cost = equipmentAscendCost(target.quality);
      const craftingRoomLevel = caveBuildingLevel(snapshot.cave.buildings, "crafting_room");
      if (craftingRoomLevel < cost.requiredCraftingRoomLevel) {
        throw new LocalGameError(
          `炼器室需达到 Lv.${cost.requiredCraftingRoomLevel}`,
        );
      }

      // Materials must be spare copies: in the bag, unlocked and unequipped, so
      // ascending can never eat the piece the player is wearing or protecting.
      const materials = snapshot.equipment.filter(
        (item) =>
          item.id !== target.id &&
          item.equipmentConfigId === target.equipmentConfigId &&
          item.quality === target.quality &&
          item.location === "bag" &&
          item.equippedSlot === null &&
          !item.isLocked,
      );
      if (materials.length < cost.duplicateCount) {
        throw new LocalGameError(
          `同款${qualityDisplayName(target.quality)}法宝不足，还需 ${cost.duplicateCount - materials.length} 件（须在行囊中且未锁定）`,
        );
      }
      const spiritStone = decimal(snapshot.wallet.spiritStone);
      if (spiritStone.lessThan(cost.spiritStone)) {
        throw new LocalGameError(
          `灵石不足，还需 ${decimal(cost.spiritStone).minus(spiritStone).toFixed(0)} 灵石`,
        );
      }

      const consumed = new Set(
        materials.slice(0, cost.duplicateCount).map((item) => item.id),
      );
      // The enhance level survives: quality scales both base power and the
      // enhance multiplier, so clearing it would force a choice between
      // ascending and keeping the investment.
      const equipment = snapshot.equipment
        .filter((item) => !consumed.has(item.id))
        .map((item) =>
          item.id === equipmentInstanceId
            ? {
                ...item,
                quality: cost.targetQuality,
                isLocked: shouldAutoLockEquipment(cost.targetQuality),
                rolledAffixes: rollEquipmentAffixes(
                  cost.targetQuality,
                  randomInteger,
                ),
              }
            : item,
        );

      return {
        snapshot: refreshSnapshot({
          ...snapshot,
          equipment,
          wallet: {
            ...snapshot.wallet,
            spiritStone: spiritStone.minus(cost.spiritStone).toFixed(0),
          },
        }),
        events: [],
        message: `消耗 ${cost.duplicateCount} 件同款法宝和 ${cost.spiritStone} 灵石，${target.displayName}升华为${qualityDisplayName(cost.targetQuality)}`,
      };
    });
  }

  toggleEquipmentLock(equipmentInstanceId: string): LocalMutationResult {
    return this.mutate((snapshot) => {
      const target = snapshot.equipment.find(
        (item) => item.id === equipmentInstanceId,
      );
      if (!target || target.location === "harvest") {
        throw new LocalGameError("该法宝不在行囊中");
      }
      const isLocked = !target.isLocked;
      return {
        snapshot: {
          ...snapshot,
          equipment: snapshot.equipment.map((item) =>
            item.id === equipmentInstanceId ? { ...item, isLocked } : item,
          ),
        },
        events: [],
        message: isLocked
          ? `已锁定 ${target.displayName}，分解前需先解锁`
          : `已解锁 ${target.displayName}`,
      };
    });
  }

  salvageEquipment(equipmentInstanceId: string): LocalMutationResult {
    return this.mutate((snapshot) => {
      const target = snapshot.equipment.find(
        (item) => item.id === equipmentInstanceId,
      );
      if (!target || target.location === "harvest") {
        throw new LocalGameError("该法宝不在行囊中");
      }
      if (target.location === "equipped" || target.equippedSlot !== null) {
        throw new LocalGameError("请先卸下该法宝再分解");
      }
      if (target.isLocked) {
        throw new LocalGameError("该法宝已锁定，请先解锁");
      }
      if (!isAssetQuality(target.quality)) {
        throw new LocalGameError("法宝品质数据无效");
      }

      const reward = equipmentSalvageReward(
        target.quality,
        target.enhanceLevel,
      );
      const applied = resolveSalvageReward(snapshot, reward, {
        releasesBagSlot: true,
        accountLifetimeImmediately: true,
      });
      return {
        snapshot: {
          ...snapshot,
          equipment: snapshot.equipment.filter(
            (item) => item.id !== equipmentInstanceId,
          ),
          inventory: applied.inventory,
          wallet: applied.wallet,
        },
        events: [],
        message: salvageRewardMessage(target.displayName, applied),
      };
    });
  }

  equipEquipment(
    equipmentInstanceId: string,
    equippedSlot: EquippedEquipmentSlot,
  ): LocalMutationResult {
    return this.mutate((snapshot) => {
      const target = snapshot.equipment.find((item) => item.id === equipmentInstanceId);
      if (!target || target.location === "harvest") {
        throw new LocalGameError("该法宝不在行囊中");
      }
      if (!equipmentFitsSlot(target.slot, equippedSlot)) {
        throw new LocalGameError("该法宝无法装备到这个位置");
      }
      const equipment = snapshot.equipment.map((item) => {
        if (item.id === equipmentInstanceId) {
          return { ...item, location: "equipped", equippedSlot };
        }
        if (item.equippedSlot === equippedSlot) {
          return { ...item, location: "bag", equippedSlot: null };
        }
        return item;
      });
      return {
        snapshot: refreshSnapshot({ ...snapshot, equipment }),
        events: [],
        message: `已装备 ${target.displayName}`,
      };
    });
  }

  unequipEquipment(equipmentInstanceId: string): LocalMutationResult {
    return this.mutate((snapshot) => {
      const target = snapshot.equipment.find((item) => item.id === equipmentInstanceId);
      if (!target?.equippedSlot) throw new LocalGameError("该法宝当前未装备");
      return {
        snapshot: refreshSnapshot({
          ...snapshot,
          equipment: snapshot.equipment.map((item) =>
            item.id === equipmentInstanceId
              ? { ...item, location: "bag", equippedSlot: null }
              : item,
          ),
        }),
        events: [],
        message: `已卸下 ${target.displayName}`,
      };
    });
  }

  debugGrant(target: DebugGrantTarget): LocalMutationResult {
    return this.mutate((snapshot) => {
      if (target === "spirit_stone") {
        return {
          snapshot: {
            ...snapshot,
            wallet: {
              ...snapshot.wallet,
              spiritStone: decimal(snapshot.wallet.spiritStone)
                .plus(10_000)
                .toFixed(0),
            },
          },
          events: [],
          message: "已增加 10000 灵石",
        };
      }
      if (target === "breakthrough_pill") {
        ensureStackOutputCapacity(
          snapshot,
          "breakthrough_pill",
          "行囊空间不足，无法增加调试突破丹",
        );
        return {
          snapshot: {
            ...snapshot,
            inventory: addStack(snapshot.inventory, "breakthrough_pill", 1),
          },
          events: [],
          message: "已增加 1 枚突破丹",
        };
      }
      if (snapshot.progress.status !== "gaining") {
        throw new LocalGameError("当前修为状态无法继续填充");
      }
      const required = decimal(snapshot.progress.requiredExperience);
      const current = decimal(snapshot.progress.experience);
      const applied = applyWholeExperience(snapshot.progress, required.minus(current));
      const progressed = refreshSnapshot({
        ...snapshot,
        progress: { ...snapshot.progress, ...applied.progress },
      });
      const withTasks = syncProgressionTasks(progressed);
      return {
        snapshot: withTasks.snapshot,
        events: applied.events,
        message: "当前等级修为已填满",
      };
    });
  }

  debugSimulateOffline(seconds: number, seed?: number): LocalMutationResult {
    if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 86_400) {
      throw new LocalGameError("模拟离线时长必须在 1 秒到 24 小时之间");
    }
    if (seed !== undefined && (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff)) {
      throw new LocalGameError("固定掉落种子必须是 32 位无符号整数");
    }
    const previous = this.snapshot;
    const to = new Date();
    const from = new Date(to.getTime() - seconds * 1_000);
    const result = this.settleElapsed(
      previous,
      seconds * 1_000,
      CLIENT_CONFIG.offlineEfficiencyBp,
      from,
      to,
      true,
      seed,
    );
    this.setSnapshot(result.snapshot, to);
    this.persist();
    return {
      previous,
      snapshot: this.snapshot,
      events: result.events,
      sourceId: result.sourceId,
      message: `已模拟离线 ${formatDuration(seconds)}`,
    };
  }

  exportBackup(now = new Date()): LocalBackupExportResult {
    const checkpoint = this.checkpoint(now);
    const payload = JSON.stringify(this.requireSave());
    return {
      ...checkpoint,
      backupCode: `${LOCAL_BACKUP_PREFIX}${backupChecksum(payload)}:${payload}`,
    };
  }

  importBackup(backupCode: string, now = new Date()): LocalLoadResult {
    const imported = parseLocalBackupCode(backupCode);
    this.checkpoint(now);
    const current = this.requireSave();
    if (
      !this.platform.save(
        CLIENT_CONFIG.localImportRecoveryStorageKey,
        current,
      )
    ) {
      throw new LocalGameError("无法创建当前进度的回退备份，导入已取消");
    }
    return this.activateImportedSave(imported, current, now, "导入存档写入失败");
  }

  hasImportRecovery(): boolean {
    return (
      parseLocalGameSave(
        this.platform.load<unknown>(
          CLIENT_CONFIG.localImportRecoveryStorageKey,
        ),
      ) !== null
    );
  }

  restoreImportRecovery(now = new Date()): LocalLoadResult {
    const recovery = parseLocalGameSave(
      this.platform.load<unknown>(CLIENT_CONFIG.localImportRecoveryStorageKey),
    );
    if (!recovery) throw new LocalGameError("没有可恢复的导入前存档");
    this.checkpoint(now);
    const current = this.requireSave();
    const result = this.activateImportedSave(
      recovery,
      current,
      now,
      "回退存档写入失败",
    );
    this.platform.remove(CLIENT_CONFIG.localImportRecoveryStorageKey);
    return result;
  }

  reset(): LocalLoadResult {
    const previous = this.snapshot;
    this.platform.remove(CLIENT_CONFIG.localSaveStorageKey);
    this.platform.remove(CLIENT_CONFIG.localImportRecoveryStorageKey);
    this.saveData = createInitialSave(new Date());
    const persisted = this.persist();
    return {
      previous,
      snapshot: this.snapshot,
      savedAt: this.requireSave().savedAt,
      persisted,
      events: [],
      sourceId: createLocalId(),
      created: true,
    };
  }

  private mutate(
    operation: (snapshot: BootstrapSnapshot) => {
      snapshot: BootstrapSnapshot;
      events: readonly ProgressionEvent[];
      message?: string;
    },
  ): LocalMutationResult {
    this.settleTo(new Date(), BASIS_POINTS, false);
    const previous = this.snapshot;
    try {
      const result = operation(previous);
      // A milestone the action itself just satisfied settles inside the same
      // transaction: a cleared tower floor or a fresh breakthrough should show
      // up in the task panel immediately rather than waiting for the next idle
      // tick, which is the only other place tasks are synced.
      const tasks = syncProgressionTasks(result.snapshot);
      const now = new Date();
      this.setSnapshot(refreshSnapshot(tasks.snapshot), now);
      this.persist();
      return {
        previous,
        snapshot: this.snapshot,
        events: result.events,
        sourceId: createLocalId(),
        ...(result.message ? { message: result.message } : {}),
      };
    } catch (error) {
      // The idle settlement precedes every action and remains valid even when
      // the requested mutation is rejected.
      this.persist();
      throw error;
    }
  }

  private activateImportedSave(
    imported: LocalGameSave,
    current: LocalGameSave,
    now: Date,
    failureMessage: string,
  ): LocalLoadResult {
    this.saveData = imported;
    this.setSnapshot(imported.snapshot, now);
    if (!this.persist()) {
      this.saveData = current;
      this.persist();
      throw new LocalGameError(`${failureMessage}，当前进度未改变`);
    }
    return {
      previous: current.snapshot,
      snapshot: this.snapshot,
      savedAt: this.requireSave().savedAt,
      persisted: true,
      events: [],
      sourceId: createLocalId(),
      created: false,
    };
  }

  private settleTo(
    now: Date,
    efficiencyBp: number,
    showOfflineSummary: boolean,
  ): LocalMutationResult {
    const previous = this.snapshot;
    const fromMilliseconds = Date.parse(previous.progress.settledAt);
    const requestedMilliseconds = Math.max(0, now.getTime() - fromMilliseconds);
    const capMilliseconds = showOfflineSummary
      ? CLIENT_CONFIG.maxOfflineSeconds * 1_000
      : requestedMilliseconds;
    const elapsedMilliseconds = Math.floor(
      Math.min(requestedMilliseconds, capMilliseconds),
    );
    if (elapsedMilliseconds <= 0) return emptyMutation(previous);

    const from = new Date(now.getTime() - elapsedMilliseconds);
    const result = this.settleElapsed(
      previous,
      elapsedMilliseconds,
      efficiencyBp,
      from,
      now,
      showOfflineSummary,
    );
    this.setSnapshot(result.snapshot, now);
    return {
      previous,
      snapshot: this.snapshot,
      events: result.events,
      sourceId: result.sourceId,
    };
  }

  private settleElapsed(
    snapshot: BootstrapSnapshot,
    elapsedMilliseconds: number,
    efficiencyBp: number,
    from: Date,
    to: Date,
    showOfflineSummary: boolean,
    seed?: number,
  ): {
    snapshot: BootstrapSnapshot;
    events: readonly ProgressionEvent[];
    sourceId: string;
  } {
    const save = this.requireSave();
    const settled = settleCultivation({
      progress: snapshot.progress,
      elapsedMilliseconds,
      experienceRemainderMicros: snapshot.progress.experienceRemainderMicros,
      spiritStoneRemainderMicros: save.spiritStoneRemainderMicros,
      dropClockRemainderMicros: save.dropClockRemainderMicros,
      efficiencyBp,
      experienceBonusBp: snapshot.progress.experienceBonusBp,
      spiritStoneBonusBp: snapshot.progress.spiritStoneBonusBp,
      dropBonusBp: snapshot.progress.dropBonusBp,
    });
    const randomInt = seed === undefined ? randomInteger : createSeededRandomInteger(seed);
    const drops = applyIdleDrops(snapshot, settled.dropAttempts, randomInt);
    const sourceId = createLocalId();
    let next = refreshSnapshot({
      ...drops.snapshot,
      progress: {
        ...drops.snapshot.progress,
        ...settled.progress,
        settledAt: to.toISOString(),
        experienceRemainderMicros: settled.experienceRemainderMicros,
      },
      wallet: {
        ...drops.snapshot.wallet,
        spiritStone: decimal(drops.snapshot.wallet.spiritStone)
          .plus(settled.spiritStoneGained)
          .toFixed(0),
        lifetimeSpiritStoneEarned: decimal(
          drops.snapshot.wallet.lifetimeSpiritStoneEarned,
        )
          .plus(settled.spiritStoneGained)
          .plus(drops.summary.autoSalvageSpiritStone)
          .toFixed(0),
      },
    });
    const taskResult = syncProgressionTasks(next);
    next = taskResult.snapshot;
    const effectiveSeconds = Math.floor(elapsedMilliseconds / 1_000);
    const shouldShow =
      showOfflineSummary && effectiveSeconds >= OFFLINE_NOTICE_MIN_SECONDS;
    const offlineSettlement = shouldShow
      ? {
          id: sourceId,
          fromTime: from.toISOString(),
          toTime: to.toISOString(),
          effectiveSeconds,
          efficiencyBp,
          experienceGained: settled.experienceGained,
          experienceDiscarded: settled.experienceDiscarded,
          spiritStoneGained: settled.spiritStoneGained,
          dropAttempts: settled.dropAttempts,
          drops: drops.summary,
          events: settled.events,
          newcomerRewardGranted: taskResult.rewardGranted,
        }
      : snapshot.offlineSettlement;
    next = { ...next, offlineSettlement };
    this.saveData = {
      ...save,
      spiritStoneRemainderMicros: settled.spiritStoneRemainderMicros,
      dropClockRemainderMicros: settled.dropClockRemainderMicros,
      snapshot: next,
    };
    return { snapshot: next, events: settled.events, sourceId };
  }

  private setSnapshot(snapshot: BootstrapSnapshot, now: Date): void {
    const save = this.requireSave();
    this.saveData = {
      ...save,
      savedAt: now.toISOString(),
      snapshot: { ...snapshot, progress: { ...snapshot.progress, settledAt: now.toISOString() } },
    };
  }

  private persist(): boolean {
    this.lastPersistSucceeded = this.platform.save(
      CLIENT_CONFIG.localSaveStorageKey,
      this.requireSave(),
    );
    return this.lastPersistSucceeded;
  }

  private requireSave(): LocalGameSave {
    if (!this.saveData) throw new Error("Local game has not been initialized");
    return this.saveData;
  }
}

function applyIdleDrops(
  snapshot: BootstrapSnapshot,
  attempts: number,
  randomInt: (maxExclusive: number) => number,
): { snapshot: BootstrapSnapshot; summary: DropRewardSummary } {
  const summary = emptyDropSummary();
  let next = snapshot;
  const materialIds = ["wood", "stone", "spiritual_soil", "spiritual_herb", "ore"];
  const stackRewards = new Map<string, number>();
  // Drops never change the level, so the band is resolved once for the whole
  // run. The pool is this band's five configs and nothing else: a 凡阶 player
  // cannot find a 天阶 sword, and a 天阶 player stops finding 凡阶 ones.
  const band = equipmentBandForLevel(snapshot.progress.level);
  const bandEquipmentConfigs = equipmentConfigsForBand(band);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const stackItemRoll = randomInt(1_000_000);
    if (stackItemRoll < 350_000) {
      const itemId = materialIds[randomInt(materialIds.length)]!;
      stackRewards.set(
        itemId,
        (stackRewards.get(itemId) ?? 0) + 1 + randomInt(3),
      );
    }
    if (stackItemRoll >= 350_000 && stackItemRoll < 355_000) {
      stackRewards.set(
        "technique_page",
        (stackRewards.get("technique_page") ?? 0) + 1,
      );
    }
    if (stackItemRoll >= 355_000 && stackItemRoll < 356_000) {
      stackRewards.set(
        "treasure_token",
        (stackRewards.get("treasure_token") ?? 0) + 1,
      );
    }
    if (roll(10_000, randomInt)) {
      stackRewards.set(
        "enhance_stone",
        (stackRewards.get("enhance_stone") ?? 0) + 1,
      );
    }
    if (roll(500, randomInt)) {
      stackRewards.set(
        "breakthrough_pill",
        (stackRewards.get("breakthrough_pill") ?? 0) + 1,
      );
    }
    if (roll(4_000, randomInt)) {
      const config =
        bandEquipmentConfigs[randomInt(bandEquipmentConfigs.length)]!;
      const quality = rollDropQuality(band, randomInt);
      const valueScore = Math.floor(
        (config.basePower * ASSET_QUALITY_MULTIPLIER_BP[quality]) / 10_000,
      ).toString();
      const instanceId = createLocalId();
      const candidate = {
        id: createLocalId(),
        entryType: "equipment",
        equipmentInstanceId: instanceId,
        techniqueConfigId: null,
        assetConfigId: config.id,
        displayName: config.displayName,
        quality,
        valueScore,
        acquiredAt: new Date().toISOString(),
      };
      const accepted = addHarvestCandidate(next, candidate, {
        id: instanceId,
        equipmentConfigId: config.id,
        displayName: config.displayName,
        quality,
        slot: config.slot,
        powerBonusBp: 0,
        enhanceLevel: 0,
        rolledAffixes: rollEquipmentAffixes(quality, randomInt),
        location: "harvest",
        equippedSlot: null,
        isLocked: shouldAutoLockEquipment(quality),
        configVersion: DROP_CONFIG_VERSION,
      });
      next = accepted.snapshot;
      summary.equipmentCount += 1;
      accountHarvestResult(summary, accepted);
    }
    if (roll(1_200, randomInt)) {
      const quality: AssetQuality = randomInt(10_000) < 8_000 ? "common" : "uncommon";
      const candidates = TECHNIQUE_CONFIGS.filter((item) => item.quality === quality);
      const config = candidates[randomInt(candidates.length)]!;
      const accepted = addHarvestCandidate(next, {
        id: createLocalId(),
        entryType: "technique",
        equipmentInstanceId: null,
        techniqueConfigId: config.id,
        assetConfigId: config.id,
        displayName: config.displayName,
        quality,
        valueScore: config.valueScore.toString(),
        acquiredAt: new Date().toISOString(),
      });
      next = accepted.snapshot;
      summary.techniqueCount += 1;
      accountHarvestResult(summary, accepted);
    }
  }

  for (const [itemConfigId, quantity] of stackRewards) {
    if (hasStackOutputCapacity(next, itemConfigId)) {
      next = {
        ...next,
        inventory: addStack(next.inventory, itemConfigId, quantity),
      };
      summary.stackItems.push({ itemConfigId, quantity: quantity.toString() });
      continue;
    }

    const compensation = decimal(quantity)
      .times(IDLE_STACK_OVERFLOW_SPIRIT_STONE_VALUE)
      .toFixed(0);
    next = {
      ...next,
      wallet: {
        ...next.wallet,
        spiritStone: decimal(next.wallet.spiritStone).plus(compensation).toFixed(0),
      },
    };
    summary.autoSalvagedCount += quantity;
    summary.autoSalvageSpiritStone = decimal(summary.autoSalvageSpiritStone)
      .plus(compensation)
      .toFixed(0);
  }
  return { snapshot: next, summary };
}

function addHarvestCandidate(
  snapshot: BootstrapSnapshot,
  entry: BootstrapSnapshot["harvestChest"]["entries"][number],
  equipment?: BootstrapSnapshot["equipment"][number],
): {
  snapshot: BootstrapSnapshot;
  added: boolean;
  autoSalvageSpiritStone: number;
  autoSalvageEnhanceStone: number;
} {
  const quality = isAssetQuality(entry.quality) ? entry.quality : "common";
  const autoSalvage =
    snapshot.harvestChest.entries.length >= HARVEST_CHEST_CAPACITY ||
    (quality === "common" && snapshot.settings.autoSalvageCommon) ||
    (quality === "uncommon" && snapshot.settings.autoSalvageUncommon);
  if (autoSalvage) {
    const salvage = salvageValue(entry.entryType, quality);
    const applied = resolveSalvageReward(snapshot, salvage, {
      releasesBagSlot: false,
      accountLifetimeImmediately: false,
    });
    return {
      snapshot: {
        ...snapshot,
        inventory: applied.inventory,
        wallet: applied.wallet,
      },
      added: false,
      autoSalvageSpiritStone: applied.spiritStone,
      autoSalvageEnhanceStone: applied.enhanceStone,
    };
  }
  const entries = [...snapshot.harvestChest.entries, entry];
  return {
    snapshot: {
      ...snapshot,
      ...(equipment ? { equipment: [...snapshot.equipment, equipment] } : {}),
      harvestChest: { pendingCount: entries.length, entries },
    },
    added: true,
    autoSalvageSpiritStone: 0,
    autoSalvageEnhanceStone: 0,
  };
}

function accountHarvestResult(
  summary: DropRewardSummary,
  result: {
    added: boolean;
    autoSalvageSpiritStone: number;
    autoSalvageEnhanceStone: number;
  },
): void {
  if (result.added) summary.harvestChestAdded += 1;
  else summary.autoSalvagedCount += 1;
  summary.autoSalvageSpiritStone = decimal(summary.autoSalvageSpiritStone)
    .plus(result.autoSalvageSpiritStone)
    .toFixed(0);
  summary.autoSalvageEnhanceStone = decimal(summary.autoSalvageEnhanceStone)
    .plus(result.autoSalvageEnhanceStone)
    .toFixed(0);
}

function emptyDropSummary(): DropRewardSummary {
  return {
    configVersion: DROP_CONFIG_VERSION,
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

function createTechniqueSnapshot(
  techniqueConfigId: string,
): BootstrapSnapshot["techniques"][number] {
  const config = getTechniqueConfig(techniqueConfigId);
  return {
    techniqueConfigId,
    displayName: config.displayName,
    quality: config.quality,
    slot: config.slot,
    star: 1,
    duplicateCount: 0,
    equippedSlot: null,
    powerBonusBp: 0,
    experienceBonusBp: config.experienceBonusBp,
    spiritStoneBonusBp: config.spiritStoneBonusBp,
    dropBonusBp: config.dropBonusBp,
    configVersion: DROP_CONFIG_VERSION,
  };
}

function ensureStackOutputCapacity(
  snapshot: BootstrapSnapshot,
  itemConfigId: string,
  errorMessage = "行囊空间不足，无法收取炼丹产物",
): void {
  if (!hasStackOutputCapacity(snapshot, itemConfigId)) {
    throw new LocalGameError(errorMessage);
  }
}

function hasStackOutputCapacity(
  snapshot: BootstrapSnapshot,
  itemConfigId: string,
): boolean {
  return (
    snapshot.inventory.stacks.some(
      (stack) => stack.itemConfigId === itemConfigId,
    ) || countOccupiedBagSlots(snapshot) < snapshot.inventory.bagCapacity
  );
}

function addStackRewards(
  snapshot: BootstrapSnapshot,
  inventory: BootstrapSnapshot["inventory"],
  rewards: readonly { readonly itemConfigId: string; readonly quantity: number }[],
  capacityErrorMessage: string,
): BootstrapSnapshot["inventory"] {
  let next = inventory;
  for (const reward of rewards) {
    ensureStackOutputCapacity(
      { ...snapshot, inventory: next },
      reward.itemConfigId,
      capacityErrorMessage,
    );
    next = addStack(next, reward.itemConfigId, reward.quantity);
  }
  return next;
}

function ensureEquipmentCapacity(snapshot: BootstrapSnapshot): void {
  if (countOccupiedBagSlots(snapshot) >= snapshot.inventory.bagCapacity) {
    throw new LocalGameError("行囊空间不足，无法收取炼器产物");
  }
}

/** Picks one entry out of a weighted table with a single random draw. */
function pickWeightedQuality(
  weights: readonly { readonly quality: AssetQuality; readonly weight: number }[],
  randomInt: (maxExclusive: number) => number,
): AssetQuality {
  const totalWeight = weights.reduce((total, entry) => total + entry.weight, 0);
  let rollValue = randomInt(totalWeight);
  for (const entry of weights) {
    if (rollValue < entry.weight) return entry.quality;
    rollValue -= entry.weight;
  }
  return "common";
}

/**
 * The quality an idle drop rolls. Band 1's table totals the same 10,000 and
 * splits at the same 7,500 the fixed roll used, so early-game drops come out of
 * a seeded run exactly as they did before bands existed.
 */
function rollDropQuality(
  band: EquipmentBand,
  randomInt: (maxExclusive: number) => number,
): AssetQuality {
  return pickWeightedQuality(equipmentDropQualityWeights(band), randomInt);
}

function rollCraftingQuality(
  craftingRoomLevel: number,
  band: EquipmentBand,
  randomInt: (maxExclusive: number) => number,
): AssetQuality {
  return pickWeightedQuality(
    CRAFTING_QUALITY_WEIGHTS.map(({ quality }) => ({
      quality,
      weight: craftingQualityWeight(quality, craftingRoomLevel, band),
    })),
    randomInt,
  );
}

function createCraftedEquipment(
  equipmentConfigId: string,
  quality: AssetQuality,
): BootstrapSnapshot["equipment"][number] {
  const config = getEquipmentConfig(equipmentConfigId);
  return {
    id: createLocalId(),
    equipmentConfigId,
    displayName: config.displayName,
    quality,
    slot: config.slot,
    powerBonusBp: 0,
    enhanceLevel: 0,
    rolledAffixes: rollEquipmentAffixes(quality, randomInteger),
    location: "bag",
    equippedSlot: null,
    isLocked: shouldAutoLockEquipment(quality),
    configVersion: DROP_CONFIG_VERSION,
  };
}

function qualityDisplayName(quality: AssetQuality): string {
  return ASSET_QUALITY_DISPLAY_NAMES[quality];
}

function formatAffixScore(scoreBp: number): string {
  return `${affixScorePercent(scoreBp)}%`;
}

/**
 * 单次批量玩法操作能做的份数：灵石和每种材料各自够几份，取最小值，再压到批量上限。
 * 调用方已经校验过至少够一份，因此返回值不会小于 1。
 */
function maxAffordableBatchCount(
  spiritStone: string,
  spiritStoneCost: number,
  materialCosts: ReadonlyArray<{ readonly owned: string; readonly cost: number }>,
): number {
  let count = LOCAL_BATCH_ACTION_CAP;
  const costs = [{ owned: spiritStone, cost: spiritStoneCost }, ...materialCosts];
  for (const entry of costs) {
    if (entry.cost <= 0) continue;
    count = Math.min(
      count,
      decimal(entry.owned).dividedToIntegerBy(entry.cost).toNumber(),
    );
  }
  return count;
}

function formatQualityCounts(counts: ReadonlyMap<AssetQuality, number>): string {
  return [...counts.entries()]
    .sort(([left], [right]) => ASSET_QUALITY_ORDER[left] - ASSET_QUALITY_ORDER[right])
    .map(([quality, count]) => `${qualityDisplayName(quality)} x${count}`)
    .join("、");
}

function addStack(
  inventory: BootstrapSnapshot["inventory"],
  itemConfigId: string,
  quantity: string | number,
): BootstrapSnapshot["inventory"] {
  const amount = decimal(quantity);
  if (!amount.isPositive()) return inventory;
  const config = getItemConfig(itemConfigId);
  const existing = inventory.stacks.find((item) => item.itemConfigId === itemConfigId);
  return {
    ...inventory,
    stacks: existing
      ? inventory.stacks.map((item) =>
          item.itemConfigId === itemConfigId
            ? {
                ...item,
                quantity: decimal(item.quantity).plus(amount).toFixed(0),
              }
            : item,
        )
      : [
          ...inventory.stacks,
          { itemConfigId, displayName: config.displayName, quantity: amount.toFixed(0) },
        ],
  };
}

function setStackQuantity(
  inventory: BootstrapSnapshot["inventory"],
  itemConfigId: string,
  quantity: string | number,
): BootstrapSnapshot["inventory"] {
  const amount = decimal(quantity);
  return {
    ...inventory,
    stacks:
      !amount.isPositive()
        ? inventory.stacks.filter((item) => item.itemConfigId !== itemConfigId)
        : inventory.stacks.map((item) =>
            item.itemConfigId === itemConfigId
              ? { ...item, quantity: amount.toFixed(0) }
              : item,
          ),
  };
}

function stackQuantity(snapshot: BootstrapSnapshot, itemConfigId: string): string {
  return (
    snapshot.inventory.stacks.find((item) => item.itemConfigId === itemConfigId)
      ?.quantity ?? "0"
  );
}

function salvageValue(entryType: string, quality: AssetQuality): {
  spiritStone: number;
  enhanceStone: number;
} {
  const uncommon = quality !== "common";
  if (entryType === "equipment") {
    return equipmentSalvageReward(quality, 0);
  }
  return uncommon
    ? { spiritStone: 200, enhanceStone: 0 }
    : { spiritStone: 80, enhanceStone: 0 };
}

function resolveSalvageReward(
  snapshot: BootstrapSnapshot,
  reward: { readonly spiritStone: number; readonly enhanceStone: number },
  options: {
    readonly releasesBagSlot: boolean;
    readonly accountLifetimeImmediately: boolean;
  },
): {
  readonly inventory: BootstrapSnapshot["inventory"];
  readonly wallet: BootstrapSnapshot["wallet"];
  readonly spiritStone: number;
  readonly enhanceStone: number;
  readonly convertedEnhanceStone: number;
} {
  const hasEnhanceStoneStack = snapshot.inventory.stacks.some(
    (stack) => stack.itemConfigId === "enhance_stone",
  );
  const canStoreEnhanceStone =
    reward.enhanceStone === 0 ||
    hasEnhanceStoneStack ||
    options.releasesBagSlot ||
    countOccupiedBagSlots(snapshot) < snapshot.inventory.bagCapacity;
  const enhanceStone = canStoreEnhanceStone ? reward.enhanceStone : 0;
  const convertedEnhanceStone = reward.enhanceStone - enhanceStone;
  const spiritStone =
    reward.spiritStone +
    convertedEnhanceStone * ENHANCE_STONE_OVERFLOW_SPIRIT_STONE_VALUE;
  return {
    inventory:
      enhanceStone > 0
        ? addStack(snapshot.inventory, "enhance_stone", enhanceStone)
        : snapshot.inventory,
    wallet: {
      ...snapshot.wallet,
      spiritStone: decimal(snapshot.wallet.spiritStone).plus(spiritStone).toFixed(0),
      lifetimeSpiritStoneEarned: decimal(
        snapshot.wallet.lifetimeSpiritStoneEarned,
      )
        .plus(options.accountLifetimeImmediately ? spiritStone : 0)
        .toFixed(0),
    },
    spiritStone,
    enhanceStone,
    convertedEnhanceStone,
  };
}

function salvageRewardMessage(
  displayName: string,
  reward: {
    readonly spiritStone: number;
    readonly enhanceStone: number;
    readonly convertedEnhanceStone: number;
  },
): string {
  const enhancementReward =
    reward.enhanceStone > 0 ? `和 ${reward.enhanceStone} 枚强化石` : "";
  const conversionNotice =
    reward.convertedEnhanceStone > 0
      ? `（${reward.convertedEnhanceStone} 枚强化石因行囊已满折为灵石）`
      : "";
  return `分解 ${displayName}，获得 ${reward.spiritStone} 灵石${enhancementReward}${conversionNotice}`;
}

function equipmentFitsSlot(slot: string, equippedSlot: EquippedEquipmentSlot): boolean {
  return slot === "accessory"
    ? equippedSlot === "accessory_left" || equippedSlot === "accessory_right"
    : slot === equippedSlot;
}

function migrateSnapshot(snapshot: unknown): unknown {
  if (!isRecord(snapshot)) return snapshot;
  let migrated = snapshot;
  let config = migrated.config;
  if (!isRecord(config)) return snapshot;

  if (config.version === GAME_CONFIG_VERSION_PRE_CAVE) {
    migrated = {
      ...migrated,
      cave: { buildings: createEmptyCaveBuildings() },
      config: { ...config, version: GAME_CONFIG_VERSION_PRE_EXPEDITION },
    };
    config = migrated.config;
  }
  if (
    isRecord(config) &&
    config.version === GAME_CONFIG_VERSION_PRE_EXPEDITION
  ) {
    migrated = {
      ...migrated,
      expedition: { clearedStageIds: [] },
      config: { ...config, version: GAME_CONFIG_VERSION_PRE_FEATURE_COMPLETION },
    };
    config = migrated.config;
  }
  if (
    isRecord(config) &&
    config.version === GAME_CONFIG_VERSION_PRE_FEATURE_COMPLETION
  ) {
    migrated = {
      ...migrated,
      partner: { partnerId: null, level: 0, bond: 0 },
      sect: { sectId: null, level: 0, contribution: 0 },
      config: { ...config, version: GAME_CONFIG_VERSION_PRE_ITEM_COMPLETION },
    };
    config = migrated.config;
  }
  if (
    isRecord(config) &&
    config.version === GAME_CONFIG_VERSION_PRE_ITEM_COMPLETION
  ) {
    const inventory = isRecord(migrated.inventory) ? migrated.inventory : null;
    migrated = {
      ...migrated,
      ...(inventory && Array.isArray(inventory.stacks)
        ? {
            inventory: {
              ...inventory,
              stacks: inventory.stacks.filter(
                (stack) =>
                  !isRecord(stack) ||
                  stack.itemConfigId !== "protection_talisman",
              ),
            },
          }
        : {}),
      config: {
        ...config,
        version: GAME_CONFIG_VERSION_PRE_EXPEDITION_SWEEPS,
      },
    };
    config = migrated.config;
  }
  if (
    isRecord(config) &&
    config.version === GAME_CONFIG_VERSION_PRE_EXPEDITION_SWEEPS
  ) {
    const expedition = isRecord(migrated.expedition)
      ? migrated.expedition
      : null;
    migrated = {
      ...migrated,
      ...(expedition
        ? { expedition: { ...expedition, sweepCounts: [] } }
        : {}),
      config: {
        ...config,
        version: GAME_CONFIG_VERSION_PRE_EQUIPMENT_MANAGEMENT,
      },
    };
    config = migrated.config;
  }
  if (
    isRecord(config) &&
    config.version === GAME_CONFIG_VERSION_PRE_EQUIPMENT_MANAGEMENT
  ) {
    migrated = {
      ...migrated,
      ...(Array.isArray(migrated.equipment)
        ? {
            equipment: migrated.equipment.map((item) =>
              isRecord(item) &&
              isAssetQualityValue(item.quality) &&
              shouldAutoLockEquipment(item.quality)
                ? { ...item, isLocked: true }
                : item,
            ),
          }
        : {}),
      config: { ...config, version: GAME_CONFIG_VERSION_PRE_POWER_MODEL },
    };
    config = migrated.config;
  }
  if (isRecord(config) && config.version === GAME_CONFIG_VERSION_PRE_POWER_MODEL) {
    // Loadout power became a percentage of base power, so the three derived
    // display fields changed both name and type. They are rewritten from
    // config on every load, which is why zero is a safe placeholder: it only
    // has to survive validation until `refreshSnapshot` recomputes it. Written
    // unconditionally rather than renamed in place, because a save reaching
    // this step may already carry the new names.
    migrated = {
      ...migrated,
      ...(isRecord(migrated.progress)
        ? {
            progress: replacePowerField(
              migrated.progress,
              "loadoutFixedPower",
              "loadoutPowerBonusBp",
            ),
          }
        : {}),
      ...(Array.isArray(migrated.techniques)
        ? { techniques: migrated.techniques.map(renameItemPowerField) }
        : {}),
      ...(Array.isArray(migrated.equipment)
        ? { equipment: migrated.equipment.map(renameItemPowerField) }
        : {}),
      config: { ...config, version: GAME_CONFIG_VERSION_PRE_TRIAL_TOWER },
    };
    config = migrated.config;
  }
  if (
    isRecord(config) &&
    config.version === GAME_CONFIG_VERSION_PRE_TRIAL_TOWER
  ) {
    // Padding the task list is mandatory, not cosmetic: `isProgressionTaskList`
    // requires the stored count to equal the config length exactly, so the
    // table growing from 3 rows to 22 would condemn every existing save as
    // corrupt and hand the player a new one.
    migrated = {
      ...migrated,
      trialTower: { highestFloor: 0 },
      progressionTasks: padProgressionTasks(migrated.newcomerTasks),
      unlocks: seedTrialTowerUnlock(migrated.unlocks, migrated.progress),
      config: { ...config, version: GAME_CONFIG_VERSION_PRE_AFFIX_ROLL },
    };
    delete (migrated as Record<string, unknown>).newcomerTasks;
    config = migrated.config;
  }
  if (
    isRecord(config) &&
    config.version === GAME_CONFIG_VERSION_PRE_AFFIX_ROLL
  ) {
    // Affixes became random, but stored ones are left exactly as they are: the
    // old fixed values sit at the center of the new ranges and already satisfy
    // the tightened validation, and rerolling on load would silently change an
    // equipped piece's idle bonuses without the player doing anything.
    migrated = {
      ...migrated,
      config: { ...config, version: GAME_CONFIG_VERSION },
    };
  }
  return migrated;
}

function padProgressionTasks(value: unknown): unknown[] {
  const existing = new Map<string, unknown>();
  if (Array.isArray(value)) {
    for (const task of value) {
      if (isRecord(task) && typeof task.taskConfigId === "string") {
        existing.set(task.taskConfigId, task);
      }
    }
  }
  return PROGRESSION_TASK_CONFIGS.map(
    (config) =>
      existing.get(config.id) ?? {
        taskConfigId: config.id,
        progress: "0",
        completedAt: null,
        claimedAt: null,
      },
  );
}

/**
 * Unlocks became stored and monotonic in this version. The other two bits are
 * already on disk from when they were derived, so only the tower's needs a
 * value, and the current level is the only fair thing to seed it from.
 */
function seedTrialTowerUnlock(
  unlocks: unknown,
  progress: unknown,
): Record<string, unknown> {
  const level =
    isRecord(progress) && typeof progress.level === "number" ? progress.level : 1;
  return {
    ...(isRecord(unlocks) ? unlocks : { partner: false, cave: false }),
    trialTower: level >= TRIAL_TOWER_UNLOCK_LEVEL,
  };
}

function renameItemPowerField(item: unknown): unknown {
  return isRecord(item) ? replacePowerField(item, "fixedPower", "powerBonusBp") : item;
}

function replacePowerField(
  record: Record<string, unknown>,
  oldKey: string,
  newKey: string,
): Record<string, unknown> {
  const next = { ...record, [newKey]: 0 };
  delete next[oldKey];
  return next;
}

function parseLocalGameSave(value: unknown): LocalGameSave | null {
  if (!isRecord(value) || value.schemaVersion !== LOCAL_SAVE_SCHEMA_VERSION) return null;
  const snapshot = migrateSnapshot(value.snapshot);
  if (
    !isIsoTimestamp(value.savedAt) ||
    !isIntegerBetween(value.spiritStoneRemainderMicros, 0, 999_999) ||
    !isIntegerBetween(value.dropClockRemainderMicros, 0, DROP_CLOCK_MAX_REMAINDER - 1) ||
    !isBootstrapSnapshot(snapshot)
  ) {
    return null;
  }

  try {
    applyWholeExperience(snapshot.progress, 0);
    if (
      snapshot.progress.status === "gaining" &&
      decimal(snapshot.progress.experience).greaterThanOrEqualTo(
        requiredExperienceForLevel(snapshot.progress.level),
      )
    ) {
      return null;
    }
    return {
      schemaVersion: LOCAL_SAVE_SCHEMA_VERSION,
      savedAt: value.savedAt,
      spiritStoneRemainderMicros: Number(value.spiritStoneRemainderMicros),
      dropClockRemainderMicros: Number(value.dropClockRemainderMicros),
      snapshot: refreshSnapshot(snapshot),
    };
  } catch {
    return null;
  }
}

function parseLocalBackupCode(rawCode: string): LocalGameSave {
  if (typeof rawCode !== "string" || rawCode.length > LOCAL_BACKUP_MAX_LENGTH) {
    throw new LocalGameError("存档备份内容过长或格式无效");
  }
  const code = rawCode.trim();
  const checksumStart = LOCAL_BACKUP_PREFIX.length;
  const checksumEnd = checksumStart + LOCAL_BACKUP_CHECKSUM_LENGTH;
  if (
    !code.startsWith(LOCAL_BACKUP_PREFIX) ||
    code.charAt(checksumEnd) !== ":"
  ) {
    throw new LocalGameError("剪贴板中没有可识别的修仙存档备份");
  }
  const checksum = code.slice(checksumStart, checksumEnd);
  const payload = code.slice(checksumEnd + 1);
  if (!/^[0-9a-f]{8}$/.test(checksum) || backupChecksum(payload) !== checksum) {
    throw new LocalGameError("存档备份校验失败，内容可能不完整或已被修改");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(payload);
  } catch {
    throw new LocalGameError("存档备份内容不是有效数据");
  }
  const save = parseLocalGameSave(decoded);
  if (!save) {
    throw new LocalGameError("存档备份内容无效或版本不兼容");
  }
  return save;
}

function backupChecksum(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    hash = Math.imul(hash ^ (code & 0xff), 0x01000193);
    hash = Math.imul(hash ^ (code >>> 8), 0x01000193);
  }
  return `00000000${(hash >>> 0).toString(16)}`.slice(-8);
}

function isBootstrapSnapshot(value: unknown): value is BootstrapSnapshot {
  if (!isRecord(value)) return false;
  const player = value.player;
  const progress = value.progress;
  const wallet = value.wallet;
  const inventory = value.inventory;
  const chest = value.harvestChest;
  const settings = value.settings;
  const config = value.config;
  return (
    isRecord(value.account) &&
    isIdentifier(value.account.id) &&
    isRecord(player) &&
    isIdentifier(player.id) &&
    typeof player.displayName === "string" &&
    /^[\u3400-\u9fffA-Za-z0-9]{2,12}$/.test(player.displayName) &&
    (player.avatarVariant === "neutral" ||
      player.avatarVariant === "male" ||
      player.avatarVariant === "female") &&
    typeof player.freeRenameAvailable === "boolean" &&
    isProgressSnapshot(progress) &&
    isWalletSnapshot(wallet) &&
    isInventorySnapshot(inventory) &&
    isTechniqueList(value.techniques) &&
    isEquipmentList(value.equipment) &&
    isHarvestChest(chest) &&
    isCaveSnapshot(value.cave) &&
    isExpeditionSnapshot(value.expedition) &&
    isTrialTowerSnapshot(value.trialTower) &&
    isPartnerSnapshot(value.partner) &&
    isSectSnapshot(value.sect) &&
    isProgressionTaskList(value.progressionTasks) &&
    isRecord(value.unlocks) &&
    typeof value.unlocks.partner === "boolean" &&
    typeof value.unlocks.cave === "boolean" &&
    typeof value.unlocks.trialTower === "boolean" &&
    isRecord(settings) &&
    typeof settings.autoSalvageCommon === "boolean" &&
    typeof settings.autoSalvageUncommon === "boolean" &&
    typeof settings.partnerUnlockNoticeSeen === "boolean" &&
    isMainTab(settings.selectedTab) &&
    Array.isArray(value.activeEffects) &&
    value.activeEffects.length === 0 &&
    isRecord(config) &&
    config.version === GAME_CONFIG_VERSION &&
    config.maxLevel === MAX_LEVEL &&
    isOfflineSettlement(value.offlineSettlement) &&
    hasConsistentInventory(value)
  );
}

function isPartnerSnapshot(value: unknown): boolean {
  if (!isRecord(value) || !isIntegerBetween(value.bond, 0, 1_000_000_000)) {
    return false;
  }
  if (value.partnerId === null) {
    return value.level === 0 && value.bond === 0;
  }
  if (typeof value.partnerId !== "string") return false;
  try {
    getPartnerConfig(value.partnerId);
  } catch {
    return false;
  }
  if (!isIntegerBetween(value.level, 1, PARTNER_MAX_LEVEL)) return false;
  if (value.level === PARTNER_MAX_LEVEL) return value.bond === 0;
  return Number(value.bond) < partnerBondRequirement(Number(value.level) + 1);
}

function isSectSnapshot(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isIntegerBetween(value.contribution, 0, 1_000_000_000)
  ) {
    return false;
  }
  if (value.sectId === null) {
    return value.level === 0 && value.contribution === 0;
  }
  if (typeof value.sectId !== "string") return false;
  try {
    getSectConfig(value.sectId);
  } catch {
    return false;
  }
  if (!isIntegerBetween(value.level, 1, SECT_MAX_LEVEL)) return false;
  if (value.level === SECT_MAX_LEVEL) return value.contribution === 0;
  return Number(value.contribution) < sectContributionRequirement(Number(value.level) + 1);
}

function isExpeditionSnapshot(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !Array.isArray(value.clearedStageIds) ||
    !Array.isArray(value.sweepCounts)
  ) {
    return false;
  }
  if (value.clearedStageIds.length > EXPEDITION_STAGE_CONFIGS.length) return false;
  if (
    !value.clearedStageIds.every(
      (stageId, index) =>
        typeof stageId === "string" &&
        stageId === EXPEDITION_STAGE_CONFIGS[index]?.id,
    ) ||
    value.sweepCounts.length > value.clearedStageIds.length
  ) {
    return false;
  }
  const sweepStageIds = new Set<string>();
  for (const entry of value.sweepCounts) {
    if (
      !isRecord(entry) ||
      typeof entry.stageConfigId !== "string" ||
      value.clearedStageIds.indexOf(entry.stageConfigId) < 0 ||
      sweepStageIds.has(entry.stageConfigId) ||
      !isIntegerBetween(entry.count, 1, EXPEDITION_SWEEP_MAX_COUNT)
    ) {
      return false;
    }
    sweepStageIds.add(entry.stageConfigId);
  }
  return true;
}

function isCaveSnapshot(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.buildings)) return false;
  if (value.buildings.length !== CAVE_BUILDING_CONFIGS.length) return false;
  const seen = new Set<string>();
  for (const building of value.buildings) {
    if (!isRecord(building) || typeof building.buildingConfigId !== "string") return false;
    try {
      getCaveBuildingConfig(building.buildingConfigId);
    } catch {
      return false;
    }
    if (seen.has(building.buildingConfigId)) return false;
    seen.add(building.buildingConfigId);
    if (!isIntegerBetween(building.level, 0, CAVE_MAX_LEVEL)) return false;
  }
  return true;
}

function isProgressSnapshot(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isIntegerBetween(value.level, 1, MAX_LEVEL) &&
    typeof value.realmId === "string" &&
    isBoundedString(value.realmName, 1, 24) &&
    (value.stage === "early" ||
      value.stage === "middle" ||
      value.stage === "late" ||
      value.stage === "perfect") &&
    isBoundedString(value.title, 1, 24) &&
    isDecimalString(value.experience) &&
    isDecimalString(value.requiredExperience) &&
    isIsoTimestamp(value.settledAt) &&
    isIntegerBetween(value.experienceRemainderMicros, 0, 999_999) &&
    (value.status === "gaining" ||
      value.status === "breakthrough_ready" ||
      value.status === "version_cap") &&
    isDecimalString(value.totalPower) &&
    isDecimalString(value.cultivationReserve) &&
    isRateString(value.experiencePerSecond) &&
    isRateString(value.spiritStonePerMinute) &&
    isNonNegativeSafeInteger(value.loadoutPowerBonusBp) &&
    isNonNegativeSafeInteger(value.experienceBonusBp) &&
    isNonNegativeSafeInteger(value.spiritStoneBonusBp) &&
    isNonNegativeSafeInteger(value.dropBonusBp)
  );
}

function isWalletSnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    isDecimalString(value.spiritStone) &&
    isDecimalString(value.immortalJade) &&
    isDecimalString(value.lifetimeSpiritStoneEarned)
  );
}

function isInventorySnapshot(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isIntegerBetween(value.bagCapacity, BAG_INITIAL_CAPACITY, BAG_MAX_CAPACITY) ||
    (Number(value.bagCapacity) - BAG_INITIAL_CAPACITY) % BAG_EXPANSION_SIZE !== 0 ||
    !Array.isArray(value.stacks) ||
    value.stacks.length > BAG_MAX_CAPACITY
  ) {
    return false;
  }
  const itemIds = new Set<string>();
  return value.stacks.every((stack) => {
    if (
      !isRecord(stack) ||
      typeof stack.itemConfigId !== "string" ||
      !isBoundedString(stack.displayName, 1, 40) ||
      !isPositiveDecimalString(stack.quantity) ||
      itemIds.has(stack.itemConfigId)
    ) {
      return false;
    }
    try {
      const config = getItemConfig(stack.itemConfigId);
      if (stack.displayName !== config.displayName) return false;
    } catch {
      return false;
    }
    itemIds.add(stack.itemConfigId);
    return true;
  });
}

function isTechniqueList(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > TECHNIQUE_CONFIGS.length) return false;
  const configIds = new Set<string>();
  const equippedSlots = new Set<string>();
  return value.every((technique) => {
    if (!isRecord(technique) || typeof technique.techniqueConfigId !== "string") {
      return false;
    }
    let config;
    try {
      config = getTechniqueConfig(technique.techniqueConfigId);
    } catch {
      return false;
    }
    const equippedSlot = technique.equippedSlot;
    if (
      configIds.has(config.id) ||
      technique.displayName !== config.displayName ||
      technique.quality !== config.quality ||
      technique.slot !== config.slot ||
      !isIntegerBetween(technique.star, 1, TECHNIQUE_MAX_STAR) ||
      !isIntegerBetween(technique.duplicateCount, 0, 1_000_000_000) ||
      (equippedSlot !== null && equippedSlot !== config.slot) ||
      !isNonNegativeSafeInteger(technique.powerBonusBp) ||
      !isNonNegativeSafeInteger(technique.experienceBonusBp) ||
      !isNonNegativeSafeInteger(technique.spiritStoneBonusBp) ||
      !isNonNegativeSafeInteger(technique.dropBonusBp) ||
      technique.configVersion !== DROP_CONFIG_VERSION ||
      (typeof equippedSlot === "string" && equippedSlots.has(equippedSlot))
    ) {
      return false;
    }
    configIds.add(config.id);
    if (typeof equippedSlot === "string") equippedSlots.add(equippedSlot);
    return true;
  });
}

function isEquipmentList(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > 500) return false;
  const instanceIds = new Set<string>();
  const equippedSlots = new Set<string>();
  return value.every((equipment) => {
    if (
      !isRecord(equipment) ||
      !isIdentifier(equipment.id) ||
      typeof equipment.equipmentConfigId !== "string"
    ) {
      return false;
    }
    let config;
    try {
      config = getEquipmentConfig(equipment.equipmentConfigId);
    } catch {
      return false;
    }
    const equippedSlot = equipment.equippedSlot;
    const location = equipment.location;
    if (
      instanceIds.has(equipment.id) ||
      equipment.displayName !== config.displayName ||
      !isAssetQualityValue(equipment.quality) ||
      equipment.slot !== config.slot ||
      !isNonNegativeSafeInteger(equipment.powerBonusBp) ||
      !isIntegerBetween(
        equipment.enhanceLevel,
        0,
        EQUIPMENT_MAX_ENHANCE_LEVEL,
      ) ||
      !isRolledAffixes(equipment.rolledAffixes) ||
      (location !== "bag" && location !== "equipped" && location !== "harvest") ||
      !isEquipmentSlotOrNull(equippedSlot) ||
      (location === "equipped" &&
        (equippedSlot === null || !equipmentFitsSlot(config.slot, equippedSlot))) ||
      (location !== "equipped" && equippedSlot !== null) ||
      (typeof equippedSlot === "string" && equippedSlots.has(equippedSlot)) ||
      typeof equipment.isLocked !== "boolean" ||
      equipment.configVersion !== DROP_CONFIG_VERSION
    ) {
      return false;
    }
    instanceIds.add(equipment.id);
    if (typeof equippedSlot === "string") equippedSlots.add(equippedSlot);
    return true;
  });
}

function isHarvestChest(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !Array.isArray(value.entries) ||
    value.entries.length > HARVEST_CHEST_CAPACITY ||
    value.pendingCount !== value.entries.length
  ) {
    return false;
  }
  const entryIds = new Set<string>();
  const equipmentInstanceIds = new Set<string>();
  return value.entries.every((entry) => {
    if (
      !isRecord(entry) ||
      !isIdentifier(entry.id) ||
      entryIds.has(entry.id) ||
      !isBoundedString(entry.displayName, 1, 40) ||
      !isAssetQualityValue(entry.quality) ||
      !isDecimalString(entry.valueScore) ||
      !isIsoTimestamp(entry.acquiredAt) ||
      typeof entry.assetConfigId !== "string"
    ) {
      return false;
    }
    entryIds.add(entry.id);
    if (entry.entryType === "equipment") {
      if (
        !isIdentifier(entry.equipmentInstanceId) ||
        entry.techniqueConfigId !== null ||
        equipmentInstanceIds.has(entry.equipmentInstanceId)
      ) {
        return false;
      }
      try {
        const config = getEquipmentConfig(entry.assetConfigId);
        if (entry.displayName !== config.displayName) return false;
      } catch {
        return false;
      }
      equipmentInstanceIds.add(entry.equipmentInstanceId);
      return true;
    }
    if (
      entry.entryType !== "technique" ||
      entry.equipmentInstanceId !== null ||
      typeof entry.techniqueConfigId !== "string" ||
      entry.assetConfigId !== entry.techniqueConfigId
    ) {
      return false;
    }
    try {
      const config = getTechniqueConfig(entry.techniqueConfigId);
      return entry.displayName === config.displayName && entry.quality === config.quality;
    } catch {
      return false;
    }
  });
}

function isTrialTowerSnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    isIntegerBetween(value.highestFloor, 0, TRIAL_TOWER_MAX_FLOOR)
  );
}

function isProgressionTaskList(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== PROGRESSION_TASK_CONFIGS.length) {
    return false;
  }
  const taskIds = new Set<string>();
  return value.every((task) => {
    if (
      !isRecord(task) ||
      typeof task.taskConfigId !== "string" ||
      taskIds.has(task.taskConfigId) ||
      !isDecimalString(task.progress) ||
      !isNullableIsoTimestamp(task.completedAt) ||
      !isNullableIsoTimestamp(task.claimedAt) ||
      (task.claimedAt !== null && task.completedAt === null) ||
      !PROGRESSION_TASK_CONFIGS.some((config) => config.id === task.taskConfigId)
    ) {
      return false;
    }
    taskIds.add(task.taskConfigId);
    return true;
  });
}

function isOfflineSettlement(value: unknown): boolean {
  if (value === null) return true;
  if (!isRecord(value) || !isRecord(value.drops)) return false;
  const fromTime = isIsoTimestamp(value.fromTime) ? Date.parse(value.fromTime) : NaN;
  const toTime = isIsoTimestamp(value.toTime) ? Date.parse(value.toTime) : NaN;
  return (
    isIdentifier(value.id) &&
    Number.isFinite(fromTime) &&
    Number.isFinite(toTime) &&
    fromTime <= toTime &&
    isIntegerBetween(value.effectiveSeconds, 0, CLIENT_CONFIG.maxOfflineSeconds) &&
    isIntegerBetween(value.efficiencyBp, 0, BASIS_POINTS) &&
    isDecimalString(value.experienceGained) &&
    isDecimalString(value.experienceDiscarded) &&
    isDecimalString(value.spiritStoneGained) &&
    isNonNegativeSafeInteger(value.dropAttempts) &&
    isDropSummary(value.drops) &&
    Array.isArray(value.events) &&
    value.events.length <= MAX_LEVEL &&
    value.events.every(isProgressionEvent) &&
    typeof value.newcomerRewardGranted === "boolean"
  );
}

function isDropSummary(value: Record<string, unknown>): boolean {
  if (
    value.configVersion !== DROP_CONFIG_VERSION ||
    !Array.isArray(value.stackItems) ||
    value.stackItems.length > 32 ||
    !isNonNegativeSafeInteger(value.equipmentCount) ||
    !isNonNegativeSafeInteger(value.techniqueCount) ||
    !isNonNegativeSafeInteger(value.harvestChestAdded) ||
    !isNonNegativeSafeInteger(value.techniqueDuplicates) ||
    !isNonNegativeSafeInteger(value.autoSalvagedCount) ||
    !isNonNegativeSafeInteger(value.mailedCount) ||
    !isDecimalString(value.autoSalvageSpiritStone) ||
    !isDecimalString(value.autoSalvageEnhanceStone)
  ) {
    return false;
  }
  const itemIds = new Set<string>();
  return value.stackItems.every((stack) => {
    if (
      !isRecord(stack) ||
      typeof stack.itemConfigId !== "string" ||
      itemIds.has(stack.itemConfigId) ||
      !isPositiveDecimalString(stack.quantity)
    ) {
      return false;
    }
    try {
      getItemConfig(stack.itemConfigId);
    } catch {
      return false;
    }
    itemIds.add(stack.itemConfigId);
    return true;
  });
}

function isProgressionEvent(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.type === "level_up") {
    return (
      isIntegerBetween(value.fromLevel, 1, MAX_LEVEL - 1) &&
      value.toLevel === Number(value.fromLevel) + 1
    );
  }
  return (
    (value.type === "breakthrough_ready" || value.type === "version_cap_reached") &&
    isIntegerBetween(value.level, 1, MAX_LEVEL)
  );
}

function hasConsistentInventory(snapshot: Record<string, unknown>): boolean {
  const inventory = snapshot.inventory;
  const equipment = snapshot.equipment;
  const chest = snapshot.harvestChest;
  if (!isRecord(inventory) || !Array.isArray(inventory.stacks)) return false;
  if (!Array.isArray(equipment) || !isRecord(chest) || !Array.isArray(chest.entries)) {
    return false;
  }
  const occupiedBagSlots =
    inventory.stacks.length +
    equipment.filter(
      (item) => isRecord(item) && item.location !== "harvest",
    ).length;
  if (occupiedBagSlots > Number(inventory.bagCapacity)) return false;

  const harvestEquipmentIds = new Set<string>();
  for (const entry of chest.entries) {
    if (
      isRecord(entry) &&
      entry.entryType === "equipment" &&
      typeof entry.equipmentInstanceId === "string"
    ) {
      harvestEquipmentIds.add(entry.equipmentInstanceId);
    }
  }
  const storedHarvestEquipmentCount = equipment.filter(
    (item) => isRecord(item) && item.location === "harvest",
  ).length;
  if (harvestEquipmentIds.size !== storedHarvestEquipmentCount) return false;
  return equipment.every((item) => {
    if (!isRecord(item) || typeof item.id !== "string") return false;
    return item.location === "harvest"
      ? harvestEquipmentIds.has(item.id)
      : !harvestEquipmentIds.has(item.id);
  });
}

function isRolledAffixes(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > AFFIX_STATS.length) return false;
  const seen = new Set<unknown>();
  for (const affix of value) {
    if (
      !isRecord(affix) ||
      !AFFIX_STATS.some((stat) => stat === affix.stat) ||
      !isIntegerBetween(affix.valueBp, 0, 1_000_000) ||
      seen.has(affix.stat)
    ) {
      return false;
    }
    seen.add(affix.stat);
  }
  // Deliberately not range-checked against the quality's roll table: that would
  // make load validation depend on the value tables, so any later retune would
  // condemn existing saves. Ranges constrain new rolls, not stored ones.
  return true;
}

function isEquipmentSlotOrNull(value: unknown): value is EquippedEquipmentSlot | null {
  return (
    value === null ||
    value === "weapon" ||
    value === "armor" ||
    value === "accessory_left" ||
    value === "accessory_right" ||
    value === "mount" ||
    value === "pet"
  );
}

function isMainTab(value: unknown): boolean {
  return (
    value === "cultivation" ||
    value === "partner" ||
    value === "ranking" ||
    value === "cave"
  );
}

function isAssetQualityValue(value: unknown): value is AssetQuality {
  return typeof value === "string" && isAssetQuality(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isNullableIsoTimestamp(value: unknown): value is string | null {
  return value === null || isIsoTimestamp(value);
}

function isIdentifier(value: unknown): value is string {
  return isBoundedString(value, 1, 128);
}

function isBoundedString(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimumLength &&
    value.length <= maximumLength
  );
}

function isDecimalString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 256 &&
    /^(0|[1-9]\d*)$/.test(value)
  );
}

/**
 * Derived rates keep the fraction that a percentage bonus produces — a Lv.11
 * cultivator with a 3% technique earns 22.66 experience per second. Stored
 * balances stay whole; only these projections may carry decimals.
 */
function isRateString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 256 &&
    /^(0|[1-9]\d*)(\.\d+)?$/.test(value)
  );
}

function isPositiveDecimalString(value: unknown): value is string {
  return isDecimalString(value) && value !== "0";
}

function isNonNegativeSafeInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isIntegerBetween(value: unknown, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function emptyMutation(snapshot: BootstrapSnapshot): LocalMutationResult {
  return {
    previous: snapshot,
    snapshot,
    events: [],
    sourceId: createLocalId(),
  };
}

function createLocalId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes
    .map((value) => (`0${value.toString(16)}`).slice(-2))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function randomInteger(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function createSeededRandomInteger(seed: number): (maxExclusive: number) => number {
  let state = seed >>> 0;
  return (maxExclusive: number): number => {
    state = (state + 0x6d2b_79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) % maxExclusive;
  };
}

function roll(chance: number, randomInt: (maxExclusive: number) => number): boolean {
  return randomInt(1_000_000) < chance;
}

function formatDuration(seconds: number): string {
  if (seconds % 3_600 === 0) return `${seconds / 3_600} 小时`;
  if (seconds % 60 === 0) return `${seconds / 60} 分钟`;
  return `${seconds} 秒`;
}
