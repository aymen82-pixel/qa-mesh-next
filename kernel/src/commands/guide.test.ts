import { strict as assert } from "node:assert";
import { test } from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { listSkills, runGuide } from "./guide";

const SKILLS = resolve(__dirname, "..", "..", "..", ".claude", "skills");
const g = (topic?: string, json = false) => runGuide({ topic, json, skillsDir: SKILLS });

test("guide : liste les skills avec leurs topics", () => {
  const list = JSON.parse(g(undefined, true).stdout) as { name: string; topics: string[] }[];
  const names = list.map((s) => s.name);
  assert.ok(names.includes("qa-mesh") && names.includes("playwright-best-practices"));
  assert.ok(list.find((s) => s.name === "playwright-best-practices")!.topics.includes("locators"));
});

test("guide <skill> : routeur sans frontmatter ; <skill>/<topic> : la référence", () => {
  const router = g("qa-mesh");
  assert.equal(router.exitCode, 0);
  assert.ok(!router.stdout.startsWith("---"));
  assert.match(router.stdout, /\| Topic \| Fichier \| À lire quand \|/);
  assert.match(g("qa-mesh/loop").stdout, /^# Mode loop/);
});

test("guide <topic> : raccourci quand un seul skill porte ce topic", () => {
  assert.match(g("locators").stdout, /locator/i);
});

test("guide : inconnu -> exit 2 avec la liste", () => {
  const out = g("qa-mesh/inexistant");
  assert.equal(out.exitCode, 2);
  assert.match(out.stdout, /Topics : /);
  assert.equal(g("pas-un-skill").exitCode, 2);
});

/** Contrat du modèle progressive disclosure, vérifié sur tous les skills. */
for (const skill of listSkills(SKILLS)) {
  test(`skill ${skill.name} : routeur < 160 lignes, liens et topics cohérents`, () => {
    const text = readFileSync(join(skill.dir, "SKILL.md"), "utf8");
    assert.ok(text.split("\n").length < 160, "SKILL.md doit rester un routeur court");
    const linked = [...text.matchAll(/\]\((references\/[^)]+\.md)\)/g)].map((m) => m[1]);
    for (const l of linked) assert.ok(existsSync(join(skill.dir, l)), `lien cassé : ${l}`);
    const refsDir = join(skill.dir, "references");
    if (existsSync(refsDir)) {
      for (const f of readdirSync(refsDir)) {
        assert.ok(linked.includes(`references/${f}`), `référence non routée : ${f}`);
      }
      assert.match(text, /\| Topic \| Fichier \| À lire quand/, "table de routage attendue");
    }
  });
}
