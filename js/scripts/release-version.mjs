import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function readLatestVersion(output) {
  // npm dist-tag ls emits text even when passed --json.
  const match = output.match(/^latest:[ \t]+(\S+)[ \t]*$/m);
  assert(match, "npm did not return a latest tag");
  assert.match(match[1], stableVersion, "npm latest must be a stable version");
  return match[1];
}

export function shouldRelease({ event, branch, requested, version, previous }) {
  assert.match(version, stableVersion, "Releases must use a stable X.Y.Z version");
  if (event === "workflow_dispatch") {
    assert.equal(version, requested, "Requested version must match package.json");
    return true;
  }
  assert.equal(event, "push", "Unsupported release event");
  if (branch === "main") {
    assert.match(previous, stableVersion, "Previous main version must be available");
    if (version === previous) return false;
    const before = previous.split(".").map(BigInt);
    const after = version.split(".").map(BigInt);
    const changed = after.findIndex((part, index) => part !== before[index]);
    assert(after[changed] > before[changed], "Release version must increase");
    return true;
  }
  assert.equal(branch, `release/${version}`, "Release branch must match package.json");
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
  const event = process.env.GITHUB_EVENT_NAME;
  const branch = process.env.GITHUB_REF_NAME;
  let previous;
  if (event === "push" && branch === "main") {
    const { before } = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    assert.match(before, /^[a-f0-9]{40}$/, "A valid previous commit is required");
    previous = JSON.parse(execFileSync("git", ["show", `${before}:js/package.json`], { encoding: "utf8" })).version;
  }
  const release = shouldRelease({ event, branch, requested: process.env.REQUESTED_VERSION, version: pkg.version, previous });
  appendFileSync(process.env.GITHUB_OUTPUT, `release=${release}\nversion=${pkg.version}\n`);
  console.log(release ? `Release requested: ${pkg.name}@${pkg.version}` : "Package version unchanged; no npm release needed.");
}
