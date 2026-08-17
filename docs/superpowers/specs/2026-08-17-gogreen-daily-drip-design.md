# goGreen — Daily Drip (Ongoing Contributions via GitHub Actions)

## Problem

The v2 backfill fills the graph from account creation through today. After
that, the graph goes quiet: nothing new gets committed, so future weeks show
gaps. The user wants the graph to keep looking alive **from now on** — a few
realistic commits every active day, pushed automatically, with rest days and
varied commit times, without them touching anything.

## Goal

An automatic daily pipeline that, once set up, keeps the `daily-log` repo
growing forever:

1. A GitHub Actions workflow in the goGreen repo runs once per day on a fixed
   cron schedule, plus a manual `workflow_dispatch` trigger for top-ups.
2. A new `daily.js` CLI entry decides what to commit for today using the same
   realism engine as the backfill:
   - Rest-day roll: 12% weekdays / 45% weekends (same constants as v2 — the
     year-blended rate is ~21%, but a single day rolls against the constant
     for its weekday/weekend class).
   - Intensity roll: 68% 1–2 commits, 22% 3–4, 10% 5–8.
   - Randomized commit time-of-day from the same four time windows — so the
     graph shows varied hours even though the cron fires at a fixed hour.
   - Message from the same template pool.
3. On rest days the run does nothing and exits 0 (a "no-op" run is a success).
4. On active days it clones `daily-log` fresh, applies today's 1–8 commits with
   `--date` (timestamps all today, never future), and pushes once.
5. Credentials come from env vars so the workflow can supply them as a secret;
   local runs fall back to `.gogreen.json`.

## Non-Goals

- No future-dated commits (everything is dated today or earlier).
- No backfill re-run: `npm start` behavior is unchanged.
- No web UI, no dashboard, no commit reports.
- No multi-account support.

## Architecture

Same stack (ES-module Node.js, `moment`, `simple-git`, `jsonfile`, `random`,
`node:test`). No new runtime dependencies.

### Files

- `lib/planner.js` — add `generateDailyPlan({ now, seed })`:
  - Returns `{ entries: [], restDay: true }` on a rest day.
  - Otherwise returns `{ entries: [{ date, message }], restDay: false }` with
    1–8 entries for `now`'s calendar day, times drawn from `TIME_WINDOWS`,
    messages from the same pool (fresh `used` set per run; repeats across
    days are acceptable, like a real developer).
  - Reuses existing internal helpers (`createRng`, `pick`, `weightedWindow`,
    `buildMessage`). No future timestamps: entries are built from
    `startOf("day")` + minutes, never beyond `now`.
- `daily.js` — new root CLI entry:
  - Reads `GOGREEN_TOKEN`, `GOGREEN_USERNAME`, `GOGREEN_REPO` (default
    `daily-log`) from env; falls back to `loadConfig()` for local runs.
  - Builds `github` via `createGithub` (reuses `remoteUrl`).
  - Calls `generateDailyPlan({ now: new Date() })`.
  - Rest day → `console.log("Rest day — no commits.")` and exit 0.
  - Active day → `applyPlan` with a fresh clone in `.daily-work/`:
    - `workDir: ".daily-work"`, `planPath: path.join(workDir, "plan.json")`
      (avoids clobbering the backfill's `plan.json` in the repo root),
      `appliedCount: 0`, `pushImpl` = `git push -u origin main` (origin is
      the token URL).
    - Prints `Added N commits for <YYYY-MM-DD>.`
  - Exit 1 with a clear message on API/network failure (the workflow will
    surface it).
- `.github/workflows/daily-contribution.yml`:
  - `on: schedule: [{ cron: "30 15 * * *" }]` (15:30 UTC) + `workflow_dispatch`.
  - `permissions: contents: read`.
  - Steps: `actions/checkout@v4`, `actions/setup-node@v4` (Node 20),
    `npm install --omit=dev`, `node daily.js` with env
    `GOGREEN_TOKEN: ${{ secrets.GOGREEN_TOKEN }}`,
    `GOGREEN_USERNAME: jeyfason`, `GOGREEN_REPO: daily-log`.
  - No secrets in the repo; the classic token (repo scope) is stored as the
    `GOGREEN_TOKEN` secret by the user once.
- `.gitignore` — add `.daily-work/`.
- `package.json` — add `"today": "node daily.js"` script.

### Data Flow

1. Workflow fires (cron 15:30 UTC or manual dispatch).
2. `daily.js` loads token from env, generates today's plan.
3. Rest day → log and exit 0 (workflow shows a green run).
4. Active day → clone `daily-log` via token URL into `.daily-work/`, apply
   entries (append `activity.log`, `git add`, `git commit --date`), push once.
5. Print summary.

### Timing semantics

- Cron hour is fixed by GitHub's scheduler; the randomized per-commit
  timestamps (09–12, 13–18, 19–23, 00–03 windows) make the graph show varied
  hours each day. The graph itself is day-granular, so the fixed cron time is
  invisible.
- Commits are authored in the runner's timezone (UTC). Times stay within the
  windows; hours rendered on the graph are unaffected.
- A failed mid-run (e.g., network) leaves at most today's commits un-pushed;
  re-running the workflow re-commits for today — harmless because duplicate
  same-day commits are invisible on the graph.
- With the fixed 15:30 UTC cron, any time window that starts after the run
  time is re-rolled, so the 19–23 evening window is unreachable: the effective
  distribution is ~50% 09–12, ~43.75% 13–18, ~6.25% 00–03. The graph is
  day-granular, so this is cosmetic; a later cron (e.g. 23:30 UTC) would trade
  the morning window for the evening one.

## Testing

- `test/planner.test.js` — new cases for `generateDailyPlan`:
  - With a fixed seed: deterministic output (same entries twice).
  - Entries never exceed the given `now`; every entry is a valid ISO date.
  - Entries all fall on the requested calendar day.
  - Entries are 0 or 1–8; over many seeds the mean is 1–4 and rest days occur
    (both active and rest outcomes observable across seeds).
  - Rest-day rate across ~500 seeds is within tolerance of 22% (±8%).
- Manual E2E once: run `npm run today` locally with a stub token? No — run it
  for real once (token from `.gogreen.json`) to verify a same-day commit lands
  in `daily-log`, then trigger `workflow_dispatch` once to verify the Action
  path end-to-end.

## Out of Scope (future ideas)

- Multi-commit catch-up after missed days (today's run only does today).
- Drawing shapes/patterns on the graph.
- A web dashboard of daily activity.