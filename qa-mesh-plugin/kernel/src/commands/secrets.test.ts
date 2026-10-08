import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRedact, runSecretsList } from "./secrets";
import { runJournal } from "./journal";
import { projectRedactor } from "../secrets/project";

const SCHEMA = join(__dirname, "..", "..", "..", ".qa", "agentdb", "schema.json");

function project(): string {
  const qaDir = join(mkdtempSync(join(tmpdir(), "qa-mesh-secrets-")), ".qa");
  mkdirSync(join(qaDir, "agentdb"), { recursive: true });
  writeFileSync(join(qaDir, "agentdb", "schema.json"), readFileSync(SCHEMA));
  writeFileSync(
    join(qaDir, "qa.config.json"),
    JSON.stringify({
      roles: [{ name: "default", username_env: "QA_U", password_env: "QA_P" }],
      secrets: [{ name: "api-token", env: "QA_TEST_API_TOKEN" }],
    }),
  );
  return qaDir;
}

const ENV = { QA_P: "motdepasse-de-test", QA_TEST_API_TOKEN: "jeton-api-0123456789" };

test("secrets list : noms et présence, jamais la valeur", () => {
  const out = runSecretsList({ qaDir: project(), env: ENV, json: true });
  assert.deepEqual(JSON.parse(out.stdout), [
    { name: "api-token", env: "QA_TEST_API_TOKEN", present: true },
    { name: "default.password", env: "QA_P", present: true },
  ]);
  assert.ok(!out.stdout.includes(ENV.QA_P));
});

test("redact : texte et JSON", () => {
  const qaDir = project();
  const file = join(qaDir, "rapport.json");
  writeFileSync(file, JSON.stringify({ message: `401 avec ${ENV.QA_TEST_API_TOKEN}` }));
  const out = runRedact({ file, qaDir, env: ENV });
  assert.equal(JSON.parse(out.stdout).message, "401 avec <secret:api-token>");
  assert.equal(runRedact({ file: "-", stdin: `pwd=${ENV.QA_P}`, qaDir, env: ENV }).stdout, "pwd=<secret:default.password>");
  runRedact({ file, qaDir, env: ENV, inPlace: true });
  assert.ok(!readFileSync(file, "utf8").includes(ENV.QA_TEST_API_TOKEN));
});

test("journal : les anomalies écrites dans pipeline.log sont redactées", () => {
  const qaDir = project();
  const saved = process.env.QA_TEST_API_TOKEN;
  process.env.QA_TEST_API_TOKEN = ENV.QA_TEST_API_TOKEN;
  try {
    const out = runJournal({
      runId: "2026-10-08-001",
      agent: "agent-5",
      status: "error",
      anomalies: [`échec auth avec ${ENV.QA_TEST_API_TOKEN}`],
      qaDir,
    });
    assert.equal(out.exitCode, 0, out.stdout);
    const log = readFileSync(join(qaDir, "runs", "2026-10-08-001", "pipeline.log"), "utf8");
    assert.ok(log.includes("<secret:api-token>"));
    assert.ok(!log.includes(ENV.QA_TEST_API_TOKEN));
  } finally {
    if (saved === undefined) delete process.env.QA_TEST_API_TOKEN;
    else process.env.QA_TEST_API_TOKEN = saved;
  }
});

test("fail-closed : un secret trop court fait échouer plutôt que d'écrire mal masqué", () => {
  assert.throws(() => projectRedactor(project(), { QA_P: "court" }), /trop court/);
});
