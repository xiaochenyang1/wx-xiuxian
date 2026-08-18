import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const workspace = process.cwd();
const sourceRoots = ["assets/scripts", "shared/src"];
const forbidden = [
  { pattern: /\bfetch\s*\(/, label: "fetch" },
  { pattern: /\bwx\.request\b/, label: "wx.request" },
  { pattern: /\bWebSocket\b/, label: "WebSocket" },
  { pattern: /\bXMLHttpRequest\b/, label: "XMLHttpRequest" },
  { pattern: /\bAuthorization\b|\bBearer\b/, label: "authorization headers" },
];

const diffCheck = spawnSync("git", ["diff", "--check"], {
  cwd: workspace,
  encoding: "utf8",
});
if (diffCheck.status !== 0) {
  throw new Error(diffCheck.stdout.trim() || diffCheck.stderr.trim() || "git diff --check failed");
}

const files = [];
for (const root of sourceRoots) await collect(path.join(workspace, root), files);
const violations = [];
for (const file of files) {
  const source = await readFile(file, "utf8");
  for (const entry of forbidden) {
    if (entry.pattern.test(source)) {
      violations.push(`${path.relative(workspace, file)} contains ${entry.label}`);
    }
  }
}
if (violations.length > 0) {
  throw new Error("Local-only source boundary violated:\n" + violations.join("\n"));
}
console.log(`Verified local-only source boundaries: ${files.length} source files`);

async function collect(directory, result) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collect(file, result);
    } else if (/\.(?:m?js|ts)$/.test(entry.name)) {
      result.push(file);
    }
  }
}
