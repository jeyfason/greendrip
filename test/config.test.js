import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig, saveConfig } from "../lib/config.js";

test("save then load round-trips the config", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gogreen-config-"));
  const file = path.join(dir, ".gogreen.json");
  await saveConfig({ username: "fenrir2608", token: "abc123" }, file);
  const loaded = await loadConfig(file);
  assert.deepEqual(loaded, { username: "fenrir2608", token: "abc123" });
});

test("loadConfig returns null when the file is missing", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gogreen-config-"));
  const loaded = await loadConfig(path.join(dir, "nope.json"));
  assert.equal(loaded, null);
});