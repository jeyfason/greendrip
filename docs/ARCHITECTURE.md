# greendrip architecture

Maintainer-facing guide to how greendrip works. Consumer docs live in the
[README](../README.md); design and planning notes for the npm publication live
under `docs/superpowers/`.

## Module map

| File | Responsibility |
| --- | --- |
| `index.js` | CLI entry point (bin `greendrip`). Dispatches on flags, drives the interactive backfill prompt loop, wires everything together. |
| `lib/config.js` | `loadConfig` / `saveConfig` — reads and writes `.gogreen.json` (username + token) via `jsonfile`. |
| `lib/github.js` | `createGithub` — GitHub REST client: `getUser` (profile name, email, account creation year), `ensurePrivateRepo` (creates the private `daily-log` repo if missing), `remoteUrl` (HTTPS remote embedding the token). |
| `lib/planner.js` | `generatePlan` (multi-year backfill plan), `generateDailyPlan` (single-day plan), and the realism engine behind both. |
| `lib/applier.js` | `applyPlan` — work-dir git repo management, activity log, backdated commits, reconcile, resume bookkeeping. |
| `lib/daily.js` | `runDaily` — orchestrates the daily path: profile → private repo → `generateDailyPlan` → `applyPlan` in `.daily-work/`. |

Three modes, selected in `index.js`:

- `greendrip` — interactive backfill: config prompt → account lookup → start-year prompt → plan generation → preview → apply.
- `greendrip --preview` — generate and print the plan, write `plan.json`, never touch git (`PREVIEW_ONLY`, `index.js`).
- `greendrip --daily` — headless daily mode (`DAILY_ONLY`, `index.js`); reads credentials from env or falls back to `.gogreen.json`, then delegates to `lib/daily.js`.

## Data flow

### Backfill path (interactive)

```
.gogreen.json (config)            lib/config.js
      │ loadConfig
      ▼
getUser()                         lib/github.js — account name/email, creation year
      │
      ▼
start-year prompt (creationYear..currentYear, default = creationYear)
      │
      ▼
generatePlan({ startYear })       lib/planner.js — realism engine, `now = new Date()`
      │
      ▼
plan.json (written)               jsonfile — { startYear, totalCommits, activeDays, restDays, entries[] }
      │
      ├── --preview → print plan, exit (repo untouched)
      ▼
ensurePrivateRepo("daily-log")    lib/github.js — creates if missing
      │
      ▼
applyPlan({ plan, profile, remoteUrl, pushImpl })   lib/applier.js
      │   work dir `.gogreen-work/`: init, activity.log,
      │   backdated commits (plan.appliedCount bookkeeping after every commit),
      │   reconcile, then single push (`git push -u <remoteUrl> main`)
      ▼
"Done: N commits pushed to private repo" + "Include private contributions" reminder
```

If a `plan.json` with an in-progress plan exists, `index.js` offers to resume
before generating anything new.

### Daily path (cron)

```
env GOGREEN_TOKEN / GOGREEN_USERNAME / GOGREEN_REPO  (or .gogreen.json fallback)
      │
      ▼
runDaily({ token, username, repo })       lib/daily.js
      │
      ▼
getUser() + ensurePrivateRepo(repo)
      │
      ▼
generateDailyPlan({ now })                lib/planner.js
      │
      ├── restDay → "Rest day — no commits." exit 0 (no git touched)
      ▼
applyPlan in `.daily-work/` (fresh plan, appliedCount 0, single-day)
      ▼
push (default `git push -u origin main`)
```

The daily plan is time-bounded to *today*: windows before "now" are re-rolled
and per-window minute ranges are clamped so commits never land in the future.

## Realism engine

All constants live at the top of `lib/planner.js`.

- **Rest days** — 12% of weekdays (`WEEKDAY_REST = 0.12`), 45% of weekend days (`WEEKEND_REST = 0.45`). A roll below the probability yields a rest day.
- **Intensity** — per active day: 68% chance of 1–2 commits, 22% of 3–4, 10% of 5–8 (`rng.int` upper bounds).
- **Time windows** — weighted pick: 40% 09:00–12:00, 35% 13:00–18:00, 20% 19:00–23:00, 5% 00:00–03:00; minute offset uniform within the window, then sorted chronologically.
- **Messages** — `buildMessage`: verb + noun + optional suffix from pools (`VERBS`, `NOUNS`, `SUFFIXES`), deduplicated per plan (up to 50 attempts, then a `#N` counter).
- **Seeded determinism** — `createRng(seed)` uses the `random` package's `RNGFactory`; `seed === 0` is honored (only `undefined` means unseeded). Same seed + same `startYear`/`now` → identical plan.
- **No future dates** — backfill: the loop ends at today and per-day timestamps after `now` are skipped. Daily: windows whose start is after "now" are re-rolled and the minute range is clamped to `nowMinutes`.

## Resume semantics

- `plan.json` carries `appliedCount` (defaults to 0), written after **every** commit via `jsonfile` in `lib/applier.js` — a crash mid-run never loses more than the commit being written.
- On the next run, `index.js` detects an in-progress plan (`appliedCount > 0 && < entries.length`) and asks "Resume it? (Y/n)".
- Resuming: `applyPlan` slices `entries.slice(appliedCount)` and continues; the pre-existing `activity.log` lines are replayed from the plan so log and commit history stay consistent.
- Declining: a fresh plan is generated; previously committed entries stay in the repo, and the note "previously committed entries remain in the repo" is printed.
- `lib/daily.js` always passes a fresh plan (`appliedCount: 0`) in `.daily-work/`, so a day is never double-applied via the daily path.

## Reconcile semantics

In `applyPlan` (lib/applier.js), before any commit:

1. Fetch `origin/main` silently — `.catch(() => {})`; an unreachable remote never fails the run.
2. If upstream exists (`rev-parse --verify origin/main`):
   - Local `HEAD` unborn → `reset --hard origin/main` (adopt upstream history).
   - Else count `origin/main..HEAD`: if local is **not ahead**, and `HEAD..origin/main` shows behind → `reset --hard origin/main`.
   - If local is ahead (diverged), **nothing** is reset — local-only commits are never destroyed.
3. Resume backfill runs hit this too: the pushed history is adopted and commits continue on top, keeping the work repo in sync with the remote.

## Security

- Credentials live only in `.gogreen.json` — gitignored (never committed) and excluded from the published tarball by the `files` whitelist in `package.json` (`index.js`, `lib/`, `docs/`, `README.md`, `LICENSE`).
- CI mode uses the `GOGREEN_TOKEN` repo secret (plus `GOGREEN_USERNAME` / `GOGREEN_REPO` env vars), per `.github/workflows/daily-contribution.yml`.
- The remote URL embeds the token as `https://x-access-token:<token>@github.com/<user>/daily-log.git` (`remoteUrl` in lib/github.js) — one of the reasons pushes only ever target the private `daily-log` repo.
- The workflow runs `node index.js --daily` with `contents: read` permissions and the token passed via `env` only.
- Verification step before publishing: `npm pack --dry-run` and a scan for stray credentials; `prepublishOnly` runs `npm test`.
