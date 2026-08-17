import { Random, RNGFactory } from "random";
import moment from "moment";

const WEEKDAY_REST = 0.12;
const WEEKEND_REST = 0.45;

const TIME_WINDOWS = [
  { start: 9, end: 12, weight: 0.4 },
  { start: 13, end: 18, weight: 0.35 },
  { start: 19, end: 23, weight: 0.2 },
  { start: 0, end: 3, weight: 0.05 },
];

const VERBS = [
  "fix", "add", "refactor", "update", "improve", "optimize",
  "simplify", "clean up", "document", "rename", "extract", "migrate",
];
const NOUNS = [
  "parser", "auth module", "config loader", "logger", "api client",
  "db schema", "build pipeline", "error handling", "caching layer",
  "middleware", "utils", "cli parser", "rate limiter", "session store",
  "event bus", "query builder", "test fixtures", "docs", "dependencies",
  "type definitions",
];
const SUFFIXES = ["", "", "", " for v2", " in prod", " across modules", " after review", " per issue #42", " on weekends", " while on the train"];

function createRng(seed) {
  return seed ? new Random(RNGFactory(String(seed))) : new Random();
}

function pick(rng, arr) {
  return arr[rng.int(0, arr.length - 1)];
}

function weightedWindow(rng) {
  const roll = rng.float(0, 1);
  let acc = 0;
  for (const window of TIME_WINDOWS) {
    acc += window.weight;
    if (roll <= acc) return window;
  }
  return TIME_WINDOWS[TIME_WINDOWS.length - 1];
}

function buildMessage(rng, used) {
  let message = "";
  let attempts = 0;
  do {
    message = `${pick(rng, VERBS)} ${pick(rng, NOUNS)}${pick(rng, SUFFIXES)}`.trim();
    attempts++;
  } while (used.has(message) && attempts < 50);
  if (used.has(message)) message = `${message} #${used.size}`;
  used.add(message);
  return message;
}

export function generatePlan({ startYear, seed, now = new Date() }) {
  const rng = createRng(seed);
  const used = new Set();
  const entries = [];
  const day = moment({ year: startYear, month: 0, day: 1 });
  const end = moment(now);
  let activeDays = 0;
  let restDays = 0;

  while (day.isSameOrBefore(end, "day")) {
    const isWeekend = day.isoWeekday() >= 6;
    const restProbability = isWeekend ? WEEKEND_REST : WEEKDAY_REST;

    if (rng.float(0, 1) < restProbability) {
      restDays++;
    } else {
      activeDays++;
      const roll = rng.float(0, 1);
      const count =
        roll < 0.68 ? rng.int(1, 2) : roll < 0.9 ? rng.int(3, 4) : rng.int(5, 8);

      const minutes = [];
      for (let i = 0; i < count; i++) {
        const window = weightedWindow(rng);
        minutes.push(window.start * 60 + rng.int(0, (window.end - window.start) * 60));
      }
      minutes.sort((a, b) => a - b);

      for (const totalMinutes of minutes) {
        const timestamp = day.clone().startOf("day").add(totalMinutes, "minutes");
        if (timestamp.isAfter(end)) break;
        entries.push({ date: timestamp.format(), message: buildMessage(rng, used) });
      }
    }
    day.add(1, "day");
  }

  return {
    startYear,
    totalCommits: entries.length,
    activeDays,
    restDays,
    entries,
  };
}