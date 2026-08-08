import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { assertEqual, loadWechatBuildConfig } from "./wechat-build-manifest.mjs";

const workspace = process.cwd();
const [config, rootPackage, sharedPackage] =
  await Promise.all([
    loadWechatBuildConfig(workspace),
    readJson("package.json"),
    readJson("shared/package.json"),
  ]);

assertEqual(rootPackage.version, config.productVersion, "root package version");
assertEqual(sharedPackage.version, config.productVersion, "shared package version");
assertEqual(
  rootPackage.creator?.version,
  config.cocosCreatorVersion,
  "Cocos Creator version",
);
const escapedVersion = config.productVersion.replaceAll(".", "\\.");
if (!new RegExp("^" + escapedVersion + "-r[1-9]\\d*$").test(config.releaseId)) {
  throw new Error("Invalid WeChat release ID: " + config.releaseId);
}
console.log(
  "Verified release config: product=" +
    config.productVersion +
    ", wechat=" +
    config.releaseId,
);

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(workspace, relativePath), "utf8"));
}
