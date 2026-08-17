# greendrip — npm Package Publication

## Problem

goGreen is a working, tested CLI (backfill + daily drip) living in a personal repo under a capital-letter name (`goGreen`) that npm cannot publish (npm names are lowercase-only). The author wants to claim the idea publicly: publish the tool as a documented, ready-to-use npm package under a fresh name, credited to Jey Fason.

## Goal

Publish the tool to npm as **`greendrip`**:

1. `npm i -g greendrip` (or `npx greendrip`) runs the full CLI: interactive realistic backfill, plus `greendrip --daily` for today's contribution.
2. The package tarball contains only the code and docs — never credentials, plans, or work directories.
3. The project is documented for outside users: install/usage README + `docs/ARCHITECTURE.md`.
4. MIT licensed, authored by Jey Fason.
5. Every publish is gated by the test suite.

## Non-Goals

- No CI auto-publish (approach 2, deferred: add later if desired).
- No scoped package (`@jeyfason/greendrip` not needed — top-level name is free).
- No new runtime features beyond the `--daily` consolidation.
- No changes to the realism engine or apply/reconcile logic.
- No repo content changes beyond packaging, docs, and the workflow command swap.

## Architecture

### 1. Package metadata (`package.json`)

- `name`: `greendrip`
- `version`: `1.0.0`
- `license`: `MIT`
- `author`: `Jey Fason`
- `description`: one-liner (realistic GitHub contribution backfill + daily drip)
- `keywords`: `["github", "contribution-graph", "git", "cli", "backfill", "green", "commits"]`
- `bin`: `{ "greendrip": "./index.js" }`
- `files`: `["index.js", "lib/", "docs/", "README.md", "LICENSE"]`
- `prepublishOnly`: `"npm test"`
- `main`: `"index.js"` (kept; harmless)
- `repository`: `https://github.com/jeyfason/goGreen` (updated to `greendrip` repo name if renamed)
- Drop the placeholder name `thomyorke` and empty `author`/`description`.

### 2. CLI consolidation (`index.js`)

- Add `#!/usr/bin/env node` shebang (required for `bin` to work).
- Add `--daily` flag handling: `process.argv.includes("--daily")` → run the daily path (env-first `GOGREEN_TOKEN`/`GOGREEN_USERNAME`/`GOGREEN_REPO`, fallback to `.gogreen.json`, `runDaily` from `lib/daily.js`, print `Added N commits for <date>.` or `Rest day — no commits.`).
- Delete root `daily.js`; the daily flow now lives entirely in `index.js --daily`.
- `.github/workflows/daily-contribution.yml`: replace `node daily.js` with `node index.js --daily`.
- `package.json` scripts: `"today": "node index.js --daily"` (behavior unchanged).

### 3. Docs

- `LICENSE`: MIT text, `Copyright (c) 2026 Jey Fason`.
- `docs/ARCHITECTURE.md`: modules map, data flow for backfill and daily paths, realism-engine rules (rest constants, intensity, time windows), resume semantics (`plan.json` appliedCount), reconcile semantics (reset only when unborn or behind-not-ahead; never destroys local commits), security notes (credentials only in gitignored local files; whitelist keeps them out of the tarball).
- `README.md`: rewritten for package consumers — install via npm, usage of both modes, Daily Drip setup (secret + cron), links to ARCHITECTURE.md, credits to Jey Fason.

### 4. Publish flow

1. `npm test` — 38 tests pass.
2. `npm pack --dry-run` — tarball must contain exactly: `index.js`, `lib/` (4 files), `docs/`, `README.md`, `LICENSE`, `package.json`. Must NOT contain: `.gogreen.json`, `plan.json`, `.gogreen-work/`, `.daily-work/`, `test/`, `node_modules/`, workflow files.
3. User runs `npm login` (one-time).
4. `npm publish` — gated by `prepublishOnly` test run.

### 5. Repo rename (user's call, recommended)

- `jeyfason/goGreen` → `jeyfason/greendrip` via GitHub API (`PATCH /repos/jeyfason/goGreen` with the classic token, `{ "name": "greendrip" }`).
- Update local remote: `git remote set-url origin git@github.com-jeyfason:jeyfason/greendrip.git`.
- GitHub redirects the old URL; the Actions workflow and README clone URL keep working. Old repo name becomes permanently unavailable to others (ownership claim).

## Error Handling

- Publish preconditions: tests fail → no publish; `npm pack` list mismatches → stop and fix before publish.
- `--daily` without token and without `.gogreen.json` → clear error, exit 1 (existing `runDaily` behavior).
- Rename failure (API error) → report, continue without rename (non-blocking for publish).

## Testing

- Existing 38 tests must pass unchanged (no logic changes; `daily.js` deletion verified by `npm test` + workflow edit).
- Manual verification:
  - `node index.js --daily` once (uses `.gogreen.json`) — same smoke behavior as before.
  - `npm pack --dry-run` content assertion (grep the file list).
  - `node index.js --preview` still prints the plan preview and exits clean (CLI not broken by the shebang/bin changes).

## Out of Scope (future)

- Auto-publish GitHub Action on version tags.
- `greendrip init` scaffolding for non-interactive setups.
- Version badges / publish checks (CI).