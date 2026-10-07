/**
 * `qa-mesh classify --report <playwright.json> [--login-url /login] [--json]`
 *
 * Lit un rapport du reporter JSON Playwright et attribue à chaque test en
 * échec un code du catalogue (kernel/src/errors/catalog.ts), sa classe
 * PRODUIT|SCRIPT|ENV et une piste. 0 token, 0 LLM : l'Agent 5 ne raisonne
 * ensuite que sur les codes `ambiguous` et `UNCLASSIFIED`.
 *
 * `auth.login_url` est lu dans `.qa/qa.config.json` si présent (`--login-url`
 * prioritaire). Exit 0 même s'il y a des échecs (classer n'est pas juger) ;
 * 2 si le rapport est absent ou illisible.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findQaDir } from "../paths";
import { classifyFailure, type Classification } from "../errors/classify";

export interface ClassifyOptions {
  report?: string;
  loginUrl?: string;
  json?: boolean;
  qaDir?: string;
}

export interface ClassifiedTest extends Classification {
  spec: string;
  line?: number;
  title: string;
  project: string;
  status: string;
  /** Attachments utiles au diagnostic (trace, error-context, screenshot). */
  attachments: { name: string; path: string }[];
}

interface PwResult {
  status: string;
  errors?: { message?: string }[];
  error?: { message?: string };
  attachments?: { name: string; path?: string }[];
}
interface PwTest {
  projectName?: string;
  status: string;
  results: PwResult[];
}
interface PwSpec {
  title: string;
  file: string;
  line?: number;
  tests: PwTest[];
}
interface PwSuite {
  title: string;
  file?: string;
  specs?: PwSpec[];
  suites?: PwSuite[];
}

/** Parcourt les suites imbriquées ; ne retient que les tests finalement en échec. */
export function classifyReport(report: { suites?: PwSuite[] }, loginUrl?: string): {
  failures: ClassifiedTest[];
  flaky: number;
} {
  const failures: ClassifiedTest[] = [];
  let flaky = 0;
  const visit = (suite: PwSuite, path: string[]): void => {
    const here = suite.file && suite.title === suite.file ? path : [...path, suite.title];
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests) {
        if (t.status === "flaky") flaky++;
        if (t.status !== "unexpected") continue;
        const last = t.results[t.results.length - 1];
        if (!last) continue;
        const messages = (last.errors?.length ? last.errors : last.error ? [last.error] : [])
          .map((e) => e.message ?? "");
        failures.push({
          spec: spec.file,
          line: spec.line,
          title: [...here, spec.title].filter(Boolean).join(" › "),
          project: t.projectName ?? "",
          status: last.status,
          attachments: (last.attachments ?? [])
            .filter((a) => a.path && ["trace", "error-context", "screenshot"].includes(a.name))
            .map((a) => ({ name: a.name, path: a.path! })),
          ...classifyFailure(messages, { loginUrl }),
        });
      }
    }
    for (const child of suite.suites ?? []) visit(child, here);
  };
  for (const s of report.suites ?? []) visit(s, []);
  return { failures, flaky };
}

function configLoginUrl(qaDir: string | undefined): string | undefined {
  try {
    const dir = qaDir ?? findQaDir();
    const file = join(dir, "qa.config.json");
    if (!existsSync(file)) return undefined;
    return JSON.parse(readFileSync(file, "utf8"))?.auth?.login_url;
  } catch {
    return undefined;
  }
}

export function runClassify(opts: ClassifyOptions): { exitCode: number; stdout: string } {
  const fail = (msg: string) => ({ exitCode: 2, stdout: opts.json ? JSON.stringify({ error: msg }) : msg });
  if (!opts.report) return fail("classify : --report <playwright.json> requis");
  if (!existsSync(opts.report)) return fail(`classify : rapport introuvable : ${opts.report}`);
  let report: { suites?: PwSuite[] };
  try {
    report = JSON.parse(readFileSync(opts.report, "utf8"));
  } catch (e) {
    return fail(`classify : JSON illisible : ${(e as Error).message}`);
  }
  const { failures, flaky } = classifyReport(report, opts.loginUrl ?? configLoginUrl(opts.qaDir));
  const byCode: Record<string, number> = {};
  for (const f of failures) byCode[f.code] = (byCode[f.code] ?? 0) + 1;
  const summary = { failed: failures.length, flaky, by_code: byCode };

  if (opts.json) return { exitCode: 0, stdout: JSON.stringify({ failures, summary }) };
  if (!failures.length) return { exitCode: 0, stdout: `Aucun échec (${flaky} flaky).` };
  const lines = [`${failures.length} échec(s), ${flaky} flaky`];
  for (const f of failures) {
    lines.push(`- ${f.code} [${f.class}${f.ambiguous ? ", ambigu" : ""}] ${f.spec}${f.line ? `:${f.line}` : ""} › ${f.title}`);
    lines.push(`    piste : ${f.hint}`);
  }
  return { exitCode: 0, stdout: lines.join("\n") };
}
