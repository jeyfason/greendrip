import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import simpleGit from "simple-git";
import { applyPlan } from "../lib/applier.js";

const profile = { name: "Test User", email: "test@example.com" };
const remoteUrl = "https://x-access-token:fake@example.invalid/test/daily-log.git";

const plan = {
  entries: [
    { date: "2024-01-02T09:15:00+05:30", message: "fix parser" },
    { date: "2024-01-02T14:30:00+05:30", message: "add tests" },
    { date: "2024-01-04T22:10:00+05:30", message: "refactor auth" },
  ],
  appliedCount: 0,
};

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "gogreen-apply-"));
}

test("applies all entries as backdated commits", async () => {
  const dir = await tempDir();
  const count = await applyPlan({ plan, profile, remoteUrl, workDir: dir, planPath: path.join(dir, "plan.json") });
  assert.equal(count, 3);

  const git = simpleGit(dir);
  const log = await git.log();
  assert.equal(log.total, 3);

  const dates = (await git.raw(["log", "--format=%aI", "--reverse"])).trim().split("\n");
  assert.equal(dates.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(Date.parse(dates[i]), Date.parse(plan.entries[i].date), `author date ${i} mismatch`);
  }

  const messages = (await git.raw(["log", "--format=%s", "--reverse"])).trim().split("\n");
  assert.deepEqual(messages, ["fix parser", "add tests", "refactor auth"]);

  const logFile = await fs.readFile(path.join(dir, "activity.log"), "utf8");
  assert.equal(logFile.trim().split("\n").length, 3);
});

test("resumes from appliedCount instead of duplicating commits", async () => {
  const dir = await tempDir();
  const partial = { entries: plan.entries.slice(0, 1), appliedCount: 0 };
  await applyPlan({ plan: partial, profile, remoteUrl, workDir: dir, planPath: path.join(dir, "plan.json") });

  const resumed = {
    entries: plan.entries,
    appliedCount: 1,
  };
  const count = await applyPlan({ plan: resumed, profile, remoteUrl, workDir: dir, planPath: path.join(dir, "plan.json") });
  assert.equal(count, 3);

  const git = simpleGit(dir);
  const log = await git.log();
  assert.equal(log.total, 3);
  assert.equal(resumed.appliedCount, 3);
});

test("uses main branch and local author config", async () => {
  const dir = await tempDir();
  await applyPlan({ plan: { ...plan, appliedCount: 0 }, profile, remoteUrl, workDir: dir, planPath: path.join(dir, "plan.json") });
  const git = simpleGit(dir);
  const branch = (await git.raw(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  assert.equal(branch, "main");
  const name = (await git.raw(["config", "user.name"])).trim();
  const email = (await git.raw(["config", "user.email"])).trim();
  assert.equal(name, "Test User");
  assert.equal(email, "test@example.com");
});

test("calls pushImpl once when commits were made", async () => {
  const dir = await tempDir();
  let pushes = 0;
  await applyPlan({ plan: { ...plan, appliedCount: 0 }, profile, remoteUrl, workDir: dir, planPath: path.join(dir, "plan.json"), pushImpl: () => { pushes++; } });
  assert.equal(pushes, 1);
});

test("does not call pushImpl when nothing to apply", async () => {
  const dir = await tempDir();
  const done = { entries: plan.entries, appliedCount: 3 };
  let pushes = 0;
  await applyPlan({ plan: done, profile, remoteUrl, workDir: dir, planPath: path.join(dir, "plan.json"), pushImpl: () => { pushes++; } });
  assert.equal(pushes, 0);
});