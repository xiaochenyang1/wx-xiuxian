import { Type } from "@sinclair/typebox";

const nullableString = Type.Union([Type.String(), Type.Null()]);

const progressionEventSchema = Type.Union([
  Type.Object({
    type: Type.Literal("level_up"),
    fromLevel: Type.Integer(),
    toLevel: Type.Integer(),
  }),
  Type.Object({
    type: Type.Literal("breakthrough_ready"),
    level: Type.Integer(),
  }),
  Type.Object({
    type: Type.Literal("version_cap_reached"),
    level: Type.Integer(),
  }),
]);

export const dropRewardSummarySchema = Type.Object({
  configVersion: Type.String(),
  stackItems: Type.Array(
    Type.Object({
      itemConfigId: Type.String(),
      quantity: Type.String(),
    }),
  ),
  equipmentCount: Type.Integer({ minimum: 0 }),
  techniqueCount: Type.Integer({ minimum: 0 }),
  harvestChestAdded: Type.Integer({ minimum: 0 }),
  techniqueDuplicates: Type.Integer({ minimum: 0 }),
  autoSalvagedCount: Type.Integer({ minimum: 0 }),
  mailedCount: Type.Integer({ minimum: 0 }),
  autoSalvageSpiritStone: Type.String(),
  autoSalvageEnhanceStone: Type.String(),
});

export const offlineSettlementSummarySchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  fromTime: Type.String({ format: "date-time" }),
  toTime: Type.String({ format: "date-time" }),
  effectiveSeconds: Type.Integer({ minimum: 0, maximum: 86_400 }),
  efficiencyBp: Type.Integer({ minimum: 0 }),
  experienceGained: Type.String(),
  experienceDiscarded: Type.String(),
  spiritStoneGained: Type.String(),
  dropAttempts: Type.Integer({ minimum: 0 }),
  drops: dropRewardSummarySchema,
  events: Type.Array(progressionEventSchema),
  newcomerRewardGranted: Type.Boolean(),
});

export const bootstrapSnapshotSchema = Type.Object({
  account: Type.Object({ id: Type.String({ format: "uuid" }) }),
  player: Type.Object({
    id: Type.String({ format: "uuid" }),
    displayName: Type.String(),
    avatarVariant: Type.Union([
      Type.Literal("neutral"),
      Type.Literal("male"),
      Type.Literal("female"),
    ]),
    freeRenameAvailable: Type.Boolean(),
  }),
  progress: Type.Object({
    level: Type.Integer({ minimum: 1 }),
    realmId: Type.String(),
    realmName: Type.String(),
    stage: Type.Union([
      Type.Literal("early"),
      Type.Literal("middle"),
      Type.Literal("late"),
      Type.Literal("perfect"),
    ]),
    title: Type.String(),
    experience: Type.String(),
    requiredExperience: Type.String(),
    status: Type.Union([
      Type.Literal("gaining"),
      Type.Literal("breakthrough_ready"),
      Type.Literal("version_cap"),
    ]),
    totalPower: Type.String(),
    cultivationReserve: Type.String(),
    experiencePerSecond: Type.String(),
    spiritStonePerMinute: Type.String(),
    loadoutFixedPower: Type.String(),
    experienceBonusBp: Type.Integer({ minimum: 0 }),
    spiritStoneBonusBp: Type.Integer({ minimum: 0 }),
    dropBonusBp: Type.Integer({ minimum: 0 }),
  }),
  wallet: Type.Object({
    spiritStone: Type.String(),
    immortalJade: Type.String(),
    lifetimeSpiritStoneEarned: Type.String(),
  }),
  inventory: Type.Object({
    bagCapacity: Type.Integer({ minimum: 50, maximum: 200 }),
    stacks: Type.Array(
      Type.Object({
        itemConfigId: Type.String(),
        displayName: Type.String(),
        quantity: Type.String(),
      }),
    ),
  }),
  techniques: Type.Array(
    Type.Object({
      techniqueConfigId: Type.String(),
      displayName: Type.String(),
      quality: Type.String(),
      slot: Type.String(),
      star: Type.Integer(),
      duplicateCount: Type.Integer(),
      equippedSlot: nullableString,
      fixedPower: Type.String(),
      experienceBonusBp: Type.Integer({ minimum: 0 }),
      spiritStoneBonusBp: Type.Integer({ minimum: 0 }),
      dropBonusBp: Type.Integer({ minimum: 0 }),
      configVersion: Type.String(),
    }),
  ),
  equipment: Type.Array(
    Type.Object({
      id: Type.String({ format: "uuid" }),
      equipmentConfigId: Type.String(),
      displayName: Type.String(),
      quality: Type.String(),
      slot: Type.String(),
      fixedPower: Type.String(),
      enhanceLevel: Type.Integer(),
      rolledAffixes: Type.Unknown(),
      location: Type.String(),
      equippedSlot: nullableString,
      isLocked: Type.Boolean(),
      configVersion: Type.String(),
    }),
  ),
  harvestChest: Type.Object({
    pendingCount: Type.Integer({ minimum: 0 }),
    entries: Type.Array(
      Type.Object({
        id: Type.String({ format: "uuid" }),
        entryType: Type.String(),
        equipmentInstanceId: nullableString,
        techniqueConfigId: nullableString,
        assetConfigId: Type.String(),
        displayName: Type.String(),
        quality: Type.String(),
        valueScore: Type.String(),
        acquiredAt: Type.String({ format: "date-time" }),
      }),
    ),
  }),
  newcomerTasks: Type.Array(
    Type.Object({
      taskConfigId: Type.String(),
      progress: Type.String(),
      completedAt: nullableString,
      claimedAt: nullableString,
    }),
  ),
  unlocks: Type.Object({
    partner: Type.Boolean(),
    cave: Type.Boolean(),
  }),
  settings: Type.Object({
    autoSalvageCommon: Type.Boolean(),
    autoSalvageUncommon: Type.Boolean(),
    partnerUnlockNoticeSeen: Type.Boolean(),
    selectedTab: Type.String(),
  }),
  activeEffects: Type.Array(Type.Unknown()),
  config: Type.Object({ version: Type.String() }),
  offlineSettlement: Type.Union([offlineSettlementSummarySchema, Type.Null()]),
});
