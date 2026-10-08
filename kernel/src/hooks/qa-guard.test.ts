/** Hook .claude/hooks/qa-guard.js, alimenté par stdin JSON comme le fait Claude Code. */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const HOOK = resolve(__dirname, "..", "..", "..", ".claude", "hooks", "qa-guard.js");

function guard(filePath: string, content: string): { code: number | null; stderr: string } {
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: "Write", tool_input: { file_path: filePath, content } }),
    encoding: "utf8",
  });
  return { code: res.status, stderr: res.stderr };
}

// Jetons construits à l'exécution : ce fichier ne contient aucun jeton littéral.
const JWT = ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"].join(".");
const BEARER = "Bearer " + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4";
const SK = "sk-" + "ant-" + "a".repeat(12) + "B".repeat(12);

test("JWT, Bearer et clé sk- bloqués sur tout chemin (exit 2)", () => {
  for (const [path, content] of [
    ["docs/notes.md", `jeton : ${JWT}`],
    [".qa/qa.config.json", `{"h": "${BEARER}"}`],
    ["utils/client.ts", `const key = "${SK}";`],
  ]) {
    const res = guard(path, content);
    assert.equal(res.code, 2, `${path} aurait dû être bloqué`);
    assert.match(res.stderr, /qa-guard : écriture bloquée/);
  }
});

test("gabarits et placeholders autorisés (exit 0)", () => {
  for (const content of [
    "Authorization: `Bearer ${options.token}`",
    "Authorization: Bearer <token>",
    "clé sk-... à déclarer dans qa.config.json#secrets",
    "eyJ... (JWT tronqué)",
  ]) {
    assert.equal(guard("utils/api-client.ts", content).code, 0, content);
  }
});

test("règles de test inchangées : waitForTimeout bloqué dans tests/, pas dans docs/", () => {
  assert.equal(guard("tests/a/a.spec.ts", "await page.waitForTimeout(500);").code, 2);
  assert.equal(guard("docs/regles.md", "jamais waitForTimeout(500)").code, 0);
});

test("aiJudge jamais seul : bloqué sans assertion déterministe, accepté avec", () => {
  const alone = "test('x', async ({ aiJudge }) => {\n  const v = await aiJudge.evaluate({ output: o, criterion: c });\n  expect(v.ok, v.reason).toBe(true);\n});";
  const res = guard("tests/rag/rag.answer.spec.ts", alone);
  assert.equal(res.code, 2);
  assert.match(res.stderr, /aiJudge utilisé seul/);
  const paired = alone.replace("expect(v.ok", "expect(o, 'source citée').toContain('note 12');\n  expect(v.ok");
  assert.equal(guard("tests/rag/rag.answer.spec.ts", paired).code, 0);
});

test("le spec réel du juge IA respecte la règle", () => {
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const spec = readFileSync(resolve(__dirname, "..", "..", "..", "tests", "ai-judge", "ai-judge.spec.ts"), "utf8");
  assert.equal(guard("tests/ai-judge/ai-judge.spec.ts", spec).code, 0);
});
