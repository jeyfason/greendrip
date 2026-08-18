# greendrip npm Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the goGreen tool to npm as `greendrip` — package metadata, single CLI with `--daily`, docs, license, and verified publish flow.

**Architecture:** Minimal packaging changes: package.json metadata + whitelist, shebang + `--daily` flag in `index.js`, delete root `daily.js`, swap workflow command, add LICENSE + ARCHITECTURE.md, rewrite README. No logic changes to lib/ modules (38 tests must pass unchanged).

**Tech Stack:** Node.js, npm, GitHub Actions (workflow edit only).

## Global Constraints

- Package name `greendrip` (lowercase, npm-valid, confirmed free).
- Version `1.0.0`, license MIT, author "Jey Fason".
- `bin: { "greendrip": "./index.js" }` — requires `#!/usr/bin/env node` at top of index.js.
- `files: ["index.js", "lib/", "docs/ARCHITECTURE.md", "README.md", "LICENSE"]` — tarball must NEVER contain `.gogreen.json`, `plan.json`, `.gogreen-work/`, `.daily-work/`, `test/`, `node_modules/`, `.github/`.
- `prepublishOnly: "npm test"` (38 tests).
- Root `daily.js` is deleted; daily path = `node index.js --daily`; workflow runs `node index.js --daily`; `npm run today` = `node index.js --daily`.
- No changes to `lib/*.js` logic — only `index.js` gains the flag dispatch.
- All commits on main, pushed (established workflow).

---

### Task 1: Package metadata, shebang, LICENSE

**Files:**
- Modify: `package.json`
- Modify: `index.js` (line 1 only — shebang)
- Create: `LICENSE`
- Test: none new (configuration); verified by `npm test` + `npm pack --dry-run`

**Interfaces:**
- Produces: `npm pack --dry-run` showing exactly `index.js`, `lib/*.js` (4), `docs/ARCHITECTURE.md`, `README.md`, `LICENSE`, `package.json`.

- [ ] **Step 1: Rewrite `package.json`**

```json
{
  "name": "greendrip",
  "version": "1.0.0",
  "description": "Fill your GitHub contribution graph with realistic commits and keep it green with a daily drip",
  "type": "module",
  "main": "index.js",
  "bin": {
    "greendrip": "./index.js"
  },
  "files": [
    "index.js",
    "lib/",
    "docs/ARCHITECTURE.md",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "test": "node --test",
    "prepublishOnly": "npm test",
    "start": "node index.js",
    "preview": "node index.js --preview",
    "today": "node index.js --daily"
  },
  "keywords": [
    "github",
    "contribution-graph",
    "git",
    "cli",
    "backfill",
    "commits",
    "green"
  ],
  "author": "Jey Fason",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/jeyfason/goGreen.git"
  },
  "dependencies": {
    "jsonfile": "^6.1.0",
    "moment": "^2.30.1",
    "random": "^4.1.0",
    "simple-git": "^3.25.0"
  }
}
```

- [ ] **Step 2: Add shebang to `index.js`**

Line 1 becomes:

```js
#!/usr/bin/env node
```

(keep all existing code after it unchanged)

- [ ] **Step 3: Create `LICENSE`**

MIT License text, with:

```
Copyright (c) 2026 Jey Fason
```

(full MIT license body — standard text)

- [ ] **Step 4: Verify**

Run: `npm test` — expect 38/38 pass.
Run: `npm pack --dry-run` — expect the file list to contain ONLY: `package.json`, `index.js`, `lib/applier.js`, `lib/config.js`, `lib/daily.js`, `lib/github.js`, `lib/planner.js`, `docs/ARCHITECTURE.md`, `README.md`, `LICENSE`. Grep the output to confirm NO `.gogreen.json`, `plan.json`, `test/`, `.github/`, `.daily-work`, `.gogreen-work`, `node_modules`.

- [ ] **Step 5: Commit**

```bash
git add package.json index.js LICENSE
git commit -m "chore: publish as greendrip — package metadata, bin, MIT license"
```

---

### Task 2: `--daily` consolidation

**Files:**
- Modify: `index.js` (flag dispatch)
- Delete: `daily.js`
- Modify: `.github/workflows/daily-contribution.yml` (command swap)
- Test: none new (dispatch is 3 lines; covered by smoke test)

**Interfaces:**
- Consumes: `runDaily` from `lib/daily.js` (signature `{ token, username, repo, now, seed, workDir, fetchImpl, pushImpl }`), `loadConfig` from `lib/config.js`.
- Produces: `node index.js --daily` runs the daily flow; `npm run today` and the workflow call it; root `daily.js` gone.

- [ ] **Step 1: Add the `--daily` branch to `index.js`**

At the top of `index.js`, after the existing constant declarations:

```js
const PREVIEW_ONLY = process.argv.includes("--preview");
const DAILY_ONLY = process.argv.includes("--daily");
```

At the very start of `main()`:

```js
if (DAILY_ONLY) {
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
  rl.close();
  return;
}
```

Update the import line to add `runDaily`:

```js
import { runDaily } from "./lib/daily.js";
```

- [ ] **Step 2: Delete `daily.js`**

`git rm daily.js`

- [ ] **Step 3: Swap the workflow command**

In `.github/workflows/daily-contribution.yml`, change:

```yaml
      - name: Push today's contributions
        run: node daily.js
```

to:

```yaml
      - name: Push today's contributions
        run: node index.js --daily
```

- [ ] **Step 4: Verify**

Run: `npm test` — 38/38 pass (the daily logic tests in `test/daily.test.js` exercise `lib/daily.js` directly, unaffected).
Run: `node index.js --daily` once — expect either `Rest day — no commits. (2026-08-18)` or `Added N commits for 2026-08-18.` (this pushes real commits to `jeyfason/daily-log` — acceptable, it's today's contribution).
Run: `node index.js --preview` — expect plan preview output, exits clean.

- [ ] **Step 5: Commit**

```bash
git add index.js .github/workflows/daily-contribution.yml
git rm daily.js
git commit -m "feat: consolidate daily mode into greendrip --daily"
```

---

### Task 3: Architecture docs + README

**Files:**
- Create: `docs/ARCHITECTURE.md`
- Modify: `README.md`
- Test: none (documentation); verified by read-through

**Interfaces:**
- Produces: consumer-facing install/usage docs and a maintainer architecture doc, both shipped in the tarball.

- [ ] **Step 1: Create `docs/ARCHITECTURE.md`**

Cover, in order:
1. **Module map**: `index.js` (CLI entry, modes: interactive backfill, `--preview`, `--daily`), `lib/config.js` (`.gogreen.json` load/save), `lib/github.js` (`createGithub` → `getUser`, `ensurePrivateRepo`, `remoteUrl`), `lib/planner.js` (`generatePlan`, `generateDailyPlan`, realism engine), `lib/applier.js` (`applyPlan`: workdir init, log file, backdated commits, reconcile, push), `lib/daily.js` (`runDaily`).
2. **Data flow**: backfill path (config → getUser → start year → generatePlan → plan.json → preview → ensurePrivateRepo → applyPlan → push → reminder) and daily path (env/config → generateDailyPlan → rest-day no-op | applyPlan with fresh `.daily-work` → push).
3. **Realism engine**: rest constants 12% weekday / 45% weekend; intensity 68% 1–2 / 22% 3–4 / 10% 5–8; time windows 40% 09–12 / 35% 13–18 / 20% 19–23 / 5% 00–03; message pool; seeded determinism (seed 0 supported); no future dates (window re-roll + clamp).
4. **Resume semantics**: `plan.json` `appliedCount` written after every commit; resume prompt in `index.js`; declining leaves old commits in place.
5. **Reconcile semantics** (`applyPlan`): fetch origin/main silently; reset --hard ONLY when local is unborn or behind-not-ahead; never destroys local-only commits; offline fetch fails silently.
6. **Security**: credentials only in `.gogreen.json` (gitignored, excluded from tarball by `files` whitelist); tokens passed via env for CI (`GOGREEN_TOKEN` secret); `npm pack --dry-run` verification step.

- [ ] **Step 2: Rewrite `README.md`**

Structure:
1. Title `# 🌱 greendrip`, `Created by Jey Fason`, one-line tagline.
2. Features (realistic backfill, daily drip, resume, private daily-log repo).
3. Install & usage: `npm install -g greendrip` or `npx greendrip`; `greendrip` (interactive backfill with prompt walkthrough); `greendrip --daily`; `greendrip --preview`.
4. Daily Drip setup: `GOGREEN_TOKEN` repo secret + the workflow already in this repo (cron 15:30 UTC + manual dispatch).
5. How it works — link to `docs/ARCHITECTURE.md`.
6. Tests: `npm test` (38).
7. ToS note (backdated commits, keep repo private).
8. Credits: Jey Fason.

- [ ] **Step 3: Verify**

Read both files; confirm: no stale `goGreen` CLI references as the command name (repo name may appear in clone URLs), the clone URL still `https://github.com/jeyfason/goGreen.git`, no credentials anywhere.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/ARCHITECTURE.md
git commit -m "docs: consumer README and architecture guide for greendrip"
```

---

### Task 4: Publish + repo rename (user-assisted)

- [ ] **Step 1: Verify pack contents**

Run: `npm pack --dry-run` — confirm whitelist-only contents (as in Task 1 Step 4).

- [ ] **Step 2: Rename the GitHub repo** (recommended, non-blocking)

Run: `curl -X PATCH -H "Authorization: token $TOKEN" https://api.github.com/repos/jeyfason/goGreen -d '{"name":"greendrip"}'` (classic token from `.gogreen.json`). Then:

```bash
git remote set-url origin git@github.com-jeyfason:jeyfason/greendrip.git
```

Update `package.json` `repository.url` to `git+https://github.com/jeyfason/greendrip.git` and README clone URLs, commit, push. If the rename fails, skip it and continue (old repo name remains; package still publishes).

- [ ] **Step 3: Publish**

User runs `npm login` in their terminal (one-time, own npm account). Then:

```bash
npm publish
```

Expect: prepublishOnly runs 38 tests, then tarball upload. Confirm success output and `npm view greendrip` shows the package.

- [ ] **Step 4: Claim verification**

`curl -s https://registry.npmjs.org/greendrip | head` — verify name, version 1.0.0, author Jey Fason, and that the tarball file list matches the whitelist.

---

## Self-Review

**Spec coverage:**
- package.json metadata (name/version/license/author/bin/files/prepublishOnly) — Task 1 ✓
- Shebang — Task 1 ✓
- LICENSE MIT © 2026 Jey Fason — Task 1 ✓
- `--daily` consolidation, daily.js deletion, workflow + npm script swap — Task 2 ✓
- docs/ARCHITECTURE.md + README — Task 3 ✓
- Publish flow with npm login + npm publish + npm view verification — Task 4 ✓
- Repo rename with API + remote URL update — Task 4 ✓
- Tarball never contains credentials/state/tests — whitelist + dry-run check in Tasks 1 & 4 ✓

**Placeholder scan:** No TBD/TODO; every step has concrete content. The LICENSE body is "standard text" — the implementer writes the canonical MIT license (MIT License, Permission is hereby granted...) with the given copyright line — this is unambiguous.

**Type consistency:** `runDaily({ token, username, repo })` matches lib/daily.js's signature (rest defaulted); `loadConfig()` returns `{ username, token } | null`; `--preview` behavior unchanged. index.js import path `./lib/daily.js` correct. Workflow command matches the new flag.