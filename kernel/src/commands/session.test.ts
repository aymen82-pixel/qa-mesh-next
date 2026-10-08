import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSessionRefresh, type SetupRunner } from "./session";
import { AgentDb } from "../db/agentdb";

function project(): string {
  const qaDir = join(mkdtempSync(join(tmpdir(), "qa-mesh-session-")), ".qa");
  mkdirSync(join(qaDir, "agentdb"), { recursive: true });
  writeFileSync(
    join(qaDir, "qa.config.json"),
    JSON.stringify({
      roles: [{ name: "admin", username_env: "QA_ADMIN_USER", password_env: "QA_ADMIN_PASSWORD" }],
      auth: { login_url: "/login", session_ttl_hours: 2 },
    }),
  );
  return qaDir;
}

const ENV = { QA_ADMIN_USER: "admin@example.test", QA_ADMIN_PASSWORD: "motdepasse-admin" };
const report = (status: string) => ({ suites: [{ title: "auth.setup.ts", specs: [{ title: "x", tests: [{ status }] }] }] });

/** Runner simulé : écrit (ou non) le storageState comme le ferait tests/auth.setup.ts. */
const runner = (status: string, write = true): SetupRunner => ({ env }) => {
  if (write) writeFileSync(env.QA_STORAGE_STATE, JSON.stringify({ cookies: [], origins: [] }));
  return { status: status === "expected" ? 0 : 1, report: report(status) };
};

test("refresh : connexion réussie -> session enregistrée avec TTL de la config", () => {
  const qaDir = project();
  const out = runSessionRefresh({ role: "admin", qaDir, env: ENV, runner: runner("expected"), json: true, now: () => new Date("2026-10-08T10:00:00Z") });
  assert.equal(out.exitCode, 0, out.stdout);
  const res = JSON.parse(out.stdout);
  assert.equal(res.storage_state_path, ".qa/agentdb/sessions/admin.json");
  assert.equal(res.expires_at, "2026-10-08T12:00:00.000Z");
  const db = AgentDb.open(join(qaDir, "agentdb", "agentdb.sqlite"));
  try {
    assert.equal((db.getSession("admin") as { storage_state_path: string }).storage_state_path, ".qa/agentdb/sessions/admin.json");
  } finally {
    db.close();
  }
});

test("refresh : la sortie ne contient jamais le mot de passe", () => {
  const out = runSessionRefresh({ role: "admin", qaDir: project(), env: ENV, runner: runner("unexpected") });
  assert.equal(out.exitCode, 1);
  assert.ok(!out.stdout.includes(ENV.QA_ADMIN_PASSWORD));
});

test("refresh : test sauté ou storageState non écrit -> échec, rien d'enregistré", () => {
  assert.equal(runSessionRefresh({ role: "admin", qaDir: project(), env: ENV, runner: runner("skipped") }).exitCode, 1);
  const out = runSessionRefresh({ role: "admin", qaDir: project(), env: ENV, runner: runner("expected", false), json: true });
  assert.equal(out.exitCode, 1);
  assert.match(JSON.parse(out.stdout).error, /non écrit/);
});

test("refresh : rôle inconnu ou variables absentes -> exit 2 sans lancer Playwright", () => {
  let called = false;
  const spy: SetupRunner = () => ((called = true), { status: 0 });
  assert.equal(runSessionRefresh({ role: "inconnu", qaDir: project(), env: ENV, runner: spy }).exitCode, 2);
  const out = runSessionRefresh({ role: "admin", qaDir: project(), env: { QA_ADMIN_USER: "a" }, runner: spy, json: true });
  assert.equal(out.exitCode, 2);
  assert.deepEqual(JSON.parse(out.stdout).missing, ["QA_ADMIN_PASSWORD"]);
  assert.equal(called, false);
});
