import jsonfile from "jsonfile";

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