import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readZip } from "./zip";
import { parseTrace } from "./parse";
import { MAX_APP_LOG, MAX_STEPS, extractAriaSnapshot, renderTracePage } from "./render";
import { classifyFailure } from "../errors/classify";
import { runTraceRender } from "../commands/trace";

const FIX = resolve(__dirname, "..", "..", "src", "trace", "fixtures");
const zipBuf = () => readFileSync(join(FIX, "compteur.trace.zip"));

test("zip : lit le trace.zip réel de Playwright 1.56 (deflate)", () => {
  const entries = readZip(zipBuf());
  assert.ok(entries.has("test.trace"));
  assert.ok(entries.has("0-trace.network"));
  assert.match(entries.get("test.trace")!.read().toString("utf8"), /"type":"before"/);
});

test("zip : fichier tronqué ou non ZIP -> erreur explicite", () => {
  assert.throws(() => readZip(Buffer.from("pas un zip du tout, vraiment pas")), /fin de répertoire central/);
  assert.throws(() => readZip(zipBuf().subarray(0, 500)), /zip :/);
});

test("parse : étapes du test, erreur sur l'assertion, journal app (console + 500)", () => {
  const t = parseTrace(readZip(zipBuf()));
  assert.deepEqual(t.steps.map((s) => s.method).slice(-3), ["pw:api", "pw:api", "expect"]);
  const last = t.steps[t.steps.length - 1];
  assert.match(last.error ?? "", /compteur — expect\(locator\)\.toHaveText/);
  assert.ok(t.steps.every((s) => !/Fixture|Before Hooks|After Hooks/.test(s.title)), "hooks et fixtures exclus");
  assert.ok(t.appLog.some((l) => l.kind === "network" && /POST .*\/api\/todos → 500/.test(l.text)));
  assert.ok(t.appLog.some((l) => l.kind === "console" && l.level === "error"));
  assert.ok(!t.appLog.some((l) => /Failed to load resource/.test(l.text)), "doublon console/réseau retiré");
  assert.equal(t.failedRequests, 1);
});

test("render : page bornée (étapes, journal, snapshot) et dégradée sans trace", () => {
  const classification = classifyFailure(["Error: expect(locator).toHaveText(expected) failed\nExpected: \"1\"\nReceived: \"0\""]);
  const many = {
    steps: Array.from({ length: MAX_STEPS + 10 }, (_, i) => ({ title: `s${i}`, method: "pw:api", durationMs: 1 })),
    appLog: Array.from({ length: MAX_APP_LOG + 5 }, (_, i) => ({ level: "info" as const, kind: "console" as const, text: `l${i}`, time: i })),
    failedRequests: 0,
  };
  const page = renderTracePage({ title: "t", spec: "a.spec.ts", project: "chromium", status: "failed", classification, trace: many, attachments: [] });
  assert.match(page, /10 étape\(s\) antérieure\(s\) omise\(s\)/);
  assert.match(page, /\+5 lignes/);
  assert.match(page, /\*\*ASSERTION_FAILED\*\* · classe \*\*PRODUIT\*\*/);
  const degraded = renderTracePage({ title: "t", spec: "a.spec.ts", project: "", status: "failed", classification, trace: null, attachments: [] });
  assert.match(degraded, /Trace indisponible/);
});

test("extractAriaSnapshot : bloc YAML de error-context.md", () => {
  const yaml = extractAriaSnapshot(readFileSync(join(FIX, "compteur.error-context.md"), "utf8"));
  assert.match(yaml ?? "", /status \[ref=e4\]: 0 remaining/);
});

test("trace render : une page par échec, redactée, sous .qa/runs/<id>/results/", () => {
  const qaDir = join(mkdtempSync(join(tmpdir(), "qa-mesh-trace-")), ".qa");
  mkdirSync(qaDir, { recursive: true });
  writeFileSync(join(qaDir, "qa.config.json"), JSON.stringify({ secrets: [{ name: "msg", env: "QA_TRACE_SECRET" }] }));
  const report = JSON.parse(readFileSync(join(FIX, "compteur.report.json"), "utf8"));
  const result = report.suites[0].specs[0].tests[0].results[0];
  result.attachments = [
    { name: "error-context", contentType: "text/markdown", path: join(FIX, "compteur.error-context.md") },
    { name: "trace", contentType: "application/zip", path: join(FIX, "compteur.trace.zip") },
  ];
  const reportPath = join(qaDir, "report.json");
  writeFileSync(reportPath, JSON.stringify(report));

  const out = runTraceRender({ run: "2026-10-08-001", report: reportPath, qaDir, json: true, env: { QA_TRACE_SECRET: "hydratation" } });
  assert.equal(out.exitCode, 0, out.stdout);
  const { written } = JSON.parse(out.stdout);
  assert.equal(written.length, 1);
  assert.equal(written[0].code, "ASSERTION_FAILED");
  const dir = join(qaDir, "runs", "2026-10-08-001", "results");
  const page = readFileSync(join(dir, readdirSync(dir)[0], "trace.md"), "utf8");
  assert.match(page, /## Étapes/);
  assert.match(page, /<secret:msg>/);
  assert.ok(!/hydratation/i.test(page), "valeur du secret absente de trace.md");
});

test("trace render : arguments manquants ou rapport absent -> exit 2", () => {
  assert.equal(runTraceRender({}).exitCode, 2);
  assert.equal(runTraceRender({ run: "x", report: "/nonexistent.json", qaDir: tmpdir() }).exitCode, 2);
});
