import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { loadConfig, saveConfig, resetConfig, acquireCredentials } from "../lib/config.js";

function tmpFile(name = ".gogreen.json") {
  return path.join(mkdtempSync(path.join(os.tmpdir(), "gogreen-config-")), name);
}

test("resetConfig removes an existing file and reports it", async () => {
  const file = tmpFile();
  await saveConfig({ username: "u", token: "t" }, file);
  assert.equal(await resetConfig(file), true);
  assert.equal(await loadConfig(file), null);
});

test("resetConfig reports false when nothing was there", async () => {
  assert.equal(await resetConfig(tmpFile("nope.json")), false);
});

test("acquireCredentials reuses an existing config without asking or verifying", async () => {
  const config = { username: "u", token: "t" };
  const asks = [];
  const result = await acquireCredentials({ config, ask: async () => asks.push("called") });
  assert.equal(result, config);
  assert.deepEqual(asks, []);
});

test("acquireCredentials verifies before saving new credentials", async () => {
  const file = tmpFile();
  const verified = [];
  const result = await acquireCredentials({
    config: null,
    file,
    ask: async () => "input",
    verify: async (c) => verified.push(c),
    save: saveConfig,
  });
  assert.equal(verified.length, 1);
  assert.equal(result.username, "input");
  assert.equal(result.token, "input");
  assert.deepEqual(await loadConfig(file), { username: "input", token: "input" });
});

test("acquireCredentials retries on 401 and never saves a rejected token", async () => {
  const file = tmpFile();
  const answers = ["bad-token", "bad-token", "good-token", "good-token"];
  const result = await acquireCredentials({
    config: null,
    file,
    ask: async () => answers.shift(),
    verify: async (c) => {
      if (c.token === "bad-token") throw new Error("GitHub API 401 on /users/x");
      return c;
    },
    save: saveConfig,
  });
  assert.equal(result.token, "good-token");
  assert.deepEqual(await loadConfig(file), { username: "good-token", token: "good-token" });
});

test("acquireCredentials gives up with guidance after repeated 401s and saves nothing", async () => {
  const file = tmpFile();
  await assert.rejects(
    acquireCredentials({
      config: null,
      file,
      ask: async () => "still-bad",
      verify: async () => {
        throw new Error("GitHub API 401 on /users/x");
      },
      save: saveConfig,
    }),
    /greendrip --reset/
  );
  assert.equal(await loadConfig(file), null);
});

test("acquireCredentials rethrows non-401 errors immediately", async () => {
  await assert.rejects(
    acquireCredentials({
      config: null,
      ask: async () => "input",
      verify: async () => {
        throw new Error("network down");
      },
      save: saveConfig,
    }),
    /network down/
  );
});