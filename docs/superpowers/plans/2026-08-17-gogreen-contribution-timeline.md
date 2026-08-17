# goGreen v2 — Realistic Contribution Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn goGreen into a CLI that connects a GitHub account, detects the account creation year, lets the user pick a start year, and backfills a private repo with realistic-looking commits (rest days, varied intensity, natural times) from that year through today.

**Architecture:** Small ES-module CLI with no new runtime dependencies. Four focused lib modules (`planner`, `config`, `github`, `applier`) orchestrated by `index.js`. Planner is pure and seedable; GitHub client and applier are injectable for offline tests.

**Tech Stack:** Node.js (ES modules, `node:test`, built-in `fetch` and `readline`), existing deps `moment`, `simple-git`, `jsonfile`, `random`.

## Global Constraints

- Node.js ≥ 18 (global `fetch`); package already has `"type": "module"`.
- NO new runtime dependencies. Tests use built-in `node:test` only.
- The plan must never contain a commit dated after "now" (injected via `now` param, defaults to `new Date()`).
- Rest days ≈ 22% of all days: 12% of weekdays, 45% of weekends.
- Intensity: 68% of active days get 1–2 commits, 22% get 3–4, 10% get 5–8.
- Commit times from windows: 09–12h (40%), 13–18h (35%), 19–23h (20%), 00–03h (5%).
- Messages: template pool, no exact repeats within a plan.
- Private repo name: `daily-log`. Local work dir: `.gogreen-work/` (gitignored). Progress file: `plan.json` (gitignored). Credentials: `.gogreen.json` (gitignored).
- CLI only. English output. Exit code 1 on fatal errors.

---

### Task 1: Planner — realistic timeline generator

**Files:**
- Create: `lib/planner.js`
- Test: `test/planner.test.js`

**Interfaces:**
- Produces: `generatePlan({ startYear, seed, now })` →
  `{ startYear, totalCommits, activeDays, restDays, entries: [{ date, message }] }`
  where `date` is a moment-`format()` ISO-8601 string with timezone offset
  (e.g. `2024-01-15T10:30:00+05:30`), `seed` is an optional string (deterministic
  when provided), `now` is an optional Date (defaults to `new Date()`), and
  `startYear` is a number.

- [ ] **Step 1: Write the failing tests**

Create `test/planner.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import moment from "moment";
import { generatePlan } from "../lib/planner.js";

const plan = generatePlan({ startYear: 2024, seed: "test-seed" });

test("rest-day ratio is near 22% (17-27%)", () => {
  const totalDays = plan.activeDays + plan.restDays;
  const ratio = plan.restDays / totalDays;
  assert.ok(ratio >= 0.17 && ratio <= 0.27, `rest ratio was ${ratio}`);
});

test("never generates a date after now", () => {
  const now = new Date("2024-12-31T23:59:00");
  const p = generatePlan({ startYear: 2024, seed: "test-seed", now });
  for (const entry of p.entries) {
    assert.ok(Date.parse(entry.date) <= now.getTime(), `future date: ${entry.date}`);
  }
  for (const entry of plan.entries) {
    assert.ok(Date.parse(entry.date) <= Date.now(), `future date: ${entry.date}`);
  }
});

test("all dates are valid ISO-8601 moment formats", () => {
  assert.ok(plan.entries.length > 100);
  for (const entry of plan.entries) {
    assert.ok(moment(entry.date).isValid(), `invalid date: ${entry.date}`);
    assert.equal(moment(entry.date).format(), entry.date, `non-canonical: ${entry.date}`);
  }
});

test("no two entries share the same message", () => {
  const messages = new Set(plan.entries.map((e) => e.message));
  assert.equal(messages.size, plan.entries.length);
});

test("daily commit counts are within 1-8 and average 2.0-3.2", () => {
  const counts = new Map();
  for (const entry of plan.entries) {
    const day = entry.date.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const values = [...counts.values()];
  for (const n of values) {
    assert.ok(n >= 1 && n <= 8, `count out of range: ${n}`);
  }
  const mean = plan.totalCommits / plan.activeDays;
  assert.ok(mean >= 2.0 && mean <= 3.2, `mean was ${mean}`);
});

test("same seed produces the identical plan", () => {
  const a = generatePlan({ startYear: 2024, seed: "dup" });
  const b = generatePlan({ startYear: 2024, seed: "dup" });
  assert.deepEqual(a, b);
});

test("different seeds produce different plans", () => {
  const a = generatePlan({ startYear: 2024, seed: "one" });
  const b = generatePlan({ startYear: 2024, seed: "two" });
  assert.notDeepEqual(a, b);
});

test("plan only contains entries from the start year onward", () => {
  for (const entry of plan.entries) {
    assert.ok(entry.date.slice(0, 4) >= "2024", `before start year: ${entry.date}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/planner.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` (no `../lib/planner.js`).

- [ ] **Step 3: Write the implementation**

Create `lib/planner.js`:

```js
import random from "random";
import moment from "moment";

const WEEKDAY_REST = 0.12;
const WEEKEND_REST = 0.45;

const TIME_WINDOWS = [
  { start: 9, end: 12, weight: 0.4 },
  { start: 13, end: 18, weight: 0.35 },
  { start: 19, end: 23, weight: 0.2 },
  { start: 0, end: 3, weight: 0.05 },
];

const VERBS = [
  "fix", "add", "refactor", "update", "improve", "optimize",
  "simplify", "clean up", "document", "rename", "extract", "migrate",
];
const NOUNS = [
  "parser", "auth module", "config loader", "logger", "api client",
  "db schema", "build pipeline", "error handling", "caching layer",
  "middleware", "utils", "cli parser", "rate limiter", "session store",
  "event bus", "query builder", "test fixtures", "docs", "dependencies",
  "type definitions",
];
const SUFFIXES = ["", "", "", " for v2", " in prod", " across modules", " after review", " per issue #42", " on weekends", " while on the train"];

function createRng(seed) {
  return seed ? new random.Random(random.RNGFactory(String(seed))) : new random.Random();
}

function pick(rng, arr) {
  return arr[rng.int(0, arr.length - 1)];
}

function weightedWindow(rng) {
  const roll = rng.float(0, 1);
  let acc = 0;
  for (const window of TIME_WINDOWS) {
    acc += window.weight;
    if (roll <= acc) return window;
  }
  return TIME_WINDOWS[TIME_WINDOWS.length - 1];
}

function buildMessage(rng, used) {
  let message = "";
  let attempts = 0;
  do {
    message = `${pick(rng, VERBS)} ${pick(rng, NOUNS)}${pick(rng, SUFFIXES)}`.trim();
    attempts++;
  } while (used.has(message) && attempts < 50);
  if (used.has(message)) message = `${message} #${used.size}`;
  used.add(message);
  return message;
}

export function generatePlan({ startYear, seed, now = new Date() }) {
  const rng = createRng(seed);
  const used = new Set();
  const entries = [];
  const day = moment({ year: startYear, month: 0, day: 1 });
  const end = moment(now);
  let activeDays = 0;
  let restDays = 0;

  while (day.isSameOrBefore(end, "day")) {
    const isWeekend = day.isoWeekday() >= 6;
    const restProbability = isWeekend ? WEEKEND_REST : WEEKDAY_REST;

    if (rng.float(0, 1) < restProbability) {
      restDays++;
    } else {
      activeDays++;
      const roll = rng.float(0, 1);
      const count =
        roll < 0.68 ? rng.int(1, 2) : roll < 0.9 ? rng.int(3, 4) : rng.int(5, 8);

      const minutes = [];
      for (let i = 0; i < count; i++) {
        const window = weightedWindow(rng);
        minutes.push(window.start * 60 + rng.int(0, (window.end - window.start) * 60));
      }
      minutes.sort((a, b) => a - b);

      for (const totalMinutes of minutes) {
        const timestamp = day.clone().startOf("day").add(totalMinutes, "minutes");
        if (timestamp.isAfter(end)) break;
        entries.push({ date: timestamp.format(), message: buildMessage(rng, used) });
      }
    }
    day.add(1, "day");
  }

  return {
    startYear,
    totalCommits: entries.length,
    activeDays,
    restDays,
    entries,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/planner.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/planner.js test/planner.test.js
git commit -m "feat: add realistic contribution timeline planner"
```

---

### Task 2: Config — credentials persistence

**Files:**
- Create: `lib/config.js`
- Test: `test/config.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `loadConfig(path = "./.gogreen.json")` → `Promise<object | null>` (null when file missing or unreadable)
  - `saveConfig(config, path = "./.gogreen.json")` → `Promise<void>` (writes JSON with 2-space indent)

- [ ] **Step 1: Write the failing tests**

Create `test/config.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/config.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write the implementation**

Create `lib/config.js`:

```js
import jsonfile from "jsonfile";

export async function loadConfig(path = "./.gogreen.json") {
  try {
    return await jsonfile.readFile(path);
  } catch {
    return null;
  }
}

export async function saveConfig(config, path = "./.gogreen.json") {
  await jsonfile.writeFile(path, config, { spaces: 2 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/config.test.js`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/config.js test/config.test.js
git commit -m "feat: add config persistence for credentials"
```

---

### Task 3: GitHub client — account detection and repo creation

**Files:**
- Create: `lib/github.js`
- Test: `test/github.test.js`

**Interfaces:**
- Consumes: nothing (fetch injected).
- Produces: `createGithub({ token, username, fetchImpl = fetch })` → object with:
  - `getUser()` → `Promise<{ name, email, creationYear }>` — `name` falls back to username, `email` falls back to `${username}@users.noreply.github.com`, `creationYear` is the UTC year of `created_at`.
  - `ensurePrivateRepo(repoName)` → `Promise<string>` — returns repo name; creates via `POST /user/repos` with `{ name, private: true }` only if `GET /repos/{username}/{repoName}` is not 200.
  - `remoteUrl(repoName)` → `"https://x-access-token:<token>@github.com/<username>/<repoName>.git"`
  - Throws `Error("GitHub API <status> on <path>: <body>")` on non-2xx.

- [ ] **Step 1: Write the failing tests**

Create `test/github.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGithub } from "../lib/github.js";

function mockFetch(routes) {
  return async (url, opts = {}) => {
    const key = `${opts.method ?? "GET"} ${url}`;
    const route = routes[key];
    if (!route) return { ok: false, status: 404, text: async () => "not found" };
    if (route.status !== 200) return { ok: false, status: route.status, text: async () => route.body ?? "" };
    return { ok: true, status: 200, json: async () => route.body };
  };
}

test("getUser extracts name, email and creation year", async () => {
  const fetchImpl = mockFetch({
    "GET https://api.github.com/users/fenrir2608": {
      status: 200,
      body: {
        login: "fenrir2608",
        name: "Fason King",
        email: "fason@example.com",
        created_at: "2016-04-05T14:00:00Z",
      },
    },
  });
  const github = createGithub({ token: "tok", username: "fenrir2608", fetchImpl });
  const user = await github.getUser();
  assert.equal(user.name, "Fason King");
  assert.equal(user.email, "fason@example.com");
  assert.equal(user.creationYear, 2016);
});

test("getUser falls back to username and noreply email", async () => {
  const fetchImpl = mockFetch({
    "GET https://api.github.com/users/ghost": {
      status: 200,
      body: { login: "ghost", name: null, email: null, created_at: "2020-01-01T00:00:00Z" },
    },
  });
  const github = createGithub({ token: "tok", username: "ghost", fetchImpl });
  const user = await github.getUser();
  assert.equal(user.name, "ghost");
  assert.equal(user.email, "ghost@users.noreply.github.com");
  assert.equal(user.creationYear, 2020);
});

test("ensurePrivateRepo creates the repo when it does not exist", async () => {
  const fetchImpl = mockFetch({
    "GET https://api.github.com/repos/fenrir2608/daily-log": { status: 404, body: "not found" },
    "POST https://api.github.com/user/repos": { status: 200, body: { name: "daily-log" } },
  });
  const github = createGithub({ token: "tok", username: "fenrir2608", fetchImpl });
  const name = await github.ensurePrivateRepo("daily-log");
  assert.equal(name, "daily-log");
});

test("ensurePrivateRepo skips creation when repo exists", async () => {
  let postCalled = false;
  const base = mockFetch({
    "GET https://api.github.com/repos/fenrir2608/daily-log": { status: 200, body: { name: "daily-log" } },
  });
  const fetchImpl = async (url, opts) => {
    if (opts?.method === "POST") postCalled = true;
    return base(url, opts);
  };
  const github = createGithub({ token: "tok", username: "fenrir2608", fetchImpl });
  await github.ensurePrivateRepo("daily-log");
  assert.equal(postCalled, false);
});

test("API errors throw with status and path", async () => {
  const fetchImpl = mockFetch({
    "GET https://api.github.com/users/ghost": { status: 401, body: "Bad credentials" },
  });
  const github = createGithub({ token: "bad", username: "ghost", fetchImpl });
  await assert.rejects(() => github.getUser(), /401.*users\/ghost/);
});

test("remoteUrl embeds the token", () => {
  const github = createGithub({ token: "tok123", username: "fenrir2608" });
  assert.equal(
    github.remoteUrl("daily-log"),
    "https://x-access-token:tok123@github.com/fenrir2608/daily-log.git"
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/github.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write the implementation**

Create `lib/github.js`:

```js
const API = "https://api.github.com";

export function createGithub({ token, username, fetchImpl = fetch }) {
  const headers = {
    Authorization: `token ${token}`,
    "User-Agent": "gogreen",
    Accept: "application/vnd.github+json",
  };

  async function request(path, opts = {}) {
    const res = await fetchImpl(`${API}${path}`, { ...opts, headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GitHub API ${res.status} on ${path}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  return {
    async getUser() {
      const user = await request(`/users/${username}`);
      return {
        name: user.name || username,
        email: user.email || `${username}@users.noreply.github.com`,
        creationYear: new Date(user.created_at).getUTCFullYear(),
      };
    },

    async ensurePrivateRepo(repoName) {
      const exists = await fetchImpl(`${API}/repos/${username}/${repoName}`, { headers })
        .then((res) => res.status === 200)
        .catch(() => false);
      if (!exists) {
        await request(`/user/repos`, {
          method: "POST",
          body: JSON.stringify({ name: repoName, private: true }),
        });
      }
      return repoName;
    },

    remoteUrl(repoName) {
      return `https://x-access-token:${token}@github.com/${username}/${repoName}.git`;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/github.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/github.js test/github.test.js
git commit -m "feat: add GitHub API client for account and repo"
```

---

### Task 4: Applier — backdated commits with resume

**Files:**
- Create: `lib/applier.js`
- Test: `test/applier.test.js`

**Interfaces:**
- Consumes: plan shape from Task 1 (`{ entries: [{ date, message }], appliedCount? }`), profile shape from Task 3 (`{ name, email }`).
- Produces: `applyPlan({ plan, profile, remoteUrl, pushImpl, workDir = ".gogreen-work", planPath = "plan.json" })` → `Promise<number>` (total applied count).
  - Initializes `workDir` as a git repo (branch `main`, local author config from `profile`), adds `origin` = `remoteUrl` (never fetched — only push happens).
  - Rebuilds `workDir/activity.log` deterministically from `plan.entries.slice(0, appliedCount)` so a resumed run continues cleanly.
  - For each remaining entry: append `"<date> - <message>"` to `activity.log`, stage, `git commit -m <message> --date=<date>`.
  - After each commit, writes `plan.appliedCount` back to `planPath` (progress for resume).
  - Calls `pushImpl(git)` once at the end if any commit was made and `pushImpl` was provided. Never pushes when nothing was applied.

- [ ] **Step 1: Write the failing tests**

Create `test/applier.test.js`:

```js
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
  await applyPlan({ plan, profile, remoteUrl, workDir: dir, planPath: path.join(dir, "plan.json") });
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
  await applyPlan({ plan, profile, remoteUrl, workDir: dir, planPath: path.join(dir, "plan.json"), pushImpl: () => { pushes++; } });
  assert.equal(pushes, 1);
});

test("does not call pushImpl when nothing to apply", async () => {
  const dir = await tempDir();
  const done = { entries: plan.entries, appliedCount: 3 };
  let pushes = 0;
  await applyPlan({ plan: done, profile, remoteUrl, workDir: dir, planPath: path.join(dir, "plan.json"), pushImpl: () => { pushes++; } });
  assert.equal(pushes, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/applier.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write the implementation**

Create `lib/applier.js`:

```js
import fs from "node:fs/promises";
import path from "node:path";
import simpleGit from "simple-git";
import jsonfile from "jsonfile";

const LOG_FILE = "activity.log";

export async function applyPlan({ plan, profile, remoteUrl, pushImpl, workDir = ".gogreen-work", planPath = "plan.json" }) {
  const workPath = path.resolve(workDir);
  await fs.mkdir(workPath, { recursive: true });
  const git = simpleGit(workPath);

  const isRepo = await fs.access(path.join(workPath, ".git")).then(() => true).catch(() => false);
  if (!isRepo) {
    await git.raw(["init", "-b", "main"]);
    await git.raw(["config", "user.name", profile.name]);
    await git.raw(["config", "user.email", profile.email]);
    await git.addRemote("origin", remoteUrl);
  }

  const applied = plan.appliedCount ?? 0;
  const logPath = path.join(workPath, LOG_FILE);
  const logContent = plan.entries.slice(0, applied).map((e) => `${e.date} - ${e.message}`).join("\n");
  await fs.writeFile(logPath, logContent.endsWith("\n") || logContent === "" ? logContent : logContent + "\n");

  const remaining = plan.entries.slice(applied);
  for (const entry of remaining) {
    await fs.appendFile(logPath, `${entry.date} - ${entry.message}\n`);
    await git.add([LOG_FILE]);
    await git.commit(entry.message, { "--date": entry.date });
    plan.appliedCount = (plan.appliedCount ?? 0) + 1;
    await jsonfile.writeFile(planPath, plan, { spaces: 2 });
  }

  if (remaining.length > 0 && pushImpl) {
    await pushImpl(git);
  }
  return plan.appliedCount ?? 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/applier.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/applier.js test/applier.test.js
git commit -m "feat: add plan applier with backdated commits and resume"
```

---

### Task 5: CLI — interactive flow in index.js

**Files:**
- Modify: `index.js` (full rewrite — delete the old random-spray logic)
- Modify: `package.json` (test script)
- Modify: `.gitignore`
- Delete: `data.json` (via `git rm`)

**Interfaces:**
- Consumes: `loadConfig`/`saveConfig` (Task 2), `createGithub` (Task 3), `generatePlan` (Task 1), `applyPlan` (Task 4).
- Produces: runnable CLI. `node index.js` runs the full flow; `node index.js --preview` generates and shows the plan, then exits without applying.

- [ ] **Step 1: Add .gitignore entries and remove data.json**

Modify `.gitignore` — append these three lines:

```
.gogreen.json
plan.json
.gogreen-work/
```

Then remove the obsolete commit-data file:

```bash
git rm data.json
```

- [ ] **Step 2: Update the test script**

Edit `package.json` — replace the `test` script value:

```json
"test": "node --test",
```

- [ ] **Step 3: Rewrite index.js**

Replace the entire content of `index.js`:

```js
import jsonfile from "jsonfile";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { loadConfig, saveConfig } from "./lib/config.js";
import { createGithub } from "./lib/github.js";
import { generatePlan } from "./lib/planner.js";
import { applyPlan } from "./lib/applier.js";

const REPO_NAME = "daily-log";
const PREVIEW_ONLY = process.argv.includes("--preview");

const rl = readline.createInterface({ input: stdin, output: stdout });

async function ask(question, validate = () => true) {
  while (true) {
    const answer = (await rl.question(question)).trim();
    if (validate(answer)) return answer;
    console.log("  Invalid input, try again.");
  }
}

async function withRetry(fn, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`  Retry ${i} of ${attempts - 1}: ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1500 * i));
    }
  }
}

async function main() {
  let config = await loadConfig();
  if (!config) {
    const username = await ask("GitHub username: ", (v) => v.length > 0);
    const token = await ask("Personal access token (repo scope): ", (v) => v.length > 0);
    config = { username, token };
    await saveConfig(config);
    console.log("Saved credentials to .gogreen.json (gitignored).\n");
  }

  const github = createGithub(config);
  const profile = await github.getUser();
  console.log(`Account: ${profile.name} <${profile.email}> — joined GitHub in ${profile.creationYear}\n`);

  const currentYear = new Date().getFullYear();
  const defaultYear = profile.creationYear;
  const startYear = Number(
    await ask(
      `Pick a start year (${profile.creationYear}-${currentYear}) [${defaultYear}]: `,
      (v) => {
        if (v === "") return true;
        const n = Number(v);
        return Number.isInteger(n) && n >= profile.creationYear && n <= currentYear;
      }
    ) || defaultYear
  );

  const plan = generatePlan({ startYear });
  await jsonfile.writeFile("plan.json", plan, { spaces: 2 });

  if (plan.totalCommits === 0) {
    console.log("The plan has no commits (all days fell on rest days). Run again for a new plan.");
    rl.close();
    return;
  }

  console.log(`\nPlan: ${plan.totalCommits} commits across ${plan.activeDays} active days, ${plan.restDays} rest days (${startYear} → today).`);
  console.log("Sample week:");
  for (const entry of plan.entries.slice(0, 7)) {
    console.log(`  ${entry.date}  ${entry.message}`);
  }
  console.log("  ...");

  if (PREVIEW_ONLY) {
    console.log("\nPreview only — run without --preview to apply. Plan kept in plan.json.");
    rl.close();
    return;
  }

  const ok = (await ask("Apply this plan? (y/N): ")).toLowerCase();
  if (!["y", "yes"].includes(ok)) {
    console.log("Aborted. Delete plan.json and run again to generate a fresh plan.");
    rl.close();
    return;
  }

  await github.ensurePrivateRepo(REPO_NAME);
  const remoteUrl = github.remoteUrl(REPO_NAME);
  await withRetry(() =>
    applyPlan({
      plan,
      profile,
      remoteUrl,
      pushImpl: (git) => git.raw(["push", "-u", remoteUrl, "main"]),
    })
  );

  console.log(`\nDone: ${plan.appliedCount} commits pushed to private repo ${config.username}/${REPO_NAME}.`);
  console.log('Remember: enable "Include private contributions" in your GitHub profile settings so private activity shows on your graph.');
  rl.close();
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests from tasks 1–4 run (planner, config, github, applier).

- [ ] **Step 5: Smoke test the CLI**

Run: `node index.js --preview` with no `.gogreen.json` present.
Expected: prompts for username and token, then (if valid credentials are entered) prints the plan summary, sample week, and "Preview only" message. If no valid GitHub credentials are handy, verify instead that a bad token produces `Error: GitHub API 401 on /users/<name>: ...` with exit code 1.

- [ ] **Step 6: Commit**

```bash
git add index.js package.json .gitignore
git commit -m "feat: add interactive CLI flow with plan preview"
```

---

## Self-Review Notes

- **Spec coverage:** planner realism rules (rest days, intensity, times, messages, no future dates) → Task 1; config persistence → Task 2; account creation year + private repo + token remote → Task 3; backdated commits, resume, single push → Task 4; CLI flow, preview flag, validation, retry, reminders, gitignore, data.json removal, test script → Task 5. All spec sections covered.
- **Type consistency:** `generatePlan` returns `{ startYear, totalCommits, activeDays, restDays, entries }` everywhere (Tasks 1, 5); `createGithub` returns `{ getUser, ensurePrivateRepo, remoteUrl }` (Tasks 3, 5); `applyPlan` takes `{ plan, profile, remoteUrl, pushImpl, workDir, planPath }` (Tasks 4, 5); `profile` is `{ name, email, creationYear }` (Tasks 3, 4, 5).
- **No placeholders:** every step contains complete code or an exact command with expected output.