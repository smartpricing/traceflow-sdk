import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldRelease } from "./release-version.mjs";

const main = { event: "push", branch: "main", version: "2.8.0", previous: "2.8.0" };

test("dependency-only package changes do not publish", () => {
  assert.equal(shouldRelease(main), false);
});

test("patch, minor and major version increases publish", () => {
  for (const version of ["2.8.1", "2.9.0", "2.10.0", "3.0.0"]) {
    assert.equal(shouldRelease({ ...main, version }), true);
  }
});

test("downgrades and non-stable versions fail closed", () => {
  for (const version of ["2.7.9", "1.9.0", "2.8.1-beta.1", "02.8.1", "latest"]) {
    assert.throws(() => shouldRelease({ ...main, version }));
  }
  assert.throws(() => shouldRelease({ ...main, previous: undefined }));
});

test("manual recovery requires the exact committed version", () => {
  assert.equal(shouldRelease({ ...main, event: "workflow_dispatch", requested: "2.8.0" }), true);
  assert.throws(() => shouldRelease({ ...main, event: "workflow_dispatch", requested: "2.8.1" }));
});

test("legacy release branches must match the committed version", () => {
  assert.equal(shouldRelease({ ...main, branch: "release/2.8.0" }), true);
  assert.throws(() => shouldRelease({ ...main, branch: "release/2.8.1" }));
  assert.throws(() => shouldRelease({ ...main, branch: "feature/example" }));
  assert.throws(() => shouldRelease({ ...main, event: "pull_request" }));
});
