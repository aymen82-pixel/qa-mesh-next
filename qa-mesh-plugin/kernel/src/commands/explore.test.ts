import { strict as assert } from "node:assert";
import { test } from "node:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runExplore, type ExploreMode } from "./explore";
import { AgentDb } from "../db/agentdb";

const REAL_QA = resolve(__dirname, "..", "..", "..", ".qa");
const RUN = "2026-10-08-001";

function project(config: Record<string, unknown> = {}): { root: string; qaDir: string } {
  const root = mkdtempSync(join(tmpdir(), "qa-mesh-explore-"));
  const qaDir = join(root, ".qa");
  mkdirSync(join(qaDir, "agentdb"), { recursive: true });
  cpSync(join(REAL_QA, "contracts"), join(qaDir, "contracts"), { recursive: true });
  writeFileSync(join(qaDir, "qa.config.json"), JSON.stringify(config));
  return { root, qaDir };
}

function x(qaDir: string, mode: ExploreMode, flags: Record<string, string> = {}, bools: string[] = [], positionals: string[] = [], env = {}) {
  return runExplore({
    mode,
    qaDir,
    flags: new Map(Object.entries({ run: RUN, ...flags }).map(([k, v]) => [k, [v]])),
    bools: new Set(["json", ...bools]),
    positionals,
    env,
  });
}

const finding = (over: Record<string, unknown> = {}) => ({
  title: "Le compteur reste à zéro après ajout",
  kind: "issue",
  severity: 4,
  expected: "1 item left",
  actual: "0 items left",
  repro_steps: ["ouvrir /", "ajouter « Lait »"],
  route: "/",
  ...over,
});
const deliverable = (index: number, payload: Record<string, unknown>) => ({
  protocol: "qa-mesh/2.0",
  run_id: RUN,
  agent: "agent-explore",
  status: "ok",
  payload: { charter: { index, title: "charter de test" }, status: "passed", summary: "parcours mené à son terme", findings: [], ...payload },
});
function ingest(qaDir: string, doc: unknown, env = {}) {
  const f = join(qaDir, `d-${Math.random()}.json`);
  writeFileSync(f, JSON.stringify(doc));
  return x(qaDir, "ingest", {}, [], [f], env);
}

test("boucle complète : init -> start -> ingest -> decide -> close (verdict calculé, rapport conforme)", () => {
  const { qaDir } = project({ known_non_bugs: ["Les liens target=_blank laissent la page inchangée."] });
  assert.equal(x(qaDir, "init", { goal: "Explorer la liste de tâches" }).exitCode, 0);
  const ctx = JSON.parse(x(qaDir, "context").stdout);
  assert.deepEqual(ctx.known_non_bugs, ["Les liens target=_blank laissent la page inchangée."]);
  const started = JSON.parse(x(qaDir, "start", { title: "Ajout", instruction: "Ajouter une tâche et vérifier le compteur" }).stdout);
  assert.equal(started.index, 1);
  assert.equal(x(qaDir, "start", { title: "B", instruction: "x" }).exitCode, 1, "parallélisme 1 : un seul charter à la fois");
  assert.equal(ingest(qaDir, deliverable(1, { findings: [finding(), finding({ kind: "warning", severity: 1, title: "Faute de frappe dans le pied de page" })] })).exitCode, 0);
  assert.equal(JSON.parse(x(qaDir, "decide").stdout).action, "continue");
  const closed = x(qaDir, "close", { assessment: "Un défaut de compteur." });
  assert.equal(closed.exitCode, 1, "une issue -> verdict failed, exit 1");
  const res = JSON.parse(closed.stdout);
  assert.equal(res.verdict, "failed");
  const report = JSON.parse(readFileSync(join(qaDir, "runs", RUN, "explore", "explore_report.json"), "utf8"));
  assert.deepEqual(report.findings.map((f: { id: string }) => f.id), ["F-001", "F-002"]);
  assert.ok(existsSync(join(qaDir, "runs", RUN, "explore", "PROGRESS.md")));
});

test("arrêt automatique après 3 charters bloqués sans finding", () => {
  const { qaDir } = project();
  x(qaDir, "init", { goal: "g" });
  for (let i = 1; i <= 3; i++) {
    x(qaDir, "start", { title: `c${i}`, instruction: "i" });
    ingest(qaDir, deliverable(i, { status: "blocked", error_code: "ENV_UNREACHABLE", summary: "hôte injoignable pendant le charter" }));
  }
  const d = JSON.parse(x(qaDir, "decide").stdout);
  assert.equal(d.action, "stop");
  assert.equal(d.ended, "stuck");
  assert.equal(x(qaDir, "start", { title: "c4", instruction: "i" }).exitCode, 1, "plus de charter après l'arrêt");
  assert.equal(x(qaDir, "close").exitCode, 2, "tout bloqué -> verdict blocked, exit 2");
});

test("ingest : livrable non conforme rejeté ; capture d'un charter taché refusée ; secrets redactés", () => {
  const { root, qaDir } = project({ secrets: [{ name: "tok", env: "QA_EXPLORE_TOKEN" }] });
  const env = { QA_EXPLORE_TOKEN: "jeton-secret-xyz123" };
  x(qaDir, "init", { goal: "g" });
  x(qaDir, "start", { title: "c", instruction: "i" });
  assert.equal(ingest(qaDir, deliverable(1, { findings: [finding({ severity: 9 })] }), env).exitCode, 1);
  const shot = `.qa/runs/${RUN}/explore/charter-1/f.png`;
  mkdirSync(join(root, ".qa", "runs", RUN, "explore", "charter-1"), { recursive: true });
  writeFileSync(join(root, shot), "png");
  const out = ingest(qaDir, deliverable(1, { tainted: true, findings: [finding({ screenshot_path: shot, actual: `affiche jeton-secret-xyz123` })] }), env);
  assert.equal(out.exitCode, 0, out.stdout);
  assert.match(JSON.parse(out.stdout).notes[0], /capture refusée/);
  const progress = readFileSync(join(qaDir, "runs", RUN, "explore", "PROGRESS.md"), "utf8");
  assert.ok(!progress.includes("jeton-secret-xyz123"));
  x(qaDir, "close", {}, [], [], env);
  const report = readFileSync(join(qaDir, "runs", RUN, "explore", "explore_report.json"), "utf8");
  assert.ok(report.includes("<secret:tok>") && !report.includes("jeton-secret-xyz123"));
  assert.ok(!report.includes("f.png"));
});

test("init --session : exige une session valide ; --read-only injecte les règles", () => {
  const { qaDir } = project();
  assert.equal(x(qaDir, "init", { goal: "g", session: "admin" }).exitCode, 2);
  const db = AgentDb.open(join(qaDir, "agentdb", "agentdb.sqlite"));
  db.putSession({ role: "admin", storage_state_path: ".qa/agentdb/sessions/admin.json", expires_at: new Date(Date.now() + 3600_000).toISOString() });
  db.close();
  assert.equal(x(qaDir, "init", { goal: "g", session: "admin" }, ["read-only"]).exitCode, 0);
  const ctx = JSON.parse(x(qaDir, "context").stdout);
  assert.equal(ctx.storage_state, ".qa/agentdb/sessions/admin.json");
  assert.ok(ctx.rules.length >= 3);
});
