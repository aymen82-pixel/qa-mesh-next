/**
 * Extraction PURE des faits utiles d'un `trace.zip` Playwright (format v8,
 * Playwright 1.56). Le format interne n'est pas une API publique : le parseur
 * est tolérant (lignes illisibles ou types inconnus ignorés) et `trace render`
 * produit une page dégradée depuis le seul rapport JSON si le zip manque.
 *
 *  - `test.trace`    : étapes du test (`before`/`after`, titre, durée, erreur, ligne)
 *  - `*-trace.trace` : console du navigateur, erreurs de page
 *  - `*-trace.network` : requêtes et statuts (HAR simplifié)
 */
import type { ZipEntry } from "./zip";

export interface TraceStep {
  title: string;
  method: string;
  durationMs: number | null;
  error?: string;
  /** `fichier:ligne` relatif si connu. */
  location?: string;
}

export interface AppLogLine {
  level: "error" | "warning" | "info";
  kind: "console" | "pageerror" | "network";
  text: string;
  time: number;
}

export interface ParsedTrace {
  steps: TraceStep[];
  appLog: AppLogLine[];
  /** Requêtes en échec (4xx/5xx), pour le résumé. */
  failedRequests: number;
}

const ANSI = /\x1b\[[0-9;]*m/g;
const USER_METHODS = new Set(["pw:api", "expect", "test.step"]);

function lines(entry: ZipEntry | undefined): any[] {
  if (!entry) return [];
  return entry
    .read()
    .toString("utf8")
    .split("\n")
    .flatMap((l) => {
      if (!l.trim()) return [];
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    });
}

/** Deux premières lignes significatives d'une erreur (message perso + matcher). */
function firstLine(message: string): string {
  return message
    .replace(ANSI, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^Error:\s*$/.test(l) && !/^Call log:$/.test(l))
    .slice(0, 2)
    .join(" — ");
}

export function parseTrace(entries: Map<string, ZipEntry>, repoRoot = ""): ParsedTrace {
  const rel = (file: string) => (repoRoot && file.startsWith(repoRoot) ? file.slice(repoRoot.length).replace(/^[\\/]/, "") : file);

  // 1. Étapes de premier niveau écrites par le test (pas les hooks ni les fixtures).
  const before = new Map<string, any>();
  const steps: TraceStep[] = [];
  const order: string[] = [];
  for (const e of lines(entries.get("test.trace"))) {
    if (e.type === "before") {
      before.set(e.callId, e);
      if (!e.parentId && USER_METHODS.has(e.method)) order.push(e.callId);
    } else if (e.type === "after" && before.has(e.callId)) {
      before.get(e.callId).__after = e;
    }
  }
  for (const id of order) {
    const b = before.get(id);
    const a = b.__after;
    const frame = (b.stack ?? []).find((s: any) => s?.file && !String(s.file).includes("node_modules"));
    steps.push({
      title: String(b.title ?? b.method),
      method: String(b.method),
      durationMs: a?.endTime != null ? Math.round(a.endTime - b.startTime) : null,
      ...(a?.error?.message ? { error: firstLine(String(a.error.message)) } : {}),
      ...(frame ? { location: `${rel(String(frame.file))}:${frame.line}` } : {}),
    });
  }

  // 2. Journal de l'application : console, erreurs de page, réseau en échec.
  const appLog: AppLogLine[] = [];
  let failedRequests = 0;
  for (const [name, entry] of entries) {
    if (/^\d+-trace\.trace$/.test(name)) {
      for (const e of lines(entry)) {
        if (e.type === "console") {
          const level = e.messageType === "error" ? "error" : e.messageType === "warning" ? "warning" : "info";
          // « Failed to load resource » double l'entrée réseau : on garde le réseau.
          if (/^Failed to load resource/.test(String(e.text))) continue;
          appLog.push({ level, kind: "console", text: String(e.text), time: Number(e.time) || 0 });
        } else if (e.type === "event" && e.method === "pageError") {
          const err = e.params?.error?.error ?? e.params?.error ?? {};
          appLog.push({ level: "error", kind: "pageerror", text: `${err.name ?? "Error"}: ${err.message ?? ""}`.trim(), time: Number(e.time) || 0 });
        }
      }
    } else if (/^\d+-trace\.network$/.test(name)) {
      for (const e of lines(entry)) {
        const s = e.snapshot;
        if (e.type !== "resource-snapshot" || !s?.request) continue;
        const status = Number(s.response?.status ?? 0);
        if (status >= 400 || status === -1 || s.response?._failureText) {
          failedRequests++;
          const label = status > 0 ? `${status} ${s.response?.statusText ?? ""}`.trim() : `échec réseau ${s.response?._failureText ?? ""}`.trim();
          appLog.push({
            level: status >= 500 || status <= 0 ? "error" : "warning",
            kind: "network",
            text: `${s.request.method} ${s.request.url} → ${label}`,
            time: Date.parse(s.startedDateTime) || 0,
          });
        }
      }
    }
  }
  return { steps, appLog, failedRequests };
}
