/**
 * Règle des contrats (AGENTS.md) : chaque schéma de `.qa/contracts/` a une
 * fixture valide et une fixture invalide. La valide passe ; l'invalide échoue
 * sur le chemin qu'elle déclare dans `_expect_error` (jamais par accident).
 * Toute modification de contrat touche le schéma, ses deux fixtures et le
 * producteur dans le même commit.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CONFIG_SCHEMA, ContractRegistry, validateConfig, validateDocument, type ValidationResult } from "./contracts";

const QA_DIR = resolve(__dirname, "..", "..", ".qa");
const CONTRACTS = join(QA_DIR, "contracts");
const FIXTURES = join(CONTRACTS, "fixtures");
const registry = ContractRegistry.load(QA_DIR);

interface Expectation {
  layer: string;
  path: string;
}

function load(name: string): { doc: Record<string, unknown>; expect?: Expectation } {
  const doc = JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as Record<string, unknown>;
  const expect = doc._expect_error as Expectation | undefined;
  delete doc._expect_error;
  return { doc, expect };
}

function check(schema: string, doc: unknown): ValidationResult {
  if (schema === CONFIG_SCHEMA) return validateConfig(registry, doc);
  // Documents écrits par le kernel (rapports) : ni enveloppe ni payload d'agent.
  if (schema !== "envelope" && !schema.startsWith("agent-")) return validateDocument(registry, schema, doc);
  // L'enveloppe seule (qa-analyst) n'a pas de payload contrôlé ; les agents oui.
  return registry.validateDeliverable(doc, schema === "envelope" ? undefined : schema);
}

const schemas = readdirSync(CONTRACTS)
  .filter((f) => f.endsWith(".schema.json"))
  .map((f) => f.replace(/\.schema\.json$/, ""))
  .sort();

test("chaque contrat a ses deux fixtures (valide + invalide)", () => {
  const missing = schemas.flatMap((s) =>
    [`${s}.valid.json`, `${s}.invalid.json`].filter((f) => !existsSync(join(FIXTURES, f))),
  );
  assert.deepEqual(missing, [], `fixtures manquantes : ${missing.join(", ")}`);
});

test("aucune fixture orpheline (sans schéma correspondant)", () => {
  const orphans = readdirSync(FIXTURES).filter((f) => {
    const m = /^(.+)\.(valid|invalid)\.json$/.exec(f);
    return !m || !schemas.includes(m[1]);
  });
  assert.deepEqual(orphans, []);
});

for (const schema of schemas) {
  test(`${schema} : la fixture valide est conforme`, () => {
    const { doc } = load(`${schema}.valid.json`);
    const result = check(schema, doc);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  });

  test(`${schema} : la fixture invalide échoue pour la raison déclarée`, () => {
    const { doc, expect } = load(`${schema}.invalid.json`);
    assert.ok(expect, "la fixture invalide doit déclarer _expect_error {layer, path}");
    const result = check(schema, doc);
    assert.equal(result.valid, false, "la fixture invalide doit être rejetée");
    assert.ok(
      result.errors.some((e) => e.layer === expect.layer && e.path === expect.path),
      `erreur attendue ${expect.layer} ${expect.path}, obtenu : ${JSON.stringify(result.errors)}`,
    );
  });
}

test("qa.config.example.json reste conforme au contrat de config", () => {
  const doc = JSON.parse(readFileSync(join(QA_DIR, "qa.config.example.json"), "utf8"));
  const result = validateConfig(registry, doc);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("qa-config n'est pas pris pour un contrat d'agent", () => {
  assert.equal(registry.hasPayloadContract(CONFIG_SCHEMA), false);
  assert.ok(registry.schemaKeys().includes(CONFIG_SCHEMA));
});
