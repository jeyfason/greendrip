import { runDaily } from "./lib/daily.js";
import { loadConfig } from "./lib/config.js";

async function main() {
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
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
