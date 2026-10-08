/** Verdicts de vérification d'un bug bash (AgentDB, écrits par le kernel seul). */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DDL = `
CREATE TABLE IF NOT EXISTS bugbash_verdicts (
  run_id TEXT NOT NULL, candidate TEXT NOT NULL, bucket TEXT NOT NULL, reason TEXT NOT NULL,
  outcome TEXT, spec TEXT, test_title TEXT, root_cause TEXT, evidence TEXT,
  attempts INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, candidate)
);`;

export type Bucket = "artifact" | "environment" | "design" | "fixture" | "candidate";

export interface VerdictRow {
  candidate: string;
  bucket: Bucket;
  reason: string;
  outcome?: string | null;
  spec?: string | null;
  test_title?: string | null;
  root_cause?: string | null;
  evidence?: string | null;
  attempts: number;
  updated_at: string;
}

export class BugbashStore {
  private constructor(private readonly db: DatabaseSync) {}

  static open(path: string): BugbashStore {
    mkdirSync(dirname(path), { recursive: true });
    const db = new DatabaseSync(path);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA busy_timeout = 5000;");
    db.exec(DDL);
    return new BugbashStore(db);
  }

  close(): void {
    this.db.close();
  }

  get(runId: string, candidate: string): VerdictRow | null {
    return (this.db.prepare("SELECT * FROM bugbash_verdicts WHERE run_id = ? AND candidate = ?").get(runId, candidate) as VerdictRow | undefined) ?? null;
  }

  all(runId: string): VerdictRow[] {
    return this.db.prepare("SELECT * FROM bugbash_verdicts WHERE run_id = ? ORDER BY candidate").all(runId) as unknown as VerdictRow[];
  }

  put(runId: string, v: VerdictRow): void {
    this.db
      .prepare(
        `INSERT INTO bugbash_verdicts(run_id, candidate, bucket, reason, outcome, spec, test_title, root_cause, evidence, attempts, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(run_id, candidate) DO UPDATE SET bucket = excluded.bucket, reason = excluded.reason, outcome = excluded.outcome,
           spec = excluded.spec, test_title = excluded.test_title, root_cause = excluded.root_cause, evidence = excluded.evidence,
           attempts = excluded.attempts, updated_at = excluded.updated_at`,
      )
      .run(runId, v.candidate, v.bucket, v.reason, v.outcome ?? null, v.spec ?? null, v.test_title ?? null, v.root_cause ?? null, v.evidence ?? null, v.attempts, v.updated_at);
  }
}
