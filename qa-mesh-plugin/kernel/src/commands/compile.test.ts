import { strict as assert } from "node:assert";
import { test } from "node:test";
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { GENERATED_MARKER, runCompile } from "./compile";

const ROOT = resolve(__dirname, "..", "..", "..");

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "qa-mesh-compile-"));
  cpSync(join(ROOT, "agents"), join(dir, "agents"), { recursive: true });
  cpSync(join(ROOT, ".claude", "rules"), join(dir, ".claude", "rules"), { recursive: true });
  return dir;
}

test("compile codex : refuse d'écraser un AGENTS.md écrit à la main", () => {
  const root = scratch();
  writeFileSync(join(root, "AGENTS.md"), "# AGENTS.md\n\nInvariants du dépôt.\n");
  const out = runCompile({ target: "codex", root });
  assert.equal(out.exitCode, 2);
  assert.match(out.stdout, /refus d'écraser AGENTS\.md/);
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), "# AGENTS.md\n\nInvariants du dépôt.\n");
});

test("compile codex : écrit puis réécrit un bundle généré", () => {
  const root = scratch();
  assert.equal(runCompile({ target: "codex", root }).exitCode, 0);
  assert.ok(readFileSync(join(root, "AGENTS.md"), "utf8").includes(GENERATED_MARKER));
  assert.equal(runCompile({ target: "codex", root }).exitCode, 0, "un bundle généré peut être régénéré");
  assert.ok(existsSync(join(root, ".codex", "config.toml")));
});
