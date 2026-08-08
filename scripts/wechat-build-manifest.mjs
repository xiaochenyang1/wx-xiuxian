import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

export const WECHAT_BUILD_MANIFEST = "cultivation-diary-build.json";
export const COCOS_WECHAT_TEST_APP_ID = "wx6ac3f5090a6b99c5";

export async function loadWechatBuildConfig(workspace) {
  return readJson(path.join(workspace, "wechat-build.config.json"));
}

export async function sourceFingerprint(workspace, config) {
  const files = await collectInputFiles(workspace, config.sourceInputs);
  const revision = gitOutput(workspace, ["rev-parse", "HEAD"]);
  const status = gitOutput(workspace, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    ...config.sourceInputs,
  ]);

  return {
    revision,
    dirty: status.length > 0,
    sha256: await hashFiles(workspace, files),
    fileCount: files.length,
  };
}

export async function artifactFingerprint(directory) {
  const files = (await collectInputFiles(directory, ["."])).filter(
    (file) => file !== WECHAT_BUILD_MANIFEST,
  );
  return {
    sha256: await hashFiles(directory, files),
    fileCount: files.length,
    javascriptFileCount: files.filter((file) => file.endsWith(".js")).length,
  };
}

export async function readBuildFacts(directory, config) {
  const sceneImport = path.join(
    directory,
    "assets/main/import",
    config.sceneUuid.slice(0, 2),
    config.sceneUuid + ".json",
  );
  const [settings, game, project, mainConfig, sceneSource, settingsStat] =
    await Promise.all([
      readJson(path.join(directory, "src/settings.json")),
      readJson(path.join(directory, "game.json")),
      readJson(path.join(directory, "project.config.json")),
      readJson(path.join(directory, "assets/main/config.json")),
      readFile(sceneImport, "utf8"),
      stat(path.join(directory, "src/settings.json")),
    ]);
  const appId = typeof project.appid === "string" ? project.appid.trim() : "";

  return {
    builtAt: settingsStat.mtime.toISOString(),
    cocosCreatorVersion: settings.CocosEngine,
    platform: settings.engine?.platform,
    debug: settings.engine?.debug,
    mainBundleDebug: mainConfig.debug,
    launchScene: settings.launch?.launchScene,
    launchScenePresent: Object.hasOwn(mainConfig.scenes ?? {}, config.launchScene),
    sceneComponentPresent: sceneSource.includes(config.gameBootstrapComponentId),
    designResolutionPolicy: settings.screen?.designResolution?.policy,
    orientation: game.deviceOrientation,
    compileType: project.compileType,
    miniprogramRoot: project.miniprogramRoot,
    urlCheck: project.setting?.urlCheck,
    libVersion: project.libVersion,
    appIdClass: classifyWechatAppId(appId),
    appIdSha256: appId.length === 0 ? null : sha256("wechat-app-id\0" + appId),
  };
}

export function validateBuildFacts(facts, config, mode) {
  const expectedDebug = mode === "debug";
  assertEqual(facts.cocosCreatorVersion, config.cocosCreatorVersion, "Cocos version");
  assertEqual(facts.platform, config.platform, "platform");
  assertEqual(facts.debug, expectedDebug, mode + " flag");
  assertEqual(facts.mainBundleDebug, expectedDebug, mode + " main bundle flag");
  assertEqual(facts.launchScene, config.launchScene, "launch scene");
  assertEqual(facts.launchScenePresent, true, "main bundle launch scene");
  assertEqual(facts.sceneComponentPresent, true, "GameBootstrap scene binding");
  assertEqual(
    facts.designResolutionPolicy,
    config.designResolutionPolicy,
    "design resolution policy",
  );
  assertEqual(facts.orientation, config.orientation, "device orientation");
  assertEqual(facts.compileType, "game", "WeChat compile type");
  assertEqual(facts.miniprogramRoot, "./", "mini-game root");
  assertEqual(facts.urlCheck, true, "WeChat URL validation");
  if (facts.appIdClass === "missing") {
    throw new Error(mode + " build is missing a WeChat AppID");
  }
}

export async function stampWechatBuild(
  workspace,
  directory,
  mode,
  expectedSource,
  effectiveConfigSha256,
) {
  const config = await loadWechatBuildConfig(workspace);
  const [currentSource, artifact, facts] = await Promise.all([
    sourceFingerprint(workspace, config),
    artifactFingerprint(directory),
    readBuildFacts(directory, config),
  ]);
  for (const field of ["revision", "dirty", "sha256", "fileCount"]) {
    assertEqual(
      currentSource[field],
      expectedSource[field],
      mode + " source " + field + " changed during build",
    );
  }
  validateBuildFacts(facts, config, mode);
  if (artifact.javascriptFileCount === 0) {
    throw new Error(mode + " build contains no JavaScript files");
  }
  if (!/^[0-9a-f]{64}$/.test(effectiveConfigSha256)) {
    throw new Error("Missing effective Cocos build config hash");
  }

  const manifest = {
    schemaVersion: config.schemaVersion,
    productVersion: config.productVersion,
    releaseId: config.releaseId,
    mode,
    builtAt: facts.builtAt,
    source: expectedSource,
    artifact,
    build: {
      ...facts,
      effectiveConfigSha256,
    },
  };
  await writeFile(
    path.join(directory, WECHAT_BUILD_MANIFEST),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
  return manifest;
}

export async function readWechatBuildManifest(directory) {
  return readJson(path.join(directory, WECHAT_BUILD_MANIFEST));
}

export function classifyWechatAppId(appId) {
  if (appId.length === 0) return "missing";
  return appId === COCOS_WECHAT_TEST_APP_ID ? "cocos-test" : "configured";
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      label +
        " mismatch: expected " +
        JSON.stringify(expected) +
        ", got " +
        JSON.stringify(actual),
    );
  }
}

async function collectInputFiles(baseDirectory, inputs) {
  const files = [];
  for (const input of inputs) {
    await collectEntry(baseDirectory, normalizeRelative(input), files);
  }
  return [...new Set(files)].sort();
}

async function collectEntry(baseDirectory, relativePath, files) {
  const absolutePath = path.join(baseDirectory, relativePath);
  const entryStat = await stat(absolutePath);
  if (entryStat.isFile()) {
    files.push(normalizeRelative(relativePath));
    return;
  }
  if (!entryStat.isDirectory()) {
    throw new Error("Unsupported build input: " + absolutePath);
  }
  const entries = await readdir(absolutePath, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    await collectEntry(
      baseDirectory,
      normalizeRelative(path.join(relativePath, entry.name)),
      files,
    );
  }
}

async function hashFiles(baseDirectory, files) {
  const hash = createHash("sha256");
  for (const file of files) {
    const contents = await readFile(path.join(baseDirectory, file));
    hash.update(file);
    hash.update("\0");
    hash.update(String(contents.length));
    hash.update("\0");
    hash.update(contents);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function gitOutput(workspace, args) {
  const result = spawnSync("git", args, {
    cwd: workspace,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const details = result.stderr.trim() || result.stdout.trim();
    throw new Error("git " + args[0] + " failed: " + details);
  }
  return result.stdout.trim();
}

function normalizeRelative(value) {
  const normalized = value.split(path.sep).join("/");
  return normalized === "." ? "." : normalized.replace(/^\.\//, "");
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
