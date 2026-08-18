import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFlags } from "../lib/cli.js";

test("no args yields no flags", () => {
  assert.deepEqual(parseFlags([]), { help: false, version: false, reset: false, daily: false, preview: false });
});

test("--help and -h set help", () => {
  assert.equal(parseFlags(["--help"]).help, true);
  assert.equal(parseFlags(["-h"]).help, true);
});

test("--version sets version", () => {
  assert.equal(parseFlags(["--version"]).version, true);
});

test("--reset sets reset", () => {
  assert.equal(parseFlags(["--reset"]).reset, true);
});

test("--daily sets daily", () => {
  assert.equal(parseFlags(["--daily"]).daily, true);
});

test("--preview sets preview", () => {
  assert.equal(parseFlags(["--preview"]).preview, true);
});

test("unknown flags are ignored", () => {
  assert.deepEqual(parseFlags(["--bogus", "-x"]), { help: false, version: false, reset: false, daily: false, preview: false });
});

test("help takes precedence over all other flags", () => {
  assert.deepEqual(parseFlags(["--daily", "--help"]), { help: true, version: false, reset: false, daily: true, preview: false });
});

test("version takes precedence over reset, daily and preview", () => {
  assert.deepEqual(parseFlags(["--reset", "--version", "--daily"]), { help: false, version: true, reset: true, daily: true, preview: false });
});

test("reset takes precedence over daily and preview", () => {
  const flags = parseFlags(["--reset", "--preview"]);
  assert.equal(flags.reset, true);
  assert.equal(flags.preview, true);
});