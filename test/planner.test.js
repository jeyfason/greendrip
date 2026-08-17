import { test } from "node:test";
import assert from "node:assert/strict";
import moment from "moment";
import { generatePlan, generateDailyPlan } from "../lib/planner.js";

const plan = generatePlan({ startYear: 2024, seed: "test-seed" });

test("rest-day ratio is near 22% (17-27%)", () => {
  const totalDays = plan.activeDays + plan.restDays;
  const ratio = plan.restDays / totalDays;
  assert.ok(ratio >= 0.17 && ratio <= 0.27, `rest ratio was ${ratio}`);
});

test("never generates a date after now", () => {
  const now = new Date("2024-12-31T23:59:00");
  const p = generatePlan({ startYear: 2024, seed: "test-seed", now });
  for (const entry of p.entries) {
    assert.ok(Date.parse(entry.date) <= now.getTime(), `future date: ${entry.date}`);
  }
  for (const entry of plan.entries) {
    assert.ok(Date.parse(entry.date) <= Date.now(), `future date: ${entry.date}`);
  }
});

test("all dates are valid ISO-8601 moment formats", () => {
  assert.ok(plan.entries.length > 100);
  for (const entry of plan.entries) {
    assert.ok(moment(entry.date).isValid(), `invalid date: ${entry.date}`);
    assert.equal(moment(entry.date).format(), entry.date, `non-canonical: ${entry.date}`);
  }
});

test("no two entries share the same message", () => {
  const messages = new Set(plan.entries.map((e) => e.message));
  assert.equal(messages.size, plan.entries.length);
});

test("daily commit counts are within 1-8 and average 2.0-3.2", () => {
  const counts = new Map();
  for (const entry of plan.entries) {
    const day = entry.date.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const values = [...counts.values()];
  for (const n of values) {
    assert.ok(n >= 1 && n <= 8, `count out of range: ${n}`);
  }
  const mean = plan.totalCommits / plan.activeDays;
  assert.ok(mean >= 2.0 && mean <= 3.2, `mean was ${mean}`);
});

test("same seed produces the identical plan", () => {
  const a = generatePlan({ startYear: 2024, seed: "dup" });
  const b = generatePlan({ startYear: 2024, seed: "dup" });
  assert.deepEqual(a, b);
});

test("different seeds produce different plans", () => {
  const a = generatePlan({ startYear: 2024, seed: "one" });
  const b = generatePlan({ startYear: 2024, seed: "two" });
  assert.notDeepEqual(a, b);
});

test("plan only contains entries from the start year onward", () => {
  for (const entry of plan.entries) {
    assert.ok(entry.date.slice(0, 4) >= "2024", `before start year: ${entry.date}`);
  }
});

function dayKey(iso) {
  return iso.slice(0, 10);
}

test("generateDailyPlan is deterministic with a seed", () => {
  const now = new Date("2026-08-17T12:00:00Z");
  const a = generateDailyPlan({ now, seed: "seed-1" });
  const b = generateDailyPlan({ now, seed: "seed-1" });
  assert.deepEqual(a, b);
});

test("generateDailyPlan entries are on today, valid ISO, never in the future", () => {
  const now = new Date("2026-08-17T12:00:00Z");
  for (let seed = 0; seed < 200; seed++) {
    const { entries } = generateDailyPlan({ now, seed });
    for (const e of entries) {
      assert.strictEqual(e.date.slice(0, 10), moment(now).startOf("day").format("YYYY-MM-DD"));
      assert.ok(!Number.isNaN(Date.parse(e.date)), "valid ISO date");
      assert.ok(new Date(e.date) <= now, "no future timestamps");
      assert.ok(e.message.length > 0, "message non-empty");
    }
  }
});

test("generateDailyPlan produces rest days and active days across seeds", () => {
  const now = new Date("2026-08-17T12:00:00Z");
  let restDays = 0;
  let activeDays = 0;
  const sizes = new Set();
  for (let seed = 0; seed < 500; seed++) {
    const { entries, restDay } = generateDailyPlan({ now, seed });
    assert.strictEqual(restDay, entries.length === 0);
    if (restDay) restDays++;
    else {
      activeDays++;
      assert.ok(entries.length >= 1 && entries.length <= 8, "1-8 commits on active days");
      sizes.add(entries.length);
    }
  }
  const restRate = restDays / 500;
  assert.ok(Math.abs(restRate - 0.12) < 0.05, `rest rate ${restRate} within tolerance of 0.12`);
  assert.ok(activeDays > 0 && restDays > 0, "both outcomes occur");
  assert.ok(sizes.size >= 3, `varied intensities observed: ${[...sizes].sort((a, b) => a - b)}`);
});

test("generateDailyPlan entries are sorted ascending by time", () => {
  const now = new Date("2026-08-17T23:00:00Z");
  for (let seed = 0; seed < 50; seed++) {
    const { entries } = generateDailyPlan({ now, seed });
    const times = entries.map((e) => Date.parse(e.date));
    for (let i = 1; i < times.length; i++) {
      assert.ok(times[i] >= times[i - 1], "sorted ascending");
    }
  }
});

test("generateDailyPlan default now is the current date", () => {
  const { entries } = generateDailyPlan({ seed: 7 });
  for (const e of entries) {
    assert.strictEqual(e.date.slice(0, 10), moment().startOf("day").format("YYYY-MM-DD"));
  }
});
