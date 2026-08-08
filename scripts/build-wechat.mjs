import { readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import {
  COCOS_WECHAT_TEST_APP_ID,
  loadWechatBuildConfig,
  sha256,
  sourceFingerprint,
  stampWechatBuild,
} from "./wechat-build-manifest.mjs";

const workspace = process.cwd();
const args = new Set(process.argv.slice(2));
const selectedMode =
  process.argv.slice(2).find((arg) => ["debug", "release", "all"].includes(arg)) ??
  "all";
const production = args.has("--production");
const modes = selectedMode === "all" ? ["debug", "release"] : [selectedMode];
const creatorBinary =
  process.env.COCOS_CREATOR_BIN ??
  "/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator";
const configuredAppId = process.env.WECHAT_GAME_APP_ID?.trim() ?? "";
const appId = configuredAppId || COCOS_WECHAT_TEST_APP_ID;
const baseLibraryVersion = process.env.WECHAT_BASE_LIBRARY_VERSION?.trim() ?? "";

validateInputs();
const baseConfig = JSON.parse(
  await readFile(path.join(workspace, "config/cocos/wechatgame.json"), "utf8"),
);
const fingerprintConfig = await loadWechatBuildConfig(workspace);
const generatedConfigDirectory = path.join(
  workspace,
  "temp/cultivation-diary-build",
);
const creatorHome = path.join(generatedConfigDirectory, "cocos-home");
await mkdir(generatedConfigDirectory, { recursive: true });
await mkdir(creatorHome, { recursive: true });
const candidateSource = await sourceFingerprint(workspace, fingerprintConfig);

for (const mode of modes) {
  await buildMode(mode, candidateSource);
}

if (selectedMode === "all") {
  const verifyArgs = [
    path.join(workspace, "scripts/verify-wechat-build.mjs"),
    ...(production ? ["--production"] : []),
  ];
  const verified = spawnSync(process.execPath, verifyArgs, {
    cwd: workspace,
    stdio: "inherit",
    env: process.env,
  });
  if (verified.status !== 0) {
    process.exit(verified.status ?? 1);
  }
}

async function buildMode(mode, source) {
  const debug = mode === "debug";
  const outputName = debug ? "wechatgame-dev" : "wechatgame-release";
  const effectiveConfig = structuredClone(baseConfig);
  effectiveConfig.debug = debug;
  effectiveConfig.outputName = outputName;
  effectiveConfig.taskName = outputName;
  effectiveConfig.packages.wechatgame.appid = appId;

  const configPath = path.join(
    generatedConfigDirectory,
    "wechatgame-" + mode + ".json",
  );
  const serializedConfig = JSON.stringify(effectiveConfig, null, 2) + "\n";
  await writeFile(configPath, serializedConfig, "utf8");

  console.log(
    "Building " +
      mode +
      " WeChat package with " +
      (appId === COCOS_WECHAT_TEST_APP_ID ? "the Cocos test AppID" : "a configured AppID"),
  );
  await prepareCreatorHome();
  const built = spawnSync(
    creatorBinary,
    [
      "--project",
      workspace,
      "--home",
      creatorHome,
      "--build",
      "configPath=" + configPath,
    ],
    {
      cwd: workspace,
      stdio: "inherit",
    },
  );
  if (built.error) throw built.error;
  if (built.signal || built.status !== 36) {
    throw new Error(
      "Cocos " +
        mode +
        " build failed: status=" +
        String(built.status) +
        ", signal=" +
        String(built.signal),
    );
  }

  const outputDirectory = path.join(workspace, "build", outputName);
  await pinBaseLibrary(outputDirectory);
  const manifest = await stampWechatBuild(
    workspace,
    outputDirectory,
    mode,
    source,
    sha256(serializedConfig),
  );
  console.log(
    "Stamped " +
      manifest.releaseId +
      " " +
      mode +
      ": source=" +
      manifest.source.sha256.slice(0, 12) +
      ", artifact=" +
      manifest.artifact.sha256.slice(0, 12),
  );
}

async function prepareCreatorHome() {
  const editorStateDirectory = path.join(creatorHome, "editor");
  await Promise.all(
    [
      "layout.json",
      "layout.json.backup",
      "window.json",
      "window.json.backup",
    ].map((fileName) =>
      rm(path.join(editorStateDirectory, fileName), { force: true }),
    ),
  );
}

async function pinBaseLibrary(outputDirectory) {
  if (!baseLibraryVersion) return;
  const projectConfigPath = path.join(outputDirectory, "project.config.json");
  const projectConfig = JSON.parse(await readFile(projectConfigPath, "utf8"));
  projectConfig.libVersion = baseLibraryVersion;
  await writeFile(projectConfigPath, JSON.stringify(projectConfig) + "\n", "utf8");
}

function validateInputs() {
  if (!["debug", "release", "all"].includes(selectedMode)) {
    throw new Error("Usage: node scripts/build-wechat.mjs [debug|release|all] [--production]");
  }
  if (!/^wx[0-9a-f]{16}$/.test(appId)) {
    throw new Error("WECHAT_GAME_APP_ID must match wx followed by 16 lowercase hex digits");
  }
  if (production && appId === COCOS_WECHAT_TEST_APP_ID) {
    throw new Error("Production builds require a non-test WECHAT_GAME_APP_ID");
  }
  if (production) {
    if (
      !/^\d+\.\d+\.\d+$/.test(baseLibraryVersion) ||
      baseLibraryVersion === "widelyUsed" ||
      baseLibraryVersion === "latest"
    ) {
      throw new Error(
        "Production builds require a tested, fixed WECHAT_BASE_LIBRARY_VERSION",
      );
    }
  }
  if (!production && appId === COCOS_WECHAT_TEST_APP_ID) {
    console.warn(
      "Candidate build uses the Cocos test AppID and cannot be uploaded as production.",
    );
  }
}
