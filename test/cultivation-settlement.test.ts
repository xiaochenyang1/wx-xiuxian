import { describe, expect, it } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import { LocalGameService } from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const START = new Date("2026-01-01T00:00:00.000Z");
const HOUR_SECONDS = 3_600;

function at(offsetSeconds: number): Date {
  return new Date(START.getTime() + offsetSeconds * 1_000);
}

function freshService(): LocalGameService {
  const service = new LocalGameService(new FakePlatformAdapter());
  service.initialize(START);
  return service;
}

describe("online settlement", () => {
  it("accrues experience over a foreground checkpoint", () => {
    const service = freshService();
    const before = service.snapshot.progress.experience;

    service.checkpoint(at(600));

    // Level may have advanced, so compare the derived totals rather than the
    // raw bar, which resets on level-up.
    const after = service.snapshot;
    const advanced =
      after.progress.level > 1 || Number(after.progress.experience) > Number(before);
    expect(advanced).toBe(true);
  });

  it("does not move the snapshot when no time has passed", () => {
    const service = freshService();
    const before = service.snapshot;

    service.checkpoint(START);

    expect(service.snapshot.progress.experience).toBe(before.progress.experience);
    expect(service.snapshot.progress.level).toBe(before.progress.level);
    expect(service.snapshot.wallet.spiritStone).toBe(before.wallet.spiritStone);
  });

  it("ignores a clock that moves backwards", () => {
    const service = freshService();
    service.checkpoint(at(600));
    const before = service.snapshot;

    service.checkpoint(at(300));

    expect(service.snapshot.progress.level).toBe(before.progress.level);
    expect(service.snapshot.progress.experience).toBe(before.progress.experience);
    expect(service.snapshot.wallet.spiritStone).toBe(before.wallet.spiritStone);
  });
});

describe("settlement accumulation invariance", () => {
  // The remainder micros exist so that many small settlements equal one large
  // settlement. If these diverge, a player's yield depends on how often they
  // background the app.
  it("matches 3600 one-second checkpoints against a single one-hour checkpoint", () => {
    const stepwise = freshService();
    for (let second = 1; second <= HOUR_SECONDS; second += 1) {
      stepwise.checkpoint(at(second));
    }

    const single = freshService();
    single.checkpoint(at(HOUR_SECONDS));

    expect(stepwise.snapshot.progress.level).toBe(single.snapshot.progress.level);
    expect(stepwise.snapshot.progress.experience).toBe(
      single.snapshot.progress.experience,
    );
    expect(stepwise.snapshot.wallet.spiritStone).toBe(
      single.snapshot.wallet.spiritStone,
    );
  });

  it("matches 60 one-minute checkpoints against a single one-hour checkpoint", () => {
    const stepwise = freshService();
    for (let minute = 1; minute <= 60; minute += 1) {
      stepwise.checkpoint(at(minute * 60));
    }

    const single = freshService();
    single.checkpoint(at(HOUR_SECONDS));

    expect(stepwise.snapshot.progress.level).toBe(single.snapshot.progress.level);
    expect(stepwise.snapshot.progress.experience).toBe(
      single.snapshot.progress.experience,
    );
    expect(stepwise.snapshot.wallet.spiritStone).toBe(
      single.snapshot.wallet.spiritStone,
    );
  });
});

describe("offline settlement", () => {
  it("applies the configured offline efficiency below the online rate", () => {
    const online = freshService();
    online.checkpoint(at(HOUR_SECONDS));

    const offline = freshService();
    offline.resume(at(HOUR_SECONDS));

    expect(CLIENT_CONFIG.offlineEfficiencyBp).toBeLessThan(10_000);
    const onlineStones = Number(online.snapshot.wallet.spiritStone);
    const offlineStones = Number(offline.snapshot.wallet.spiritStone);
    expect(offlineStones).toBeLessThan(onlineStones);
    expect(offlineStones).toBeGreaterThan(0);
  });

  it("caps a resume at the configured maximum offline window", () => {
    const capped = freshService();
    capped.resume(at(CLIENT_CONFIG.maxOfflineSeconds));

    const beyondCap = freshService();
    beyondCap.resume(at(CLIENT_CONFIG.maxOfflineSeconds * 3));

    expect(beyondCap.snapshot.progress.level).toBe(capped.snapshot.progress.level);
    expect(beyondCap.snapshot.progress.experience).toBe(
      capped.snapshot.progress.experience,
    );
    expect(beyondCap.snapshot.wallet.spiritStone).toBe(
      capped.snapshot.wallet.spiritStone,
    );
  });

  it("surfaces an offline summary once the away time clears the notice floor", () => {
    const service = freshService();
    service.resume(at(120));

    const summary = service.snapshot.offlineSettlement;
    expect(summary).not.toBeNull();
    expect(summary!.effectiveSeconds).toBe(120);
    expect(summary!.efficiencyBp).toBe(CLIENT_CONFIG.offlineEfficiencyBp);
  });

  it("stays silent for a brief background flick", () => {
    const service = freshService();
    service.resume(at(5));

    expect(service.snapshot.offlineSettlement).toBeNull();
  });

  it("reports the capped window rather than real elapsed time in the summary", () => {
    const service = freshService();
    service.resume(at(CLIENT_CONFIG.maxOfflineSeconds * 2));

    const summary = service.snapshot.offlineSettlement;
    expect(summary).not.toBeNull();
    expect(summary!.effectiveSeconds).toBe(CLIENT_CONFIG.maxOfflineSeconds);
  });
});

describe("foreground checkpoint window", () => {
  // `settleTo` only applies `maxOfflineSeconds` when it is producing an offline
  // summary; `checkpoint` and every gameplay mutation settle an unbounded span
  // at full efficiency. This pins the current behaviour so a future change to
  // the cap is a deliberate decision rather than an accident.
  it("settles an unbounded span at full efficiency through checkpoint", () => {
    const viaCheckpoint = freshService();
    viaCheckpoint.checkpoint(at(CLIENT_CONFIG.maxOfflineSeconds * 3));

    const viaResume = freshService();
    viaResume.resume(at(CLIENT_CONFIG.maxOfflineSeconds * 3));

    const checkpointStones = Number(viaCheckpoint.snapshot.wallet.spiritStone);
    const resumeStones = Number(viaResume.snapshot.wallet.spiritStone);

    expect(checkpointStones).toBeGreaterThan(resumeStones);
    expect(viaCheckpoint.snapshot.offlineSettlement).toBeNull();
  });
});
