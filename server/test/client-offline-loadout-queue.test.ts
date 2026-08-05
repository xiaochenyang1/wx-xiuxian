import {
  calculateEquipmentContribution,
  calculateTechniqueContribution,
  getEquipmentConfig,
  getTechniqueConfig,
  type AssetQuality,
  type BootstrapSnapshot,
  type EquippedEquipmentSlot,
} from "@cultivation-diary/shared";
import { describe, expect, it } from "vitest";
import {
  MAX_PENDING_LOADOUT_OPERATIONS,
  OFFLINE_LOADOUT_QUEUE_SCHEMA_VERSION,
  acceptOfflineLoadoutHead,
  acceptOfflineLoadoutSettlement,
  appendOfflineLoadoutOperation,
  applyOfflineLoadoutOperations,
  beginOfflineLoadoutHead,
  beginOfflineLoadoutSettlement,
  classifyOfflineLoadoutResume,
  createStoredOfflineLoadoutQueue,
  isStoredOfflineLoadoutQueue,
  restartOfflineLoadoutSettlement,
  type OfflineLoadoutQueueIdentity,
  type PendingLoadoutOperation,
  type StoredOfflineLoadoutQueue,
} from "../../assets/scripts/core/OfflineLoadoutQueue";
import { bootstrapFixture } from "./fixtures/bootstrap";

const IDENTITY: OfflineLoadoutQueueIdentity = {
  accountId: "bc830a7d-c6b7-4918-883e-f1b835c8100e",
  playerId: "9430bd13-5c38-43ef-8ff6-43aac1a17e33",
};

describe("Cocos offline loadout queue", () => {
  it("validates an identity-bound versioned envelope and rejects corrupt ordering", () => {
    const queue = createQueue();

    expect(queue).not.toBeNull();
    expect(queue).toMatchObject({
      schemaVersion: OFFLINE_LOADOUT_QUEUE_SCHEMA_VERSION,
      phase: "needs_settlement",
      expectedPlayerVersion: "7",
      nextSequence: 2,
      settlementRequestPending: false,
      inFlightOperationId: null,
    });
    expect(isStoredOfflineLoadoutQueue(queue, IDENTITY, "7")).toBe(true);
    expect(
      isStoredOfflineLoadoutQueue(queue, { ...IDENTITY, playerId: uuid(900) }, "7"),
    ).toBe(false);
    expect(isStoredOfflineLoadoutQueue(queue, IDENTITY, "8")).toBe(false);

    const validSecond = techniqueUnequip(2, "quiet_breathing_art");
    expect(
      isStoredOfflineLoadoutQueue(
        { ...queue!, nextSequence: 3, operations: [validSecond, queue!.operations[0]] },
        IDENTITY,
        "7",
      ),
    ).toBe(false);
    expect(
      isStoredOfflineLoadoutQueue(
        {
          ...queue!,
          nextSequence: 3,
          operations: [
            queue!.operations[0],
            { ...validSecond, operationId: queue!.operations[0]!.operationId },
          ],
        },
        IDENTITY,
        "7",
      ),
    ).toBe(false);
    expect(
      isStoredOfflineLoadoutQueue({ ...queue!, unexpected: true }, IDENTITY, "7"),
    ).toBe(false);
    const {
      settlementRequestPending: _settlementRequestPending,
      ...missingSettlementRequestPending
    } = queue!;
    expect(
      isStoredOfflineLoadoutQueue(
        missingSettlementRequestPending,
        IDENTITY,
        "7",
      ),
    ).toBe(false);
    expect(
      isStoredOfflineLoadoutQueue(
        { ...queue!, settlementRequestPending: "pending" },
        IDENTITY,
        "7",
      ),
    ).toBe(false);
    expect(
      isStoredOfflineLoadoutQueue(
        {
          ...queue!,
          phase: "replaying",
          settlementRequestPending: true,
          settlementIdempotencyKey: null,
        },
        IDENTITY,
        "7",
      ),
    ).toBe(false);
    expect(
      isStoredOfflineLoadoutQueue(
        {
          ...queue!,
          phase: "replaying",
          settlementIdempotencyKey: uuid(701),
        },
        IDENTITY,
        "7",
      ),
    ).toBe(false);
  });

  it("persists the settlement request marker idempotently and clears it on transitions", () => {
    const queue = createQueue()!;
    const pending = beginOfflineLoadoutSettlement(queue);

    expect(pending).toMatchObject({
      phase: "needs_settlement",
      settlementRequestPending: true,
      settlementIdempotencyKey: uuid(700),
    });
    expect(pending).not.toBe(queue);
    expect(beginOfflineLoadoutSettlement(pending!)).toBe(pending);

    const replaying = acceptOfflineLoadoutSettlement(pending!, "8");
    expect(replaying).toMatchObject({
      phase: "replaying",
      expectedPlayerVersion: "8",
      settlementRequestPending: false,
      settlementIdempotencyKey: null,
    });

    const restarted = restartOfflineLoadoutSettlement(replaying!, uuid(701));
    expect(restarted).toMatchObject({
      phase: "needs_settlement",
      expectedPlayerVersion: "8",
      settlementRequestPending: false,
      settlementIdempotencyKey: uuid(701),
    });
  });

  it("enforces the queue bound and exact append sequence", () => {
    let queue: StoredOfflineLoadoutQueue = createQueue()!;
    for (let sequence = 2; sequence <= MAX_PENDING_LOADOUT_OPERATIONS; sequence += 1) {
      queue = appendOfflineLoadoutOperation(
        queue,
        techniqueEquip(sequence, "quiet_breathing_art"),
      )!;
    }

    expect(queue.operations).toHaveLength(MAX_PENDING_LOADOUT_OPERATIONS);
    expect(isStoredOfflineLoadoutQueue(queue, IDENTITY, "7")).toBe(true);
    expect(
      appendOfflineLoadoutOperation(
        queue,
        techniqueEquip(MAX_PENDING_LOADOUT_OPERATIONS + 1, "quiet_breathing_art"),
      ),
    ).toBeNull();
    expect(
      appendOfflineLoadoutOperation(createQueue()!, techniqueEquip(3, "quiet_breathing_art")),
    ).toBeNull();
    expect(
      isStoredOfflineLoadoutQueue(
        {
          ...queue,
          nextSequence: MAX_PENDING_LOADOUT_OPERATIONS + 2,
        },
        IDENTITY,
        "7",
      ),
    ).toBe(false);

    const overLimit = {
      ...queue,
      nextSequence: MAX_PENDING_LOADOUT_OPERATIONS + 2,
      operations: [
        ...queue.operations,
        techniqueEquip(MAX_PENDING_LOADOUT_OPERATIONS + 1, "quiet_breathing_art"),
      ],
    };
    expect(isStoredOfflineLoadoutQueue(overLimit, IDENTITY, "7")).toBe(false);
  });

  it("preserves a pending settlement key and advances only the FIFO head", () => {
    const created = createQueue()!;
    const queued = appendOfflineLoadoutOperation(
      created,
      techniqueUnequip(2, "quiet_breathing_art"),
    )!;

    const alreadyPending = restartOfflineLoadoutSettlement(queued, uuid(702));
    expect(alreadyPending).toBe(queued);
    expect(alreadyPending?.settlementIdempotencyKey).toBe(uuid(700));

    const replaying = acceptOfflineLoadoutSettlement(queued, "8");
    expect(replaying).toMatchObject({
      phase: "replaying",
      expectedPlayerVersion: "8",
      settlementIdempotencyKey: null,
      inFlightOperationId: null,
    });
    expect(acceptOfflineLoadoutSettlement(replaying!, "9")).toBeNull();
    const awaiting = beginOfflineLoadoutHead(replaying!);
    expect(awaiting).toMatchObject({
      phase: "awaiting_confirmation",
      inFlightOperationId: replaying!.operations[0]!.operationId,
    });
    expect(beginOfflineLoadoutHead(awaiting!)).toBeNull();
    expect(restartOfflineLoadoutSettlement(awaiting!, uuid(704))).toBeNull();
    expect(
      acceptOfflineLoadoutHead(awaiting!, awaiting!.operations[1]!.operationId, "9"),
    ).toBeNull();

    const afterHead = acceptOfflineLoadoutHead(
      awaiting!,
      awaiting!.operations[0]!.operationId,
      "9",
    );
    expect(afterHead).toMatchObject({
      phase: "replaying",
      expectedPlayerVersion: "9",
      nextSequence: 3,
      inFlightOperationId: null,
    });
    expect(afterHead?.operations).toEqual([awaiting!.operations[1]]);
    const finalAwaiting = beginOfflineLoadoutHead(afterHead!);
    expect(
      acceptOfflineLoadoutHead(
        finalAwaiting!,
        finalAwaiting!.operations[0]!.operationId,
        "10",
      ),
    ).toBeNull();

    const restarted = restartOfflineLoadoutSettlement(replaying!, uuid(703));
    expect(restarted).toMatchObject({
      phase: "needs_settlement",
      expectedPlayerVersion: "8",
      settlementIdempotencyKey: uuid(703),
    });
    expect(acceptOfflineLoadoutSettlement(restarted!, "7")).toBeNull();
  });

  it("classifies a persisted in-flight head for idempotent recovery", () => {
    const needsSettlement = createQueue()!;
    const replaying = acceptOfflineLoadoutSettlement(needsSettlement, "8")!;
    const awaiting = beginOfflineLoadoutHead(replaying)!;
    const awaitingWithTail = appendOfflineLoadoutOperation(
      awaiting,
      techniqueUnequip(2, "quiet_breathing_art"),
    );

    expect(awaitingWithTail).toMatchObject({
      phase: "awaiting_confirmation",
      inFlightOperationId: awaiting.operations[0]!.operationId,
      nextSequence: 3,
    });

    expect(classifyOfflineLoadoutResume(needsSettlement, IDENTITY, "7")).toBe(
      "settle",
    );
    expect(classifyOfflineLoadoutResume(needsSettlement, IDENTITY, "8")).toBe(
      "settle",
    );
    expect(classifyOfflineLoadoutResume(needsSettlement, IDENTITY, "9")).toBe(
      "rollback",
    );
    expect(classifyOfflineLoadoutResume(replaying, IDENTITY, "8")).toBe("drain");
    expect(classifyOfflineLoadoutResume(replaying, IDENTITY, "9")).toBe(
      "rollback",
    );
    expect(classifyOfflineLoadoutResume(awaiting, IDENTITY, "8")).toBe("drain");
    expect(classifyOfflineLoadoutResume(awaiting, IDENTITY, "9")).toBe("drain");
    expect(classifyOfflineLoadoutResume(awaiting, IDENTITY, "10")).toBe(
      "rollback",
    );
    expect(classifyOfflineLoadoutResume(awaiting, IDENTITY, "7")).toBe(
      "rollback",
    );
    expect(
      classifyOfflineLoadoutResume(
        awaiting,
        { ...IDENTITY, accountId: uuid(705) },
        "9",
      ),
    ).toBe("rollback");
  });

  it("optimistically replaces and unequips techniques with exact derived stats", () => {
    const authoritative = bootstrapWithLoadout({
      techniques: [
        technique("quiet_breathing_art", "mind"),
        technique("azure_cloud_heart_manual", null),
        technique("spirit_gathering_secret", "secret"),
      ],
      equipment: [],
    });
    const before = cloneBootstrap(authoritative);

    const projected = applyOfflineLoadoutOperations(authoritative, [
      techniqueEquip(1, "azure_cloud_heart_manual"),
      techniqueUnequip(2, "spirit_gathering_secret"),
    ]);

    expect(projected).not.toBeNull();
    expect(
      projected?.techniques.map((entry) => [entry.techniqueConfigId, entry.equippedSlot]),
    ).toEqual([
      ["quiet_breathing_art", null],
      ["azure_cloud_heart_manual", "mind"],
      ["spirit_gathering_secret", null],
    ]);
    expect(projected?.progress).toMatchObject({
      totalPower: "250",
      loadoutFixedPower: "150",
      experienceBonusBp: 750,
      spiritStoneBonusBp: 0,
      dropBonusBp: 0,
      experiencePerSecond: "1.075",
      spiritStonePerMinute: "1",
    });
    expect(authoritative).toEqual(before);
    expect(projected).not.toBe(authoritative);
    expect(projected?.techniques).not.toBe(authoritative.techniques);
  });

  it("moves, replaces, and unequips equipment without mutating the authority", () => {
    const swordOne = equipment(
      uuid(101),
      "ironwood_sword",
      "common",
      0,
      "equipped",
      "weapon",
    );
    const swordTwo = equipment(
      uuid(102),
      "ironwood_sword",
      "uncommon",
      2,
      "bag",
      null,
      [{ stat: "experience_bonus", valueBp: 100 }],
    );
    const ringOne = equipment(
      uuid(103),
      "jade_spirit_ring",
      "common",
      0,
      "equipped",
      "accessory_left",
      [{ stat: "spirit_stone_bonus", valueBp: 200 }],
    );
    const ringTwo = equipment(
      uuid(104),
      "jade_spirit_ring",
      "common",
      0,
      "equipped",
      "accessory_right",
      [{ stat: "drop_bonus", valueBp: 300 }],
    );
    const authoritative = bootstrapWithLoadout({
      techniques: [],
      equipment: [swordOne, swordTwo, ringOne, ringTwo],
    });
    const before = cloneBootstrap(authoritative);
    const firstTwoOperations: PendingLoadoutOperation[] = [
      equipmentEquip(1, swordTwo.id, "weapon"),
      equipmentEquip(2, ringOne.id, "accessory_right"),
    ];

    const moved = applyOfflineLoadoutOperations(authoritative, firstTwoOperations);
    expect(moved?.equipment.find((item) => item.id === swordOne.id)).toMatchObject({
      location: "bag",
      equippedSlot: null,
    });
    expect(moved?.equipment.find((item) => item.id === swordTwo.id)).toMatchObject({
      location: "equipped",
      equippedSlot: "weapon",
    });
    expect(moved?.equipment.find((item) => item.id === ringOne.id)).toMatchObject({
      location: "equipped",
      equippedSlot: "accessory_right",
    });
    expect(moved?.equipment.find((item) => item.id === ringTwo.id)).toMatchObject({
      location: "bag",
      equippedSlot: null,
    });

    const projected = applyOfflineLoadoutOperations(authoritative, [
      ...firstTwoOperations,
      equipmentUnequip(3, ringOne.id),
    ]);
    expect(projected?.equipment.filter((item) => item.location === "equipped")).toEqual([
      expect.objectContaining({ id: swordTwo.id, equippedSlot: "weapon" }),
    ]);
    expect(projected?.progress).toMatchObject({
      totalPower: "244",
      loadoutFixedPower: "144",
      experienceBonusBp: 100,
      spiritStoneBonusBp: 0,
      dropBonusBp: 0,
      experiencePerSecond: "1.01",
      spiritStonePerMinute: "1",
    });
    expect(authoritative).toEqual(before);
  });

  it.each([
    ["ironwood_sword", "weapon"],
    ["cloudweave_robe", "armor"],
    ["jade_spirit_ring", "accessory_left"],
    ["jade_spirit_ring", "accessory_right"],
    ["mist_crane_mount", "mount"],
    ["moonfox_companion", "pet"],
  ] as const)("accepts %s in the %s loadout slot", (equipmentConfigId, equippedSlot) => {
    const target = equipment(uuid(201), equipmentConfigId, "common", 0, "bag", null);
    const authoritative = bootstrapWithLoadout({ techniques: [], equipment: [target] });

    const projected = applyOfflineLoadoutOperations(authoritative, [
      equipmentEquip(1, target.id, equippedSlot),
    ]);

    expect(projected?.equipment[0]).toMatchObject({
      location: "equipped",
      equippedSlot,
    });
  });

  it("rejects invalid assets, slots, duplicates, ordering, levels, and dependencies", () => {
    const sword = equipment(uuid(301), "ironwood_sword", "common", 0, "bag", null);
    const authoritative = bootstrapWithLoadout({
      techniques: [technique("quiet_breathing_art", null)],
      equipment: [sword],
    });

    expect(
      applyOfflineLoadoutOperations(authoritative, [
        techniqueEquip(1, "missing_technique"),
      ]),
    ).toBeNull();
    expect(
      applyOfflineLoadoutOperations(authoritative, [
        equipmentEquip(1, sword.id, "armor"),
      ]),
    ).toBeNull();
    expect(
      applyOfflineLoadoutOperations(authoritative, [equipmentUnequip(1, sword.id)]),
    ).toBeNull();
    expect(
      applyOfflineLoadoutOperations(authoritative, [
        techniqueEquip(2, "quiet_breathing_art"),
        techniqueUnequip(1, "quiet_breathing_art"),
      ]),
    ).toBeNull();

    const duplicateId = techniqueUnequip(2, "quiet_breathing_art");
    expect(
      applyOfflineLoadoutOperations(authoritative, [
        techniqueEquip(1, "quiet_breathing_art"),
        { ...duplicateId, operationId: uuid(1) },
      ]),
    ).toBeNull();
    expect(
      applyOfflineLoadoutOperations(authoritative, [
        techniqueEquip(1, "quiet_breathing_art"),
        techniqueEquip(2, "quiet_breathing_art"),
        techniqueUnequip(3, "quiet_breathing_art"),
        techniqueUnequip(4, "quiet_breathing_art"),
      ]),
    ).toBeNull();

    const duplicateAsset = cloneBootstrap(authoritative);
    duplicateAsset.equipment.push({ ...duplicateAsset.equipment[0]! });
    expect(applyOfflineLoadoutOperations(duplicateAsset, [])).toBeNull();

    const invalidLevel = cloneBootstrap(authoritative);
    invalidLevel.progress.level = 1_001;
    expect(
      applyOfflineLoadoutOperations(invalidLevel, [
        equipmentEquip(1, sword.id, "weapon"),
      ]),
    ).toBeNull();
  });
});

function createQueue() {
  return createStoredOfflineLoadoutQueue(
    IDENTITY,
    "7",
    uuid(700),
    techniqueEquip(1, "quiet_breathing_art"),
  );
}

function techniqueEquip(
  sequence: number,
  techniqueConfigId: string,
): PendingLoadoutOperation {
  return {
    operationId: uuid(sequence),
    sequence,
    kind: "technique.equip",
    techniqueConfigId,
  };
}

function techniqueUnequip(
  sequence: number,
  techniqueConfigId: string,
): PendingLoadoutOperation {
  return {
    operationId: uuid(sequence),
    sequence,
    kind: "technique.unequip",
    techniqueConfigId,
  };
}

function equipmentEquip(
  sequence: number,
  equipmentInstanceId: string,
  equippedSlot: EquippedEquipmentSlot,
): PendingLoadoutOperation {
  return {
    operationId: uuid(sequence),
    sequence,
    kind: "equipment.equip",
    equipmentInstanceId,
    equippedSlot,
  };
}

function equipmentUnequip(
  sequence: number,
  equipmentInstanceId: string,
): PendingLoadoutOperation {
  return {
    operationId: uuid(sequence),
    sequence,
    kind: "equipment.unequip",
    equipmentInstanceId,
  };
}

function bootstrapWithLoadout(input: {
  techniques: BootstrapSnapshot["techniques"];
  equipment: BootstrapSnapshot["equipment"];
}): BootstrapSnapshot {
  const bootstrap = bootstrapFixture();
  bootstrap.techniques = input.techniques;
  bootstrap.equipment = input.equipment;
  const recalculated = applyOfflineLoadoutOperations(bootstrap, []);
  if (!recalculated) throw new Error("Invalid loadout fixture");
  return recalculated;
}

function technique(
  techniqueConfigId: string,
  equippedSlot: string | null,
): BootstrapSnapshot["techniques"][number] {
  const config = getTechniqueConfig(techniqueConfigId);
  const contribution = calculateTechniqueContribution({ techniqueConfigId, star: 1 });
  return {
    techniqueConfigId,
    displayName: config.displayName,
    quality: config.quality,
    slot: config.slot,
    star: 1,
    duplicateCount: 0,
    equippedSlot,
    ...contribution,
    configVersion: "mvp-0.3.0",
  };
}

function equipment(
  id: string,
  equipmentConfigId: string,
  quality: AssetQuality,
  enhanceLevel: number,
  location: "bag" | "equipped",
  equippedSlot: EquippedEquipmentSlot | null,
  rolledAffixes: unknown = [],
): BootstrapSnapshot["equipment"][number] {
  const config = getEquipmentConfig(equipmentConfigId);
  const contribution = calculateEquipmentContribution({
    equipmentConfigId,
    quality,
    enhanceLevel,
    rolledAffixes,
  });
  return {
    id,
    equipmentConfigId,
    displayName: config.displayName,
    quality,
    slot: config.slot,
    fixedPower: contribution.fixedPower,
    enhanceLevel,
    rolledAffixes,
    location,
    equippedSlot,
    isLocked: false,
    configVersion: "mvp-0.3.0",
  };
}

function cloneBootstrap(bootstrap: BootstrapSnapshot): BootstrapSnapshot {
  return JSON.parse(JSON.stringify(bootstrap)) as BootstrapSnapshot;
}

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}
