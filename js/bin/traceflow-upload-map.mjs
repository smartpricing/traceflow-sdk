#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { parseArgs } from "node:util";

try {
  const { values } = parseArgs({
    options: Object.fromEntries(
      [
        "url",
        "source",
        "environment",
        "release",
        "dist",
        "platform",
        "filename",
        "map",
        "help",
      ].map((key) => [key, { type: key === "help" ? "boolean" : "string" }]),
    ),
  });
  if (values.help) {
    console.log(
      "traceflow-upload-map --url https://traceflow.example --source webapp --environment production --release 1.0 --dist BUILD_ID --platform browser --filename /_nuxt/app.js --map ./app.js.map\nSet TRACEFLOW_API_KEY to a private service key. Upload maps before releasing the matching build.",
    );
  } else {
    for (const key of [
      "url",
      "source",
      "environment",
      "release",
      "dist",
      "platform",
      "filename",
      "map",
    ])
      if (!values[key]) throw new Error(`Missing --${key}`);
    if (!process.env.TRACEFLOW_API_KEY)
      throw new Error("Set TRACEFLOW_API_KEY");
    const url = new URL(values.url);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("Invalid --url");
    if ((await stat(values.map)).size > 10 * 1024 * 1024)
      throw new Error("Source map exceeds 10 MiB");
    const map = JSON.parse(await readFile(values.map, "utf8"));
    const { source, environment, release, dist, platform, filename } = values;
    const response = await fetch(
      values.url.replace(/\/$/, "") + "/api/v1/client-error-artifacts",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": process.env.TRACEFLOW_API_KEY,
        },
        body: JSON.stringify({
          source,
          environment,
          release,
          dist,
          platform,
          filename,
          map,
        }),
        signal: AbortSignal.timeout(30000),
        redirect: "error",
      },
    );
    if (!response.ok)
      throw new Error(`Artifact upload failed (${response.status})`);
    const result = await response.json();
    console.log(
      `${result.duplicate ? "Already uploaded" : "Uploaded"} ${filename}: ${result.artifact_id}`,
    );
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Artifact upload failed",
  );
  process.exitCode = 1;
}
