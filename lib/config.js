import jsonfile from "jsonfile";
import { unlink } from "node:fs/promises";

export async function loadConfig(path = "./.gogreen.json") {
  try {
    return await jsonfile.readFile(path);
  } catch {
    return null;
  }
}

export async function saveConfig(config, path = "./.gogreen.json") {
  await jsonfile.writeFile(path, config, { spaces: 2 });
}

export async function resetConfig(path = "./.gogreen.json") {
  try {
    await unlink(path);
    return true;
  } catch {
    return false;
  }
}

export async function acquireCredentials({ config, file = "./.gogreen.json", ask, verify, save = saveConfig, attempts = 3 }) {
  if (config) return config;
  for (let i = 1; i <= attempts; i++) {
    const username = await ask("GitHub username: ");
    const token = await ask("Personal access token (repo scope): ");
    const candidate = { username, token };
    try {
      await verify(candidate);
      await save(candidate, file);
      return candidate;
    } catch (err) {
      if (!/401/.test(err.message)) throw err;
      if (i < attempts) console.log(`  Invalid credentials (${err.message}) — try again.`);
    }
  }
  throw new Error(`Credentials were rejected ${attempts} times. Fix with: greendrip --reset`);
}