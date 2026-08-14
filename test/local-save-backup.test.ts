import { describe, expect, it } from "vitest";
import { CLIENT_CONFIG } from "../assets/scripts/core/ClientConfig";
import {
  LocalGameError,
  LocalGameService,
} from "../assets/scripts/services/LocalGameService";
import { FakePlatformAdapter } from "./support/fake-platform-adapter";

const START = new Date("2026-01-01T00:00:00.000Z");
const LATER = new Date("2026-01-02T00:00:00.000Z");

function serviceAt(
  platform = new FakePlatformAdapter(),
  now = START,
): LocalGameService {
  const service = new LocalGameService(platform);
  service.initialize(now);
  return service;
}

describe("local save backup codes", () => {
  it("exports and imports all player-visible progress", () => {
    const now = new Date();
    const source = serviceAt(new FakePlatformAdapter(), now);
    source.debugGrant("spirit_stone");
    source.debugGrant("breakthrough_pill");
    source.chooseAvatar("female");
    const exported = source.exportBackup(now);

    const destinationPlatform = new FakePlatformAdapter();
    const destination = serviceAt(destinationPlatform, now);
    const originalDestinationId = destination.snapshot.player.id;
    const imported = destination.importBackup(exported.backupCode, now);

    expect(imported.created).toBe(false);
    expect(imported.snapshot.account).toEqual(exported.snapshot.account);
    expect(imported.snapshot.player).toEqual(exported.snapshot.player);
    expect(imported.snapshot.wallet).toEqual(exported.snapshot.wallet);
    expect(imported.snapshot.inventory).toEqual(exported.snapshot.inventory);
    expect(imported.snapshot.equipment).toEqual(exported.snapshot.equipment);
    expect(imported.snapshot.techniques).toEqual(exported.snapshot.techniques);
    expect(imported.snapshot.player.id).not.toBe(originalDestinationId);
    expect(destination.hasImportRecovery()).toBe(true);

    const reloaded = new LocalGameService(destinationPlatform);
    const reloadResult = reloaded.initialize(new Date(imported.savedAt));
    expect(reloadResult.created).toBe(false);
    expect(reloaded.snapshot.player).toEqual(imported.snapshot.player);
    expect(reloaded.snapshot.wallet).toEqual(imported.snapshot.wallet);
  });

  it("rejects a modified backup without changing current progress", () => {
    const source = serviceAt();
    const backupCode = source.exportBackup(START).backupCode;
    const destination = serviceAt();
    const before = destination.snapshot;
    const tampered = `${backupCode.slice(0, -1)}]`;

    expect(() => destination.importBackup(tampered, START)).toThrow(
      new LocalGameError("存档备份校验失败，内容可能不完整或已被修改"),
    );
    expect(destination.snapshot).toEqual(before);
    expect(destination.hasImportRecovery()).toBe(false);
  });

  it("rejects unknown and oversized backup formats", () => {
    const service = serviceAt();

    expect(() => service.importBackup("not-a-save", START)).toThrow(
      "剪贴板中没有可识别的修仙存档备份",
    );
    expect(() => service.importBackup("x".repeat(1_000_001), START)).toThrow(
      "存档备份内容过长或格式无效",
    );
    expect(service.hasImportRecovery()).toBe(false);
  });

  it("does not award offline gains between export and import", () => {
    const source = serviceAt();
    const exported = source.exportBackup(START);
    const destination = serviceAt(new FakePlatformAdapter(), LATER);

    const imported = destination.importBackup(exported.backupCode, LATER);

    expect(imported.snapshot.progress.level).toBe(1);
    expect(imported.snapshot.progress.experience).toBe("0");
    expect(imported.snapshot.wallet.spiritStone).toBe("0");
    expect(imported.snapshot.progress.settledAt).toBe(LATER.toISOString());
  });

  it("restores the automatic pre-import recovery and consumes it", () => {
    const now = new Date();
    const source = serviceAt(new FakePlatformAdapter(), now);
    source.chooseAvatar("male");
    const backupCode = source.exportBackup(now).backupCode;

    const platform = new FakePlatformAdapter();
    const destination = serviceAt(platform, now);
    destination.debugGrant("spirit_stone");
    destination.renamePlayer("回退角色");
    const beforeImport = destination.snapshot;

    destination.importBackup(backupCode, now);
    expect(destination.snapshot.player.id).toBe(source.snapshot.player.id);
    expect(destination.hasImportRecovery()).toBe(true);

    const restored = destination.restoreImportRecovery(now);
    expect(restored.snapshot.player).toEqual(beforeImport.player);
    expect(restored.snapshot.wallet).toEqual(beforeImport.wallet);
    expect(restored.snapshot.inventory).toEqual(beforeImport.inventory);
    expect(destination.hasImportRecovery()).toBe(false);
  });

  it("cancels import when the current save cannot be preserved", () => {
    const source = serviceAt(new FakePlatformAdapter(), START);
    const backupCode = source.exportBackup(START).backupCode;

    const platform = new FakePlatformAdapter();
    const destination = serviceAt(platform);
    const before = destination.snapshot;
    platform.failedSaveKeys.add(CLIENT_CONFIG.localImportRecoveryStorageKey);

    expect(() => destination.importBackup(backupCode, START)).toThrow(
      "无法创建当前进度的回退备份，导入已取消",
    );
    expect(destination.snapshot).toEqual(before);
    expect(destination.hasImportRecovery()).toBe(false);
  });

  it("rolls back the in-memory session when the imported save cannot be written", () => {
    const source = serviceAt();
    const backupCode = source.exportBackup(START).backupCode;
    const platform = new FakePlatformAdapter();
    const destination = serviceAt(platform);
    const before = destination.snapshot;
    platform.failedSaveKeys.add(CLIENT_CONFIG.localSaveStorageKey);

    expect(() => destination.importBackup(backupCode, START)).toThrow(
      "导入存档写入失败，当前进度未改变",
    );
    expect(destination.snapshot).toEqual(before);
    expect(destination.hasImportRecovery()).toBe(true);
  });

  it("clears the recovery slot when local progress is reset", () => {
    const source = serviceAt();
    const backupCode = source.exportBackup(START).backupCode;
    const destination = serviceAt();
    destination.importBackup(backupCode, START);
    expect(destination.hasImportRecovery()).toBe(true);

    destination.reset();

    expect(destination.hasImportRecovery()).toBe(false);
  });

  it("reports a missing or invalid recovery slot", () => {
    const platform = new FakePlatformAdapter();
    const service = serviceAt(platform);
    expect(() => service.restoreImportRecovery(START)).toThrow(
      "没有可恢复的导入前存档",
    );

    platform.seed(CLIENT_CONFIG.localImportRecoveryStorageKey, { broken: true });
    expect(service.hasImportRecovery()).toBe(false);
    expect(() => service.restoreImportRecovery(START)).toThrow(
      "没有可恢复的导入前存档",
    );
  });
});

describe("clipboard adapter contract", () => {
  it("round-trips text and exposes denied clipboard access", async () => {
    const platform = new FakePlatformAdapter();
    expect(await platform.writeClipboard("backup-code")).toBe(true);
    expect(await platform.readClipboard()).toBe("backup-code");

    platform.clipboardWriteShouldFail = true;
    platform.clipboardReadShouldFail = true;
    expect(await platform.writeClipboard("replacement")).toBe(false);
    expect(await platform.readClipboard()).toBeNull();
    expect(platform.clipboardText).toBe("backup-code");
  });
});
