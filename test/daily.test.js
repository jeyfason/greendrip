import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runDaily } from "../lib/daily.js";

function stubFetch(status, body) {
  return async () => ({ ok: status === 200, status, json: async () => body, text: async () => JSON.stringify(body) });
}

test("runDaily on a rest day applies nothing and creates no workdir", async () => {
  const now = new Date("2026-08-17T12:00:00Z");
  let restSeed = -1;
  for (let seed = 0; seed < 500; seed++) {
    const { generateDailyPlan } = await import("../lib/planner.js");
    if (generateDailyPlan({ now, seed }).restDay) { restSeed = seed; break; }
  }
  assert.notStrictEqual(restSeed, -1, "found a rest seed");

  const workDir = path.join(os.tmpdir(), "gogreen-rest-" + Date.now() + "-" + restSeed);
  const result = await runDaily({
    token: "t", username: "u", repo: "daily-log", now, seed: restSeed,
    workDir, fetchImpl: stubFetch(200, {}),
  });
  assert.deepEqual(result, { restDay: true, count: 0 });
  await assert.rejects(fs.access(workDir), (err) => err.code === "ENOENT");
  await fs.rm(workDir, { recursive: true, force: true });
});

test("runDaily on an active day applies today's commits and pushes", async () => {
  const now = new Date("2026-08-17T12:00:00Z");
  const { generateDailyPlan } = await import("../lib/planner.js");
  let seed = -1;
  for (let s = 0; s < 500; s++) {
    if (!generateDailyPlan({ now, seed: s }).restDay) { seed = s; break; }
  }
  const expectedCount = generateDailyPlan({ now, seed }).entries.length;
  assert.ok(expectedCount >= 1 && expectedCount <= 8);

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "gogreen-active-"));
  let pushed = false;
  const result = await runDaily({
    token: "t", username: "u", repo: "daily-log", now, seed,
    workDir, fetchImpl: stubFetch(200, {}),
    pushImpl: async () => { pushed = true; },
  });

  assert.deepEqual(result, { restDay: false, count: expectedCount });
  assert.ok(pushed, "pushImpl called");
  const log = await fs.readFile(path.join(workDir, "activity.log"), "utf8");
  assert.strictEqual(log.trim().split("\n").length, expectedCount);
  const count = (await import("child_process")).execSync("git -C " + workDir + " log --oneline | wc -l").toString().trim();
  assert.strictEqual(count, String(expectedCount));
  await fs.rm(workDir, { recursive: true, force: true });
});

test("runDaily fails clearly on a bad token", async () => {
  const now = new Date("2026-08-17T12:00:00Z");
  const { generateDailyPlan } = await import("../lib/planner.js");
  let seed = -1;
  for (let s = 0; s < 500; s++) {
    if (!generateDailyPlan({ now, seed: s }).restDay) { seed = s; break; }
  }
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "gogreen-bad-"));
  // getUser runs before the rest-day check, so any seed throws on a 401.
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => "Bad credentials" });
  await assert.rejects(
    runDaily({ token: "bad", username: "u", repo: "daily-log", now, seed, workDir, fetchImpl }),
    /GitHub API 401/
  );
  await fs.rm(workDir, { recursive: true, force: true });
});