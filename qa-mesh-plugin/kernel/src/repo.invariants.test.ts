/** Invariants du dépôt qui ne relèvent d'aucun module (régressions déjà vécues). */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..");

test("playwright.config.ts : le premier projet n'est pas `setup` (le serveur MCP y cherche le seed)", () => {
  const config = readFileSync(resolve(ROOT, "playwright.config.ts"), "utf8");
  const projects = config.slice(config.indexOf("projects:"));
  const first = /name:\s*'([^']+)'/.exec(projects)?.[1];
  assert.ok(first && first !== "setup", `premier projet : ${first}`);
});

test("tests/seed.spec.ts importe depuis fixtures/pages.fixture (le serveur MCP peut le réécrire)", () => {
  const seed = readFileSync(resolve(ROOT, "tests", "seed.spec.ts"), "utf8");
  assert.match(seed, /from '\.\.\/fixtures\/pages\.fixture'/);
  assert.doesNotMatch(seed, /from '@playwright\/test'/);
});
