import { test } from "node:test";
import assert from "node:assert/strict";
import moment from "moment";
import { generatePlan } from "../lib/planner.js";

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