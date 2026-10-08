/**
 * Verdict PUR d'un test de repro (le kernel tranche, jamais un agent).
 * Un finding n'est CONFIRMÉ que si son test, rejoué plusieurs fois sans retry,
 * échoue à CHAQUE exécution avec le code ASSERTION_FAILED du catalogue et
 * sur l'assertion qui porte le marqueur `[BUG:<id>]`.
 */
import { classifyFailure } from "../errors/classify";

export type ReproOutcome = "confirmed" | "not_reproduced" | "test_invalid" | "flaky";

export interface ReproRun {
  /** Statut Playwright de chaque exécution : passed | failed | timedOut | skipped… */
  status: string;
  messages: string[];
}

export interface ReproVerdict {
  outcome: ReproOutcome;
  reason: string;
  /** Message d'échec retenu (classé), si échec. */
  evidence?: string;
}

export function markerOf(id: string): string {
  return `[BUG:${id}]`;
}

export function judgeRepro(id: string, runs: ReproRun[]): ReproVerdict {
  if (!runs.length) return { outcome: "test_invalid", reason: "aucun test exécuté (fichier hors tests/bugbash/, titre ou tag @bugbash manquant ?)" };
  const failed = runs.filter((r) => r.status === "failed" || r.status === "timedOut");
  const passed = runs.filter((r) => r.status === "passed");
  if (runs.some((r) => r.status === "skipped")) return { outcome: "test_invalid", reason: "test sauté : une repro doit s'exécuter" };
  if (passed.length === runs.length) return { outcome: "not_reproduced", reason: `le test passe (${runs.length}/${runs.length}) : le défaut ne se reproduit pas` };
  if (failed.length && passed.length) return { outcome: "flaky", reason: `${failed.length}/${runs.length} échec(s) seulement : instable, non prouvé` };

  for (const r of failed) {
    const c = classifyFailure(r.messages);
    if (c.code !== "ASSERTION_FAILED") {
      return { outcome: "test_invalid", reason: `échec ${c.code} et non ASSERTION_FAILED : le test est faux, pas l'application`, evidence: c.evidence };
    }
    if (!r.messages.some((m) => m.includes(markerOf(id)))) {
      return { outcome: "test_invalid", reason: `l'assertion en échec ne porte pas le marqueur ${markerOf(id)} : échec pour une autre raison que celle annoncée`, evidence: c.evidence };
    }
  }
  return { outcome: "confirmed", reason: `échoue ${failed.length}/${runs.length} fois sur l'assertion ${markerOf(id)} (ASSERTION_FAILED)`, evidence: classifyFailure(failed[0].messages).evidence };
}
