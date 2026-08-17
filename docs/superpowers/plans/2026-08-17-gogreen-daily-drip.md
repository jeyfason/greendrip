# Daily Drip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an automatic daily pipeline (GitHub Action + `daily.js`) that commits 1–8 realistic same-day commits to `daily-log` on active days and nothing on rest days, keeping the contribution graph alive from now on.

**Architecture:** Extend `lib/planner.js` with a seeded `generateDailyPlan({ now, seed })` that reuses the existing realism constants. Add `lib/daily.js` with a testable `runDaily()` that clones `daily-log` into `.daily-work/`, applies today's entries via the existing `applyPlan`, and pushes. Root `daily.js` is a thin CLI wrapper for the Action; `.github/workflows/daily-contribution.yml` wires cron 15:30 UTC + manual dispatch.

**Tech Stack:** Node 20 ESM, `moment`, `simple-git`, `jsonfile`, `random`, `node:test`, GitHub Actions.

## Global Constraints

- No new runtime dependencies.
- No future-dated commits: every entry's timestamp must be ≤ `now` and on `now`'s calendar day.
- Rest-day constants: `WEEKDAY_REST = 0.12`, `WEEKEND_REST = 0.45` (same as backfill).
- Intensity roll: 68% → 1–2, 22% → 3–4, 10% → 5–8 commits.
- Time windows: 40% 09–12, 35% 13–18, 20% 19–23, 5% 00–03.
- Credentials via env (`GOGREEN_TOKEN`, `GOGREEN_USERNAME`, `GOGREEN_REPO`), never committed; secret referenced as `secrets.GOGREEN_TOKEN`.
- The backfill flow (`npm start`, `plan.json`, `.gogreen-work/`) must remain untouched.
- Workflow must not require a lock/state: re-running today is harmless (duplicate same-day commits are invisible on the graph).
- Tests use Node's built-in `node:test`; run with `npm test`.

---

### Task 1: `generateDailyPlan` in the planner

**Files:**
- Modify: `lib/planner.js` (append function after `generatePlan`)
- Test: `test/planner.test.js` (append tests)

**Interfaces:**
- Consumes: existing internal helpers `createRng`, `pick`, `weightedWindow`, `buildMessage`, and constants `WEEKDAY_REST`, `WEEKEND_REST`, `TIME_WINDOWS`, `VERBS`, `NOUNS`, `SUFFIXES`.
- Produces: `generateDailyPlan({ now = new Date(), seed })` → `{ entries: Array<{ date: string (ISO-8601), message: string }>, restDay: boolean }`. With a seed, output is deterministic. `entries` is `[]` exactly when `restDay` is `true`.

- [ ] **Step 1: Write the failing tests**

Append to `test/planner.test.js`:

```js
import { generateDailyPlan } from "../lib/planner.js";

function dayKey(iso) {
  return iso.slice(0, 10);
}

test("generateDailyPlan is deterministic with a seed", () => {
  const now = new Date("2026-08-17T12:00:00Z");
  const a = generateDailyPlan({ now, seed: "seed-1" });
  const b = generateDailyPlan({ now, seed: "seed-1" });
  assert.deepEqual(a, b);
});

test("generateDailyPlan entries are on today, valid ISO, never in the future", () => {
  const now = new Date("2026-08-17T12:00:00Z");
  for (let seed = 0; seed < 200; seed++) {
    const { entries } = generateDailyPlan({ now, seed });
    for (const e of entries) {
      assert.strictEqual(e.date.slice(0, 10), "2026-08-17");
      assert.ok(!Number.isNaN(Date.parse(e.date)), "valid ISO date");
      assert.ok(new Date(e.date) <= now, "no future timestamps");
      assert.ok(e.message.length > 0, "message non-empty");
    }
  }
});

test("generateDailyPlan produces rest days and active days across seeds", () => {
  const now = new Date("2026-08-17T12:00:00Z");
  let restDays = 0;
  let activeDays = 0;
  const sizes = new Set();
  for (let seed = 0; seed < 500; seed++) {
    const { entries, restDay } = generateDailyPlan({ now, seed });
    assert.strictEqual(restDay, entries.length === 0);
    if (restDay) restDays++;
    else {
      activeDays++;
      assert.ok(entries.length >= 1 && entries.length <= 8, "1-8 commits on active days");
      sizes.add(entries.length);
    }
  }
  const restRate = restDays / 500;
  assert.ok(Math.abs(restRate - 0.22) < 0.08, `rest rate ${restRate} within tolerance of 0.22`);
  assert.ok(activeDays > 0 && restDays > 0, "both outcomes occur");
  assert.ok(sizes.size >= 3, `varied intensities observed: ${[...sizes].sort((a, b) => a - b)}`);
});

test("generateDailyPlan entries are sorted ascending by time", () => {
  const now = new Date("2026-08-17T23:00:00Z");
  for (let seed = 0; seed < 50; seed++) {
    const { entries } = generateDailyPlan({ now, seed });
    const times = entries.map((e) => Date.parse(e.date));
    for (let i = 1; i < times.length; i++) {
      assert.ok(times[i] >= times[i - 1], "sorted ascending");
    }
  }
});

test("generateDailyPlan default now is the current date", () => {
  const { entries } = generateDailyPlan({ seed: 7 });
  for (const e of entries) {
    assert.strictEqual(e.date.slice(0, 10), new Date().toISOString().slice(0, 10));
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/planner.test.js`
Expected: FAIL with `generateDailyPlan is not a function` (import error).

- [ ] **Step 3: Implement `generateDailyPlan`**

Append to `lib/planner.js`:

```js
export function generateDailyPlan({ now = new Date(), seed } = {}) {
  const rng = createRng(seed);
  const day = moment(now).startOf("day");
  const isWeekend = day.isoWeekday() >= 6;
  const restProbability = isWeekend ? WEEKEND_REST : WEEKDAY_REST;
  if (rng.float(0, 1) < restProbability) {
    return { entries: [], restDay: true };
  }

  const used = new Set();
  const roll = rng.float(0, 1);
  const count = roll < 0.68 ? rng.int(1, 2) : roll < 0.9 ? rng.int(3, 4) : rng.int(5, 8);

  const minutes = [];
  for (let i = 0; i < count; i++) {
    const window = weightedWindow(rng);
    minutes.push(window.start * 60 + rng.int(0, (window.end - window.start) * 60));
  }
  minutes.sort((a, b) => a - b);

  const entries = [];
  for (const totalMinutes of minutes) {
    const timestamp = day.clone().add(totalMinutes, "minutes");
    if (timestamp.isAfter(moment(now))) break;
    entries.push({ date: timestamp.format(), message: buildMessage(rng, used) });
  }
  return { entries, restDay: false };
}
```

Note: `generateDailyPlan` must be declared after `createRng`/`weightedWindow`/`buildMessage` — appending at the end of the file is correct. The `break` for `timestamp.isAfter(now)` guarantees no future timestamps even when `now` is early in the day (e.g., run at 00:30 — only the 00–03 window can still apply).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/planner.test.js`
Expected: PASS (all tests, including the existing backfill tests).

- [ ] **Step 5: Commit**

```bash
git add lib/planner.js test/planner.test.js
git commit -m "feat: add generateDailyPlan for one-day realistic commits"
```

---

### Task 2: `lib/daily.js` — the runnable daily logic

**Files:**
- Create: `lib/daily.js`
- Test: `test/daily.test.js`
- Modify: `.gitignore` (append `.daily-work/`)

**Interfaces:**
- Consumes: `generateDailyPlan` (Task 1), `applyPlan` from `lib/applier.js`, `createGithub` from `lib/github.js`, `loadConfig` from `lib/config.js`.
- Produces: `runDaily({ token, username, repo = "daily-log", now = new Date(), seed, workDir = ".daily-work", fetchImpl = fetch, pushImpl })` → `Promise<{ restDay: boolean, count: number }>`. `count` is the number of commits applied (0 on rest days). When `restDay` is true, no directory/repo is created. `pushImpl` defaults to `(git) => git.raw(["push", "-u", "origin", "main"])` (origin is the token remote URL set by `applyPlan`).

- [ ] **Step 1: Write the failing tests**

Create `test/daily.test.js`:

```js
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

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "gogreen-rest-"));
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
```

Note: the third test relies on `runDaily` calling the GitHub API (`getUser`) *before* deciding rest vs active — the implementation in Step 3 does exactly that (the author profile is needed for commits, so the API call happens unconditionally), which also surfaces bad tokens on rest days.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/daily.test.js`
Expected: FAIL — `Cannot find module '../lib/daily.js'` or `runDaily is not a function`.

- [ ] **Step 3: Implement `lib/daily.js`**

Create `lib/daily.js`:

```js
import path from "node:path";
import { createGithub } from "./github.js";
import { generateDailyPlan } from "./planner.js";
import { applyPlan } from "./applier.js";

export async function runDaily({
  token,
  username,
  repo = "daily-log",
  now = new Date(),
  seed,
  workDir = ".daily-work",
  fetchImpl = fetch,
  pushImpl,
}) {
  const github = createGithub({ token, username, fetchImpl });
  const profile = await github.getUser();

  const plan = generateDailyPlan({ now, seed });
  if (plan.restDay) {
    return { restDay: true, count: 0 };
  }

  const planPath = path.join(workDir, "plan.json");
  const remoteUrl = github.remoteUrl(repo);
  const doPush = pushImpl ?? ((git) => git.raw(["push", "-u", "origin", "main"]));

  await applyPlan({
    plan: { ...plan, appliedCount: 0, totalCommits: plan.entries.length, activeDays: 1, restDays: 0 },
    profile,
    remoteUrl,
    workDir,
    planPath,
    pushImpl: doPush,
  });

  return { restDay: false, count: plan.entries.length };
}
```

Note: `applyPlan` requires `profile.name` / `profile.email` — provided by `getUser`. On rest days the repo is never created or cloned, so the workdir stays absent (matches the test).

- [ ] **Step 4: Append `.daily-work/` to `.gitignore`**

`.gitignore` — add a line:

```
.daily-work/
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all tests, including the new daily tests).

- [ ] **Step 6: Commit**

```bash
git add lib/daily.js test/daily.test.js .gitignore
git commit -m "feat: add runDaily for same-day contributions"
```

---

### Task 3: CLI wrapper, workflow, and npm script

**Files:**
- Create: `daily.js` (repo root)
- Create: `.github/workflows/daily-contribution.yml`
- Modify: `package.json` (add `"today": "node daily.js"` script)

**Interfaces:**
- Consumes: `runDaily` from `lib/daily.js` (Task 2), `loadConfig` from `lib/config.js`.
- Produces: a runnable CLI (`node daily.js`) that exits 0 on success (including rest days) and 1 on failure; a workflow that runs it on cron and manual dispatch.

- [ ] **Step 1: Write the failing test — none (CLI + workflow wiring, covered by manual verification)**

No unit test for this task; the workflow file and npm script are configuration. Verify in Step 3–4 instead.

- [ ] **Step 2: Implement `daily.js`**

Create `daily.js` (repo root):

```js
import { runDaily } from "./lib/daily.js";
import { loadConfig } from "./lib/config.js";

async function main() {
  let { GOGREEN_TOKEN: token, GOGREEN_USERNAME: username, GOGREEN_REPO: repo } = process.env;

  if (!token || !username) {
    const config = await loadConfig();
    if (!config?.token || !config?.username) {
      throw new Error("Set GOGREEN_TOKEN and GOGREEN_USERNAME env vars (or run `npm start` once to save credentials).");
    }
    token = config.token;
    username = config.username;
  }

  const result = await runDaily({ token, username, repo });
  if (result.restDay) {
    console.log(`Rest day — no commits. (${new Date().toISOString().slice(0, 10)})`);
  } else {
    console.log(`Added ${result.count} commits for ${new Date().toISOString().slice(0, 10)}.`);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
```

- [ ] **Step 3: Implement the workflow**

Create `.github/workflows/daily-contribution.yml`:

```yaml
name: daily-contribution

on:
  schedule:
    - cron: "30 15 * * *"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  daily:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install --omit=dev
      - name: Push today's contributions
        run: node daily.js
        env:
          GOGREEN_TOKEN: ${{ secrets.GOGREEN_TOKEN }}
          GOGREEN_USERNAME: jeyfason
          GOGREEN_REPO: daily-log
```

- [ ] **Step 4: Update `package.json` scripts**

Add to `scripts` in `package.json`:

```json
"today": "node daily.js"
```

- [ ] **Step 5: Verify manually**

1. Run: `node daily.js` locally (token present in `.gogreen.json`).
   Expected: either `Rest day — no commits. (2026-08-17)` or `Added N commits for 2026-08-17.` with N in 1–8.
2. If active: confirm the commits landed — `curl -H "Authorization: token <classic-token>" "https://api.github.com/repos/jeyfason/daily-log/commits?per_page=3"` shows today's commits.
3. Run: `npm test` — all tests pass.

- [ ] **Step 6: Commit and push**

```bash
git add daily.js .github/workflows/daily-contribution.yml package.json
git commit -m "feat: add daily contribution GitHub Action and npm run today"
git push
```

- [ ] **Step 7: Enable the secret + first run (user-assisted)**

In GitHub → repo `jeyfason/goGreen` → Settings → Secrets and variables → Actions → New repository secret: name `GOGREEN_TOKEN`, value = the classic token (`repo` scope, long expiry). Then Actions → `daily-contribution` → Run workflow (manual dispatch) once; confirm it succeeds and today's commits appear in `daily-log`.

---

## Self-Review

**Spec coverage:**
- `generateDailyPlan` — Task 1 ✓ (rest days, intensity, windows, no-future, determinism)
- `lib/daily.js` runDaily — Task 2 ✓ (rest-day no-op, active-day apply+push, env-agnostic)
- `daily.js` CLI — Task 3 ✓ (env → config fallback, exit codes, summary lines)
- Workflow cron + dispatch + secret — Task 3 ✓
- `.gitignore` `.daily-work/` — Task 2 Step 4 ✓
- `npm run today` script — Task 3 Step 4 ✓
- Backfill untouched (`plan.json`, `.gogreen-work/`, `npm start`) — never modified ✓
- Tests: determinism, day-boundary, no-future, rest rate tolerance, active/rest both occur, sorted times, rest-day no-op, active-day push + log count, bad-token error ✓

**Placeholder scan:** No TBD/TODO; every step has concrete code or commands.

**Type consistency:** `generateDailyPlan({ now, seed })` → `{ entries, restDay }` used identically in Task 1 tests, Task 2 `runDaily`, and `lib/daily.js`. `runDaily` params (`token, username, repo, now, seed, workDir, fetchImpl, pushImpl`) match between Task 2 tests and the Task 2 implementation, and `daily.js` (Task 3) calls `runDaily({ token, username, repo })` — all consistent. `applyPlan` expects `{ plan: { entries, appliedCount, totalCommits, activeDays, restDays }, profile, remoteUrl, workDir, planPath, pushImpl }` — Task 2 supplies exactly these. One deviation from the spec doc: `runDaily` is in `lib/daily.js` (library) instead of the root `daily.js` (thin CLI) — matches the spec's "Files" intent but improves testability; root `daily.js` remains the entry. `totalCommits`/`activeDays`/`restDays` fields are provided in the plan object so the progress-printing code in `applyPlan` (`plan.appliedCount % 50 === 0 || plan.appliedCount === total`) can't divide by zero (total ≥ 1 on active days).