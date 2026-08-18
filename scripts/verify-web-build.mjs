import { readFile, readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  artifactFingerprint,
  loadWechatBuildConfig,
  sha256,
  sourceFingerprint,
} from "./wechat-build-manifest.mjs";

const workspace = process.cwd();
const WEB_BUILD_MANIFEST = "cultivation-diary-web-build.json";
const directory = path.resolve(workspace, process.argv[2] ?? "build/web-mobile-preview");
const required = ["index.html", "index.js", "application.js", "src/settings.json", "assets/main/index.js"];
for (const entry of required) {
  const entryStat = await stat(path.join(directory, entry));
  if (!entryStat.isFile()) throw new Error(`Web build entry is not a file: ${entry}`);
}
const manifest = JSON.parse(
  await readFile(path.join(directory, WEB_BUILD_MANIFEST), "utf8"),
);
const config = await loadWechatBuildConfig(workspace);
const webConfig = JSON.parse(
  await readFile(path.join(workspace, "config/cocos/web-mobile.json"), "utf8"),
);
webConfig.outputName = "web-mobile-preview";
webConfig.taskName = "web-mobile-preview";
if (
  manifest.schemaVersion !== 1 ||
  manifest.productVersion !== config.productVersion ||
  manifest.releaseId !== config.releaseId
) {
  throw new Error("Web build manifest version does not match release config");
}
if (manifest.platform !== "web-mobile" || manifest.orientation !== "portrait") {
  throw new Error("Web build manifest platform settings are invalid");
}
if (
  manifest.effectiveConfigSha256 !==
  sha256(JSON.stringify(webConfig, null, 2) + "\n")
) {
  throw new Error("Web build effective config hash does not match");
}
const currentSource = await sourceFingerprint(workspace, {
  sourceInputs: [
    ...config.sourceInputs,
    "build-templates/web-mobile",
    "config/cocos/web-mobile.json",
    "scripts/build-web.mjs",
  ],
});
for (const field of ["revision", "dirty", "sha256", "fileCount"]) {
  if (manifest.source[field] !== currentSource[field]) {
    throw new Error(`Web build source ${field} does not match current source`);
  }
}
const artifact = await artifactFingerprint(directory, [WEB_BUILD_MANIFEST]);
for (const field of ["sha256", "fileCount", "javascriptFileCount"]) {
  if (manifest.artifact[field] !== artifact[field]) {
    throw new Error(`Web build artifact ${field} does not match manifest`);
  }
}
const files = await javascriptFiles(directory);
for (const file of files) {
  const checked = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (checked.status !== 0) throw new Error(`Web JavaScript syntax check failed: ${file}`);
}
const mainSource = await readFile(path.join(directory, "assets/main/index.js"), "utf8");
for (const marker of ["GameBootstrap", "FIXED_WIDTH", "750", "1334", "LocalGameService"]) {
  if (!mainSource.includes(marker)) throw new Error(`Web build missing runtime marker: ${marker}`);
}
const settings = JSON.parse(
  await readFile(path.join(directory, "src/settings.json"), "utf8"),
);
if (
  settings.CocosEngine !== config.cocosCreatorVersion ||
  settings.engine?.platform !== "web-mobile" ||
  settings.engine?.debug !== false ||
  settings.launch?.launchScene !== config.launchScene ||
  settings.screen?.designResolution?.policy !== config.designResolutionPolicy
) {
  throw new Error("Web build runtime settings do not match release configuration");
}
console.log(`Verified web preview: ${files.length} JavaScript files, source=${currentSource.sha256.slice(0, 12)}`);

async function javascriptFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const candidate = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) return javascriptFiles(candidate);
      return entry.isFile() && entry.name.endsWith(".js") ? [candidate] : [];
    }),
  );
  return nested.flat().sort();
}
