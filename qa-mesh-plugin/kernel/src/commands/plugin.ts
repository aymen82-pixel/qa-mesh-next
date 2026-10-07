/**
 * `qa-mesh plugin build [--check]` — génère `qa-mesh-plugin/` depuis les
 * sources uniques du dépôt. Le plugin n'est JAMAIS édité à la main :
 *
 *   plugin-src/**                 -> fichiers propres au plugin (plugin.json, README, hooks.json)
 *   agents/manifest.yaml + bodies -> agents/*.md + .mcp.json (même compilation que `compile --target claude`)
 *   .claude/{commands,skills}     -> commands/, skills/
 *   .claude/hooks/*.js            -> hooks/*.js
 *   kernel/ (sources)             -> kernel/ (jamais dist/ ni node_modules/)
 *   .qa/{contracts,routing.yaml,qa.config.example.json,agentdb/schema.json}
 *                                 -> templates/.qa/ (à copier dans le projet cible)
 *
 * `--check` compare au disque sans écrire (fichiers en trop, absents ou différents) :
 * c'est la garde anti-dérive, comme `compile --check`.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { findQaDir, repoRoot } from "../paths";
import { compileTarget } from "../manifest/targets";
import { loadAgents } from "./compile";

export const PLUGIN_DIR = "qa-mesh-plugin";

export interface PluginOptions {
  check?: boolean;
  json?: boolean;
  qaDir?: string;
  /** Racine du projet (tests) ; sinon parent de `.qa`. */
  root?: string;
}

export interface PluginOutcome {
  exitCode: number;
  stdout: string;
}

/** Fichiers et dossiers jamais embarqués. */
const SKIP = new Set(["node_modules", "dist", "dist-test", ".DS_Store"]);

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

/** Liste récursive des fichiers d'un dossier (chemins relatifs POSIX, triés). */
export function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const abs = join(current, entry.name);
      if (entry.isDirectory()) visit(abs);
      else if (entry.isFile()) out.push(toPosix(relative(dir, abs)));
    }
  };
  visit(dir);
  return out.sort();
}

/** Calcule le contenu attendu du plugin : chemin relatif -> octets. */
export function buildPluginFiles(root: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const copyTree = (srcRel: string, destRel: string, filter: (p: string) => boolean = () => true): void => {
    const src = join(root, srcRel);
    for (const rel of walk(src)) {
      if (!filter(rel)) continue;
      files.set(`${destRel}/${rel}`.replace(/^\//, ""), readFileSync(join(src, rel)));
    }
  };
  const copyFile = (srcRel: string, destRel: string, optional = false): void => {
    const src = join(root, srcRel);
    if (!existsSync(src)) {
      if (optional) return;
      throw new Error(`plugin build : source manquante ${srcRel}`);
    }
    files.set(destRel, readFileSync(src));
  };

  if (!existsSync(join(root, "plugin-src"))) {
    throw new Error("plugin build : dossier plugin-src/ introuvable");
  }
  copyTree("plugin-src", "");

  // Agents + MCP : compilés depuis le manifeste (source unique), pas copiés de .claude/.
  const { agents, rules } = loadAgents(root);
  for (const out of compileTarget("claude", agents, rules)) {
    const dest = out.path.startsWith(".claude/agents/") ? out.path.replace(".claude/agents/", "agents/") : out.path;
    files.set(dest, Buffer.from(out.content, "utf8"));
  }

  copyTree(".claude/commands", "commands");
  copyTree(".claude/skills", "skills");
  copyTree(".claude/hooks", "hooks", (p) => p.endsWith(".js") && !p.includes("/"));

  copyTree("kernel/src", "kernel/src");
  for (const f of ["package.json", "package-lock.json", "tsconfig.json", "tsconfig.test.json", "README.md", ".gitignore"]) {
    copyFile(`kernel/${f}`, `kernel/${f}`, f === "package-lock.json");
  }

  copyTree(".qa/contracts", "templates/.qa/contracts");
  copyFile(".qa/routing.yaml", "templates/.qa/routing.yaml");
  copyFile(".qa/qa.config.example.json", "templates/.qa/qa.config.example.json");
  copyFile(".qa/agentdb/schema.json", "templates/.qa/agentdb/schema.json");

  return new Map([...files.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function runPlugin(opts: PluginOptions): PluginOutcome {
  const root = opts.root ?? repoRoot(opts.qaDir ?? findQaDir());
  const pluginDir = join(root, PLUGIN_DIR);
  const expected = buildPluginFiles(root);

  if (opts.check) {
    const onDisk = new Set(walk(pluginDir));
    const missing: string[] = [];
    const diff: string[] = [];
    for (const [rel, content] of expected) {
      if (!onDisk.has(rel)) missing.push(rel);
      else if (!readFileSync(join(pluginDir, rel)).equals(content)) diff.push(rel);
      onDisk.delete(rel);
    }
    const extra = [...onDisk];
    const ok = missing.length === 0 && diff.length === 0 && extra.length === 0;
    if (opts.json) return { exitCode: ok ? 0 : 1, stdout: JSON.stringify({ ok, missing, diff, extra }) };
    if (ok) return { exitCode: 0, stdout: `OK plugin à jour — ${expected.size} fichier(s) conforme(s)` };
    const lines = ["KO plugin build --check (lancer `qa-mesh plugin build`) :"];
    for (const m of diff) lines.push(`  diff   ${m}`);
    for (const m of missing) lines.push(`  absent ${m}`);
    for (const m of extra) lines.push(`  en trop ${m}`);
    return { exitCode: 1, stdout: lines.join("\n") };
  }

  // Régénération complète : le dossier est un artefact, on repart de zéro.
  if (existsSync(pluginDir) && statSync(pluginDir).isDirectory()) {
    rmSync(pluginDir, { recursive: true, force: true });
  }
  for (const [rel, content] of expected) {
    const abs = join(pluginDir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return {
    exitCode: 0,
    stdout: opts.json
      ? JSON.stringify({ written: expected.size, dir: PLUGIN_DIR })
      : `OK plugin généré — ${expected.size} fichier(s) dans ${PLUGIN_DIR}/`,
  };
}
