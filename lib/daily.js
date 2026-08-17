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

  await github.ensurePrivateRepo(repo);
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