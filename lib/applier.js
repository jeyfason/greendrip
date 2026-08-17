import fs from "node:fs/promises";
import path from "node:path";
import simpleGit from "simple-git";
import jsonfile from "jsonfile";

const LOG_FILE = "activity.log";

export async function applyPlan({ plan, profile, remoteUrl, pushImpl, workDir = ".gogreen-work", planPath = "plan.json" }) {
  const workPath = path.resolve(workDir);
  await fs.mkdir(workPath, { recursive: true });
  const git = simpleGit(workPath);

  const isRepo = await fs.access(path.join(workPath, ".git")).then(() => true).catch(() => false);
  if (!isRepo) {
    await git.raw(["init", "-b", "main"]);
    await git.raw(["config", "user.name", profile.name]);
    await git.raw(["config", "user.email", profile.email]);
    await git.addRemote("origin", remoteUrl);
  }

  await git.fetch(["--no-tags", "origin", "main"]).catch(() => {});
  const hasUpstream = await git.raw(["rev-parse", "--verify", "origin/main"]).then(() => true).catch(() => false);
  if (hasUpstream) {
    const behind = await git.raw(["rev-list", "--count", "HEAD..origin/main"]).then((n) => Number(n)).catch(() => Infinity);
    if (behind > 0) {
      await git.raw(["reset", "--hard", "origin/main"]);
    }
  }

  const applied = plan.appliedCount ?? 0;
  const logPath = path.join(workPath, LOG_FILE);
  const logContent = plan.entries.slice(0, applied).map((e) => `${e.date} - ${e.message}`).join("\n");
  await fs.writeFile(logPath, logContent.endsWith("\n") || logContent === "" ? logContent : logContent + "\n");

  const remaining = plan.entries.slice(applied);
  const total = plan.entries.length;
  if (remaining.length > 0) {
    console.log(`Applying ${remaining.length} commits...`);
  }
  for (const entry of remaining) {
    await fs.appendFile(logPath, `${entry.date} - ${entry.message}\n`);
    await git.add([LOG_FILE]);
    await git.commit(entry.message, { "--date": entry.date });
    plan.appliedCount = (plan.appliedCount ?? 0) + 1;
    await jsonfile.writeFile(planPath, plan, { spaces: 2 });
    if (plan.appliedCount % 50 === 0 || plan.appliedCount === total) {
      const percent = Math.round((plan.appliedCount / total) * 100);
      console.log(`  ${plan.appliedCount} / ${total} commits (${percent}%)`);
    }
  }

  if (remaining.length > 0 && pushImpl) {
    await pushImpl(git);
  }
  return plan.appliedCount ?? 0;
}