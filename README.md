# 🌱 goGreen

> **Created by [Jey Fason](https://github.com/jeyfason)**

With **goGreen**, you can make your profile look like you've been hard at work... even if you haven't.

goGreen is a Node.js CLI that fills your GitHub contribution graph with **realistic-looking commits** — rest days, varied intensity, natural commit times and messages — so the result looks like a real, passionate developer's history, not a bot's spray.

## ✨ Features

- **Realistic backfill (`npm start`)** — connects to your GitHub account, detects your account's creation year, and generates a natural commit timeline from any start year up to today:
  - ~22% rest days (mostly weekends, some random weekdays)
  - Intensity: 68% of active days get 1–2 commits, 22% get 3–4, 10% get 5–8
  - Commit times drawn from realistic windows (morning, afternoon, evening, occasional late night)
  - Varied, natural commit messages — no exact repeats within a plan
  - No future dates, ever
- **Private `daily-log` repo** — all backdated commits are pushed to a private repo on your account, so only you see them (enable "Include private contributions" in your profile settings).
- **Resumable plans** — interrupted runs pick up exactly where they left off via `plan.json`.
{
  "username": "",
  "token": ""
}

- **Daily Drip (GitHub Action)** — keeps your graph alive from now on: a workflow runs every day at 15:30 UTC and pushes 1–8 same-day commits (or takes a rest day), with randomized hours. Fully automatic — set the secret once and forget it.

## 🚀 Getting Started

```bash
git clone https://github.com/jeyfason/goGreen.git
cd goGreen
npm install
```

### 1. Backfill your timeline

```bash
npm start
```

Follow the prompts:

1. Enter your GitHub username and a personal access token (repo scope). Saved to `.gogreen.json` (gitignored).
2. Pick a start year (defaults to your account's creation year).
3. Review the plan preview, then approve to apply.

The tool creates the private `daily-log` repo, commits the whole timeline with backdated dates, and pushes once at the end.

Use `npm run preview` to generate and preview a plan without applying.

### 2. Keep it green with the Daily Drip

```bash
npm run today        # commit today's activity manually
```

For the fully automatic version:

1. Add your token as a repository secret on the repo's **Settings → Secrets and variables → Actions** page — name it `GOGREEN_TOKEN`.
2. The `daily-contribution` workflow then runs daily at 15:30 UTC. You can also trigger it manually anytime from the **Actions** tab.

That's it — the graph stays alive on its own.

## ⚙️ How it works

- `lib/planner.js` — the realism engine: generates plans (backfill + single-day) from seeded randomness.
- `lib/applier.js` — commits each entry with `git commit --date=...` into the work repo (`.gogreen-work/` for backfill, `.daily-work/` for daily runs) and pushes once at the end.
- `lib/github.js` — GitHub API wrapper (account lookup, private repo creation).
- `.github/workflows/daily-contribution.yml` — the Daily Drip cron.

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