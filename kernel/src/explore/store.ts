/**
 * Persistance de l'état d'exploration dans AgentDB (même fichier SQLite, WAL) :
 * accès concurrent sûr quand plusieurs explorateurs terminent en parallèle.
 * Écrit UNIQUEMENT par le kernel.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Budgets, CharterRow, CharterStatus, Ended, ExploreRunRow, Verdict } from "./state";

const DDL = `
CREATE TABLE IF NOT EXISTS explore_runs (
  run_id TEXT PRIMARY KEY, goal TEXT NOT NULL, budgets TEXT NOT NULL, started_at TEXT NOT NULL,
  read_only INTEGER NOT NULL DEFAULT 0, storage_state TEXT, ended TEXT, verdict TEXT,
  assessment TEXT, closed_at TEXT
);
CREATE TABLE IF NOT EXISTS explore_charters (
  run_id TEXT NOT NULL, idx INTEGER NOT NULL, title TEXT NOT NULL, instruction TEXT NOT NULL,
  posture TEXT, status TEXT NOT NULL, summary TEXT, error_code TEXT, tainted INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL, ended_at TEXT, PRIMARY KEY (run_id, idx)
);
CREATE TABLE IF NOT EXISTS explore_findings (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, charter INTEGER NOT NULL, title TEXT NOT NULL,
  kind TEXT NOT NULL, severity INTEGER NOT NULL, expected TEXT NOT NULL, actual TEXT NOT NULL,
  repro_steps TEXT NOT NULL, route TEXT NOT NULL, screenshot_path TEXT, reported_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_explore_findings_run ON explore_findings(run_id);
`;

export interface FindingRow {
  id: string;
  run_id: string;
  charter: number;
  title: string;
  kind: "issue" | "warning";
  severity: number;
  expected: string;
  actual: string;
  repro_steps: string[];
  route: string;
  screenshot_path?: string | null;
  reported_at: string;
}

export interface CharterDetail extends CharterRow {
  instruction: string;
  posture?: string | null;
  tainted: boolean;
}

export class ExploreStore {
  private constructor(private readonly db: DatabaseSync) {}

  static open(path: string): ExploreStore {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    const db = new DatabaseSync(path);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA busy_timeout = 5000;");
    db.exec(DDL);
    return new ExploreStore(db);
  }

  close(): void {
    this.db.close();
  }

  createRun(run: ExploreRunRow): void {
    this.db
      .prepare("INSERT INTO explore_runs(run_id, goal, budgets, started_at, read_only, storage_state) VALUES (?, ?, ?, ?, ?, ?)")
      .run(run.run_id, run.goal, JSON.stringify(run.budgets), run.started_at, run.read_only ? 1 : 0, run.storage_state ?? null);
  }

  run(runId: string): (ExploreRunRow & { verdict?: Verdict | null; assessment?: string | null }) | null {
    const r = this.db.prepare("SELECT * FROM explore_runs WHERE run_id = ?").get(runId) as Record<string, any> | undefined;
    if (!r) return null;
    return {
      run_id: r.run_id,
      goal: r.goal,
      budgets: JSON.parse(r.budgets) as Budgets,
      started_at: r.started_at,
      read_only: r.read_only === 1,
      storage_state: r.storage_state,
      ended: r.ended,
      verdict: r.verdict,
      assessment: r.assessment,
    };
  }

  startCharter(runId: string, c: { title: string; instruction: string; posture?: string; started_at: string }): number {
    const row = this.db.prepare("SELECT COALESCE(MAX(idx), 0) + 1 AS n FROM explore_charters WHERE run_id = ?").get(runId) as { n: number };
    this.db
      .prepare("INSERT INTO explore_charters(run_id, idx, title, instruction, posture, status, started_at) VALUES (?, ?, ?, ?, ?, 'running', ?)")
      .run(runId, row.n, c.title, c.instruction, c.posture ?? null, c.started_at);
    return row.n;
  }

  endCharter(runId: string, idx: number, e: { status: CharterStatus; summary: string; error_code?: string; tainted: boolean; ended_at: string }): void {
    this.db
      .prepare("UPDATE explore_charters SET status = ?, summary = ?, error_code = ?, tainted = ?, ended_at = ? WHERE run_id = ? AND idx = ?")
      .run(e.status, e.summary, e.error_code ?? null, e.tainted ? 1 : 0, e.ended_at, runId, idx);
  }

  charters(runId: string): CharterDetail[] {
    const rows = this.db.prepare("SELECT * FROM explore_charters WHERE run_id = ? ORDER BY idx").all(runId) as Record<string, any>[];
    const counts = this.db
      .prepare("SELECT charter, COUNT(*) AS n, SUM(kind = 'issue') AS issues FROM explore_findings WHERE run_id = ? GROUP BY charter")
      .all(runId) as { charter: number; n: number; issues: number }[];
    const by = new Map(counts.map((c) => [c.charter, c]));
    return rows.map((r) => ({
      index: r.idx,
      title: r.title,
      instruction: r.instruction,
      posture: r.posture,
      status: r.status,
      summary: r.summary,
      error_code: r.error_code,
      tainted: r.tainted === 1,
      started_at: r.started_at,
      ended_at: r.ended_at,
      findings: by.get(r.idx)?.n ?? 0,
      issues: Number(by.get(r.idx)?.issues ?? 0),
    }));
  }

  addFinding(f: FindingRow): void {
    this.db
      .prepare(
        `INSERT INTO explore_findings(id, run_id, charter, title, kind, severity, expected, actual, repro_steps, route, screenshot_path, reported_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(f.id, f.run_id, f.charter, f.title, f.kind, f.severity, f.expected, f.actual, JSON.stringify(f.repro_steps), f.route, f.screenshot_path ?? null, f.reported_at);
  }

  findingCount(runId: string): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM explore_findings WHERE run_id = ?").get(runId) as { n: number }).n;
  }

  findings(runId: string): FindingRow[] {
    return (this.db.prepare("SELECT * FROM explore_findings WHERE run_id = ? ORDER BY kind = 'warning', severity DESC, id").all(runId) as Record<string, any>[]).map(
      (r) => ({ ...r, repro_steps: JSON.parse(r.repro_steps) }) as FindingRow,
    );
  }

  close_run(runId: string, c: { ended: Ended; verdict: Verdict; assessment?: string; closed_at: string }): void {
    this.db
      .prepare("UPDATE explore_runs SET ended = ?, verdict = ?, assessment = ?, closed_at = ? WHERE run_id = ?")
      .run(c.ended, c.verdict, c.assessment ?? null, c.closed_at, runId);
  }
}
