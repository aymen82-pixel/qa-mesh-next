import { strict as assert } from "node:assert";
import { test } from "node:test";
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildPluginFiles, runPlugin } from "./plugin";

const ROOT = resolve(__dirname, "..", "..", "..");

/** Copie les seules sources nécessaires au build dans un projet jetable. */
function scratchProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "qa-mesh-plugin-"));
  for (const p of ["plugin-src", "agents", ".claude", ".qa/contracts", ".qa/routing.yaml", ".qa/qa.config.example.json", ".qa/agentdb/schema.json"]) {
    cpSync(join(ROOT, p), join(dir, p), { recursive: true });
  }
  cpSync(join(ROOT, "kernel"), join(dir, "kernel"), {
    recursive: true,
    filter: (src) => !/[\\/](node_modules|dist|dist-test)([\\/]|$)/.test(src),
  });
  return dir;
}

test("buildPluginFiles : agents compilés depuis le manifeste, identiques à .claude/agents", () => {
  const files = buildPluginFiles(ROOT);
  const analyst = files.get("agents/qa-analyst.md");
  assert.ok(analyst, "agent qa-analyst présent");
  assert.ok(analyst.equals(readFileSync(join(ROOT, ".claude/agents/qa-analyst.md"))));
  assert.ok(files.has(".claude-plugin/plugin.json"));
  assert.ok(files.has("hooks/hooks.json"));
  assert.ok(files.has("hooks/qa-guard.js"));
  assert.ok(files.has("kernel/src/cli.ts"));
  assert.ok(files.has("templates/.qa/contracts/envelope.schema.json"), "contrats embarqués");
  assert.ok(files.has("templates/.qa/routing.yaml"), "routing embarqué");
  assert.ok(files.has("templates/.qa/qa.config.example.json"), "config exemple embarquée");
});

test("buildPluginFiles : jamais d'artefact de build ni de dépendance", () => {
  for (const rel of buildPluginFiles(ROOT).keys()) {
    assert.ok(!/(^|\/)(node_modules|dist|dist-test)\//.test(rel), `artefact embarqué : ${rel}`);
  }
});

test("runPlugin : build puis --check vert, dérive détectée (diff, en trop, absent)", () => {
  const root = scratchProject();
  assert.equal(runPlugin({ root }).exitCode, 0);
  assert.equal(runPlugin({ root, check: true }).exitCode, 0);

  const target = join(root, "qa-mesh-plugin", "agents", "qa-analyst.md");
  writeFileSync(target, readFileSync(target, "utf8") + "\nédition à la main\n");
  writeFileSync(join(root, "qa-mesh-plugin", "orphelin.txt"), "x");
  const out = runPlugin({ root, check: true, json: true });
  assert.equal(out.exitCode, 1);
  const report = JSON.parse(out.stdout);
  assert.deepEqual(report.diff, ["agents/qa-analyst.md"]);
  assert.deepEqual(report.extra, ["orphelin.txt"]);

  // Une régénération remet le plugin en conformité et supprime l'orphelin.
  assert.equal(runPlugin({ root }).exitCode, 0);
  assert.equal(existsSync(join(root, "qa-mesh-plugin", "orphelin.txt")), false);
  assert.equal(runPlugin({ root, check: true }).exitCode, 0);
});
