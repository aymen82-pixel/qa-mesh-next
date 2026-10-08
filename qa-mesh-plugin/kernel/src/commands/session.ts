/**
 * `qa-mesh session refresh --role <r> [--json]` — connexion DÉTERMINISTE (C7).
 *
 * Lance le projet Playwright `setup` (`tests/auth.setup.ts`) pour un rôle de
 * `.qa/qa.config.json`, vérifie que la connexion a réellement eu lieu (test
 * passé + storageState écrit pendant ce run), puis enregistre la session dans
 * AgentDB (TTL `auth.session_ttl_hours`, défaut 24 h).
 *
 * Le mot de passe est lu par le code de test dans l'environnement : il ne
 * passe JAMAIS par un agent (fin de la connexion de l'Agent 0 via MCP). La
 * sortie du runner n'est jamais recopiée ; seul un résumé redacté l'est.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { findQaDir, repoRoot } from "../paths";
import { AgentDb } from "../db/agentdb";
import { readProjectConfig, projectRedactor } from "../secrets/project";

export interface RunnerResult {
  status: number | null;
  /** Rapport JSON Playwright (contenu), si écrit. */
  report?: unknown;
}

/** Exécute le projet setup ; injectable pour les tests. */
export type SetupRunner = (opts: { root: string; env: Record<string, string> }) => RunnerResult;

export interface SessionOptions {
  role?: string;
  json?: boolean;
  qaDir?: string;
  runner?: SetupRunner;
  now?: () => Date;
  env?: Record<string, string | undefined>;
}

interface Role {
  name: string;
  username_env: string;
  password_env: string;
}

export const defaultRunner: SetupRunner = ({ root, env }) => {
  const reportPath = join(mkdtempSync(join(tmpdir(), "qa-mesh-setup-")), "report.json");
  const res = spawnSync("npx", ["playwright", "test", "--project=setup", "--reporter=json"], {
    cwd: root,
    env: { ...process.env, ...env, PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath },
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"],
    shell: process.platform === "win32",
  });
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : undefined;
  return { status: res.status, report };
};

/** Statuts des tests du rapport (expected | unexpected | skipped | flaky). */
function testStatuses(report: unknown): string[] {
  const out: string[] = [];
  const visit = (suite: any): void => {
    for (const spec of suite?.specs ?? []) for (const t of spec.tests ?? []) out.push(t.status);
    for (const child of suite?.suites ?? []) visit(child);
  };
  for (const s of (report as any)?.suites ?? []) visit(s);
  return out;
}

export function runSessionRefresh(opts: SessionOptions): { exitCode: number; stdout: string } {
  const out = (exitCode: number, payload: Record<string, unknown>, human: string) => ({
    exitCode,
    stdout: opts.json ? JSON.stringify(payload) : human,
  });
  const qaDir = opts.qaDir ?? findQaDir();
  const root = repoRoot(qaDir);
  const env = opts.env ?? process.env;
  const config = readProjectConfig(qaDir) as { roles?: Role[]; auth?: { session_ttl_hours?: number } };

  if (!opts.role) return out(2, { ok: false, error: "--role requis" }, "session refresh : --role <r> requis");
  const role = config.roles?.find((r) => r.name === opts.role);
  if (!role) {
    const known = (config.roles ?? []).map((r) => r.name).join(", ") || "aucun";
    return out(2, { ok: false, error: `rôle inconnu : ${opts.role}` }, `session refresh : rôle "${opts.role}" absent de qa.config.json (connus : ${known})`);
  }
  const missing = [role.username_env, role.password_env].filter((v) => !env[v]);
  if (missing.length) {
    return out(2, { ok: false, error: "variables absentes", missing }, `session refresh : variables d'environnement absentes : ${missing.join(", ")}`);
  }

  const sessionsDir = join(qaDir, "agentdb", "sessions");
  mkdirSync(sessionsDir, { recursive: true });
  const storage = join(sessionsDir, `${role.name}.json`);
  // Horloge réelle pour la fraîcheur du fichier ; `now` (injectable) pour l'expiration.
  const runStartedMs = Date.now();
  const started = (opts.now ?? (() => new Date()))();

  const result = (opts.runner ?? defaultRunner)({
    root,
    env: { QA_SETUP_ROLE: role.name, QA_STORAGE_STATE: storage },
  });
  const statuses = testStatuses(result.report);
  const redact = projectRedactor(qaDir, env);

  if (result.status !== 0 || !statuses.length || statuses.some((s) => s !== "expected")) {
    const reason = !statuses.length
      ? "aucun test setup exécuté (rapport absent)"
      : statuses.includes("skipped")
        ? "test setup sauté (rôle, variables ou QA_STORAGE_STATE manquants)"
        : "connexion en échec (voir `npx playwright test --project=setup`)";
    return out(1, { ok: false, error: redact(reason), statuses }, `KO session refresh ${role.name} — ${redact(reason)}`);
  }
  if (!existsSync(storage) || statSync(storage).mtimeMs < runStartedMs - 1000) {
    return out(1, { ok: false, error: "storageState non écrit par ce run" }, `KO session refresh ${role.name} — storageState non écrit par ce run`);
  }

  const ttlHours = config.auth?.session_ttl_hours ?? 24;
  const expires = new Date(started.getTime() + ttlHours * 3600_000).toISOString();
  const storageRel = relative(root, storage).split("\\").join("/");
  const db = AgentDb.open(join(qaDir, "agentdb", "agentdb.sqlite"));
  try {
    db.putSession({ role: role.name, storage_state_path: storageRel, expires_at: expires });
  } finally {
    db.close();
  }
  return out(
    0,
    { ok: true, role: role.name, storage_state_path: storageRel, expires_at: expires },
    `OK session ${role.name} — ${storageRel} (expire ${expires})`,
  );
}
