import { readFile, readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import {
  COCOS_WECHAT_TEST_APP_ID,
  artifactFingerprint,
  assertEqual,
  loadWechatBuildConfig,
  readBuildFacts,
  readWechatBuildManifest,
  sha256,
  sourceFingerprint,
  validateBuildFacts,
} from "./wechat-build-manifest.mjs";

const workspace = process.cwd();
const rawArgs = process.argv.slice(2);
const production = rawArgs.includes("--production");
const directoryArgs = rawArgs.filter((arg) => !arg.startsWith("--"));
const debugDirectory = path.resolve(
  workspace,
  directoryArgs[0] ?? "build/wechatgame-dev",
);
const releaseDirectory = path.resolve(
  workspace,
  directoryArgs[1] ?? "build/wechatgame-release",
);
if (debugDirectory === releaseDirectory) {
  throw new Error("Debug and release directories must be different");
}

const debugMarkers = [
  "DebugRoot",
  "\u5f00\u53d1\u8c03\u8bd5",
];
const releaseMarkers = [];
const runtimeMarkers = [
  "GameBootstrap",
  "FIXED_WIDTH",
  "setDesignResolutionSize",
  "750",
  "1334",
  "cultivation-diary.local-save.v1",
  "LocalGameService",
];
const forbiddenRuntimePatterns = [
  {
    pattern: /Math\.pow\(\s*\d+n\s*,\s*BigInt\(/,
    reason: "Cocos-transpiled BigInt exponentiation",
  },
  {
    // The Cocos build lowers array spread to [].concat(...), which appends an
    // iterator as one element instead of expanding it. Spreading map.entries()
    // therefore yields [Iterator], and every destructured field reads
    // undefined — silently, and only in the built game. Use Map.forEach.
    pattern: /\[\]\.concat\((?!Object\.)[A-Za-z_$][A-Za-z0-9_$.]*\.(?:entries|keys|values)\(\)/,
    reason: "Cocos-transpiled spread of an iterator (use Map/Set forEach)",
  },
];
const requiredEntries = [
  "game.js",
  "game.json",
  "project.config.json",
  "src/settings.json",
  "assets/main/config.json",
  "assets/main/index.js",
];

const config = await loadWechatBuildConfig(workspace);
const baseBuildConfig = JSON.parse(
  await readFile(path.join(workspace, "config/cocos/wechatgame.json"), "utf8"),
);
const currentSource = await sourceFingerprint(workspace, config);
const [debugBuild, releaseBuild] = await Promise.all([
  verifyBuild(debugDirectory, "debug"),
  verifyBuild(releaseDirectory, "release"),
]);

assertEqual(
  debugBuild.manifest.source.sha256,
  releaseBuild.manifest.source.sha256,
  "debug/release source hash",
);
assertEqual(
  debugBuild.manifest.source.revision,
  releaseBuild.manifest.source.revision,
  "debug/release source revision",
);
assertEqual(
  debugBuild.manifest.releaseId,
  releaseBuild.manifest.releaseId,
  "debug/release release ID",
);

for (const marker of debugMarkers) {
  if (!debugBuild.allSource.includes(marker)) {
    throw new Error("Debug build is missing required marker: " + marker);
  }
  if (releaseBuild.allSource.includes(marker)) {
    throw new Error("Release build contains debug-only marker: " + marker);
  }
}
for (const marker of releaseMarkers) {
  if (debugBuild.allSource.includes(marker)) {
    throw new Error("Debug build contains release-only marker: " + marker);
  }
  if (!releaseBuild.allSource.includes(marker)) {
    throw new Error("Release build is missing required marker: " + marker);
  }
}
for (const marker of runtimeMarkers) {
  for (const build of [debugBuild, releaseBuild]) {
    if (!build.allSource.includes(marker)) {
      throw new Error(build.mode + " build is missing runtime marker: " + marker);
    }
  }
}
for (const { pattern, reason } of forbiddenRuntimePatterns) {
  for (const build of [debugBuild, releaseBuild]) {
    if (pattern.test(build.allSource)) {
      throw new Error(build.mode + " build contains unsupported runtime code: " + reason);
    }
  }
}
for (const build of [debugBuild, releaseBuild]) {
  if (!build.mainSource.includes(config.gameBootstrapComponentId)) {
    throw new Error(build.mode + " main bundle is missing the scene component ID");
  }
}

if (production) {
  verifyProductionBuild(debugBuild);
  verifyProductionBuild(releaseBuild);
} else {
  const warnings = new Set();
  for (const build of [debugBuild, releaseBuild]) {
    if (build.facts.appIdClass === "cocos-test") {
      warnings.add("Cocos test AppID");
    }
    if (["widelyUsed", "latest"].includes(build.facts.libVersion)) {
      warnings.add("unfixed WeChat base library");
    }
  }
  if (warnings.size > 0) {
    console.warn(
      "Static candidate only; production checks remain: " + [...warnings].join(", "),
    );
  }
}

await warnAboutLegacyBuild();
console.log(
  "Verified WeChat " +
    config.releaseId +
    " builds: debug=" +
    debugBuild.files.length +
    " JS, release=" +
    releaseBuild.files.length +
    " JS, source=" +
    currentSource.sha256.slice(0, 12) +
    ", artifacts=" +
    debugBuild.artifact.sha256.slice(0, 12) +
    "/" +
    releaseBuild.artifact.sha256.slice(0, 12),
);

async function verifyBuild(directory, mode) {
  await Promise.all(
    requiredEntries.map(async (entry) => {
      const entryStat = await stat(path.join(directory, entry));
      if (!entryStat.isFile()) {
        throw new Error(mode + " build entry is not a file: " + entry);
      }
    }),
  );
  const [
    files,
    manifest,
    artifact,
    facts,
    mainSource,
    gameSource,
    projectConfig,
  ] = await Promise.all([
      javascriptFiles(directory),
      readWechatBuildManifest(directory),
      artifactFingerprint(directory),
      readBuildFacts(directory, config),
      readFile(path.join(directory, "assets/main/index.js"), "utf8"),
      readFile(path.join(directory, "game.js"), "utf8"),
      readJson(path.join(directory, "project.config.json")),
    ]);
  if (files.length === 0) {
    throw new Error(mode + " build contains no JavaScript files");
  }

  validateBuildFacts(facts, config, mode);
  assertEqual(manifest.schemaVersion, config.schemaVersion, mode + " manifest schema");
  assertEqual(manifest.productVersion, config.productVersion, mode + " product version");
  assertEqual(manifest.releaseId, config.releaseId, mode + " release ID");
  assertEqual(manifest.mode, mode, mode + " manifest mode");
  assertEqual(manifest.source.revision, currentSource.revision, mode + " source revision");
  assertEqual(manifest.source.dirty, currentSource.dirty, mode + " source dirty state");
  assertEqual(manifest.source.sha256, currentSource.sha256, mode + " source hash");
  assertEqual(manifest.source.fileCount, currentSource.fileCount, mode + " source file count");
  assertEqual(manifest.artifact.sha256, artifact.sha256, mode + " artifact hash");
  assertEqual(manifest.artifact.fileCount, artifact.fileCount, mode + " artifact file count");
  assertEqual(
    manifest.artifact.javascriptFileCount,
    artifact.javascriptFileCount,
    mode + " JavaScript file count",
  );
  assertEqual(manifest.builtAt, facts.builtAt, mode + " manifest build time");
  assertEqual(manifest.build.builtAt, facts.builtAt, mode + " build fact time");
  for (const field of [
    "cocosCreatorVersion",
    "platform",
    "debug",
    "mainBundleDebug",
    "launchScene",
    "launchScenePresent",
    "sceneComponentPresent",
    "designResolutionPolicy",
    "orientation",
    "compileType",
    "miniprogramRoot",
    "urlCheck",
    "libVersion",
    "appIdClass",
    "appIdSha256",
  ]) {
    assertEqual(manifest.build[field], facts[field], mode + " manifest " + field);
  }
  assertEqual(
    manifest.build.effectiveConfigSha256,
    effectiveConfigSha256(mode, projectConfig.appid),
    mode + " effective config hash",
  );
  for (const file of files) {
    const checked = spawnSync(process.execPath, ["--check", file], {
      encoding: "utf8",
    });
    if (checked.status !== 0) {
      const details = checked.stderr.trim() || checked.stdout.trim();
      throw new Error("JavaScript syntax check failed for " + file + ":\n" + details);
    }
  }
  const allSource = (
    await Promise.all(files.map((file) => readFile(file, "utf8")))
  ).join("\n");

  return {
    mode,
    directory,
    files,
    manifest,
    artifact,
    facts,
    mainSource,
    allSource,
    gameSource,
  };
}

function effectiveConfigSha256(mode, appId) {
  const effectiveConfig = structuredClone(baseBuildConfig);
  const outputName = mode === "debug" ? "wechatgame-dev" : "wechatgame-release";
  effectiveConfig.debug = mode === "debug";
  effectiveConfig.outputName = outputName;
  effectiveConfig.taskName = outputName;
  effectiveConfig.packages.wechatgame.appid = appId;
  return sha256(JSON.stringify(effectiveConfig, null, 2) + "\n");
}

function verifyProductionBuild(build) {
  const expectedAppId = process.env.WECHAT_GAME_APP_ID?.trim() ?? "";
  if (
    !/^wx[0-9a-f]{16}$/.test(expectedAppId) ||
    expectedAppId === COCOS_WECHAT_TEST_APP_ID
  ) {
    throw new Error(
      "Production verification requires a non-test WECHAT_GAME_APP_ID",
    );
  }
  const expectedBaseLibrary =
    process.env.WECHAT_BASE_LIBRARY_VERSION?.trim() ?? "";
  if (
    !/^\d+\.\d+\.\d+$/.test(expectedBaseLibrary) ||
    ["widelyUsed", "latest"].includes(expectedBaseLibrary)
  ) {
    throw new Error(
      "Production verification requires a fixed WECHAT_BASE_LIBRARY_VERSION",
    );
  }
  assertEqual(build.facts.appIdClass, "configured", build.mode + " AppID class");
  assertEqual(
    build.facts.appIdSha256,
    sha256("wechat-app-id\0" + expectedAppId),
    build.mode + " AppID",
  );
  assertEqual(
    build.facts.libVersion,
    expectedBaseLibrary,
    build.mode + " base library",
  );
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function warnAboutLegacyBuild() {
  try {
    const legacy = await stat(path.join(workspace, "build/wechatgame"));
    if (legacy.isDirectory()) {
      console.warn(
        "Ignored legacy build/wechatgame exists; import only the explicit dev/release directories.",
      );
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) return javascriptFiles(candidate);
      return entry.isFile() && entry.name.endsWith(".js") ? [candidate] : [];
    }),
  );
  return nested.flat().sort();
}
