import {
  BASIS_POINTS,
  CAVE_BUILDING_CONFIGS,
  CAVE_MAX_LEVEL,
  EQUIPMENT_CONFIGS,
  MAX_LEVEL,
  NEWCOMER_REACH_LEVEL_8_TASK_ID,
  NEWCOMER_TASK_CONFIGS,
  TECHNIQUE_CONFIGS,
  applyWholeExperience,
  calculateLoadoutBonuses,
  calculateOnlineExperiencePerSecond,
  calculateSpiritStonePerMinute,
  calculateTotalPower,
  completeBreakthrough,
  createEmptyCaveBuildings,
  decimal,
  getCaveBuildingConfig,
  getEquipmentConfig,
  getItemConfig,
  getRealmConfigForLevel,
  getRealmStage,
  getRealmTitle,
  getTechniqueConfig,
  isAssetQuality,
  requiredExperienceForLevel,
  settleCultivation,
  simulateOnlineExperience,
  type AssetQuality,
  type BootstrapSnapshot,
  type ChosenAvatarVariant,
  type DebugGrantTarget,
  type DropRewardSummary,
  type EquippedEquipmentSlot,
  type ProgressionEvent,
} from "@cultivation-diary/shared";
import { CLIENT_CONFIG } from "../core/ClientConfig";
import type { PlatformAdapter } from "../platform/PlatformAdapter";

const LOCAL_SAVE_SCHEMA_VERSION = 1 as const;
const GAME_CONFIG_VERSION = "local-1.1.0";
const GAME_CONFIG_VERSION_PRE_CAVE = "local-1.0.0";
const DROP_CONFIG_VERSION = "local-idle-drop-v1";
const OFFLINE_NOTICE_MIN_SECONDS = 60;
const HARVEST_CHEST_CAPACITY = 100;
const BAG_INITIAL_CAPACITY = 50;
const BAG_MAX_CAPACITY = 200;
const BAG_EXPANSION_SIZE = 10;
const BAG_EXPANSION_BASE_COST = 5_000;
const DROP_CLOCK_MAX_REMAINDER = 60_000_000;

interface LocalGameSave {
  readonly schemaVersion: typeof LOCAL_SAVE_SCHEMA_VERSION;
  readonly savedAt: string;
  readonly spiritStoneRemainderMicros: number;
  readonly dropClockRemainderMicros: number;
  readonly snapshot: BootstrapSnapshot;
}

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

  useInventoryItem(itemConfigId: string): LocalMutationResult {
    return this.mutate((snapshot) => {
      const config = getItemConfig(itemConfigId);
      const quantity = stackQuantity(snapshot, itemConfigId);
      if (decimal(quantity).lessThan(1)) throw new LocalGameError("物品数量不足");
      if (!config.useEffect) throw new LocalGameError("该物品当前版本暂不可使用");

      const simulated = simulateOnlineExperience({
        progress: snapshot.progress,
        elapsedMilliseconds: config.useEffect.durationSeconds * 1_000,
        experienceBonusBp: snapshot.progress.experienceBonusBp,
      });
      const inventory = setStackQuantity(
        snapshot.inventory,
        itemConfigId,
        decimal(quantity).minus(1).toFixed(0),
      );
      const progressed = refreshSnapshot({
        ...snapshot,
        inventory,
        progress: {
          ...snapshot.progress,
          ...simulated.progress,
          settledAt: new Date().toISOString(),
        },
      });
      const withTasks = syncNewcomerTasks(progressed);
      return {
        snapshot: withTasks.snapshot,
        events: simulated.events,
        message: `使用 ${config.displayName}，获得 ${simulated.experienceGained} 修为`,
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
        const usedSlots =
          snapshot.inventory.stacks.length +
          snapshot.equipment.filter((item) => item.location !== "harvest").length;
        if (usedSlots >= snapshot.inventory.bagCapacity) {
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
          message = `${entry.displayName} 已转化为功法残页`;
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

  salvageHarvest(entryId: string): LocalMutationResult {
    return this.mutate((snapshot) => {
      const entry = snapshot.harvestChest.entries.find((item) => item.id === entryId);
      if (!entry) throw new LocalGameError("该收获已经处理");
      if (!isAssetQuality(entry.quality)) throw new LocalGameError("收获品质数据无效");
      const salvage = salvageValue(entry.entryType, entry.quality);
      const entries = snapshot.harvestChest.entries.filter((item) => item.id !== entryId);
      const equipment = entry.equipmentInstanceId
        ? snapshot.equipment.filter((item) => item.id !== entry.equipmentInstanceId)
        : snapshot.equipment;
      let inventory = snapshot.inventory;
      if (salvage.enhanceStone > 0) {
        inventory = addStack(inventory, "enhance_stone", salvage.enhanceStone);
      }
      return {
        snapshot: {
          ...snapshot,
          equipment,
          inventory,
          wallet: {
            ...snapshot.wallet,
            spiritStone: decimal(snapshot.wallet.spiritStone)
              .plus(salvage.spiritStone)
              .toFixed(0),
          },
          harvestChest: { pendingCount: entries.length, entries },
        },
        events: [],
        message: `分解 ${entry.displayName}，获得 ${salvage.spiritStone} 灵石`,
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
      const withTasks = syncNewcomerTasks(progressed);
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

  reset(): LocalLoadResult {
    const previous = this.snapshot;
    this.platform.remove(CLIENT_CONFIG.localSaveStorageKey);
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
    const result = operation(previous);
    const now = new Date();
    this.setSnapshot(refreshSnapshot(result.snapshot), now);
    this.persist();
    return {
      previous,
      snapshot: this.snapshot,
      events: result.events,
      sourceId: createLocalId(),
      ...(result.message ? { message: result.message } : {}),
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
    const taskResult = syncNewcomerTasks(next);
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

function createInitialSave(now: Date): LocalGameSave {
  const nowIso = now.toISOString();
  const snapshot = refreshSnapshot({
    account: { id: createLocalId() },
    player: {
      id: createLocalId(),
      displayName: "青岚子",
      avatarVariant: "neutral",
      freeRenameAvailable: true,
    },
    progress: {
      level: 1,
      realmId: "qi_refining",
      realmName: "练气期",
      stage: "early",
      title: "练气初期",
      experience: "0",
      requiredExperience: requiredExperienceForLevel(1),
      settledAt: nowIso,
      experienceRemainderMicros: 0,
      status: "gaining",
      totalPower: "100",
      cultivationReserve: "0",
      experiencePerSecond: "1",
      spiritStonePerMinute: "1",
      loadoutFixedPower: "0",
      experienceBonusBp: 0,
      spiritStoneBonusBp: 0,
      dropBonusBp: 0,
    },
    wallet: {
      spiritStone: "0",
      immortalJade: "0",
      lifetimeSpiritStoneEarned: "0",
    },
    inventory: { bagCapacity: BAG_INITIAL_CAPACITY, stacks: [] },
    techniques: [],
    equipment: [],
    harvestChest: { pendingCount: 0, entries: [] },
    cave: { buildings: createEmptyCaveBuildings() },
    newcomerTasks: NEWCOMER_TASK_CONFIGS.map((task) => ({
      taskConfigId: task.id,
      progress: "1",
      completedAt: null,
      claimedAt: null,
    })),
    unlocks: { partner: false, cave: false },
    settings: {
      autoSalvageCommon: false,
      autoSalvageUncommon: false,
      partnerUnlockNoticeSeen: false,
      selectedTab: "cultivation",
    },
    activeEffects: [],
    config: { version: GAME_CONFIG_VERSION, maxLevel: MAX_LEVEL },
    offlineSettlement: null,
  });
  return {
    schemaVersion: LOCAL_SAVE_SCHEMA_VERSION,
    savedAt: nowIso,
    spiritStoneRemainderMicros: 0,
    dropClockRemainderMicros: 0,
    snapshot,
  };
}

function refreshSnapshot(snapshot: BootstrapSnapshot): BootstrapSnapshot {
  const bonuses = calculateLoadoutBonuses({
    techniques: snapshot.techniques
      .filter((item) => item.equippedSlot !== null)
      .map((item) => ({ techniqueConfigId: item.techniqueConfigId, star: item.star })),
    equipment: snapshot.equipment
      .filter((item) => item.equippedSlot !== null && isAssetQuality(item.quality))
      .map((item) => ({
        equipmentConfigId: item.equipmentConfigId,
        quality: item.quality as AssetQuality,
        enhanceLevel: item.enhanceLevel,
        rolledAffixes: item.rolledAffixes,
      })),
  });
  const level = snapshot.progress.level;
  const realm = getRealmConfigForLevel(level);
  const unlocked = level >= 11;
  return {
    ...snapshot,
    progress: {
      ...snapshot.progress,
      realmId: realm.id,
      realmName: realm.displayName,
      stage: getRealmStage(level),
      title: getRealmTitle(level),
      requiredExperience: requiredExperienceForLevel(level),
      totalPower: calculateTotalPower(level, { fixedPower: bonuses.fixedPower }),
      experiencePerSecond: calculateOnlineExperiencePerSecond(
        level,
        bonuses.experienceBonusBp,
      ),
      spiritStonePerMinute: calculateSpiritStonePerMinute(
        level,
        bonuses.spiritStoneBonusBp,
      ),
      loadoutFixedPower: bonuses.fixedPower,
      experienceBonusBp: bonuses.experienceBonusBp,
      spiritStoneBonusBp: bonuses.spiritStoneBonusBp,
      dropBonusBp: bonuses.dropBonusBp,
    },
    unlocks: { partner: unlocked, cave: unlocked },
    harvestChest: {
      ...snapshot.harvestChest,
      pendingCount: snapshot.harvestChest.entries.length,
    },
  };
}

function syncNewcomerTasks(snapshot: BootstrapSnapshot): {
  snapshot: BootstrapSnapshot;
  rewardGranted: boolean;
} {
  const now = new Date().toISOString();
  let rewardGranted = false;
  let inventory = snapshot.inventory;
  const existing = new Map(
    snapshot.newcomerTasks.map((task) => [task.taskConfigId, task] as const),
  );
  const newcomerTasks = NEWCOMER_TASK_CONFIGS.map((config) => {
    const previous = existing.get(config.id);
    const completed = snapshot.progress.level >= config.targetLevel;
    const newlyCompleted = completed && previous?.completedAt == null;
    const claimedAt =
      config.id === NEWCOMER_REACH_LEVEL_8_TASK_ID && completed
        ? previous?.claimedAt ?? now
        : previous?.claimedAt ?? null;
    if (
      config.id === NEWCOMER_REACH_LEVEL_8_TASK_ID &&
      newlyCompleted &&
      previous?.claimedAt == null
    ) {
      inventory = addStack(inventory, "breakthrough_pill", 1);
      rewardGranted = true;
    }
    return {
      taskConfigId: config.id,
      progress: Math.min(snapshot.progress.level, config.targetLevel).toString(),
      completedAt: completed ? previous?.completedAt ?? now : null,
      claimedAt,
    };
  });
  return {
    snapshot: { ...snapshot, inventory, newcomerTasks },
    rewardGranted,
  };
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

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (roll(350_000, randomInt)) {
      const itemId = materialIds[randomInt(materialIds.length)]!;
      stackRewards.set(
        itemId,
        (stackRewards.get(itemId) ?? 0) + 1 + randomInt(3),
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
      const config = EQUIPMENT_CONFIGS[randomInt(EQUIPMENT_CONFIGS.length)]!;
      const quality: AssetQuality = randomInt(10_000) < 7_500 ? "common" : "uncommon";
      const valueScore = Math.floor(
        (config.basePower * (quality === "common" ? 10_000 : 15_000)) / 10_000,
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
        fixedPower: valueScore,
        enhanceLevel: 0,
        rolledAffixes:
          quality === "uncommon"
            ? [{ stat: "experience_bonus", valueBp: 100 }]
            : [],
        location: "harvest",
        equippedSlot: null,
        isLocked: false,
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
    next = { ...next, inventory: addStack(next.inventory, itemConfigId, quantity) };
    summary.stackItems.push({ itemConfigId, quantity: quantity.toString() });
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
    const inventory =
      salvage.enhanceStone > 0
        ? addStack(snapshot.inventory, "enhance_stone", salvage.enhanceStone)
        : snapshot.inventory;
    return {
      snapshot: {
        ...snapshot,
        inventory,
        wallet: {
          ...snapshot.wallet,
          spiritStone: decimal(snapshot.wallet.spiritStone)
            .plus(salvage.spiritStone)
            .toFixed(0),
        },
      },
      added: false,
      autoSalvageSpiritStone: salvage.spiritStone,
      autoSalvageEnhanceStone: salvage.enhanceStone,
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
    fixedPower: config.fixedPower.toString(),
    experienceBonusBp: config.experienceBonusBp,
    spiritStoneBonusBp: config.spiritStoneBonusBp,
    dropBonusBp: config.dropBonusBp,
    configVersion: DROP_CONFIG_VERSION,
  };
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
    return uncommon
      ? { spiritStone: 250, enhanceStone: 2 }
      : { spiritStone: 100, enhanceStone: 1 };
  }
  return uncommon
    ? { spiritStone: 200, enhanceStone: 0 }
    : { spiritStone: 80, enhanceStone: 0 };
}

function equipmentFitsSlot(slot: string, equippedSlot: EquippedEquipmentSlot): boolean {
  return slot === "accessory"
    ? equippedSlot === "accessory_left" || equippedSlot === "accessory_right"
    : slot === equippedSlot;
}

/**
 * Only `local-1.0.0` is migrated, and only by adding the cave field it predates.
 * Anything else is returned untouched so that a genuinely corrupt save still
 * fails validation instead of being silently repaired.
 */
function migrateSnapshot(snapshot: unknown): unknown {
  if (!isRecord(snapshot)) return snapshot;
  const config = snapshot.config;
  if (!isRecord(config) || config.version !== GAME_CONFIG_VERSION_PRE_CAVE) {
    return snapshot;
  }
  return {
    ...snapshot,
    cave: { buildings: createEmptyCaveBuildings() },
    config: { ...config, version: GAME_CONFIG_VERSION },
  };
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
    isNewcomerTaskList(value.newcomerTasks) &&
    isRecord(value.unlocks) &&
    typeof value.unlocks.partner === "boolean" &&
    typeof value.unlocks.cave === "boolean" &&
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
    isDecimalString(value.experiencePerSecond) &&
    isDecimalString(value.spiritStonePerMinute) &&
    isDecimalString(value.loadoutFixedPower) &&
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
      !isIntegerBetween(technique.star, 1, 10) ||
      !isIntegerBetween(technique.duplicateCount, 0, 1_000_000_000) ||
      (equippedSlot !== null && equippedSlot !== config.slot) ||
      !isDecimalString(technique.fixedPower) ||
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
      !isDecimalString(equipment.fixedPower) ||
      !isIntegerBetween(equipment.enhanceLevel, 0, 20) ||
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

function isNewcomerTaskList(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== NEWCOMER_TASK_CONFIGS.length) {
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
      !NEWCOMER_TASK_CONFIGS.some((config) => config.id === task.taskConfigId)
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
  return (
    Array.isArray(value) &&
    value.length <= 16 &&
    value.every(
      (affix) =>
        isRecord(affix) &&
        (affix.stat === "experience_bonus" ||
          affix.stat === "spirit_stone_bonus" ||
          affix.stat === "drop_bonus") &&
        isIntegerBetween(affix.valueBp, 0, 1_000_000),
    )
  );
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
