import { strict as assert } from "node:assert";
import { test } from "node:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runBugbash, type ReproRunner } from "./bugbash";
import { runExplore } from "./explore";
import { AgentDb } from "../db/agentdb";

const REAL_QA = resolve(__dirname, "..", "..", "..", ".qa");
const RUN = "2026-10-08-002";

function project(config: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), "qa-mesh-bugbash-"));
  const qaDir = join(root, ".qa");
  mkdirSync(join(qaDir, "agentdb"), { recursive: true });
  cpSync(join(REAL_QA, "contracts"), join(qaDir, "contracts"), { recursive: true });
  writeFileSync(join(qaDir, "qa.config.json"), JSON.stringify(config));
  return { root, qaDir };
}
const flags = (o: Record<string, string>) => new Map(Object.entries({ run: RUN, ...o }).map(([k, v]) => [k, [v]]));
const explore = (qaDir: string, mode: any, o: Record<string, string> = {}, bools: string[] = [], pos: string[] = []) =>
  runExplore({ mode, qaDir, flags: flags(o), bools: new Set(["json", ...bools]), positionals: pos });
const bb = (qaDir: string, mode: any, pos: string[] = [], runner?: ReproRunner, o: Record<string, string> = {}) =>
  runBugbash({ mode, qaDir, flags: flags(o), bools: new Set(["json"]), positionals: pos, runner });

function writeJson(dir: string, name: string, doc: unknown): string {
  const p = join(dir, name);
  writeFileSync(p, JSON.stringify(doc));
  return p;
}
const finding = (title: string, route = "/") => ({ title, kind: "issue", severity: 4, expected: "1 item left", actual: "0 items left", repro_steps: ["ajouter une tâche"], route });
const verify = (payload: Record<string, unknown>) => ({ protocol: "qa-mesh/2.0", run_id: RUN, agent: "agent-bugverify", status: "ok", payload });

/** Explore lecture seule avec 3 findings dont 2 doublons -> merged.json avec 2 candidats. */
function seeded() {
  const p = project({ bugbash: { shared_env: true }, explore: { parallelism: 2 } });
  explore(p.qaDir, "init", { goal: "bug bash" }, ["bugbash"]);
  for (const [i, findings] of [[1, [finding("Le compteur reste à zéro après ajout"), finding("Le lien d'aide est mort", "/help")]], [2, [finding("Le compteur reste a zero apres ajout")]]] as const) {
    explore(p.qaDir, "start", { title: `charter ${i}`, instruction: "explorer", posture: "numbers-and-copy" });
    const doc = { protocol: "qa-mesh/2.0", run_id: RUN, agent: "agent-explore", status: "ok", payload: { charter: { index: i, title: `charter ${i}` }, status: "passed", summary: "parcours mené à son terme", findings } };
    assert.equal(explore(p.qaDir, "ingest", {}, [], [writeJson(p.qaDir, `c${i}.json`, doc)]).exitCode, 0);
  }
  return p;
}

const reproSpec = (root: string, id: string, body = "") => {
  mkdirSync(join(root, "tests", "bugbash"), { recursive: true });
  writeFileSync(join(root, "tests", "bugbash", `${id.toLowerCase()}.spec.ts`), `// @finding ${id}\ntest('${id} repro @bugbash', async () => { expect(x, '[BUG:${id}] ...').toBe(1); });\n${body}`);
  return `tests/bugbash/${id.toLowerCase()}.spec.ts`;
};
const failing = (id: string): ReproRunner => () => ({
  runs: [1, 2].map(() => ({ status: "failed", messages: [`Error: [BUG:${id}] compteur\n\nexpect(locator).toHaveText(expected) failed\nExpected: "1"\nReceived: "0"`] })),
});

test("bug bash lecture seule : postures qui écrivent refusées", () => {
  const { qaDir } = project({ bugbash: { shared_env: true } });
  explore(qaDir, "init", { goal: "g" }, ["bugbash"]);
  assert.equal(JSON.parse(explore(qaDir, "context").stdout).read_only, true, "shared_env impose la lecture seule");
  assert.equal(explore(qaDir, "start", { title: "t", instruction: "i", posture: "edge-input" }).exitCode, 1);
  assert.equal(explore(qaDir, "start", { title: "t", instruction: "i", posture: "numbers-and-copy" }).exitCode, 0);
});

test("bug bash hors lecture seule : un compte jetable bb-<slug> avec session par charter", () => {
  const { qaDir } = project({ bugbash: { shared_env: false }, roles: [{ name: "bb-cart", username_env: "U", password_env: "P" }], explore: { parallelism: 2 } });
  explore(qaDir, "init", { goal: "g" }, ["bugbash"]);
  assert.equal(explore(qaDir, "start", { title: "t", instruction: "i" }).exitCode, 2, "--account requis");
  assert.equal(explore(qaDir, "start", { title: "t", instruction: "i", account: "cart" }).exitCode, 2, "session requise");
  const db = AgentDb.open(join(qaDir, "agentdb", "agentdb.sqlite"));
  db.putSession({ role: "bb-cart", storage_state_path: ".qa/agentdb/sessions/bb-cart.json", expires_at: new Date(Date.now() + 3600_000).toISOString() });
  db.close();
  const ok = explore(qaDir, "start", { title: "t", instruction: "i", account: "cart" });
  assert.equal(JSON.parse(ok.stdout).storage_state, ".qa/agentdb/sessions/bb-cart.json");
  assert.equal(explore(qaDir, "start", { title: "t2", instruction: "i", account: "cart" }).exitCode, 1, "compte déjà pris par un charter en cours");
});

test("findings merge -> verify (le kernel tranche) -> report : seuls les confirmés dans bugs_report.json", () => {
  const { root, qaDir } = seeded();
  const merge = JSON.parse(bb(qaDir, "merge").stdout);
  assert.equal(merge.findings, 3);
  assert.equal(merge.issues, 2, "les deux findings « compteur » fusionnés");
  const merged = JSON.parse(readFileSync(join(qaDir, "runs", RUN, "bugbash", "merged.json"), "utf8"));
  const counter = merged.issues.find((c: { findings: string[] }) => c.findings.length === 2).id;
  const link = merged.issues.find((c: { findings: string[] }) => c.findings.length === 1).id;

  const spec = reproSpec(root, counter);
  const confirmed = bb(qaDir, "verify", [writeJson(qaDir, "v1.json", verify({ finding_id: counter, bucket: "candidate", reason: "capture : compteur à 0 après ajout", repro_spec: spec, test_title: `${counter} repro @bugbash` }))], failing(counter));
  assert.equal(JSON.parse(confirmed.stdout).outcome, "confirmed");

  const rejected = bb(qaDir, "verify", [writeJson(qaDir, "v2.json", verify({ finding_id: link, bucket: "artifact", reason: "le lien ouvre un nouvel onglet ; destination 200" }))]);
  assert.equal(JSON.parse(rejected.stdout).outcome, "rejected");

  const report = JSON.parse(bb(qaDir, "report").stdout);
  assert.equal(report.confirmed, 1);
  const bugs = JSON.parse(readFileSync(join(qaDir, "runs", RUN, "bugbash", "bugs_report.json"), "utf8"));
  assert.equal(bugs.bugs[0].id, counter);
  assert.equal(bugs.bugs[0].repro_spec, spec);
  const unconfirmed = JSON.parse(readFileSync(join(qaDir, "runs", RUN, "bugbash", "unconfirmed.json"), "utf8"));
  assert.deepEqual(unconfirmed.items.map((i: { status: string }) => i.status), ["rejected:artifact"]);
});

test("verify : test qui passe -> non reproduit ; test faux deux fois -> abandonné ; garde-fous statiques", () => {
  const { root, qaDir } = seeded();
  bb(qaDir, "merge");
  const merged = JSON.parse(readFileSync(join(qaDir, "runs", RUN, "bugbash", "merged.json"), "utf8"));
  const [a, b] = merged.issues.map((c: { id: string }) => c.id);

  const specA = reproSpec(root, a);
  const passing: ReproRunner = () => ({ runs: [{ status: "passed", messages: [] }, { status: "passed", messages: [] }] });
  const nr = bb(qaDir, "verify", [writeJson(qaDir, "va.json", verify({ finding_id: a, bucket: "candidate", reason: "à prouver par un test", repro_spec: specA, test_title: "t @bugbash" }))], passing);
  assert.equal(JSON.parse(nr.stdout).outcome, "not_reproduced");

  // Marqueur absent : refus statique sans lancer Playwright, deux fois -> abandonné.
  mkdirSync(join(root, "tests", "bugbash"), { recursive: true });
  writeFileSync(join(root, "tests", "bugbash", "sans-marqueur.spec.ts"), `// @finding ${b}\ntest('t @bugbash', () => {});`);
  let called = false;
  const spy: ReproRunner = () => ((called = true), { runs: [] });
  const doc = writeJson(qaDir, "vb.json", verify({ finding_id: b, bucket: "candidate", reason: "à prouver par un test", repro_spec: "tests/bugbash/sans-marqueur.spec.ts", test_title: "t @bugbash" }));
  const first = bb(qaDir, "verify", [doc], spy);
  assert.equal(first.exitCode, 1);
  assert.equal(JSON.parse(first.stdout).outcome, "test_invalid");
  assert.equal(JSON.parse(bb(qaDir, "verify", [doc], spy).stdout).outcome, "abandoned");
  assert.equal(called, false);
});
