/**
 * `qa-mesh errors check` — cohérence de la taxonomie des codes d'échec, sur le
 * modèle de `check-error-codes` (tester-army/e2e, Apache-2.0, voir NOTICE).
 *
 * Échoue si :
 *  - un code du catalogue manque dans `docs/errors.md`, ou la doc cite un code
 *    absent du catalogue, ou la classe documentée diffère ;
 *  - un code du catalogue n'est jamais levé (aucune règle de `classify.ts`,
 *    hors `UNCLASSIFIED` qui est le repli) ou n'a aucune fixture de message ;
 *  - le contrat `agent-5.schema.json` n'énumère pas exactement les codes, ou
 *    ne lie pas un code non ambigu à sa classe ;
 *  - un code est utilisé dans le kernel ou cité dans un prompt d'agent sans
 *    être au catalogue.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CATALOG } from "./catalog";
import { RULES } from "./classify";

export interface CheckInput {
  docsText: string;
  agent5Schema: unknown;
  /** Codes attendus par les cas de fixtures de messages. */
  fixtureCodes: string[];
  /** Fichiers source du kernel (hors tests) : chemin -> contenu. */
  kernelSources: Map<string, string>;
  /** Corps d'agents et skills : chemin -> contenu. */
  prompts: Map<string, string>;
}

const FALLBACK = "UNCLASSIFIED";
/** Forme d'un code d'échec dans la prose (évite PRODUIT, SCRIPT, etc.). */
const PROSE_CODE = /\b([A-Z][A-Z0-9]*_(?:FOUND|FAILED|TIMEOUT|EXPIRED|UNREACHABLE|MISMATCH|AMBIGUOUS|5XX))\b/g;
/** Codes utilisés par le code kernel : `code: "X"`, `=== "X"`, `build("X"`. */
const SOURCE_CODE = /(?:\bcode\s*(?::|===|!==)\s*|build\()"([A-Z][A-Z0-9_]+)"/g;

export function checkErrorCodes(input: CheckInput): string[] {
  const problems: string[] = [];
  const catalogCodes = new Set<string>(CATALOG.map((e) => e.code));
  const classOf = new Map<string, string>(CATALOG.map((e) => [e.code, e.class]));

  // 1. Doc <-> catalogue.
  const documented = new Map<string, string>();
  for (const m of input.docsText.matchAll(/^\|\s*`([A-Z][A-Z0-9_]+)`\s*\|\s*(PRODUIT|SCRIPT|ENV)\s*\|/gm)) {
    documented.set(m[1], m[2]);
  }
  for (const code of catalogCodes) {
    if (!documented.has(code)) problems.push(`code non documenté dans docs/errors.md : ${code}`);
    else if (documented.get(code) !== classOf.get(code)) {
      problems.push(`classe divergente pour ${code} : doc=${documented.get(code)} catalogue=${classOf.get(code)}`);
    }
  }
  for (const code of documented.keys()) {
    if (!catalogCodes.has(code)) problems.push(`code documenté mais absent du catalogue : ${code}`);
  }

  // 2. Chaque code est levé (règle) et prouvé (fixture).
  const raised = new Set<string>(RULES.map((r) => r.code));
  for (const code of catalogCodes) {
    if (code !== FALLBACK && !raised.has(code)) problems.push(`code jamais levé (aucune règle de classify.ts) : ${code}`);
    if (!input.fixtureCodes.includes(code)) problems.push(`code sans fixture de message réel : ${code}`);
  }
  for (const code of raised) {
    if (!catalogCodes.has(code)) problems.push(`règle de classify.ts sur un code hors catalogue : ${code}`);
  }

  // 3. Contrat agent-5 aligné sur le catalogue.
  problems.push(...checkAgent5Schema(input.agent5Schema, catalogCodes, classOf));

  // 4. Codes utilisés par le kernel ou cités dans les prompts.
  for (const [path, text] of input.kernelSources) {
    for (const m of text.matchAll(SOURCE_CODE)) {
      if (looksLikeFailureCode(m[1]) && !catalogCodes.has(m[1])) problems.push(`${path} utilise un code hors catalogue : ${m[1]}`);
    }
  }
  for (const [path, text] of input.prompts) {
    for (const m of text.matchAll(PROSE_CODE)) {
      if (!catalogCodes.has(m[1])) problems.push(`${path} cite un code hors catalogue : ${m[1]}`);
    }
  }
  return [...new Set(problems)];
}

/** Les statuts de test/loop (`OK`, `PASS`, `retry`...) ne sont pas des codes d'échec. */
function looksLikeFailureCode(token: string): boolean {
  return token.includes("_") || token === FALLBACK;
}

function checkAgent5Schema(schema: unknown, codes: Set<string>, classOf: Map<string, string>): string[] {
  const problems: string[] = [];
  const failure = (schema as any)?.properties?.results?.items?.properties?.failure;
  const enumCodes: string[] | undefined = failure?.properties?.code?.enum;
  if (!Array.isArray(enumCodes)) return ["agent-5.schema.json : failure.code.enum absent"];
  const enumSet = new Set(enumCodes);
  for (const c of codes) if (!enumSet.has(c)) problems.push(`agent-5.schema.json : code absent de l'enum : ${c}`);
  for (const c of enumSet) if (!codes.has(c)) problems.push(`agent-5.schema.json : code hors catalogue dans l'enum : ${c}`);

  // Un code non ambigu impose sa classe : if {code: X} then {kind: classe}.
  const links = new Map<string, string>();
  for (const clause of (failure?.allOf ?? []) as any[]) {
    const code = clause?.if?.properties?.code?.const;
    const kind = clause?.then?.properties?.kind?.const;
    if (typeof code === "string" && typeof kind === "string") links.set(code, kind);
  }
  for (const entry of CATALOG) {
    if (entry.ambiguous) continue;
    if (links.get(entry.code) !== entry.class) {
      problems.push(`agent-5.schema.json : ${entry.code} doit imposer kind=${entry.class} (code non ambigu)`);
    }
  }
  return problems;
}

/** Charge les entrées réelles depuis le dépôt (racine = parent de `.qa`). */
export function loadCheckInput(root: string): CheckInput {
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  const fixturesDir = join(root, "kernel", "src", "errors", "fixtures");
  const fixtureCodes = readdirSync(fixturesDir)
    .filter((f) => /^playwright-.+\.json$/.test(f))
    .flatMap((f) => (JSON.parse(readFileSync(join(fixturesDir, f), "utf8")).cases as { expected: string }[]).map((c) => c.expected));

  const kernelSources = new Map<string, string>();
  const walk = (rel: string): void => {
    for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) kernelSources.set(child, read(child));
    }
  };
  walk("kernel/src");

  const prompts = new Map<string, string>();
  for (const dir of ["agents/bodies", ".claude/commands"]) {
    if (!existsSync(join(root, dir))) continue;
    for (const f of readdirSync(join(root, dir)).filter((n) => n.endsWith(".md"))) prompts.set(`${dir}/${f}`, read(`${dir}/${f}`));
  }

  return {
    docsText: read("docs/errors.md"),
    agent5Schema: JSON.parse(read(".qa/contracts/agent-5.schema.json")),
    fixtureCodes,
    kernelSources,
    prompts,
  };
}
