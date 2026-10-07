import { strict as assert } from "node:assert";
import { test } from "node:test";
import { resolve } from "node:path";
import { checkErrorCodes, loadCheckInput, type CheckInput } from "./check";

const ROOT = resolve(__dirname, "..", "..", "..");
const fresh = (): CheckInput => loadCheckInput(ROOT);

test("le dépôt est cohérent : catalogue, doc, règles, fixtures, contrat agent-5, prompts", () => {
  assert.deepEqual(checkErrorCodes(fresh()), []);
});

test("code documenté mais jamais levé -> échec", () => {
  const input = fresh();
  input.docsText += "\n| `PHANTOM_FAILED` | SCRIPT | non | inventé |\n";
  assert.ok(checkErrorCodes(input).some((p) => p.includes("PHANTOM_FAILED")));
});

test("code du catalogue absent de la doc -> échec", () => {
  const input = fresh();
  input.docsText = input.docsText.replace(/^\|\s*`HTTP_5XX`.*$/m, "");
  assert.ok(checkErrorCodes(input).some((p) => p.includes("non documenté") && p.includes("HTTP_5XX")));
});

test("code sans fixture de message réel -> échec", () => {
  const input = fresh();
  input.fixtureCodes = input.fixtureCodes.filter((c) => c !== "NAV_TIMEOUT");
  assert.ok(checkErrorCodes(input).some((p) => p.includes("sans fixture") && p.includes("NAV_TIMEOUT")));
});

test("prompt d'agent citant un code hors catalogue -> échec", () => {
  const input = fresh();
  input.prompts.set("agents/bodies/x.md", "Si `SELECTOR_TIMEOUT` alors réparer.");
  assert.ok(checkErrorCodes(input).some((p) => p.includes("SELECTOR_TIMEOUT")));
});

test("contrat agent-5 qui ne lie plus un code non ambigu à sa classe -> échec", () => {
  const input = fresh();
  const failure = (input.agent5Schema as any).properties.results.items.properties.failure;
  failure.allOf = failure.allOf.filter((c: any) => c.if.properties.code.const !== "ENV_UNREACHABLE");
  assert.ok(checkErrorCodes(input).some((p) => p.includes("ENV_UNREACHABLE doit imposer kind=ENV")));
});
