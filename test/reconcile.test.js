import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { applyPlan } from "../lib/applier.js";

const profile = { name: "Test User", email: "test@example.com" };

const entries = [
  { date: "2024-01-02T09:15:00+05:30", message: "fix parser" },
  { date: "2024-01-02T14:30:00+05:30", message: "add tests" },
];

function git(dir, ...args) {
  return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
}

async function tempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function initRepo(dir) {
  await fs.mkdir(dir, { recursive: true });
  git(dir, "init", "-b", "main");
  git(dir, "config", "user.name", "Test User");
  git(dir, "config", "user.email", "test@example.com");
}

async function commitFile(dir, file, content, message) {
  await fs.writeFile(path.join(dir, file), content + "\n");
  git(dir, "add", file);
  git(dir, "commit", "-m", message);
}

async function commitCount(dir) {
  return git(dir, "log", "--oneline").split("\n").filter(Boolean).length;
}

async function messages(dir) {
  return git(dir, "log", "--format=%s").split("\n").filter(Boolean);
}

async function runApplyPlan(workDir, remoteUrl) {
  return applyPlan({
    plan: { entries, appliedCount: 0 },
    profile,
    remoteUrl,
    workDir,
    planPath: path.join(workDir, "plan.json"),
    pushImpl: async () => {},
  });
}

test("reconcile: unborn local aligns to origin/main before applying", async () => {
  const originDir = await tempDir("gogreen-recon-origin-");
  await initRepo(originDir);
  await commitFile(originDir, "a.txt", "one", "origin one");

  const workDir = await tempDir("gogreen-recon-unborn-");
  await fs.rm(workDir, { recursive: true, force: true });

  await runApplyPlan(workDir, "file://" + originDir);

  assert.equal(await commitCount(workDir), 3);
  const log = await fs.readFile(path.join(workDir, "activity.log"), "utf8");
  assert.equal(log.trim().split("\n").length, 2);
  assert.deepEqual(await messages(workDir), ["add tests", "fix parser", "origin one"]);
  await fs.rm(workDir, { recursive: true, force: true });
  await fs.rm(originDir, { recursive: true, force: true });
});

test("reconcile: behind-only local resets onto origin/main before applying", async () => {
  const originDir = await tempDir("gogreen-recon-origin-");
  await initRepo(originDir);
  await commitFile(originDir, "a.txt", "one", "origin one");
  await commitFile(originDir, "b.txt", "two", "origin two");
  await commitFile(originDir, "c.txt", "three", "origin three");

  const workDir = await tempDir("gogreen-recon-behind-");
  await initRepo(workDir);
  git(workDir, "remote", "add", "origin", "file://" + originDir);
  git(workDir, "fetch", "origin", "main");
  git(workDir, "reset", "--hard", git(workDir, "rev-parse", "origin/main~2"));

  await runApplyPlan(workDir, "file://" + originDir);

  assert.equal(await commitCount(workDir), 5);
  assert.deepEqual(await messages(workDir), ["add tests", "fix parser", "origin three", "origin two", "origin one"]);
  await fs.rm(workDir, { recursive: true, force: true });
  await fs.rm(originDir, { recursive: true, force: true });
});

test("reconcile: ahead-only local keeps its commits (no reset)", async () => {
  const originDir = await tempDir("gogreen-recon-origin-");
  await initRepo(originDir);
  await commitFile(originDir, "a.txt", "one", "origin one");

  const workDir = await tempDir("gogreen-recon-ahead-");
  await initRepo(workDir);
  git(workDir, "remote", "add", "origin", "file://" + originDir);
  git(workDir, "fetch", "origin", "main");
  git(workDir, "reset", "--hard", "origin/main");
  await commitFile(workDir, "x.txt", "local1", "local one");
  await commitFile(workDir, "y.txt", "local2", "local two");

  await runApplyPlan(workDir, "file://" + originDir);

  assert.equal(await commitCount(workDir), 5);
  assert.deepEqual(await messages(workDir), ["add tests", "fix parser", "local two", "local one", "origin one"]);
  await fs.rm(workDir, { recursive: true, force: true });
  await fs.rm(originDir, { recursive: true, force: true });
});

test("reconcile: diverged local keeps its un-pushed commits (no destructive reset)", async () => {
  const originDir = await tempDir("gogreen-recon-origin-");
  await initRepo(originDir);
  await commitFile(originDir, "o.txt", "origin", "origin commit");

  const workDir = await tempDir("gogreen-recon-diverged-");
  await initRepo(workDir);
  await commitFile(workDir, "w.txt", "local", "local-only commit");
  git(workDir, "remote", "add", "origin", "file://" + originDir);

  await runApplyPlan(workDir, "file://" + originDir);

  assert.equal(await commitCount(workDir), 3);
  assert.ok((await messages(workDir)).includes("local-only commit"));
  await fs.rm(workDir, { recursive: true, force: true });
  await fs.rm(originDir, { recursive: true, force: true });
});

test("reconcile: existing activity.log history is preserved on a fresh daily run", async () => {
  const originDir = await tempDir("gogreen-recon-hist-");
  await initRepo(originDir);
  const history = [
    "2024-01-01T10:00:00+00:00 - first commit",
    "2024-01-02T10:00:00+00:00 - second commit",
    "2024-01-03T10:00:00+00:00 - third commit",
  ];
  await commitFile(originDir, "activity.log", history.join("\n"), "origin history");

  const workDir = await tempDir("gogreen-recon-hist-work-");
  await fs.rm(workDir, { recursive: true, force: true });

  await applyPlan({
    plan: { entries, appliedCount: 0, totalCommits: 2, activeDays: 1, restDays: 0 },
    profile,
    remoteUrl: "file://" + originDir,
    workDir,
    planPath: path.join(workDir, "plan.json"),
    pushImpl: async () => {},
  });

  const log = await fs.readFile(path.join(workDir, "activity.log"), "utf8");
  const lines = log.trim().split("\n");
  assert.equal(lines.length, 5, "3 historical + 2 new lines");
  assert.deepEqual(lines.slice(0, 3), history);
  assert.equal(await commitCount(workDir), 3, "1 origin + 2 applied commits");
  await fs.rm(workDir, { recursive: true, force: true });
  await fs.rm(originDir, { recursive: true, force: true });
});

test("reconcile: unreachable origin is ignored gracefully", async () => {
  const workDir = await tempDir("gogreen-recon-offline-");

  await runApplyPlan(workDir, "file:///nonexistent-origin-repo");

  assert.equal(await commitCount(workDir), 2);
  const log = await fs.readFile(path.join(workDir, "activity.log"), "utf8");
  assert.equal(log.trim().split("\n").length, 2);
  await fs.rm(workDir, { recursive: true, force: true });
});