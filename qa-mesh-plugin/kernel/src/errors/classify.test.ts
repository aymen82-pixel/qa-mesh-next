import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { classifyFailure, cleanMessage } from "./classify";
import { CATALOG } from "./catalog";

const FIXTURES = resolve(__dirname, "..", "..", "src", "errors", "fixtures");
const real = JSON.parse(readFileSync(resolve(FIXTURES, "playwright-1.56.json"), "utf8")) as {
  login_url: string;
  cases: { name: string; expected: string; messages: string[] }[];
};

for (const c of real.cases) {
  test(`message réel Playwright « ${c.name} » -> ${c.expected}`, () => {
    const result = classifyFailure(c.messages, { loginUrl: real.login_url });
    assert.equal(result.code, c.expected, result.evidence);
  });
}

test("la classe et la piste viennent du catalogue", () => {
  const r = classifyFailure(["Error: locator.click: Error: strict mode violation: getByRole('button') resolved to 2 elements"]);
  const entry = CATALOG.find((e) => e.code === "LOCATOR_AMBIGUOUS")!;
  assert.equal(r.class, entry.class);
  assert.equal(r.hint, entry.hint);
  assert.equal(r.ambiguous, false);
});

test("ANSI et code frame retirés avant classification", () => {
  const raw = "\x1b[31mError: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:1/\x1b[39m\n\n> 12 | await page.goto(url)\n    at /x.ts:12";
  assert.equal(cleanMessage(raw), "Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:1/");
  assert.equal(classifyFailure([raw]).code, "ENV_UNREACHABLE");
});

test("TEST_TIMEOUT ne l'emporte que sans code plus spécifique", () => {
  assert.equal(classifyFailure(["Test timeout of 1500ms exceeded."]).code, "TEST_TIMEOUT");
  assert.equal(
    classifyFailure([
      "Test timeout of 1500ms exceeded.",
      "Error: locator.click: Test timeout of 1500ms exceeded.\nCall log:\n  - waiting for getByText('never')",
    ]).code,
    "LOCATOR_NOT_FOUND",
  );
});

test("sans auth.login_url, une redirection vers /login reste une assertion d'URL", () => {
  const urlCase = real.cases.find((c) => c.name === "url-login")!;
  assert.equal(classifyFailure(urlCase.messages).code, "ASSERTION_FAILED");
});

test("aucun message -> UNCLASSIFIED, sans lever", () => {
  const r = classifyFailure([]);
  assert.equal(r.code, "UNCLASSIFIED");
  assert.equal(r.class, "SCRIPT");
});

test("evidence bornée", () => {
  const r = classifyFailure([`Error: ${"x".repeat(5000)}`]);
  assert.ok(r.evidence.length <= 601);
});
