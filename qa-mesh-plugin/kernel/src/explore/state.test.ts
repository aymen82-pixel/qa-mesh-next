import { strict as assert } from "node:assert";
import { test } from "node:test";
import { canStartCharter, decideNext, failureStreak, resolveBudgets, verdictOf, type CharterRow, type ExploreRunRow } from "./state";

const T0 = Date.parse("2026-10-08T10:00:00Z");
const run = (over: Partial<ExploreRunRow> = {}): ExploreRunRow => ({
  run_id: "r",
  goal: "g",
  budgets: resolveBudgets({}),
  started_at: new Date(T0).toISOString(),
  read_only: false,
  ...over,
});
let n = 0;
const c = (status: CharterRow["status"], findings = 0, issues = 0): CharterRow => ({ index: ++n, title: "t", status, findings, issues, started_at: "" });

test("budgets : défauts e2e, bornés dans leurs plages", () => {
  assert.deepEqual(resolveBudgets(undefined), { max_charters: 8, max_steps_per_charter: 40, max_duration_min: 10, parallelism: 1 });
  assert.deepEqual(resolveBudgets({ max_charters: 50, max_duration_min: 1, parallelism: 9 }), { max_charters: 12, max_steps_per_charter: 40, max_duration_min: 3, parallelism: 4 });
});

test("arrêt après 3 charters consécutifs ratés/bloqués sans finding ; exhausted neutre", () => {
  n = 0;
  assert.equal(failureStreak([c("failed"), c("exhausted"), c("blocked")]), 2);
  const stuck = [c("passed"), c("failed"), c("blocked"), c("exhausted"), c("failed")];
  assert.equal(decideNext({ run: run(), charters: stuck, nowMs: T0 }).ended, "stuck");
  // Un charter raté AVEC finding casse la série.
  assert.equal(decideNext({ run: run(), charters: [c("failed"), c("failed", 1), c("failed")], nowMs: T0 }).action, "continue");
});

test("budgets de charters et de durée (la dernière minute réservée à la clôture)", () => {
  n = 0;
  const full = Array.from({ length: 8 }, () => c("passed"));
  assert.equal(decideNext({ run: run(), charters: full, nowMs: T0 }).ended, "step-limit");
  assert.equal(decideNext({ run: run(), charters: [], nowMs: T0 + 9.5 * 60000 }).ended, "time");
  assert.equal(decideNext({ run: run(), charters: [], nowMs: T0 + 5 * 60000 }).action, "continue");
  assert.equal(decideNext({ run: run(), charters: [], nowMs: T0, plannerFinished: true }).ended, "finished");
});

test("parallélisme : pas de nouveau charter au-delà de la limite", () => {
  n = 0;
  assert.equal(canStartCharter(run(), [c("running")], T0).ok, false);
  assert.equal(canStartCharter(run({ budgets: resolveBudgets({ parallelism: 2 }) }), [c("running")], T0).ok, true);
  assert.equal(canStartCharter(run({ ended: "finished" }), [], T0).ok, false);
});

test("verdict : issue -> failed ; warnings seuls -> passed ; tout bloqué -> blocked ; rien -> failed", () => {
  n = 0;
  assert.equal(verdictOf([c("passed", 2, 1)]), "failed");
  assert.equal(verdictOf([c("passed", 2, 0)]), "passed");
  assert.equal(verdictOf([c("blocked"), c("blocked", 1, 0)]), "blocked");
  assert.equal(verdictOf([]), "failed");
});
