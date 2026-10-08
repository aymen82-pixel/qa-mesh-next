/** Rendu PUR de `PROGRESS.md` d'une exploration (jamais écrit à la main). */
import type { CharterDetail, FindingRow } from "./store";
import type { DecideResult, ExploreRunRow } from "./state";

const SEVERITY = ["", "trivial", "low", "medium", "high", "critical"];

export function renderExploreProgress(run: ExploreRunRow, charters: CharterDetail[], findings: FindingRow[], decision?: DecideResult): string {
  const out = [
    `# Exploration — ${run.goal}`,
    "",
    "> Fichier généré par le kernel (`qa-mesh explore`). Ne jamais éditer à la main.",
    "",
    `Run \`${run.run_id}\` · budgets : ${run.budgets.max_charters} charters, ${run.budgets.max_steps_per_charter} actions/charter, ${run.budgets.max_duration_min} min, parallélisme ${run.budgets.parallelism}${run.read_only ? " · **lecture seule**" : ""}${run.storage_state ? ` · session \`${run.storage_state}\`` : ""}`,
    "",
    "## Charters",
    "",
  ];
  if (!charters.length) out.push("_Aucun charter._");
  for (const c of charters) {
    out.push(`${c.index}. **${c.title}** — ${c.status}${c.error_code ? ` (${c.error_code})` : ""} · ${c.findings} finding(s)${c.tainted ? " · secret saisi (sans capture)" : ""}`);
    if (c.summary) out.push(`   - ${c.summary.replace(/\s+/g, " ").slice(0, 280)}`);
  }
  out.push("", "## Findings", "");
  if (!findings.length) out.push("_Aucun finding._");
  for (const f of findings) {
    out.push(`- ⚑ ${SEVERITY[f.severity] ?? f.severity} ${f.kind} \`${f.id}\` ${f.title} (\`${f.route}\`, charter ${f.charter})`);
  }
  if (decision) {
    out.push("", "## Décision du kernel", "", `**${decision.action}**${decision.ended ? ` (${decision.ended})` : ""} — ${decision.reason} · restant : ${decision.remaining.charters} charter(s), ${decision.remaining.minutes} min`);
  }
  out.push("");
  return out.join("\n");
}
