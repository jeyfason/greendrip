# goGreen v2 — Realistic Contribution Timeline

## Problem

The current `index.js` writes 100 random commits spread across a single past
year. The result looks machine-generated: random spray, no rest days, and
possibly future-dated commits. The user wants a tool that fills a chosen
timeline with contributions that look like a real, passionate developer's
work — the way Linus Torvalds' contribution graph looks.

## Goal

A CLI tool that:

1. Lets the user connect their GitHub account (username + personal access token).
2. Determines the account's creation year automatically via the GitHub API.
3. Lets the user pick a start year (no earlier than account creation, no later
   than the current year).
4. Generates a realistic commit timeline from Jan 1 of the chosen year through
   today, with natural rest days, varying intensity, realistic commit times and
   messages.
5. Applies the plan to a **private** repo on the user's account, pushing
   backdated commits so the contribution graph shows the timeline.

## Non-Goals

- No web UI. CLI only.
- No integration with third-party git hosts (only GitHub).
- No rewriting of existing repositories or existing history.
- No filling of future dates.
- No multi-account management.

## Architecture

Small ES-module Node.js CLI with no new runtime dependencies (uses Node's
built-in `fetch`, `readline`, `node:test`). Existing dependencies `moment`,
`simple-git`, `jsonfile`, `random` stay in use where they fit.

### Files

- `index.js` — entry point. Owns the interactive CLI flow (prompts, approval
  gates) and orchestrates plan → preview → apply.
- `lib/github.js` — GitHub API wrapper:
  - `getUser(token, username)` → account creation year (`created_at`).
  - `ensurePrivateRepo(token, username, repoName)` → creates the repo via API
    if it does not exist, or verifies it already exists.
  - `push(token, repoPath)` → pushes the local repo to the private remote.
- `lib/planner.js` — pure timeline generator:
  - `generatePlan({ startYear, endDate, seed })` → `plan.json` structure:
    array of commit entries `{ date: ISO-8601, message }`, plus summary
    `{ totalCommits, activeDays, restDays }`.
- `lib/config.js` — loads/saves `.gogreen.json` (`{ username, token, repo }`).
  File is gitignored.
- `lib/applier.js` — applies the plan to a local clone of the private repo
  (cloned into a gitignored `.gogreen-work/` directory):
  - Appends each entry to a log file (e.g., `activity.log`) so every commit
    changes the tree.
  - Runs `git commit --date=<planned date>` per entry with the user's name and
    email as author.
  - Tracks progress so an interrupted run can resume from `plan.json`.
- `plan.json` — generated plan persisted on disk (gitignored).
- `test/planner.test.js` — unit tests for the planner.

### Data Flow

1. `index.js` loads config; if absent, prompts for username + token and saves.
2. Calls `getUser` → validates token and fetches creation year.
3. Prompts for start year; validates `creationYear <= startYear <= currentYear`.
4. `generatePlan` builds the full timeline (see Realism Rules).
5. Shows preview: yearly totals, active vs rest days, sample week, and a
   `--preview`-only mode that stops here.
6. On approval, `ensurePrivateRepo` creates/verifies the private repo (default
   name `daily-log`), clones it locally, and `applier` walks the plan:
   - For each entry: append `date — message` to `activity.log`, stage, commit
     with `--date`.
   - Progress saved to `plan.json` after every commit.
7. `push` once at the end; print summary and remind the user to enable
   "Include private contributions" in their GitHub profile settings.

## Realism Rules (planner)

- **Rest days**: ~22% of days have zero commits. Rest days fall mostly on
  weekends, but also on random weekdays (seeded randomness).
- **Intensity**: ~68% of active days get 1–2 commits; ~22% get 3–4; ~10% get
  5–8 ("big push" days).
- **Commit times**: times drawn from realistic waking-hour distributions —
  ~40% morning (09:00–12:00), ~35% afternoon (13:00–18:00), ~20% evening
  (19:00–23:00), ~5% late night (00:00–03:00). Jitter within each window.
- **Messages**: drawn from a varied template pool (fix, add, refactor, update,
  WIP, docs, tests...) with per-repo realistic nouns; no exact repeats within
  the plan.
- **No future dates**: the plan stops at today; no entry has a date beyond the
  current date/time.
- **Deterministic option**: planner accepts an optional seed for reproducible
  plans; otherwise uses a random seed per run.

## Error Handling

- Invalid/expired token → clear error message and exit code 1.
- Username not found → clear error message.
- Repo creation/API failure → show the GitHub error body, exit 1.
- Network failure during apply → retry up to 3 times with backoff, then resume
  from last completed entry on next run.
- Interrupted run → next run detects `plan.json` progress and continues.
- Empty plan (every day in the range ends up a rest day) → inform user and
  exit gracefully.

## Testing

- `test/planner.test.js` using Node's built-in `node:test`:
  - Rest-day ratio within tolerance (±5% of 22%) over a full-year plan.
  - No entry dated after "now".
  - Every entry is a valid ISO-8601 date.
  - Message pool has no exact repeats.
  - Intensity distribution within tolerance.
- `npm test` updated to run `node --test`.
- Manual E2E: run against a throwaway GitHub account once during implementation.

## Out of Scope (future ideas, not built now)

- Custom graph patterns (drawing text/shapes).
- Calendar UI preview in the terminal.
- Multiple repos / multiple accounts.