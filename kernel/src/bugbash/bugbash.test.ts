import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mergeFindings, titleDistance } from "./merge";
import { judgeRepro } from "./verdict";
import type { FindingRow } from "../explore/store";

let n = 0;
const f = (title: string, over: Partial<FindingRow> = {}): FindingRow => ({
  id: `F-${String(++n).padStart(3, "0")}`,
  run_id: "r",
  charter: n,
  title,
  kind: "issue",
  severity: 3,
  expected: "e",
  actual: "a",
  repro_steps: ["s1", "s2"],
  route: "/cart",
  reported_at: "",
  ...over,
});

test("fusion : même route + titres proches -> un candidat, repro la plus courte, sévérité max", () => {
  n = 0;
  const { issues } = mergeFindings([
    f("Le total du panier ne se met pas à jour"),
    f("Le total du panier ne se met pas a jour !", { severity: 5, repro_steps: ["s1"] }),
    f("Le total du panier ne se met pas à jour", { route: "/checkout" }),
    f("Le bouton supprimer ne fait rien"),
  ]);
  assert.equal(issues.length, 3);
  const merged = issues.find((c) => c.findings.length === 2)!;
  assert.deepEqual(merged.findings, ["F-001", "F-002"]);
  assert.equal(merged.primary, "F-002");
  assert.equal(merged.severity, 5);
  assert.deepEqual(merged.charters, [1, 2]);
  assert.equal(issues[0].id, "B-001", "trié par sévérité");
});

test("fusion : warnings séparés, jamais fusionnés avec une issue", () => {
  n = 0;
  const { issues, warnings } = mergeFindings([f("Faute dans le pied de page", { kind: "warning" }), f("Faute dans le pied de page")]);
  assert.equal(issues.length, 1);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].id, "W-001");
});

test("distance de titres normalisée (casse, accents, ponctuation)", () => {
  assert.equal(titleDistance("Total FAUX !", "total faux"), 0);
  assert.ok(titleDistance("compteur faux", "lien mort vers l'aide") > 0.5);
});

const FAIL = (marker = "[BUG:B-001]") => ({
  status: "failed",
  messages: [`Error: ${marker} le compteur suit l'ajout\n\nexpect(locator).toHaveText(expected) failed\n\nExpected: "1 item left"\nReceived: "0 items left"`],
});

test("verdict : confirmé seulement si chaque exécution échoue en ASSERTION_FAILED sur le marqueur", () => {
  assert.equal(judgeRepro("B-001", [FAIL(), FAIL()]).outcome, "confirmed");
  assert.equal(judgeRepro("B-001", [{ status: "passed", messages: [] }, { status: "passed", messages: [] }]).outcome, "not_reproduced");
  assert.equal(judgeRepro("B-001", [FAIL(), { status: "passed", messages: [] }]).outcome, "flaky");
  assert.equal(judgeRepro("B-001", [FAIL("[BUG:B-009]"), FAIL("[BUG:B-009]")]).outcome, "test_invalid", "autre marqueur");
  const locator = { status: "failed", messages: ["TimeoutError: locator.click: Timeout 500ms exceeded.\nCall log:\n  - waiting for getByRole('button')"] };
  assert.equal(judgeRepro("B-001", [locator, locator]).outcome, "test_invalid", "LOCATOR_NOT_FOUND = test faux");
  assert.equal(judgeRepro("B-001", []).outcome, "test_invalid");
  assert.equal(judgeRepro("B-001", [{ status: "skipped", messages: [] }]).outcome, "test_invalid");
});
