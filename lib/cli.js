export function parseFlags(args) {
  const has = (flag) => args.includes(flag);
  return {
    help: has("--help") || has("-h"),
    version: has("--version"),
    reset: has("--reset"),
    daily: has("--daily"),
    preview: has("--preview"),
  };
}

export const USAGE = `greendrip — fill your GitHub contribution graph with realistic commits

Usage:
  greendrip [options]

Options:
  --daily        Add today's contribution and push (GOGREEN_TOKEN/GOGREEN_USERNAME)
  --preview      Show the plan without applying it
  --reset        Delete saved credentials (.gogreen.json) and reconfigure
  --help, -h     Show this help
  --version      Show version

Examples:
  npx greendrip           Interactive backfill setup
  npx greendrip --reset   Re-enter credentials after a mistake
  greendrip --daily       One commit for today (CI-friendly)

Installed locally? Use npx greendrip — a local install does not put the
greendrip command on your PATH.`;