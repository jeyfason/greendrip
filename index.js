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
