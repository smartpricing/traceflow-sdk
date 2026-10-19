import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";

// Exercise the actual npm archive in an isolated consumer, without native Kafka.
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const consumer = mkdtempSync(join(tmpdir(), "traceflow-package-"));
const run = (command, args, cwd = consumer) =>
  execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

try {
  const [packed] = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", consumer], process.cwd()));
  const files = new Set(packed.files.map(({ path }) => path));
  const targets = (value) => typeof value === "string" ? [value] : Object.values(value).flatMap(targets);
  for (const target of targets(manifest.exports)) {
    assert(files.has(target.replace(/^\.\//, "")), `Missing package export: ${target}`);
  }
  for (const file of ["README.md", "ERROR_MONITORING.md", ...Object.values(manifest.bin)]) {
    assert(files.has(file), `Missing package file: ${file}`);
  }

  const archive = join(consumer, packed.filename);
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ private: true }));
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", archive,
    `react@${manifest.devDependencies.react}`]);

  const installed = JSON.parse(readFileSync(join(consumer, "node_modules", manifest.name, "package.json"), "utf8"));
  assert.equal(installed.version, manifest.version);
  const entryPoints = {
    "": ["TraceFlowSDK", "AuditClient"],
    "/browser": ["ErrorClient", "installBrowserErrors"],
    "/react-native": ["ErrorClient", "installReactNativeErrors"],
    "/react": ["TraceflowErrorBoundary"],
    "/nuxt": ["installNuxtErrors"],
  };
  for (const [suffix, exports] of Object.entries(entryPoints)) {
    const specifier = JSON.stringify(`${manifest.name}${suffix}`);
    for (const format of ["commonjs", "module"]) {
      const load = format === "commonjs" ? `require(${specifier})` : `await import(${specifier})`;
      run(process.execPath, [`--input-type=${format}`, "--eval", `
        const entry = ${load};
        for (const name of ${JSON.stringify(exports)}) {
          if (typeof entry[name] !== "function") throw new Error("Missing export: " + name);
        }
      `]);
    }
    if (suffix) {
      // Browser resolution also rejects accidental Node builtins in React Native bundles.
      await build({
        stdin: { contents: `export * from ${specifier}`, resolveDir: consumer },
        bundle: true,
        platform: "browser",
        format: "esm",
        write: false,
        logLevel: "silent",
      });
    }
  }
  // CI publishes exactly the archive that passed these checks.
  if (process.argv[2]) copyFileSync(archive, resolve(process.argv[2]));
  console.log(`Verified ${manifest.name}@${manifest.version}: all entry points load in CJS/ESM; frontend bundles need no Node/Kafka dependencies.`);
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
