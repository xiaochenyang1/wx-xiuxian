import {
  calculateLoadoutBonuses,
  calculateOnlineExperiencePerSecond,
  calculateSpiritStonePerMinute,
  calculateTotalPower,
  getEquipmentConfig,
  getTechniqueConfig,
  isAssetQuality,
  type BootstrapSnapshot,
  type EquippedEquipmentSlot,
} from "@cultivation-diary/shared";

export const OFFLINE_LOADOUT_QUEUE_SCHEMA_VERSION = 1 as const;
export const MAX_PENDING_LOADOUT_OPERATIONS = 64;

export interface OfflineLoadoutQueueIdentity {
  readonly accountId: string;
  readonly playerId: string;
}

interface PendingLoadoutOperationBase {
  readonly operationId: string;
  readonly sequence: number;
}

export interface PendingTechniqueEquipOperation
  extends PendingLoadoutOperationBase {
  readonly kind: "technique.equip";
  readonly techniqueConfigId: string;
}

export interface PendingTechniqueUnequipOperation
  extends PendingLoadoutOperationBase {
  readonly kind: "technique.unequip";
  readonly techniqueConfigId: string;
}

export interface PendingEquipmentEquipOperation
  extends PendingLoadoutOperationBase {
  readonly kind: "equipment.equip";
  readonly equipmentInstanceId: string;
  readonly equippedSlot: EquippedEquipmentSlot;
}

export interface PendingEquipmentUnequipOperation
  extends PendingLoadoutOperationBase {
  readonly kind: "equipment.unequip";
  readonly equipmentInstanceId: string;
}

export type PendingLoadoutOperation =
  | PendingTechniqueEquipOperation
  | PendingTechniqueUnequipOperation
  | PendingEquipmentEquipOperation
  | PendingEquipmentUnequipOperation;

interface StoredOfflineLoadoutQueueBase extends OfflineLoadoutQueueIdentity {
  readonly schemaVersion: typeof OFFLINE_LOADOUT_QUEUE_SCHEMA_VERSION;
  readonly expectedPlayerVersion: string;
  readonly nextSequence: number;
  readonly settlementRequestPending: boolean;
  readonly operations: readonly PendingLoadoutOperation[];
}

export interface StoredOfflineLoadoutQueueNeedsSettlement
  extends StoredOfflineLoadoutQueueBase {
  readonly phase: "needs_settlement";
  readonly settlementIdempotencyKey: string;
  readonly inFlightOperationId: null;
}

export interface StoredOfflineLoadoutQueueReplaying
  extends StoredOfflineLoadoutQueueBase {
  readonly phase: "replaying";
  readonly settlementIdempotencyKey: null;
  readonly inFlightOperationId: null;
}

export interface StoredOfflineLoadoutQueueAwaitingConfirmation
  extends StoredOfflineLoadoutQueueBase {
  readonly phase: "awaiting_confirmation";
  readonly settlementIdempotencyKey: null;
  readonly inFlightOperationId: string;
}

export type StoredOfflineLoadoutQueue =
  | StoredOfflineLoadoutQueueNeedsSettlement
  | StoredOfflineLoadoutQueueReplaying
  | StoredOfflineLoadoutQueueAwaitingConfirmation;

export type OfflineLoadoutResumeAction = "settle" | "drain" | "rollback";

export function isStoredOfflineLoadoutQueue(
  value: unknown,
  identity: OfflineLoadoutQueueIdentity,
  expectedPlayerVersion: string,
): value is StoredOfflineLoadoutQueue {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schemaVersion",
      "phase",
      "accountId",
      "playerId",
      "expectedPlayerVersion",
      "nextSequence",
      "settlementRequestPending",
      "settlementIdempotencyKey",
      "inFlightOperationId",
      "operations",
    ]) ||
    value.schemaVersion !== OFFLINE_LOADOUT_QUEUE_SCHEMA_VERSION ||
    !isUuidString(value.accountId) ||
    !isUuidString(value.playerId) ||
    value.accountId !== identity.accountId ||
    value.playerId !== identity.playerId ||
    !isUnsignedIntegerString(value.expectedPlayerVersion) ||
    value.expectedPlayerVersion !== expectedPlayerVersion ||
    !isPositiveSafeInteger(value.nextSequence) ||
    typeof value.settlementRequestPending !== "boolean" ||
    !Array.isArray(value.operations) ||
    value.operations.length === 0 ||
    value.operations.length > MAX_PENDING_LOADOUT_OPERATIONS
  ) {
    return false;
  }

  if (
    (value.phase === "needs_settlement" &&
      (!isUuidString(value.settlementIdempotencyKey) ||
        value.inFlightOperationId !== null)) ||
    (value.phase === "replaying" &&
      (value.settlementIdempotencyKey !== null ||
        value.settlementRequestPending ||
        value.inFlightOperationId !== null)) ||
    (value.phase === "awaiting_confirmation" &&
      (value.settlementIdempotencyKey !== null ||
        value.settlementRequestPending ||
        !isUuidString(value.inFlightOperationId) ||
        value.inFlightOperationId !== value.operations[0]?.operationId)) ||
    (value.phase !== "needs_settlement" &&
      value.phase !== "replaying" &&
      value.phase !== "awaiting_confirmation")
  ) {
    return false;
  }

  return (
    areContiguousUniqueOperations(value.operations) &&
    value.nextSequence === value.operations[value.operations.length - 1]!.sequence + 1
  );
}

export function createStoredOfflineLoadoutQueue(
  identity: OfflineLoadoutQueueIdentity,
  expectedPlayerVersion: string,
  settlementIdempotencyKey: string,
  firstOperation: PendingLoadoutOperation,
): StoredOfflineLoadoutQueueNeedsSettlement | null {
  if (firstOperation.sequence !== 1) return null;
  const queue: StoredOfflineLoadoutQueueNeedsSettlement = {
    schemaVersion: OFFLINE_LOADOUT_QUEUE_SCHEMA_VERSION,
    phase: "needs_settlement",
    accountId: identity.accountId,
    playerId: identity.playerId,
    expectedPlayerVersion,
    nextSequence: 2,
    settlementRequestPending: false,
    settlementIdempotencyKey,
    inFlightOperationId: null,
    operations: [cloneOperation(firstOperation)],
  };
  return isStoredOfflineLoadoutQueue(queue, identity, expectedPlayerVersion)
    ? queue
    : null;
}

export function appendOfflineLoadoutOperation(
  queue: StoredOfflineLoadoutQueue,
  operation: PendingLoadoutOperation,
): StoredOfflineLoadoutQueue | null {
  const identity = queueIdentity(queue);
  if (
    !isStoredOfflineLoadoutQueue(queue, identity, queue.expectedPlayerVersion) ||
    queue.operations.length >= MAX_PENDING_LOADOUT_OPERATIONS ||
    operation.sequence !== queue.nextSequence ||
    queue.nextSequence >= Number.MAX_SAFE_INTEGER ||
    queue.operations.some((candidate) => candidate.operationId === operation.operationId)
  ) {
    return null;
  }

  const operations = [...queue.operations, cloneOperation(operation)];
  const nextSequence = queue.nextSequence + 1;
  const next: StoredOfflineLoadoutQueue = { ...queue, nextSequence, operations };
  return isStoredOfflineLoadoutQueue(next, identity, next.expectedPlayerVersion)
    ? next
    : null;
}

export function restartOfflineLoadoutSettlement(
  queue: StoredOfflineLoadoutQueue,
  settlementIdempotencyKey: string,
): StoredOfflineLoadoutQueueNeedsSettlement | null {
  const identity = queueIdentity(queue);
  if (!isStoredOfflineLoadoutQueue(queue, identity, queue.expectedPlayerVersion)) {
    return null;
  }
  if (queue.phase === "needs_settlement") return queue;
  if (queue.phase === "awaiting_confirmation") return null;
  if (!isUuidString(settlementIdempotencyKey)) return null;

  return {
    ...queue,
    phase: "needs_settlement",
    settlementRequestPending: false,
    settlementIdempotencyKey,
    inFlightOperationId: null,
  };
}

export function beginOfflineLoadoutSettlement(
  queue: StoredOfflineLoadoutQueue,
): StoredOfflineLoadoutQueueNeedsSettlement | null {
  const identity = queueIdentity(queue);
  if (
    queue.phase !== "needs_settlement" ||
    !isStoredOfflineLoadoutQueue(queue, identity, queue.expectedPlayerVersion)
  ) {
    return null;
  }
  return queue.settlementRequestPending
    ? queue
    : { ...queue, settlementRequestPending: true };
}

export function acceptOfflineLoadoutSettlement(
  queue: StoredOfflineLoadoutQueue,
  expectedPlayerVersion: string,
): StoredOfflineLoadoutQueueReplaying | null {
  const identity = queueIdentity(queue);
  if (
    queue.phase !== "needs_settlement" ||
    !isStoredOfflineLoadoutQueue(queue, identity, queue.expectedPlayerVersion) ||
    !isNextVersion(queue.expectedPlayerVersion, expectedPlayerVersion)
  ) {
    return null;
  }

  return {
    ...queue,
    phase: "replaying",
    expectedPlayerVersion,
    settlementRequestPending: false,
    settlementIdempotencyKey: null,
    inFlightOperationId: null,
  };
}

export function beginOfflineLoadoutHead(
  queue: StoredOfflineLoadoutQueue,
): StoredOfflineLoadoutQueueAwaitingConfirmation | null {
  const identity = queueIdentity(queue);
  const head = queue.operations[0];
  if (
    queue.phase !== "replaying" ||
    !head ||
    !isStoredOfflineLoadoutQueue(queue, identity, queue.expectedPlayerVersion)
  ) {
    return null;
  }

  return {
    ...queue,
    phase: "awaiting_confirmation",
    settlementIdempotencyKey: null,
    inFlightOperationId: head.operationId,
  };
}

export function acceptOfflineLoadoutHead(
  queue: StoredOfflineLoadoutQueue,
  operationId: string,
  expectedPlayerVersion: string,
): StoredOfflineLoadoutQueueReplaying | null {
  const identity = queueIdentity(queue);
  const head = queue.operations[0];
  if (
    queue.phase !== "awaiting_confirmation" ||
    !head ||
    head.operationId !== operationId ||
    queue.inFlightOperationId !== operationId ||
    !isStoredOfflineLoadoutQueue(queue, identity, queue.expectedPlayerVersion) ||
    !isSameOrNextVersion(queue.expectedPlayerVersion, expectedPlayerVersion)
  ) {
    return null;
  }

  const operations = queue.operations.slice(1);
  if (operations.length === 0) return null;
  return {
    ...queue,
    phase: "replaying",
    expectedPlayerVersion,
    settlementIdempotencyKey: null,
    inFlightOperationId: null,
    operations,
  };
}

export function classifyOfflineLoadoutResume(
  queue: StoredOfflineLoadoutQueue,
  identity: OfflineLoadoutQueueIdentity,
  authoritativePlayerVersion: string,
): OfflineLoadoutResumeAction {
  if (
    !isStoredOfflineLoadoutQueue(
      queue,
      queueIdentity(queue),
      queue.expectedPlayerVersion,
    ) ||
    queue.accountId !== identity.accountId ||
    queue.playerId !== identity.playerId ||
    !isUnsignedIntegerString(authoritativePlayerVersion)
  ) {
    return "rollback";
  }
  if (queue.phase === "awaiting_confirmation") {
    return isSameOrNextVersion(
      queue.expectedPlayerVersion,
      authoritativePlayerVersion,
    )
      ? "drain"
      : "rollback";
  }
  if (queue.phase === "needs_settlement") {
    return isSameOrNextVersion(
      queue.expectedPlayerVersion,
      authoritativePlayerVersion,
    )
      ? "settle"
      : "rollback";
  }
  if (authoritativePlayerVersion !== queue.expectedPlayerVersion) {
    return "rollback";
  }
  return "drain";
}

export function applyOfflineLoadoutOperations(
  authoritativeBootstrap: BootstrapSnapshot,
  operations: readonly PendingLoadoutOperation[],
): BootstrapSnapshot | null {
  if (
    operations.length > MAX_PENDING_LOADOUT_OPERATIONS ||
    !areContiguousUniqueOperations(operations)
  ) {
    return null;
  }

  const techniques = authoritativeBootstrap.techniques.map((technique) => ({
    ...technique,
  }));
  const equipment = authoritativeBootstrap.equipment.map((item) => ({ ...item }));

  try {
    if (!isValidLoadoutState(authoritativeBootstrap.progress.level, techniques, equipment)) {
      return null;
    }
    for (const operation of operations) {
      if (
        !applyOperation(
          authoritativeBootstrap.progress.level,
          techniques,
          equipment,
          operation,
        )
      ) {
        return null;
      }
    }
    if (!isValidLoadoutState(authoritativeBootstrap.progress.level, techniques, equipment)) {
      return null;
    }

    const bonuses = calculateLoadoutBonuses({
      techniques: techniques
        .filter((technique) => technique.equippedSlot !== null)
        .map((technique) => ({
          techniqueConfigId: technique.techniqueConfigId,
          star: technique.star,
        })),
      equipment: equipment
        .filter((item) => item.location === "equipped")
        .map((item) => {
          if (!isAssetQuality(item.quality)) {
            throw new RangeError(`Unknown equipment quality: ${item.quality}`);
          }
          return {
            equipmentConfigId: item.equipmentConfigId,
            quality: item.quality,
            enhanceLevel: item.enhanceLevel,
            rolledAffixes: item.rolledAffixes,
          };
        }),
    });
    const level = authoritativeBootstrap.progress.level;

    return {
      ...authoritativeBootstrap,
      progress: {
        ...authoritativeBootstrap.progress,
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
      techniques,
      equipment,
    };
  } catch {
    return null;
  }
}

function applyOperation(
  level: number,
  techniques: BootstrapSnapshot["techniques"],
  equipment: BootstrapSnapshot["equipment"],
  operation: PendingLoadoutOperation,
): boolean {
  if (operation.kind === "technique.equip") {
    const target = techniques.find(
      (technique) => technique.techniqueConfigId === operation.techniqueConfigId,
    );
    if (!target) return false;
    for (const technique of techniques) {
      if (
        technique.techniqueConfigId !== target.techniqueConfigId &&
        technique.equippedSlot === target.slot
      ) {
        technique.equippedSlot = null;
      }
    }
    target.equippedSlot = target.slot;
    return true;
  }

  if (operation.kind === "technique.unequip") {
    const target = techniques.find(
      (technique) => technique.techniqueConfigId === operation.techniqueConfigId,
    );
    if (!target || target.equippedSlot === null) return false;
    target.equippedSlot = null;
    return true;
  }

  const target = equipment.find(
    (item) => item.id === operation.equipmentInstanceId,
  );
  if (!target) return false;

  if (operation.kind === "equipment.unequip") {
    if (target.location !== "equipped" || target.equippedSlot === null) return false;
    target.location = "bag";
    target.equippedSlot = null;
    return true;
  }

  const config = getEquipmentConfig(target.equipmentConfigId);
  if (
    !isCompatibleEquipmentSlot(config.slot, operation.equippedSlot) ||
    level < config.minLevel ||
    level > config.maxLevel
  ) {
    return false;
  }
  if (
    target.location === "equipped" &&
    target.equippedSlot === operation.equippedSlot
  ) {
    return true;
  }

  for (const item of equipment) {
    if (
      item.id !== target.id &&
      item.location === "equipped" &&
      item.equippedSlot === operation.equippedSlot
    ) {
      item.location = "bag";
      item.equippedSlot = null;
    }
  }
  target.location = "equipped";
  target.equippedSlot = operation.equippedSlot;
  return true;
}

function isValidLoadoutState(
  level: number,
  techniques: readonly BootstrapSnapshot["techniques"][number][],
  equipment: readonly BootstrapSnapshot["equipment"][number][],
): boolean {
  const techniqueIds = new Set<string>();
  const techniqueSlots = new Set<string>();
  for (const technique of techniques) {
    if (techniqueIds.has(technique.techniqueConfigId)) return false;
    techniqueIds.add(technique.techniqueConfigId);
    const config = getTechniqueConfig(technique.techniqueConfigId);
    if (technique.slot !== config.slot) return false;
    if (technique.equippedSlot !== null) {
      if (
        technique.equippedSlot !== config.slot ||
        techniqueSlots.has(technique.equippedSlot)
      ) {
        return false;
      }
      techniqueSlots.add(technique.equippedSlot);
    }
  }

  const equipmentIds = new Set<string>();
  const equipmentSlots = new Set<string>();
  for (const item of equipment) {
    if (
      !isUuidString(item.id) ||
      equipmentIds.has(item.id) ||
      !isAssetQuality(item.quality) ||
      !Number.isSafeInteger(item.enhanceLevel) ||
      item.enhanceLevel < 0 ||
      item.enhanceLevel > 20
    ) {
      return false;
    }
    equipmentIds.add(item.id);
    const config = getEquipmentConfig(item.equipmentConfigId);
    if (item.slot !== config.slot) return false;

    if (item.location === "bag") {
      if (item.equippedSlot !== null) return false;
      continue;
    }
    if (
      item.location !== "equipped" ||
      !isEquippedEquipmentSlot(item.equippedSlot) ||
      !isCompatibleEquipmentSlot(config.slot, item.equippedSlot) ||
      level < config.minLevel ||
      level > config.maxLevel ||
      equipmentSlots.has(item.equippedSlot)
    ) {
      return false;
    }
    equipmentSlots.add(item.equippedSlot);
  }
  return true;
}

function areContiguousUniqueOperations(
  value: readonly unknown[],
): value is PendingLoadoutOperation[] {
  let previousSequence: number | null = null;
  const operationIds = new Set<string>();
  for (const candidate of value) {
    if (
      !isPendingLoadoutOperation(candidate) ||
      (previousSequence !== null && candidate.sequence !== previousSequence + 1) ||
      operationIds.has(candidate.operationId)
    ) {
      return false;
    }
    previousSequence = candidate.sequence;
    operationIds.add(candidate.operationId);
  }
  return true;
}

function isPendingLoadoutOperation(value: unknown): value is PendingLoadoutOperation {
  if (!isRecord(value) || !isUuidString(value.operationId) || !isPositiveSafeInteger(value.sequence)) {
    return false;
  }
  if (value.kind === "technique.equip" || value.kind === "technique.unequip") {
    return (
      hasExactKeys(value, ["operationId", "sequence", "kind", "techniqueConfigId"]) &&
      isAssetIdentifier(value.techniqueConfigId)
    );
  }
  if (value.kind === "equipment.equip") {
    return (
      hasExactKeys(value, [
        "operationId",
        "sequence",
        "kind",
        "equipmentInstanceId",
        "equippedSlot",
      ]) &&
      isUuidString(value.equipmentInstanceId) &&
      isEquippedEquipmentSlot(value.equippedSlot)
    );
  }
  if (value.kind === "equipment.unequip") {
    return (
      hasExactKeys(value, ["operationId", "sequence", "kind", "equipmentInstanceId"]) &&
      isUuidString(value.equipmentInstanceId)
    );
  }
  return false;
}

function cloneOperation(operation: PendingLoadoutOperation): PendingLoadoutOperation {
  return { ...operation };
}

function queueIdentity(queue: StoredOfflineLoadoutQueue): OfflineLoadoutQueueIdentity {
  return { accountId: queue.accountId, playerId: queue.playerId };
}

function isCompatibleEquipmentSlot(
  configuredSlot: string,
  equippedSlot: EquippedEquipmentSlot,
): boolean {
  return configuredSlot === "accessory"
    ? equippedSlot === "accessory_left" || equippedSlot === "accessory_right"
    : configuredSlot === equippedSlot;
}

function isEquippedEquipmentSlot(value: unknown): value is EquippedEquipmentSlot {
  return (
    value === "weapon" ||
    value === "armor" ||
    value === "accessory_left" ||
    value === "accessory_right" ||
    value === "mount" ||
    value === "pet"
  );
}

function isNextVersion(current: string, next: string): boolean {
  if (!isUnsignedIntegerString(current) || !isUnsignedIntegerString(next)) {
    return false;
  }
  return incrementUnsignedIntegerString(current) === next;
}

function isSameOrNextVersion(current: string, next: string): boolean {
  return current === next || isNextVersion(current, next);
}

function incrementUnsignedIntegerString(value: string): string {
  const digits = value.split("");
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    const digit = Number(digits[index]);
    if (digit < 9) {
      digits[index] = String(digit + 1);
      return digits.join("");
    }
    digits[index] = "0";
  }
  return `1${digits.join("")}`;
}

function isAssetIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 64;
}

function isUuidString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isUnsignedIntegerString(value: unknown): value is string {
  return typeof value === "string" && value.length <= 160 && /^(?:0|[1-9]\d*)$/.test(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}
