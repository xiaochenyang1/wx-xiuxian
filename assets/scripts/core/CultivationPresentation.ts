import type { BootstrapSnapshot } from "@cultivation-diary/shared";
import {
  compareBigNumberStrings,
  subtractBigNumberStrings,
} from "./ClientNumber";

export type CultivationPresentationTrigger =
  | "power_change"
  | "level_up"
  | "breakthrough";

export type CultivationPresentationKind = CultivationPresentationTrigger;

export interface CultivationPresentationPlan {
  readonly accountId: string;
  readonly playerId: string;
  readonly kind: CultivationPresentationKind;
  readonly fromLevel: number;
  readonly toLevel: number;
  readonly levelGain: number;
  readonly fromRealmName: string;
  readonly toRealmName: string;
  readonly fromPower: string;
  readonly toPower: string;
  readonly powerDelta: string;
  readonly powerDirection: "increase" | "decrease" | "unchanged";
}

export function planCultivationPresentation(
  previous: BootstrapSnapshot | null | undefined,
  current: BootstrapSnapshot,
  trigger: CultivationPresentationTrigger,
): CultivationPresentationPlan | null {
  if (
    !previous ||
    previous.account.id !== current.account.id ||
    previous.player.id !== current.player.id
  ) {
    return null;
  }

  let powerComparison: number;
  let powerDelta: string;
  try {
    powerComparison = compareBigNumberStrings(
      current.progress.totalPower,
      previous.progress.totalPower,
    );
    powerDelta = subtractBigNumberStrings(
      current.progress.totalPower,
      previous.progress.totalPower,
    );
  } catch {
    return null;
  }

  if (!isTriggerConsistent(previous, current, trigger, powerComparison)) {
    return null;
  }

  return {
    accountId: current.account.id,
    playerId: current.player.id,
    kind: trigger,
    fromLevel: previous.progress.level,
    toLevel: current.progress.level,
    levelGain: Math.max(0, current.progress.level - previous.progress.level),
    fromRealmName: previous.progress.realmName,
    toRealmName: current.progress.realmName,
    fromPower: previous.progress.totalPower,
    toPower: current.progress.totalPower,
    powerDelta,
    powerDirection:
      powerComparison > 0
        ? "increase"
        : powerComparison < 0
          ? "decrease"
          : "unchanged",
  };
}

export function mergeCultivationPresentationPlans(
  previous: CultivationPresentationPlan,
  current: CultivationPresentationPlan,
): CultivationPresentationPlan | null {
  if (
    previous.accountId !== current.accountId ||
    previous.playerId !== current.playerId ||
    previous.toLevel !== current.fromLevel ||
    previous.toRealmName !== current.fromRealmName ||
    previous.toPower !== current.fromPower
  ) {
    return null;
  }

  let powerComparison: number;
  let powerDelta: string;
  try {
    powerComparison = compareBigNumberStrings(
      current.toPower,
      previous.fromPower,
    );
    powerDelta = subtractBigNumberStrings(
      current.toPower,
      previous.fromPower,
    );
  } catch {
    return null;
  }

  const kind = strongerKind(previous.kind, current.kind);
  if (kind === "power_change" && powerComparison === 0) return null;

  return {
    ...current,
    kind,
    fromLevel: previous.fromLevel,
    levelGain: Math.max(0, current.toLevel - previous.fromLevel),
    fromRealmName: previous.fromRealmName,
    fromPower: previous.fromPower,
    powerDelta,
    powerDirection:
      powerComparison > 0
        ? "increase"
        : powerComparison < 0
          ? "decrease"
          : "unchanged",
  };
}

function isTriggerConsistent(
  previous: BootstrapSnapshot,
  current: BootstrapSnapshot,
  trigger: CultivationPresentationTrigger,
  powerComparison: number,
): boolean {
  if (trigger === "power_change") return powerComparison !== 0;

  const levelIncreased = current.progress.level > previous.progress.level;
  if (!levelIncreased) return false;

  const realmChanged = current.progress.realmId !== previous.progress.realmId;
  return trigger === "breakthrough" ? realmChanged : !realmChanged;
}

function strongerKind(
  previous: CultivationPresentationKind,
  current: CultivationPresentationKind,
): CultivationPresentationKind {
  if (previous === "breakthrough" || current === "breakthrough") {
    return "breakthrough";
  }
  if (previous === "level_up" || current === "level_up") {
    return "level_up";
  }
  return "power_change";
}
