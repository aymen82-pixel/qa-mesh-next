/**
 * Bug bash avec preuve (sur le modèle de references/bug-bash.md de
 * tester-army/e2e, Apache-2.0, voir NOTICE) :
 *
 *   qa-mesh findings merge --run <id> [--threshold 0.3]     fusion des findings -> bugbash/merged.json
 *   qa-mesh bugbash verify --run <id> <verify.json>         tri + test de repro jugé par le kernel
 *   qa-mesh bugbash report --run <id>                       bugs_report.json (confirmés) + unconfirmed.json
 *   qa-mesh bugbash status --run <id>
 *
 * Le kernel lance lui-même le test de repro (`--repeat-each 2`, sans retry) et
 * tranche (bugbash/verdict.ts) : aucun agent ne déclare un bug « confirmé ».
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { findQaDir, repoRoot, runDir } from "../paths";
import { ContractRegistry, validateDocument } from "../contracts";
import { redactDeep } from "../secrets/redact";
import { projectRedactor } from "../secrets/project";
import { ExploreStore } from "../explore/store";
import { DEFAULT_THRESHOLD, mergeFindings, type Candidate } from "../bugbash/merge";
import { judgeRepro, markerOf, type ReproRun } from "../bugbash/verdict";
import { BugbashStore, type Bucket, type VerdictRow } from "../bugbash/store";

/** Essais d'écriture d'un test de repro jugé invalide avant abandon. */
export const MAX_REPRO_ATTEMPTS = 2;
export const REPRO_DIR = "tests/bugbash/";

export type ReproRunner = (opts: { root: string; spec: string; project: string }) => { runs: ReproRun[]; error?: string };

/** Exécute le spec de repro deux fois, sans retry, et extrait les résultats. */
export const defaultReproRunner: ReproRunner = ({ root, spec, project }) => {
  const out = join(mkdtempSync(join(tmpdir(), "qa-mesh-repro-")), "report.json");
  spawnSync("npx", ["playwright", "test", spec, `--project=${project}`, "--retries=0", "--repeat-each=2", "--reporter=json"], {
    cwd: root,
    env: { ...process.env, QA_BUGBASH: "1", PLAYWRIGHT_JSON_OUTPUT_NAME: out },
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  if (!existsSync(out)) return { runs: [], error: "aucun rapport Playwright produit" };
  const report = JSON.parse(readFileSync(out, "utf8"));
  const runs: ReproRun[] = [];
  const visit = (s: any): void => {
    for (const sp of s.specs ?? [])
      for (const t of sp.tests ?? [])
        for (const r of t.results ?? []) runs.push({ status: r.status, messages: (r.errors ?? []).map((e: any) => String(e.message ?? "")) });
    for (const c of s.suites ?? []) visit(c);
  };
  for (const s of report.suites ?? []) visit(s);
  return { runs, ...(report.errors?.length ? { error: String(report.errors[0].message ?? "").slice(0, 300) } : {}) };
};

export interface BugbashOptions {
  mode: "merge" | "verify" | "report" | "status";
  flags: Map<string, string[]>;
  bools: Set<string>;
  positionals: string[];
  qaDir?: string;
  runner?: ReproRunner;
  now?: () => Date;
  env?: Record<string, string | undefined>;
}

export function runBugbash(opts: BugbashOptions): { exitCode: number; stdout: string } {
  const json = opts.bools.has("json");
  const flag = (n: string) => opts.flags.get(n)?.[0];
  const now = () => (opts.now ?? (() => new Date()))().toISOString();
  const fail = (code: number, msg: string) => ({ exitCode: code, stdout: json ? JSON.stringify({ error: msg }) : msg });
  const ok = (payload: unknown, human: string) => ({ exitCode: 0, stdout: json ? JSON.stringify(payload) : human });

  const runId = flag("run");
  if (!runId) return fail(2, "--run <run_id> requis");
  const qaDir = opts.qaDir ?? findQaDir();
  const root = repoRoot(qaDir);
  const dir = join(runDir(qaDir, runId), "bugbash");
  const mergedPath = join(dir, "merged.json");
  const rel = (p: string) => relative(root, p).split("\\").join("/");
  const redact = projectRedactor(qaDir, opts.env ?? process.env);
  const dbPath = join(qaDir, "agentdb", "agentdb.sqlite");
  const loadMerged = (): { issues: Candidate[]; warnings: Candidate[] } | null =>
    existsSync(mergedPath) ? JSON.parse(readFileSync(mergedPath, "utf8")) : null;

  if (opts.mode === "merge") {
    const store = ExploreStore.open(dbPath);
    try {
      if (!store.run(runId)) return fail(2, `findings merge : aucune exploration pour ${runId}`);
      const threshold = flag("threshold") ? Number(flag("threshold")) : DEFAULT_THRESHOLD;
      if (!(threshold >= 0 && threshold <= 1)) return fail(2, "findings merge : --threshold entre 0 et 1");
      const findings = store.findings(runId);
      const merged = redactDeep(mergeFindings(findings, threshold), redact);
      mkdirSync(dir, { recursive: true });
      writeFileSync(mergedPath, JSON.stringify({ run_id: runId, threshold, ...merged }, null, 2) + "\n", "utf8");
      return ok(
        { findings: findings.length, issues: merged.issues.length, warnings: merged.warnings.length, merged: rel(mergedPath) },
        `OK ${findings.length} finding(s) -> ${merged.issues.length} candidat(s) issue, ${merged.warnings.length} warning(s) · ${rel(mergedPath)}`,
      );
    } finally {
      store.close();
    }
  }

  const merged = loadMerged();
  if (!merged) return fail(2, `bugbash ${opts.mode} : lancer d'abord \`findings merge --run ${runId}\``);
  const store = BugbashStore.open(dbPath);
  try {
    if (opts.mode === "verify") {
      const file = opts.positionals[0];
      if (!file) return fail(2, "bugbash verify : <verify.json> requis");
      let doc: any;
      try {
        doc = JSON.parse(readFileSync(file, "utf8"));
      } catch (e) {
        return fail(2, `bugbash verify : JSON illisible : ${(e as Error).message}`);
      }
      const check = ContractRegistry.load(qaDir).validateDeliverable(doc, "agent-bugverify");
      if (!check.valid) return fail(1, `bugbash verify : livrable non conforme — ${check.errors.map((e) => `${e.path} ${e.message}`).join(" ; ")}`);
      const p = redactDeep(doc.payload, redact) as {
        finding_id: string;
        bucket: Bucket;
        reason: string;
        repro_spec?: string;
        test_title?: string;
        root_cause?: string;
      };
      const candidate = merged.issues.find((c) => c.id === p.finding_id);
      if (!candidate) return fail(1, `bugbash verify : candidat inconnu ${p.finding_id} (voir merged.json)`);
      const previous = store.get(runId, candidate.id);
      if (previous?.outcome === "confirmed") return fail(1, `bugbash verify : ${candidate.id} déjà confirmé`);

      if (p.bucket !== "candidate") {
        store.put(runId, { candidate: candidate.id, bucket: p.bucket, reason: p.reason, outcome: "rejected", attempts: previous?.attempts ?? 0, updated_at: now() });
        return ok({ finding_id: candidate.id, outcome: "rejected", bucket: p.bucket }, `${candidate.id} rejeté au tri (${p.bucket}) : ${p.reason}`);
      }

      const spec = p.repro_spec!;
      const specAbs = isAbsolute(spec) ? spec : resolve(root, spec);
      const specRel = rel(specAbs);
      const attempts = (previous?.attempts ?? 0) + 1;
      const record = (outcome: string, reason: string, evidence?: string) =>
        store.put(runId, {
          candidate: candidate.id,
          bucket: "candidate",
          reason: p.reason,
          outcome,
          spec: specRel,
          test_title: p.test_title,
          root_cause: p.root_cause,
          evidence: evidence ? redact(`${reason}\n${evidence}`) : redact(reason),
          attempts,
          updated_at: now(),
        });

      // Garde-fous statiques : le test doit porter la trace du finding et le marqueur.
      const pre: string[] = [];
      if (!specRel.startsWith(REPRO_DIR) || !specRel.endsWith(".spec.ts")) pre.push(`le test doit être sous ${REPRO_DIR} et finir par .spec.ts`);
      const source = existsSync(specAbs) ? readFileSync(specAbs, "utf8") : "";
      if (!source) pre.push(`fichier introuvable : ${specRel}`);
      else {
        if (!source.includes(`@finding ${candidate.id}`)) pre.push(`commentaire de traçabilité \`// @finding ${candidate.id}\` absent`);
        if (!source.includes(markerOf(candidate.id))) pre.push(`marqueur ${markerOf(candidate.id)} absent du message de l'assertion`);
        if (!source.includes("@bugbash")) pre.push("tag @bugbash absent du titre du test");
      }
      let verdict;
      if (pre.length) {
        verdict = { outcome: "test_invalid" as const, reason: pre.join(" ; ") };
      } else {
        const res = (opts.runner ?? defaultReproRunner)({ root, spec: specRel, project: flag("project") ?? "chromium" });
        verdict = res.runs.length || !res.error ? judgeRepro(candidate.id, res.runs) : { outcome: "test_invalid" as const, reason: `exécution impossible : ${res.error}` };
      }
      const outcome = verdict.outcome === "test_invalid" && attempts >= MAX_REPRO_ATTEMPTS ? "abandoned" : verdict.outcome;
      record(outcome, verdict.reason, "evidence" in verdict ? verdict.evidence : undefined);
      const payload = { finding_id: candidate.id, outcome, reason: verdict.reason, attempts, spec: specRel };
      const human = `${candidate.id} ${outcome.toUpperCase()} — ${verdict.reason}${outcome === "test_invalid" ? ` (essai ${attempts}/${MAX_REPRO_ATTEMPTS} : corriger le test et relancer)` : ""}`;
      // test_invalid : exit 1 pour que le vérificateur corrige son test (max 2 essais).
      return { exitCode: outcome === "test_invalid" ? 1 : 0, stdout: json ? JSON.stringify(payload) : redact(human) };
    }

    const verdicts = new Map(store.all(runId).map((v) => [v.candidate, v]));
    if (opts.mode === "status") {
      const rows = merged.issues.map((c) => ({ id: c.id, title: c.title, outcome: verdicts.get(c.id)?.outcome ?? "non vérifié" }));
      return ok(rows, rows.map((r) => `${r.id} ${r.outcome.padEnd(14)} ${r.title}`).join("\n") || "Aucun candidat.");
    }

    // report
    const confirmed = merged.issues.filter((c) => verdicts.get(c.id)?.outcome === "confirmed");
    const bugs = {
      run_id: runId,
      generated_at: now(),
      bugs: confirmed.map((c) => {
        const v = verdicts.get(c.id) as VerdictRow;
        return {
          id: c.id,
          title: c.title,
          severity: c.severity,
          route: c.route,
          expected: c.expected,
          actual: c.actual,
          repro_steps: c.repro_steps,
          repro_spec: v.spec!,
          ...(v.test_title ? { test_title: v.test_title } : {}),
          failure: v.evidence ?? "",
          ...(v.root_cause ? { root_cause: v.root_cause } : {}),
          ...(c.screenshot_path ? { screenshot_path: c.screenshot_path } : {}),
          findings: c.findings,
          charters: c.charters,
        };
      }),
    };
    const unconfirmed = {
      run_id: runId,
      generated_at: now(),
      items: [
        ...merged.issues
          .filter((c) => verdicts.get(c.id)?.outcome !== "confirmed")
          .map((c) => {
            const v = verdicts.get(c.id);
            const status = !v ? "not_verified" : v.outcome === "rejected" ? `rejected:${v.bucket}` : (v.outcome ?? "not_verified");
            return {
              id: c.id,
              title: c.title,
              kind: c.kind,
              severity: c.severity,
              route: c.route,
              status,
              reason: v ? (v.outcome === "rejected" ? v.reason : (v.evidence ?? v.reason)) : "aucun test de repro soumis",
              ...(v?.spec ? { repro_spec: v.spec } : {}),
              findings: c.findings,
            };
          }),
        ...merged.warnings.map((c) => ({
          id: c.id,
          title: c.title,
          kind: c.kind,
          severity: c.severity,
          route: c.route,
          status: "warning",
          reason: "warning (cosmétique) : non vérifié par test",
          findings: c.findings,
        })),
      ],
    };
    const registry = ContractRegistry.load(qaDir);
    for (const [key, doc] of [["bugbash-bugs", bugs], ["bugbash-unconfirmed", unconfirmed]] as const) {
      const check = validateDocument(registry, key, doc);
      if (!check.valid) return fail(1, `bugbash report : ${key} non conforme (bug kernel) — ${JSON.stringify(check.errors)}`);
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "bugs_report.json"), JSON.stringify(bugs, null, 2) + "\n", "utf8");
    writeFileSync(join(dir, "unconfirmed.json"), JSON.stringify(unconfirmed, null, 2) + "\n", "utf8");
    return ok(
      { confirmed: bugs.bugs.length, unconfirmed: unconfirmed.items.length, bugs_report: rel(join(dir, "bugs_report.json")), unconfirmed_report: rel(join(dir, "unconfirmed.json")) },
      `${bugs.bugs.length} bug(s) confirmé(s), ${unconfirmed.items.length} non confirmé(s) · ${rel(dir)}/`,
    );
  } finally {
    store.close();
  }
}
