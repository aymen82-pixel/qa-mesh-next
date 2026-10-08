/**
 * `qa-mesh trace render --run <id> --report <playwright.json> [--login-url /login] [--json]`
 *
 * Écrit `.qa/runs/<id>/results/<test>/trace.md` pour chaque test en échec :
 * code du catalogue (C5), étapes, journal de l'application (console, erreurs
 * de page, requêtes 4xx/5xx), snapshot d'accessibilité à l'échec. Tout le
 * contenu passe par la redaction des secrets (C7). Les Agents 5 et 6 lisent
 * ces pages, jamais les traces brutes.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { findQaDir, repoRoot, runDir } from "../paths";
import { classifyReport, configLoginUrl } from "./classify";
import { readZip } from "../trace/zip";
import { parseTrace, type ParsedTrace } from "../trace/parse";
import { extractAriaSnapshot, renderTracePage } from "../trace/render";
import { projectRedactor } from "../secrets/project";

export interface TraceOptions {
  run?: string;
  report?: string;
  loginUrl?: string;
  json?: boolean;
  qaDir?: string;
  env?: Record<string, string | undefined>;
}

function slug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function testDirName(spec: string, title: string, project: string): string {
  const hash = createHash("sha1").update(`${spec}\u0000${title}\u0000${project}`).digest("hex").slice(0, 8);
  return `${slug(title) || "test"}-${hash}`;
}

export function runTraceRender(opts: TraceOptions): { exitCode: number; stdout: string } {
  const fail = (msg: string) => ({ exitCode: 2, stdout: opts.json ? JSON.stringify({ error: msg }) : msg });
  if (!opts.run || !opts.report) return fail("trace render : --run <id> et --report <playwright.json> requis");
  const qaDir = opts.qaDir ?? findQaDir();
  const root = repoRoot(qaDir);
  const reportPath = resolve(opts.report);
  if (!existsSync(reportPath)) return fail(`trace render : rapport introuvable : ${opts.report}`);

  let report: unknown;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (e) {
    return fail(`trace render : JSON illisible : ${(e as Error).message}`);
  }
  const redact = projectRedactor(qaDir, opts.env ?? process.env);
  const abs = (p: string) => (isAbsolute(p) ? p : join(root, p));
  const relPath = (p: string) => relative(root, abs(p)).split("\\").join("/");

  const { failures } = classifyReport(report as never, opts.loginUrl ?? configLoginUrl(qaDir));
  const written: { title: string; code: string; class: string; trace_path: string }[] = [];
  for (const f of failures) {
    const traceZip = f.attachments.find((a) => a.name === "trace");
    const errorContext = f.attachments.find((a) => a.name === "error-context");
    let trace: ParsedTrace | null = null;
    let traceUnavailable: string | undefined;
    if (traceZip && existsSync(abs(traceZip.path))) {
      try {
        trace = parseTrace(readZip(readFileSync(abs(traceZip.path))), root);
      } catch (e) {
        traceUnavailable = `trace.zip illisible (${(e as Error).message})`;
      }
    } else {
      traceUnavailable = traceZip ? "trace.zip référencé mais absent du disque" : undefined;
    }
    const aria =
      errorContext && existsSync(abs(errorContext.path)) ? extractAriaSnapshot(readFileSync(abs(errorContext.path), "utf8")) : undefined;

    const page = renderTracePage({
      title: f.title,
      spec: f.spec,
      line: f.line,
      project: f.project,
      status: f.status,
      durationMs: f.durationMs,
      classification: f,
      lookAt: f.errorLocation ? `${relPath(f.errorLocation.file)}:${f.errorLocation.line}` : undefined,
      trace,
      traceUnavailable,
      ariaSnapshot: aria,
      attachments: f.attachments.map((a) => ({ name: a.name, path: relPath(a.path) })),
    });

    const dir = join(runDir(qaDir, opts.run), "results", testDirName(f.spec, f.title, f.project));
    mkdirSync(dir, { recursive: true });
    const out = join(dir, "trace.md");
    writeFileSync(out, redact(page), "utf8");
    written.push({ title: redact(f.title), code: f.code, class: f.class, trace_path: relPath(out) });
  }

  if (opts.json) return { exitCode: 0, stdout: JSON.stringify({ written }) };
  if (!written.length) return { exitCode: 0, stdout: "Aucun échec : aucune page trace.md écrite." };
  return { exitCode: 0, stdout: [`${written.length} page(s) trace.md :`, ...written.map((w) => `- ${w.code} ${w.trace_path}`)].join("\n") };
}
