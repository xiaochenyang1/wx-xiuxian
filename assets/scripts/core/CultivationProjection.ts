import {
  accrueRate,
  type BootstrapSnapshot,
} from "@cultivation-diary/shared";
import {
  compareBigNumberStrings,
  sumBigNumberStrings,
  subtractBigNumberStrings,
} from "./ClientNumber";

// Keep the visual projection window bounded between local checkpoints.
export const MAX_LIVE_PROJECTION_MILLISECONDS = 90_000;
const MAX_LIVE_PROJECTION_DELTA_SECONDS = 1;

type CultivationProgress = BootstrapSnapshot["progress"];

export interface LiveCultivationProjection {
  readonly progress: CultivationProgress;
  readonly gainedSinceAnchor: string;
  readonly elapsedWholeSeconds: number;
}

export function liveCultivationSettlementKey(
  progress: CultivationProgress,
): string {
  return JSON.stringify([
    progress.level,
    progress.experience,
    progress.requiredExperience,
    progress.cultivationReserve,
    progress.status,
    progress.settledAt,
    progress.experienceRemainderMicros,
  ]);
}

export function projectLiveCultivation(input: {
  readonly progress: CultivationProgress;
  readonly elapsedMilliseconds: number;
  readonly online: boolean;
}): LiveCultivationProjection {
  const elapsedWholeSeconds = normalizedElapsedSeconds(
    input.elapsedMilliseconds,
    input.online,
  );
  if (elapsedWholeSeconds === 0 || input.progress.status === "breakthrough_ready") {
    return unchangedProjection(input.progress);
  }

  try {
    const accrued = accrueRate({
      ratePerPeriod: input.progress.experiencePerSecond,
      periodSeconds: 1,
      elapsedMilliseconds: elapsedWholeSeconds * 1_000,
      remainderMicros: input.progress.experienceRemainderMicros,
    });
    if (input.progress.status === "version_cap") {
      const cultivationReserve = sumBigNumberStrings([
        input.progress.cultivationReserve,
        accrued.wholeUnits,
      ]);
      return {
        progress: { ...input.progress, cultivationReserve },
        gainedSinceAnchor: nonNegativeDifference(
          cultivationReserve,
          input.progress.cultivationReserve,
        ),
        elapsedWholeSeconds,
      };
    }

    const unboundedExperience = sumBigNumberStrings([
      input.progress.experience,
      accrued.wholeUnits,
    ]);
    // Level, power, rewards, and unlocks remain authoritative. The snapshot's
    // own boundary is the only rule used by this read-only client projection.
    const experience =
      compareBigNumberStrings(
        unboundedExperience,
        input.progress.requiredExperience,
      ) >= 0
        ? input.progress.requiredExperience
        : unboundedExperience;
    return {
      progress: { ...input.progress, experience },
      gainedSinceAnchor: nonNegativeDifference(
        experience,
        input.progress.experience,
      ),
      elapsedWholeSeconds,
    };
  } catch {
    // Invalid or stale authoritative data must stay visible without inventing
    // a client-side correction. The next successful sync replaces it.
    return unchangedProjection(input.progress);
  }
}

export function initialLiveCultivationElapsed(
  synchronizedAt: string | null,
  settledAt: string,
  online: boolean,
): number | null {
  if (!online) return null;
  if (synchronizedAt === null) return 0;

  const synchronizedAtMilliseconds = Date.parse(synchronizedAt);
  const settledAtMilliseconds = Date.parse(settledAt);
  if (
    !Number.isFinite(synchronizedAtMilliseconds) ||
    !Number.isFinite(settledAtMilliseconds)
  ) {
    return null;
  }

  const elapsedMilliseconds = Math.max(
    0,
    synchronizedAtMilliseconds - settledAtMilliseconds,
  );
  // A larger gap is settled by the local save service at offline efficiency.
  return elapsedMilliseconds <= MAX_LIVE_PROJECTION_MILLISECONDS
    ? elapsedMilliseconds
    : null;
}

export function advanceLiveCultivationElapsed(
  currentMilliseconds: number,
  deltaSeconds: number,
  active: boolean,
): number {
  if (
    !active ||
    !Number.isFinite(currentMilliseconds) ||
    currentMilliseconds < 0 ||
    !Number.isFinite(deltaSeconds) ||
    deltaSeconds <= 0 ||
    deltaSeconds > MAX_LIVE_PROJECTION_DELTA_SECONDS
  ) {
    return Math.max(0, Math.min(
      Number.isFinite(currentMilliseconds) ? currentMilliseconds : 0,
      MAX_LIVE_PROJECTION_MILLISECONDS,
    ));
  }
  return Math.min(
    MAX_LIVE_PROJECTION_MILLISECONDS,
    currentMilliseconds + deltaSeconds * 1_000,
  );
}

function normalizedElapsedSeconds(
  elapsedMilliseconds: number,
  online: boolean,
): number {
  if (!online || !Number.isFinite(elapsedMilliseconds) || elapsedMilliseconds <= 0) {
    return 0;
  }
  return Math.floor(
    Math.min(elapsedMilliseconds, MAX_LIVE_PROJECTION_MILLISECONDS) / 1_000,
  );
}

function unchangedProjection(
  progress: CultivationProgress,
): LiveCultivationProjection {
  return {
    progress,
    gainedSinceAnchor: "0",
    elapsedWholeSeconds: 0,
  };
}

function nonNegativeDifference(current: string, initial: string): string {
  const difference = subtractBigNumberStrings(current, initial);
  return compareBigNumberStrings(difference, "0") < 0 ? "0" : difference;
}
