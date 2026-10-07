import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runConfigCheck } from "./config";

const QA_DIR = resolve(__dirname, "..", "..", "..", ".qa");

function tmpFile(content: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "qa-mesh-config-")), "qa.config.json");
  writeFileSync(path, content, "utf8");
  return path;
}

test("config check : la config exemple est conforme (exit 0)", () => {
  const out = runConfigCheck({ file: join(QA_DIR, "qa.config.example.json"), qaDir: QA_DIR });
  assert.equal(out.exitCode, 0, out.stdout);
});

test("config check : clé inconnue (faute de frappe) rejetée avec le chemin (exit 1)", () => {
  const out = runConfigCheck({
    file: tmpFile(JSON.stringify({ base_url: "https://app.example.test", paths: { testDir: "tests", pagesDir: "pages", fixturesDir: "fixtures" }, roles: [{ name: "d", username_env: "U", password_env: "P" }], auth: { login_url: "/login" }, budjets: {} })),
    qaDir: QA_DIR,
    json: true,
  });
  assert.equal(out.exitCode, 1);
  const report = JSON.parse(out.stdout);
  assert.ok(report.errors.some((e: { message: string }) => e.message.includes("budjets")));
});

test("config check : fichier absent ou JSON illisible (exit 2)", () => {
  assert.equal(runConfigCheck({ file: "/nonexistent/qa.config.json", qaDir: QA_DIR }).exitCode, 2);
  assert.equal(runConfigCheck({ file: tmpFile("{ pas du json"), qaDir: QA_DIR }).exitCode, 2);
});
