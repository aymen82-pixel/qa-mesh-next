/**
 * Rendu PUR de `trace.md` : une page par test en échec, lisible par les
 * Agents 5 et 6 à la place des traces brutes. Structure inspirée des pages de
 * trace de tester-army/e2e (Apache-2.0, voir NOTICE). Sortie bornée.
 */
import type { Classification } from "../errors/classify";
import type { AppLogLine, ParsedTrace } from "./parse";

export const MAX_STEPS = 40;
export const MAX_APP_LOG = 50;
export const MAX_SNAPSHOT_LINES = 120;

export interface TracePageInput {
  title: string;
  spec: string;
  line?: number;
  project: string;
  status: string;
  durationMs?: number;
  classification: Classification;
  /** `fichier:ligne` de l'erreur (errorLocation du rapport). */
  lookAt?: string;
  trace: ParsedTrace | null;
  /** Raison si le trace.zip n'a pas pu être lu. */
  traceUnavailable?: string;
  /** Snapshot d'accessibilité (YAML) issu de error-context.md. */
  ariaSnapshot?: string;
  attachments: { name: string; path: string }[];
}

function fence(text: string, lang = "text"): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const f = "`".repeat(longest + 1);
  return `${f}${lang}\n${text}\n${f}`;
}

function capLines(text: string, max: number): string {
  const all = text.split("\n");
  return all.length <= max ? text : [...all.slice(0, max), `… (+${all.length - max} lignes)`].join("\n");
}

function sortAppLog(log: AppLogLine[]): AppLogLine[] {
  const rank = { error: 0, warning: 1, info: 2 } as const;
  return [...log].sort((a, b) => rank[a.level] - rank[b.level] || a.time - b.time);
}

export function renderTracePage(p: TracePageInput): string {
  const c = p.classification;
  const out: string[] = [];
  out.push(`# ✗ ${p.title}`);
  out.push("");
  out.push(`\`${p.spec}${p.line ? `:${p.line}` : ""}\` · projet \`${p.project || "-"}\` · ${p.status}${p.durationMs != null ? ` · ${(p.durationMs / 1000).toFixed(1)}s` : ""}`);
  out.push("");
  out.push(`**${c.code}** · classe **${c.class}**${c.ambiguous ? " (ambiguë : requalifiable avec motif)" : ""}`);
  out.push("");
  out.push(`Piste : ${c.hint}`);
  out.push("");
  out.push(fence(c.evidence));
  if (p.lookAt) out.push("", `Look at : \`${p.lookAt}\``);

  out.push("", "## Étapes", "");
  if (!p.trace) {
    out.push(`_Trace indisponible : ${p.traceUnavailable ?? "aucun trace.zip (trace: 'retain-on-failure' requis)"}._`);
  } else if (!p.trace.steps.length) {
    out.push("_Aucune étape enregistrée._");
  } else {
    const steps = p.trace.steps;
    const skipped = Math.max(0, steps.length - MAX_STEPS);
    if (skipped) out.push(`_… ${skipped} étape(s) antérieure(s) omise(s)_`);
    steps.slice(-MAX_STEPS).forEach((s, i) => {
      const n = skipped + i + 1;
      const mark = s.error ? "✗" : "✓";
      const dur = s.durationMs != null ? ` (${s.durationMs}ms)` : "";
      out.push(`${n}. ${mark} \`${s.method}\` ${s.title}${dur}${s.location ? ` — \`${s.location}\`` : ""}`);
      if (s.error) out.push(`   - ✗ ${s.error}`);
    });
  }

  out.push("", "## Journal de l'application", "");
  const log = p.trace ? sortAppLog(p.trace.appLog) : [];
  if (!log.length) {
    out.push(p.trace ? "_Rien de notable (aucune erreur console, aucune requête 4xx/5xx)._" : "_Indisponible sans trace._");
  } else {
    const icon = { error: "✗", warning: "⚠", info: "ℹ" } as const;
    for (const l of log.slice(0, MAX_APP_LOG)) out.push(`- ${icon[l.level]} ${l.kind} : ${l.text.replace(/\s+/g, " ").slice(0, 300)}`);
    if (log.length > MAX_APP_LOG) out.push(`- … (+${log.length - MAX_APP_LOG} lignes)`);
  }

  out.push("", "## Écran à l'échec (snapshot d'accessibilité)", "");
  out.push(p.ariaSnapshot ? fence(capLines(p.ariaSnapshot.trim(), MAX_SNAPSHOT_LINES), "yaml") : "_Non capturé (error-context absent)._");

  if (p.attachments.length) {
    out.push("", "## Pièces", "");
    for (const a of p.attachments) out.push(`- ${a.name} : \`${a.path}\``);
  }
  out.push("");
  return out.join("\n");
}

/** Extrait le bloc YAML de `error-context.md` (Playwright ≥ 1.5x). */
export function extractAriaSnapshot(errorContext: string): string | undefined {
  const m = /```yaml\n([\s\S]*?)\n```/.exec(errorContext);
  return m ? m[1] : undefined;
}
