#!/usr/bin/env node
import jsonfile from "jsonfile";
import readline from "node:readline";
import { stdin, stdout } from "node:process";
import { loadConfig, saveConfig } from "./lib/config.js";
import { runDaily } from "./lib/daily.js";
import { createGithub } from "./lib/github.js";
import { generatePlan } from "./lib/planner.js";
import { applyPlan } from "./lib/applier.js";

const REPO_NAME = "daily-log";
const PREVIEW_ONLY = process.argv.includes("--preview");
const DAILY_ONLY = process.argv.includes("--daily");

const rl = readline.createInterface({ input: stdin, output: stdout });

const lineBuffer = [];
let lineWaiter = null;
let closed = false;

rl.on("line", (line) => {
  if (lineWaiter) {
    const resolve = lineWaiter;
    lineWaiter = null;
    resolve(line);
  } else {
    lineBuffer.push(line);
  }
});

rl.on("close", () => {
  closed = true;
  if (lineWaiter) {
    const resolve = lineWaiter;
    lineWaiter = null;
    resolve(null);
  }
});

function nextLine() {
  if (lineBuffer.length > 0) return Promise.resolve(lineBuffer.shift());
  if (closed) return Promise.resolve(null);
  return new Promise((resolve) => {
    lineWaiter = resolve;
  });
}

async function ask(question, validate = () => true) {
  while (true) {
    process.stdout.write(question);
    const line = await nextLine();
    if (line === null) throw new Error("Input closed");
    const answer = line.trim();
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

async function loadPlan() {
  try {
    const plan = await jsonfile.readFile("plan.json");
    return plan && Array.isArray(plan.entries) ? plan : null;
  } catch {
    return null;
  }
}

async function main() {
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

  const existingPlan = await loadPlan();
  let plan = null;
  const inProgress = existingPlan && (existingPlan.appliedCount ?? 0) > 0 && existingPlan.appliedCount < existingPlan.entries.length;
  if (inProgress) {
    const resume = (await ask(`Existing plan found (${existingPlan.appliedCount} of ${existingPlan.entries.length} commits applied). Resume it? (Y/n): `)).toLowerCase();
    if (["", "y", "yes"].includes(resume)) {
      plan = existingPlan;
    } else {
      console.log("Note: previously committed entries remain in the repo; a fresh plan will add commits on top of them.");
    }
  }

  if (!plan) {
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

    plan = generatePlan({ startYear });
    await jsonfile.writeFile("plan.json", plan, { spaces: 2 });
  }

  if (plan.totalCommits === 0) {
    console.log("The plan has no commits (all days fell on rest days). Run again for a new plan.");
    rl.close();
    return;
  }

  console.log(`\nPlan: ${plan.totalCommits} commits across ${plan.activeDays} active days, ${plan.restDays} rest days (${plan.startYear} → today).`);
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
