/**
 * Mode explore — moteur PUR de la boucle planner -> charter -> findings.
 * Inspiré de `e2e explore` (tester-army/e2e, Apache-2.0, voir NOTICE) :
 * budgets bornés, arrêt après 3 charters consécutifs ratés ou bloqués sans
 * finding, verdict calculé (jamais jugé par un modèle).
 *
 * Le planificateur (qa-analyst) et l'explorateur (qa-explorer) sont des
 * agents ; tout le reste (état, budgets, décision, verdict, rendu) est ici.
 */

export const DEFAULT_BUDGETS = { max_charters: 8, max_steps_per_charter: 40, max_duration_min: 10, parallelism: 1 } as const;
export const BUDGET_RANGES = {
  max_charters: [1, 12],
  max_steps_per_charter: [1, 100],
  max_duration_min: [3, 15],
  parallelism: [1, 4],
} as const;
/** Charters consécutifs ratés/bloqués sans finding avant arrêt. */
export const STUCK_STREAK = 3;

export interface Budgets {
  max_charters: number;
  max_steps_per_charter: number;
  max_duration_min: number;
  parallelism: number;
}

export type CharterStatus = "running" | "passed" | "failed" | "blocked" | "exhausted";
export type Ended = "finished" | "step-limit" | "time" | "stuck";
export type Verdict = "passed" | "failed" | "blocked";

export interface CharterRow {
  index: number;
  title: string;
  status: CharterStatus;
  findings: number;
  issues: number;
  started_at: string;
  ended_at?: string | null;
  summary?: string | null;
  error_code?: string | null;
}

export interface ExploreRunRow {
  run_id: string;
  goal: string;
  budgets: Budgets;
  started_at: string;
  read_only: boolean;
  storage_state?: string | null;
  ended?: Ended | null;
}

/** Fusionne la config avec les défauts et borne chaque budget dans sa plage. */
export function resolveBudgets(config: Partial<Budgets> | undefined): Budgets {
  const out = { ...DEFAULT_BUDGETS } as Budgets;
  for (const key of Object.keys(BUDGET_RANGES) as (keyof Budgets)[]) {
    const v = config?.[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      const [lo, hi] = BUDGET_RANGES[key];
      out[key] = Math.min(hi, Math.max(lo, Math.round(v)));
    }
  }
  return out;
}

export interface DecideInput {
  run: ExploreRunRow;
  charters: CharterRow[];
  nowMs: number;
  /** Le planificateur déclare l'objectif couvert. */
  plannerFinished?: boolean;
}

export interface DecideResult {
  action: "continue" | "stop";
  ended?: Ended;
  reason: string;
  remaining: { charters: number; minutes: number };
}

/** Longueur de la série finale de charters ratés/bloqués sans finding (« exhausted » est neutre). */
export function failureStreak(charters: CharterRow[]): number {
  let streak = 0;
  for (const c of [...charters].sort((a, b) => b.index - a.index)) {
    if (c.status === "running" || c.status === "exhausted") continue;
    if ((c.status === "failed" || c.status === "blocked") && c.findings === 0) streak++;
    else break;
  }
  return streak;
}

export function decideNext(input: DecideInput): DecideResult {
  const { run, charters } = input;
  const elapsedMin = (input.nowMs - Date.parse(run.started_at)) / 60000;
  const remaining = {
    charters: Math.max(0, run.budgets.max_charters - charters.length),
    minutes: Math.max(0, Math.round((run.budgets.max_duration_min - elapsedMin) * 10) / 10),
  };
  const stop = (ended: Ended, reason: string): DecideResult => ({ action: "stop", ended, reason, remaining });

  if (charters.some((c) => c.status === "running")) {
    return { action: "continue", reason: "charter(s) en cours : attendre leur fin", remaining };
  }
  if (input.plannerFinished) return stop("finished", "le planificateur a déclaré l'objectif couvert");
  if (failureStreak(charters) >= STUCK_STREAK) {
    return stop("stuck", `${STUCK_STREAK} charters consécutifs ratés ou bloqués sans finding`);
  }
  if (charters.length >= run.budgets.max_charters) return stop("step-limit", `budget de ${run.budgets.max_charters} charters atteint`);
  // La dernière minute est réservée à l'évaluation de clôture (comme e2e).
  if (elapsedMin >= run.budgets.max_duration_min - 1) return stop("time", `durée maximale (${run.budgets.max_duration_min} min) atteinte`);
  return { action: "continue", reason: "budgets disponibles", remaining };
}

/**
 * Verdict produit : `failed` dès qu'une `issue` existe ; `blocked` si tous les
 * charters ont été bloqués sans issue ; `failed` si rien n'a tourné ni été
 * trouvé ; sinon `passed` (les warnings ne font pas échouer).
 */
export function verdictOf(charters: CharterRow[]): Verdict {
  const done = charters.filter((c) => c.status !== "running");
  if (done.some((c) => c.issues > 0)) return "failed";
  if (!done.length) return "failed";
  if (done.every((c) => c.status === "blocked")) return "blocked";
  return "passed";
}

/**
 * Peut-on lancer un charter de plus maintenant ? Parallélisme borné
 * (`parallelism`), budgets de nombre et de durée, et pas d'enlisement.
 */
export function canStartCharter(run: ExploreRunRow, charters: CharterRow[], nowMs: number): { ok: boolean; reason: string } {
  if (run.ended) return { ok: false, reason: `exploration close (${run.ended})` };
  const running = charters.filter((c) => c.status === "running").length;
  if (running >= run.budgets.parallelism) return { ok: false, reason: `parallélisme max atteint (${run.budgets.parallelism})` };
  const settled = decideNext({ run, charters: charters.filter((c) => c.status !== "running"), nowMs });
  if (settled.action === "stop") return { ok: false, reason: settled.reason };
  if (charters.length >= run.budgets.max_charters) return { ok: false, reason: `budget de ${run.budgets.max_charters} charters atteint` };
  return { ok: true, reason: "ok" };
}
