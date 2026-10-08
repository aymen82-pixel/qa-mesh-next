/**
 * Fusion déterministe des findings d'un bug bash (`qa-mesh findings merge`).
 * Deux findings décrivent le même défaut s'ils portent sur la même route et
 * que leurs titres normalisés sont proches (distance de Levenshtein relative,
 * `db/distance.ts`). Regroupement transitif (union-find). Seuil prudent :
 * mieux vaut deux doublons qu'une fusion abusive (Levenshtein ne voit pas la
 * sémantique). Les warnings restent dans une liste séparée.
 */
import { levenshtein } from "../db/distance";
import type { FindingRow } from "../explore/store";

export const DEFAULT_THRESHOLD = 0.3;

export interface Candidate {
  id: string;
  title: string;
  kind: "issue" | "warning";
  severity: number;
  expected: string;
  actual: string;
  repro_steps: string[];
  route: string;
  screenshot_path?: string;
  /** Finding retenu comme référence (repro la plus courte). */
  primary: string;
  findings: string[];
  charters: number[];
}

export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function titleDistance(a: string, b: string): number {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  const max = Math.max(x.length, y.length);
  return max === 0 ? 0 : levenshtein(x, y) / max;
}

export function mergeFindings(findings: FindingRow[], threshold = DEFAULT_THRESHOLD): { issues: Candidate[]; warnings: Candidate[] } {
  const parent = findings.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < findings.length; i++) {
    for (let j = i + 1; j < findings.length; j++) {
      const a = findings[i];
      const b = findings[j];
      if (a.kind === b.kind && a.route === b.route && titleDistance(a.title, b.title) <= threshold) {
        parent[find(j)] = find(i);
      }
    }
  }
  const groups = new Map<number, FindingRow[]>();
  findings.forEach((f, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), f]));

  const build = (group: FindingRow[]): Omit<Candidate, "id"> => {
    const primary = [...group].sort((a, b) => a.repro_steps.length - b.repro_steps.length || a.id.localeCompare(b.id))[0];
    const shot = group.find((f) => f.screenshot_path)?.screenshot_path ?? undefined;
    return {
      title: primary.title,
      kind: primary.kind,
      severity: Math.max(...group.map((f) => f.severity)),
      expected: primary.expected,
      actual: primary.actual,
      repro_steps: primary.repro_steps,
      route: primary.route,
      ...(shot ? { screenshot_path: shot } : {}),
      primary: primary.id,
      findings: group.map((f) => f.id).sort(),
      charters: [...new Set(group.map((f) => f.charter))].sort((a, b) => a - b),
    };
  };
  const all = [...groups.values()].map(build).sort((a, b) => b.severity - a.severity || a.primary.localeCompare(b.primary));
  const issues = all.filter((c) => c.kind === "issue").map((c, i) => ({ id: `B-${String(i + 1).padStart(3, "0")}`, ...c }));
  const warnings = all.filter((c) => c.kind === "warning").map((c, i) => ({ id: `W-${String(i + 1).padStart(3, "0")}`, ...c }));
  return { issues, warnings };
}
