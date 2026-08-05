import type { BootstrapSnapshot } from "@cultivation-diary/shared";

export function bootstrapFixture(): BootstrapSnapshot {
  return {
    account: { id: "bc830a7d-c6b7-4918-883e-f1b835c8100e" },
    player: {
      id: "9430bd13-5c38-43ef-8ff6-43aac1a17e33",
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
      requiredExperience: "107",
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
    inventory: { bagCapacity: 50, stacks: [] },
    techniques: [],
    equipment: [],
    harvestChest: { pendingCount: 0, entries: [] },
    newcomerTasks: [],
    unlocks: { partner: false, cave: false },
    settings: {
      autoSalvageCommon: true,
      autoSalvageUncommon: true,
      partnerUnlockNoticeSeen: false,
      selectedTab: "cultivation",
    },
    activeEffects: [],
    config: { version: "mvp-0.3.0" },
    offlineSettlement: null,
  };
}
