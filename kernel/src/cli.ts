#!/usr/bin/env node
import { runValidate } from "./commands/validate";
import { runJournal } from "./commands/journal";
import { runDb } from "./commands/db";
import { runFilter } from "./commands/filter";
import { runManifest } from "./commands/manifest";
import { runCompile } from "./commands/compile";
import { runCoverage } from "./commands/coverage";
import { runLoop } from "./commands/loop";
import { runPlugin } from "./commands/plugin";
import { runConfigCheck } from "./commands/config";
import { runClassify } from "./commands/classify";
import { runErrors } from "./commands/errors";
import { runRedact, runSecretsList } from "./commands/secrets";
import { runSessionRefresh } from "./commands/session";
import { runTraceRender } from "./commands/trace";
import { runGuide } from "./commands/guide";
import { EXPLORE_MODES, runExplore, type ExploreMode } from "./commands/explore";
import { runBugbash } from "./commands/bugbash";

const VERSION = "2.0.0-alpha.1";

const USAGE = `qa-mesh ${VERSION} — kernel déterministe qa-mesh/2.0

Usage :
  qa-mesh validate <file|-> [--agent <id>] [--json]
      Valide un livrable contre l'enveloppe + le contrat de payload de l'agent.
      <-> lit le livrable sur stdin. Code de sortie 0 si conforme, 1 sinon.

  qa-mesh journal <run_id> --agent <id> --status <ok|partial|error|retry|skipped>
                  [--deliverable <path>] [--anomaly <msg> ...]
                  [--start <iso>] [--end <iso>] [--json]
      Ajoute une ligne JSONL à .qa/runs/<run_id>/pipeline.log.

  qa-mesh filter --from <a> --to <b> <file|->   (transmission sélective)
      Projette le payload selon l'arête from->to de .qa/routing.yaml.
      Sort l'extrait JSON à injecter dans le prompt de l'agent cible.

  qa-mesh manifest build   (migre .claude/agents/*.md -> agents/manifest.yaml + bodies)

  qa-mesh compile --target <claude|opencode|codex|copilot|gemini> [--check] [--dry-run]
      Génère les définitions d'agents + config MCP du runtime depuis le manifeste.
      --check : compare au disque sans écrire (non-régression byte-identique).

  qa-mesh db <sous-commande> [options]   (AgentDB v2 — SQLite)
      init                          Crée .qa/agentdb/agentdb.sqlite + schéma.
      migrate                       Importe les .qa/agentdb/*.json legacy.
      put [--domain --page --label --primary [--fallback] [--validated]
           [--validated-by] [--run-id]] | (JSON objet/tableau sur stdin)
      get [--domain] [--page] [--label] [--validated-only] [--json]
      pack --domain <d> [--for <agent>] [--all] [--fresh <30d>]  (trusted = validé+frais)
      similar --domain <d> --page <p> --label <l> [--top <n>]  (healing)
      prune --stale <30d|24h|…> [--dry-run]
      export [--out <fichier>]
      record-results --run <run_id> [--domain <d>]   (stdin = rapport Agent 5)
      passed-scenarios [--domain <d>]   (scénarios verts de la campagne précédente)
      journal --run <run_id>   (événements d'orchestration depuis SQLite)
      session-put|session-get --role <r> [--storage-state --expires --session-id]
      coverage-put|coverage-get --domain <d> [--score --last-run --pass-rate --routes-hash]

  qa-mesh prioritize [--top <n>] [--since <30d>] [--record [--run <id>]] [--json]
      Priorise les domaines par le risque (Coverage Intelligence, étape 9).
  qa-mesh score --domain <d> [--json]      Score détaillé d'un domaine.
  qa-mesh ci put-metric --domain <d> [--dependents --depth --users --frequency]
      Saisit les facteurs de criticité (depuis les parcours de l'Agent 2).

  qa-mesh loop init --loop <id> [--target --criteria --max-iterations --agents a,b --whitelist p1,p2] [--force]
  qa-mesh loop verify --loop <id> --run <run_id> [--agent <a>] [--report <chemin>] [--json]
  qa-mesh loop decide --loop <id> --run <run_id> [--max-iterations <n>] [--json]
  qa-mesh loop status [--loop <id>] [--run <run_id>] [--json]
      Loops autonomes (v3) : verdict et décision déterministes, PROGRESS.md généré.

  qa-mesh classify --report <playwright.json> [--login-url /login] [--json]
      Attribue à chaque test en échec un code du catalogue, sa classe PRODUIT|SCRIPT|ENV et une piste.
  qa-mesh errors list|check [--json]
      Liste le catalogue des codes ; check vérifie catalogue, docs/errors.md, règles, fixtures et contrat agent-5.

  qa-mesh explore init --run <id> --goal "<objectif>" [--session <rôle>] [--read-only]
  qa-mesh explore context|status --run <id> [--json]
  qa-mesh explore start --run <id> --title "<t>" --instruction "<i>" [--posture <p>]
  qa-mesh explore ingest --run <id> <charter.json|->
  qa-mesh explore decide --run <id> [--finished]
  qa-mesh explore close --run <id> [--assessment "<texte>"]
      Mode explore : le kernel tient l'état, les budgets, l'arrêt et le verdict ; PROGRESS.md généré.

  qa-mesh explore init … --bugbash ; explore start … --posture <p> --account <slug>
  qa-mesh findings merge --run <id> [--threshold 0.3]
  qa-mesh bugbash verify --run <id> <verify.json> [--project chromium]
  qa-mesh bugbash report|status --run <id>
      Bug bash avec preuve : fusion des findings, test de repro jugé par le kernel,
      bugs_report.json (confirmés seulement) + unconfirmed.json.

  qa-mesh guide [skill[/topic] | topic] [--json]
      Documentation à la demande : liste des skills, routeur SKILL.md, ou une référence.

  qa-mesh trace render --run <id> --report <playwright.json> [--login-url /login] [--json]
      Écrit .qa/runs/<id>/results/<test>/trace.md par test en échec (étapes, code, journal app, snapshot).

  qa-mesh secrets list [--json]
      Registre des secrets (noms, variable d'env, présence) — jamais de valeur.
  qa-mesh redact <fichier|-> [--in-place]
      Masque les secrets du registre (<secret:nom>) dans un texte ou un JSON.
  qa-mesh session refresh --role <r> [--json]
      Connexion DÉTERMINISTE (projet Playwright "setup", tests/auth.setup.ts) puis
      enregistrement du storageState dans AgentDB. Aucun mot de passe ne passe par un agent.

  qa-mesh config check [fichier] [--json]
      Valide .qa/qa.config.json (ou le fichier donné) contre qa-config.schema.json.

  qa-mesh plugin build [--check] [--json]
      Génère qa-mesh-plugin/ depuis les sources uniques (manifeste, .claude/, kernel/, .qa/).
      --check : échoue si le plugin commité a dérivé (fichier absent, en trop ou différent).

  qa-mesh --version | --help

Résolution de .qa : $QA_DIR, sinon recherche ascendante depuis le cwd.`;

/** Parseur d'arguments minimal — zéro dépendance (principe « kernel léger »). */
interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string[]>;
  bools: Set<string>;
}

function parse(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string[]>();
  const bools = new Set<string>();
  const valued = new Set([
    "agent", "status", "deliverable", "anomaly", "start", "end", "qa-dir",
    "from", "to", "target", "source",
    // db
    "domain", "page", "label", "primary", "fallback", "validated-by", "run-id",
    "for", "top", "stale", "out", "role", "storage-state", "expires",
    "session-id", "score", "last-run", "pass-rate", "routes-hash",
    "run", "fresh",
    // coverage intelligence (étape 9)
    "since", "dependents", "depth", "users", "frequency",
    // loops autonomes (v3)
    "loop", "criteria", "max-iterations", "agents", "whitelist", "report",
    // classify (C5)
    "login-url",
    // explore / bug bash (C3, C4)
    "goal", "session", "title", "instruction", "posture", "assessment", "charter", "slug", "threshold", "finding", "spec", "account", "project",
  ]);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      if (valued.has(name)) {
        const value = argv[++i];
        if (value === undefined) {
          throw new Error(`Option --${name} attend une valeur`);
        }
        const list = flags.get(name) ?? [];
        list.push(value);
        flags.set(name, list);
      } else {
        bools.add(name);
      }
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, flags, bools };
}

function first(args: ParsedArgs, name: string): string | undefined {
  return args.flags.get(name)?.[0];
}

function main(argv: string[]): number {
  if (argv.includes("--version") || argv[0] === "version") {
    process.stdout.write(VERSION + "\n");
    return 0;
  }
  if (argv.length === 0 || argv.includes("--help") || argv[0] === "help") {
    process.stdout.write(USAGE + "\n");
    return argv.length === 0 ? 1 : 0;
  }

  const [command, ...rest] = argv;
  const args = parse(rest);
  const qaDir = first(args, "qa-dir");

  try {
    switch (command) {
      case "validate": {
        const file = args.positionals[0];
        if (!file) {
          process.stderr.write("validate : fichier manquant (ou '-' pour stdin)\n");
          return 2;
        }
        const outcome = runValidate({
          file,
          agent: first(args, "agent"),
          json: args.bools.has("json"),
          qaDir,
        });
        process.stdout.write(outcome.stdout + "\n");
        return outcome.exitCode;
      }
      case "journal": {
        const runId = args.positionals[0];
        const agent = first(args, "agent");
        const status = first(args, "status");
        if (!runId || !agent || !status) {
          process.stderr.write(
            "journal : <run_id>, --agent et --status sont requis\n",
          );
          return 2;
        }
        const outcome = runJournal({
          runId,
          agent,
          status: status as JournalStatus,
          deliverable: first(args, "deliverable"),
          anomalies: args.flags.get("anomaly"),
          start: first(args, "start"),
          end: first(args, "end"),
          json: args.bools.has("json"),
          qaDir,
        });
        process.stdout.write(outcome.stdout + "\n");
        return outcome.exitCode;
      }
      case "manifest": {
        const subcommand = args.positionals[0];
        if (!subcommand) {
          process.stderr.write("manifest : sous-commande manquante (build)\n");
          return 2;
        }
        const outcome = runManifest({
          subcommand,
          source: first(args, "source"),
          json: args.bools.has("json"),
          qaDir,
        });
        process.stdout.write(outcome.stdout + "\n");
        return outcome.exitCode;
      }
      case "compile": {
        const target = first(args, "target");
        if (!target) {
          process.stderr.write("compile : --target requis (claude|opencode|codex|copilot|gemini)\n");
          return 2;
        }
        const outcome = runCompile({
          target,
          check: args.bools.has("check"),
          dryRun: args.bools.has("dry-run"),
          json: args.bools.has("json"),
          qaDir,
        });
        process.stdout.write(outcome.stdout + "\n");
        return outcome.exitCode;
      }
      case "filter": {
        const file = args.positionals[0];
        const from = first(args, "from");
        const to = first(args, "to");
        if (!file || !from || !to) {
          process.stderr.write("filter : <file>, --from et --to sont requis\n");
          return 2;
        }
        const outcome = runFilter({ file, from, to, qaDir });
        process.stdout.write(outcome.stdout + "\n");
        return outcome.exitCode;
      }
      case "db": {
        const [subcommand, ...positionals] = args.positionals;
        if (!subcommand) {
          process.stderr.write("db : sous-commande manquante\n\n" + USAGE + "\n");
          return 2;
        }
        const outcome = runDb({
          subcommand,
          positionals,
          flags: args.flags,
          bools: args.bools,
          qaDir,
        });
        process.stdout.write(outcome.stdout + "\n");
        return outcome.exitCode;
      }
      case "prioritize":
      case "score": {
        const outcome = runCoverage({
          mode: command as "score" | "prioritize",
          flags: args.flags,
          bools: args.bools,
          qaDir,
        });
        process.stdout.write(outcome.stdout + "\n");
        return outcome.exitCode;
      }
      case "ci": {
        const subcommand = args.positionals[0];
        if (subcommand !== "put-metric") {
          process.stderr.write("ci : sous-commande inconnue (put-metric)\n");
          return 2;
        }
        const outcome = runCoverage({
          mode: "put-metric",
          flags: args.flags,
          bools: args.bools,
          qaDir,
        });
        process.stdout.write(outcome.stdout + "\n");
        return outcome.exitCode;
      }
      case "loop": {
        const subcommand = args.positionals[0];
        if (!["init", "verify", "decide", "status"].includes(subcommand ?? "")) {
          process.stderr.write("loop : sous-commande inconnue (init|verify|decide|status)\n\n" + USAGE + "\n");
          return 2;
        }
        const outcome = runLoop({
          mode: subcommand as "init" | "verify" | "decide" | "status",
          flags: args.flags,
          bools: args.bools,
          qaDir,
        });
        process.stdout.write(outcome.stdout + "\n");
        return outcome.exitCode;
      }
      case "classify": {
        const outcome = runClassify({ report: first(args, "report"), loginUrl: first(args, "login-url"), json: args.bools.has("json"), qaDir });
        process.stdout.write(outcome.stdout + "\n");
        return outcome.exitCode;
      }
      case "errors": {
        const mode = args.positionals[0];
        if (mode !== "check" && mode !== "list") {
          process.stderr.write("errors : sous-commande inconnue (list|check)\n");
          return 2;
        }
        const outcome = runErrors({ mode, json: args.bools.has("json"), qaDir });
        process.stdout.write(outcome.stdout + "\n");
        return outcome.exitCode;
      }
      case "explore": {
        const mode = args.positionals[0] as ExploreMode;
        if (!EXPLORE_MODES.includes(mode)) {
          process.stderr.write(`explore : sous-commande inconnue (${EXPLORE_MODES.join("|")})\n`);
          return 2;
        }
        const outcome = runExplore({ mode, flags: args.flags, bools: args.bools, positionals: args.positionals.slice(1), qaDir });
        process.stdout.write(outcome.stdout + "\n");
        return outcome.exitCode;
      }
      case "findings":
      case "bugbash": {
        const sub = args.positionals[0];
        const mode = command === "findings" ? (sub === "merge" ? "merge" : undefined) : (["verify", "report", "status"].includes(sub ?? "") ? sub : undefined);
        if (!mode) {
          process.stderr.write(command === "findings" ? "findings : sous-commande inconnue (merge)\n" : "bugbash : sous-commande inconnue (verify|report|status)\n");
          return 2;
        }
        const outcome = runBugbash({ mode: mode as "merge" | "verify" | "report" | "status", flags: args.flags, bools: args.bools, positionals: args.positionals.slice(1), qaDir });
        process.stdout.write(outcome.stdout + "\n");
        return outcome.exitCode;
      }
      case "guide": {
        const outcome = runGuide({ topic: args.positionals[0], json: args.bools.has("json"), qaDir });
        process.stdout.write(outcome.stdout + "\n");
        return outcome.exitCode;
      }
      case "trace": {
        if (args.positionals[0] !== "render") {
          process.stderr.write("trace : sous-commande inconnue (render)\n");
          return 2;
        }
        const outcome = runTraceRender({ run: first(args, "run"), report: first(args, "report"), loginUrl: first(args, "login-url"), json: args.bools.has("json"), qaDir });
        process.stdout.write(outcome.stdout + "\n");
        return outcome.exitCode;
      }
      case "secrets": {
        if (args.positionals[0] !== "list") {
          process.stderr.write("secrets : sous-commande inconnue (list)\n");
          return 2;
        }
        const outcome = runSecretsList({ json: args.bools.has("json"), qaDir });
        process.stdout.write(outcome.stdout + "\n");
        return outcome.exitCode;
      }
      case "redact": {
        const outcome = runRedact({ file: args.positionals[0], inPlace: args.bools.has("in-place"), qaDir });
        process.stdout.write(outcome.stdout + "\n");
        return outcome.exitCode;
      }
      case "session": {
        if (args.positionals[0] !== "refresh") {
          process.stderr.write("session : sous-commande inconnue (refresh)\n");
          return 2;
        }
        const outcome = runSessionRefresh({ role: first(args, "role"), json: args.bools.has("json"), qaDir });
        process.stdout.write(outcome.stdout + "\n");
        return outcome.exitCode;
      }
      case "config": {
        if (args.positionals[0] !== "check") {
          process.stderr.write("config : sous-commande inconnue (check)\n");
          return 2;
        }
        const outcome = runConfigCheck({ file: args.positionals[1], json: args.bools.has("json"), qaDir });
        process.stdout.write(outcome.stdout + "\n");
        return outcome.exitCode;
      }
      case "plugin": {
        if (args.positionals[0] !== "build") {
          process.stderr.write("plugin : sous-commande inconnue (build)\n");
          return 2;
        }
        const outcome = runPlugin({ check: args.bools.has("check"), json: args.bools.has("json"), qaDir });
        process.stdout.write(outcome.stdout + "\n");
        return outcome.exitCode;
      }
      default:
        process.stderr.write(`Commande inconnue : ${command}\n\n${USAGE}\n`);
        return 2;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    process.stderr.write(`Erreur : ${message}\n`);
    return 1;
  }
}

type JournalStatus = "ok" | "partial" | "error" | "retry" | "skipped";

process.exit(main(process.argv.slice(2)));
