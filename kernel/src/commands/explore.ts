/**
 * `qa-mesh explore <init|context|start|ingest|decide|close|status>` — le kernel
 * tient l'état de la boucle d'exploration ; les agents planifient (qa-analyst)
 * et explorent (qa-explorer). Aucun jugement LLM sur l'arrêt ni le verdict.
 *
 *   init    --run <id> --goal "<objectif>" [--session <rôle>] [--read-only]
 *   context --run <id> [--json]          bloc à injecter (planner et explorateur)
 *   start   --run <id> --title "<t>" --instruction "<i>" [--posture <p>]
 *   ingest  --run <id> <charter.json|->  livrable qa-explorer (contrat agent-explore)
 *   decide  --run <id> [--finished]      continue | stop (+ PROGRESS.md)
 *   close   --run <id> [--assessment "<texte>"]  verdict + explore_report.json
 *   status  --run <id> [--json]
 *
 * Fichiers : `.qa/runs/<id>/explore/{PROGRESS.md, charter-<n>.json, explore_report.json}`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { findQaDir, repoRoot, runDir } from "../paths";
import { AgentDb } from "../db/agentdb";
import { ContractRegistry, validateDocument } from "../contracts";
import { redactDeep } from "../secrets/redact";
import { projectRedactor, readProjectConfig } from "../secrets/project";
import { canStartCharter, decideNext, resolveBudgets, verdictOf, type Budgets, type CharterStatus } from "../explore/state";
import { ExploreStore } from "../explore/store";
import { renderExploreProgress } from "../explore/render";

export type ExploreMode = "init" | "context" | "start" | "ingest" | "decide" | "close" | "status";
export const EXPLORE_MODES: ExploreMode[] = ["init", "context", "start", "ingest", "decide", "close", "status"];

export interface ExploreOptions {
  mode: ExploreMode;
  flags: Map<string, string[]>;
  bools: Set<string>;
  positionals: string[];
  qaDir?: string;
  now?: () => Date;
  env?: Record<string, string | undefined>;
  stdin?: string;
}

interface Outcome {
  exitCode: number;
  stdout: string;
}

/** Règles d'un environnement partagé (e2e, references/bug-bash.md). */
export const READ_ONLY_RULES = [
  "Lecture seule : aucune inscription, aucune soumission de formulaire qui crée, modifie ou supprime des données.",
  "Aucune saisie de forme injection (balises, guillemets, SQL, ../) ni dans les champs ni dans les URLs.",
  "Aucune boucle de requêtes : un blocage par pare-feu (WAF) est le pare-feu qui marche, pas un finding.",
];

/** Postures de charter (e2e, references/bug-bash.md) ; celles qui écrivent sont interdites en lecture seule. */
export const POSTURES = ["first-time-user", "numbers-and-copy", "edge-input", "state", "error-paths"] as const;
export const WRITING_POSTURES = new Set(["first-time-user", "edge-input", "state"]);

export function runExplore(opts: ExploreOptions): Outcome {
  const json = opts.bools.has("json");
  const flag = (n: string) => opts.flags.get(n)?.[0];
  const now = opts.now ?? (() => new Date());
  const qaDir = opts.qaDir ?? findQaDir();
  const root = repoRoot(qaDir);
  const ok = (payload: unknown, human: string): Outcome => ({ exitCode: 0, stdout: json ? JSON.stringify(payload) : human });
  const fail = (code: number, msg: string): Outcome => ({ exitCode: code, stdout: json ? JSON.stringify({ error: msg }) : msg });

  const runId = flag("run");
  if (!runId) return fail(2, `explore ${opts.mode} : --run <run_id> requis`);
  const dir = join(runDir(qaDir, runId), "explore");
  const config = readProjectConfig(qaDir) as {
    explore?: Partial<Budgets>;
    known_non_bugs?: string[];
    bugbash?: { shared_env?: boolean };
    roles?: { name: string }[];
  };
  const redact = projectRedactor(qaDir, opts.env ?? process.env);
  const store = ExploreStore.open(join(qaDir, "agentdb", "agentdb.sqlite"));
  const rel = (p: string) => relative(root, p).split("\\").join("/");

  try {
    if (opts.mode === "init") {
      const goal = flag("goal");
      if (!goal) return fail(2, "explore init : --goal requis");
      if (store.run(runId)) return fail(2, `explore init : une exploration existe déjà pour ${runId}`);
      let storage: string | null = null;
      const role = flag("session");
      if (role) {
        const db = AgentDb.open(join(qaDir, "agentdb", "agentdb.sqlite"));
        try {
          const s = db.getSession(role) as { storage_state_path?: string } | null;
          if (!s?.storage_state_path) {
            return fail(2, `explore init : aucune session valide pour "${role}" — lancer \`qa-mesh session refresh --role ${role}\``);
          }
          storage = s.storage_state_path;
        } finally {
          db.close();
        }
      }
      const bugbash = opts.bools.has("bugbash");
      // Bug bash sur un environnement partagé : lecture seule OBLIGATOIRE.
      const forcedReadOnly = bugbash && config.bugbash?.shared_env === true;
      const run = {
        run_id: runId,
        goal: redact(goal),
        budgets: resolveBudgets(config.explore),
        started_at: now().toISOString(),
        read_only: opts.bools.has("read-only") || forcedReadOnly,
        bugbash,
        storage_state: storage,
      };
      store.createRun(run);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "PROGRESS.md"), renderExploreProgress(run, [], []), "utf8");
      return ok(run, `OK exploration ${runId} — ${run.budgets.max_charters} charters max, ${run.budgets.max_duration_min} min${run.read_only ? ", lecture seule" : ""}`);
    }

    const run = store.run(runId);
    if (!run) return fail(2, `explore ${opts.mode} : aucune exploration pour ${runId} (lancer \`explore init\`)`);
    const charters = store.charters(runId);

    if (opts.mode === "context") {
      const decision = decideNext({ run, charters, nowMs: now().getTime() });
      const ctx = {
        goal: run.goal,
        read_only: run.read_only,
        rules: run.read_only ? READ_ONLY_RULES : [],
        known_non_bugs: config.known_non_bugs ?? [],
        storage_state: run.storage_state ?? null,
        budgets: run.budgets,
        remaining: decision.remaining,
        charters: charters.map((c) => ({ index: c.index, title: c.title, status: c.status, summary: c.summary ?? undefined, findings: c.findings })),
        findings: store.findings(runId).map((f) => ({ id: f.id, title: f.title, route: f.route, kind: f.kind })),
        charter_output_dir: rel(dir),
      };
      if (json) return { exitCode: 0, stdout: JSON.stringify(ctx) };
      const lines = [
        `## Contexte d'exploration (${runId})`,
        "",
        `Objectif : ${ctx.goal}`,
        `Budgets : ${run.budgets.max_steps_per_charter} actions max par charter · restant ${ctx.remaining.charters} charter(s), ${ctx.remaining.minutes} min`,
        ctx.storage_state ? `Session : démarrer avec \`browser_set_storage_state\` sur \`${ctx.storage_state}\` (déjà connecté, ne pas se reconnecter).` : "Session : aucune (ne pas tenter de connexion avec un mot de passe).",
      ];
      if (ctx.rules.length) lines.push("", "Règles (environnement partagé) :", ...ctx.rules.map((r) => `- ${r}`));
      if (ctx.known_non_bugs.length) lines.push("", "Comportements connus, PAS des bugs :", ...ctx.known_non_bugs.map((k) => `- ${k}`));
      if (ctx.charters.length) lines.push("", "Charters déjà menés :", ...ctx.charters.map((c) => `- ${c.index}. ${c.title} — ${c.status}${c.summary ? ` : ${c.summary}` : ""}`));
      if (ctx.findings.length) lines.push("", "Findings déjà rapportés (ne pas les redéclarer) :", ...ctx.findings.map((f) => `- ${f.id} ${f.title} (${f.route})`));
      return { exitCode: 0, stdout: redact(lines.join("\n")) };
    }

    if (opts.mode === "start") {
      const title = flag("title");
      const instruction = flag("instruction");
      if (!title || !instruction) return fail(2, "explore start : --title et --instruction requis");
      const posture = flag("posture");
      if (posture && !(POSTURES as readonly string[]).includes(posture)) {
        return fail(2, `explore start : posture inconnue "${posture}" (${POSTURES.join(", ")})`);
      }
      if (run.read_only && posture && WRITING_POSTURES.has(posture)) {
        return fail(1, `explore start refusé : la posture "${posture}" écrit des données, interdite en lecture seule`);
      }
      // Bug bash hors lecture seule : un compte jetable par charter (rôle bb-<slug>).
      const account = flag("account");
      let storage: string | null = run.storage_state ?? null;
      // Les comptes jetables ne s'imposent que si l'app en a (rôles bb-<slug> déclarés).
      const bbRoles = (config.roles ?? []).filter((r) => r.name.startsWith("bb-"));
      if (run.bugbash && !run.read_only && !account && bbRoles.length) {
        return fail(2, "explore start : bug bash -> --account <slug> requis (un compte jetable bb-<slug> par charter)");
      }
      if (account) {
        const role = `bb-${account}`;
        if (!config.roles?.some((r) => r.name === role)) return fail(2, `explore start : rôle "${role}" absent de qa.config.json#roles`);
        if (charters.some((c) => c.account === account && c.status === "running")) {
          return fail(1, `explore start refusé : le compte ${role} est déjà utilisé par un charter en cours`);
        }
        const db = AgentDb.open(join(qaDir, "agentdb", "agentdb.sqlite"));
        try {
          const s = db.getSession(role) as { storage_state_path?: string } | null;
          if (!s?.storage_state_path) return fail(2, `explore start : aucune session pour "${role}" — \`qa-mesh session refresh --role ${role}\``);
          storage = s.storage_state_path;
        } finally {
          db.close();
        }
      }
      const gate = canStartCharter(run, charters, now().getTime());
      if (!gate.ok) return fail(1, `explore start refusé : ${gate.reason}`);
      const index = store.startCharter(runId, {
        title: redact(title),
        instruction: redact(instruction),
        posture,
        account,
        storage_state: storage,
        started_at: now().toISOString(),
      });
      const output = rel(join(dir, `charter-${index}.json`));
      mkdirSync(join(dir, `charter-${index}`), { recursive: true });
      return ok(
        { index, output, evidence_dir: rel(join(dir, `charter-${index}`)), max_steps: run.budgets.max_steps_per_charter, storage_state: storage, read_only: run.read_only },
        `OK charter ${index} — livrable attendu : ${output}${storage ? ` · session ${storage}` : ""}`,
      );
    }

    if (opts.mode === "ingest") {
      const file = opts.positionals[0];
      if (!file) return fail(2, "explore ingest : <charter.json|-> requis");
      let doc: any;
      try {
        doc = JSON.parse(file === "-" ? (opts.stdin ?? readFileSync(0, "utf8")) : readFileSync(file, "utf8"));
      } catch (e) {
        return fail(2, `explore ingest : JSON illisible : ${(e as Error).message}`);
      }
      const registry = ContractRegistry.load(qaDir);
      const check = registry.validateDeliverable(doc, "agent-explore");
      if (!check.valid) {
        return fail(1, `explore ingest : livrable non conforme — ${check.errors.map((e) => `[${e.layer}] ${e.path} ${e.message}`).join(" ; ")}`);
      }
      const p = redactDeep(doc.payload, redact) as any;
      const charter = charters.find((c) => c.index === p.charter.index);
      if (!charter) return fail(1, `explore ingest : charter ${p.charter.index} inconnu (lancer \`explore start\`)`);
      if (charter.status !== "running") return fail(1, `explore ingest : charter ${p.charter.index} déjà clos (${charter.status})`);

      const notes: string[] = [];
      store.transaction(() => {
      let count = store.findingCount(runId);
      for (const f of p.findings as any[]) {
        let shot: string | null = f.screenshot_path ?? null;
        if (shot && p.tainted) {
          notes.push(`capture refusée (secret saisi pendant le charter) : ${shot}`);
          shot = null;
        } else if (shot && !shot.startsWith(`.qa/runs/${runId}/explore/`)) {
          notes.push(`capture hors du run ignorée : ${shot}`);
          shot = null;
        } else if (shot && !existsSync(join(root, shot))) {
          notes.push(`capture introuvable ignorée : ${shot}`);
          shot = null;
        }
        count++;
        store.addFinding({
          id: `F-${String(count).padStart(3, "0")}`,
          run_id: runId,
          charter: charter.index,
          title: f.title,
          kind: f.kind,
          severity: f.severity,
          expected: f.expected,
          actual: f.actual,
          repro_steps: f.repro_steps,
          route: f.route,
          screenshot_path: shot,
          reported_at: now().toISOString(),
        });
      }
      store.endCharter(runId, charter.index, {
        status: p.status as CharterStatus,
        summary: p.summary,
        error_code: p.error_code,
        tainted: !!p.tainted,
        ended_at: now().toISOString(),
      });
      });
      const updated = store.charters(runId);
      writeFileSync(join(dir, "PROGRESS.md"), renderExploreProgress(run, updated, store.findings(runId)), "utf8");
      return ok(
        { charter: charter.index, status: p.status, findings: p.findings.length, notes },
        [`OK charter ${charter.index} ${p.status} — ${p.findings.length} finding(s)`, ...notes.map((n) => `  - ${n}`)].join("\n"),
      );
    }

    if (opts.mode === "decide") {
      const decision = decideNext({ run, charters, nowMs: now().getTime(), plannerFinished: opts.bools.has("finished") });
      writeFileSync(join(dir, "PROGRESS.md"), renderExploreProgress(run, charters, store.findings(runId), decision), "utf8");
      return ok(decision, `${decision.action.toUpperCase()}${decision.ended ? ` (${decision.ended})` : ""} — ${decision.reason}`);
    }

    if (opts.mode === "close") {
      if (charters.some((c) => c.status === "running")) return fail(1, "explore close : des charters sont encore en cours");
      const decision = decideNext({ run, charters, nowMs: now().getTime(), plannerFinished: opts.bools.has("finished") });
      const ended = run.ended ?? decision.ended ?? "finished";
      const verdict = verdictOf(charters);
      const assessment = flag("assessment") ? redact(flag("assessment")!) : undefined;
      store.close_run(runId, { ended, verdict, assessment, closed_at: now().toISOString() });
      const findings = store.findings(runId);
      const report = {
        run_id: runId,
        goal: run.goal,
        budgets: run.budgets,
        read_only: run.read_only,
        ended,
        verdict,
        ...(assessment ? { assessment } : {}),
        charters: charters.map((c) => ({
          index: c.index,
          title: c.title,
          status: c.status,
          ...(c.summary ? { summary: c.summary } : {}),
          ...(c.error_code ? { error_code: c.error_code } : {}),
          findings: c.findings,
        })),
        findings: findings.map((f) => ({
          id: f.id,
          charter: f.charter,
          title: f.title,
          kind: f.kind,
          severity: f.severity,
          expected: f.expected,
          actual: f.actual,
          repro_steps: f.repro_steps,
          route: f.route,
          ...(f.screenshot_path ? { screenshot_path: f.screenshot_path } : {}),
        })),
      };
      const check = validateDocument(ContractRegistry.load(qaDir), "explore-report", report);
      if (!check.valid) return fail(1, `explore close : rapport non conforme (bug kernel) — ${JSON.stringify(check.errors)}`);
      const reportPath = join(dir, "explore_report.json");
      writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
      writeFileSync(join(dir, "PROGRESS.md"), renderExploreProgress({ ...run, ended }, charters, findings, { ...decision, action: "stop", ended }), "utf8");
      const issues = findings.filter((f) => f.kind === "issue").length;
      return {
        // Code de sortie à la e2e : 0 passed, 1 issue(s) ou rien de fait, 2 tout bloqué.
        exitCode: verdict === "passed" ? 0 : verdict === "failed" ? 1 : 2,
        stdout: json
          ? JSON.stringify({ verdict, ended, report: rel(reportPath), issues, warnings: findings.length - issues })
          : `${verdict.toUpperCase()} (${ended}) — ${issues} issue(s), ${findings.length - issues} warning(s) · ${rel(reportPath)}`,
      };
    }

    // status
    const findings = store.findings(runId);
    return ok(
      { run, charters, findings: findings.length },
      renderExploreProgress(run, charters, findings),
    );
  } finally {
    store.close();
  }
}
