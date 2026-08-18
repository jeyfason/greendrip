# 🌱 greendrip

> **Created by [Jey Fason](https://github.com/jeyfason)**

Make your GitHub contribution graph look like you've been hard at work... even if you haven't.

greendrip is a Node.js CLI that fills your GitHub contribution graph with **realistic-looking commits** — rest days, varied intensity, natural commit times and messages — so the result looks like a real developer's history, not a bot's spray. Install once, backfill your timeline, then let the Daily Drip keep it green from now on.

## ✨ Features

- **Realistic backfill** — connects to your GitHub account, detects your account's creation year, and generates a natural commit timeline from any start year up to today:
  - ~22% rest days (mostly weekends, some random weekdays)
  - Intensity: 68% of active days get 1–2 commits, 22% get 3–4, 10% get 5–8
  - Commit times drawn from realistic windows (morning, afternoon, evening, occasional late night)
  - Varied, natural commit messages — no exact repeats within a plan
  - No future dates, ever
- **Daily Drip** — keeps your graph alive from now on: the GitHub Action runs every day at 15:30 UTC and pushes 1–8 same-day commits (or takes a rest day), with randomized hours. Fully automatic — set the secret once and forget it.
- **Private `daily-log` repo** — all backdated commits are pushed to a private repo on your account, so only you see them (enable "Include private contributions" in your profile settings).
- **Resumable plans** — interrupted runs pick up exactly where they left off via `plan.json`.

## 🚀 Install

```bash
npm install -g greendrip
```

Or run without installing:

```bash
npx greendrip
```

## 📖 Usage

### Backfill your timeline

```bash
greendrip
```

Follow the prompts:

1. Enter your GitHub username and a personal access token (repo scope). Saved to `.gogreen.json` (gitignored).
2. Pick a start year (defaults to your account's creation year).
3. Review the plan preview, then approve to apply.

The tool creates the private `daily-log` repo, commits the whole timeline with backdated dates, and pushes once at the end.

### Preview without applying

```bash
greendrip --preview
```

Generates the plan, prints a sample, and keeps it in `plan.json` — nothing is pushed.

### Daily Drip (one-shot, manual)

```bash
greendrip --daily
```

Commits today's activity immediately (requires `GOGREEN_TOKEN` / `GOGREEN_USERNAME` env vars, or `.gogreen.json` from a backfill run).

## ⏰ Daily Drip setup (GitHub Action)

For the fully automatic version, clone this repo (or your fork) and add the token as a repository secret:

```bash
git clone https://github.com/jeyfason/greendrip.git
```

On the repo's **Settings → Secrets and variables → Actions** page, add the token as a repository secret — name it `GOGREEN_TOKEN`.

The `daily-contribution` workflow (`.github/workflows/daily-contribution.yml`) then runs daily at **15:30 UTC** via cron, and can be triggered manually anytime from the **Actions** tab. It runs `node index.js --daily` with your token passed via `env`.

```yaml
# What the workflow does
- run: node index.js --daily
  env:
    GOGREEN_TOKEN: ${{ secrets.GOGREEN_TOKEN }}
    GOGREEN_USERNAME: <your username>
    GOGREEN_REPO: daily-log
```

That's it — the graph stays alive on its own.

## ⚙️ How it works

A realism engine (`lib/planner.js`) generates the plan; an applier (`lib/applier.js`) writes backdated commits into a private work repo and pushes once; a GitHub client (`lib/github.js`) handles account lookup and repo creation; a daily orchestrator (`lib/daily.js`) runs the Drip. See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the full module map, data flow, realism constants, resume/reconcile semantics, and security notes.

## 🧪 Tests

```bash
npm test
```

38 tests covering plan realism, determinism, resume safety, and the reconcile logic.

## ⚠️ Note

Backdated commits are against [GitHub's Terms of Service](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies) in spirit — use at your own risk, and keep the `daily-log` repo private. The Daily Drip only ever commits today, never the future.

## Credits

- Built by [Jey Fason](https://github.com/jeyfason)
- Original concept inspired by [Akshay Saini](https://github.com/akshaymarch7)
