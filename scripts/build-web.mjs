import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import {
  artifactFingerprint,
  assertEqual,
  loadWechatBuildConfig,
  sha256,
  sourceFingerprint,
} from "./wechat-build-manifest.mjs";

const WEB_BUILD_MANIFEST = "cultivation-diary-web-build.json";
const workspace = process.cwd();
const creatorBinary =
  process.env.COCOS_CREATOR_BIN ??
  "/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator";
const outputName = "web-mobile-preview";
const generatedDirectory = path.join(workspace, "temp/cultivation-diary-build");
const creatorHome = path.join(generatedDirectory, "cocos-home");
const config = JSON.parse(
  await readFile(path.join(workspace, "config/cocos/web-mobile.json"), "utf8"),
);
const releaseConfig = await loadWechatBuildConfig(workspace);
const fingerprintConfig = {
  sourceInputs: [
    ...releaseConfig.sourceInputs,
    "build-templates/web-mobile",
    "config/cocos/web-mobile.json",
    "scripts/build-web.mjs",
  ],
};
const source = await sourceFingerprint(workspace, fingerprintConfig);
const effectiveConfig = structuredClone(config);
effectiveConfig.outputName = outputName;
effectiveConfig.taskName = outputName;
const configPath = path.join(generatedDirectory, "web-mobile.json");
await mkdir(creatorHome, { recursive: true });
await mkdir(path.dirname(configPath), { recursive: true });
await writeFile(configPath, JSON.stringify(effectiveConfig, null, 2) + "\n", "utf8");
await rm(path.join(creatorHome, "editor"), { recursive: true, force: true });

const built = spawnSync(
  creatorBinary,
  ["--project", workspace, "--home", creatorHome, "--build", "configPath=" + configPath],
  { cwd: workspace, stdio: "inherit" },
);
if (built.error) throw built.error;
if (built.signal || built.status !== 36) {
  throw new Error(`Cocos web build failed: status=${built.status}, signal=${built.signal}`);
}

const outputDirectory = path.join(workspace, "build", outputName);
const currentSource = await sourceFingerprint(workspace, fingerprintConfig);
for (const field of ["revision", "dirty", "sha256", "fileCount"]) {
  assertEqual(currentSource[field], source[field], `web source ${field} changed during build`);
}
const artifact = await artifactFingerprint(outputDirectory, [WEB_BUILD_MANIFEST]);
const manifest = {
  schemaVersion: 1,
  productVersion: releaseConfig.productVersion,
  releaseId: releaseConfig.releaseId,
  builtAt: new Date().toISOString(),
  source,
  artifact,
  platform: "web-mobile",
  orientation: "portrait",
  effectiveConfigSha256: sha256(JSON.stringify(effectiveConfig, null, 2) + "\n"),
};
await writeFile(
  path.join(outputDirectory, WEB_BUILD_MANIFEST),
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8",
);
console.log(`Built web preview: ${outputDirectory}`);

const verified = spawnSync(
  process.execPath,
  [path.join(workspace, "scripts/verify-web-build.mjs"), outputDirectory],
  { cwd: workspace, stdio: "inherit" },
);
if (verified.status !== 0) process.exit(verified.status ?? 1);
