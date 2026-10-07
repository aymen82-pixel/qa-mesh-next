import { strict as assert } from "node:assert";
import { test } from "node:test";
import { resolve } from "node:path";
import { runClassify } from "./classify";

const REPORT = resolve(__dirname, "..", "..", "src", "errors", "fixtures", "report.playwright-1.56.json");

test("classify : rapport JSON Playwright réel -> un code par test en échec", () => {
  const out = runClassify({ report: REPORT, loginUrl: "/login", json: true });
  assert.equal(out.exitCode, 0);
  const { failures, summary } = JSON.parse(out.stdout);
  assert.equal(summary.failed, 12);
  const byTitle = Object.fromEntries(failures.map((f: { title: string; code: string }) => [f.title, f.code]));
  assert.equal(byTitle["locator-not-found"], "LOCATOR_NOT_FOUND");
  assert.equal(byTitle["ambiguous"], "LOCATOR_AMBIGUOUS");
  assert.equal(byTitle["url-login"], "AUTH_EXPIRED");
  assert.equal(byTitle["test-timeout"], "LOCATOR_NOT_FOUND");
  const withContext = failures.find((f: { title: string }) => f.title === "locator-not-found");
  assert.ok(withContext.attachments.some((a: { name: string }) => a.name === "error-context"));
});

test("classify : sortie humaine bornée à code + piste", () => {
  const out = runClassify({ report: REPORT, loginUrl: "/login" });
  assert.match(out.stdout, /^12 échec\(s\), 0 flaky/);
  assert.match(out.stdout, /LOCATOR_AMBIGUOUS \[SCRIPT\]/);
});

test("classify : rapport absent -> exit 2", () => {
  assert.equal(runClassify({ report: "/nonexistent.json" }).exitCode, 2);
  assert.equal(runClassify({}).exitCode, 2);
});
