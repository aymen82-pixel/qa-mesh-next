/** `qa-mesh errors check|list [--json]` — taxonomie des codes d'échec. */
import { findQaDir, repoRoot } from "../paths";
import { CATALOG } from "../errors/catalog";
import { checkErrorCodes, loadCheckInput } from "../errors/check";

export function runErrors(opts: { mode: "check" | "list"; json?: boolean; qaDir?: string; root?: string }): {
  exitCode: number;
  stdout: string;
} {
  if (opts.mode === "list") {
    return {
      exitCode: 0,
      stdout: opts.json
        ? JSON.stringify(CATALOG)
        : CATALOG.map((e) => `${e.code.padEnd(18)} ${e.class.padEnd(8)}${e.ambiguous ? "ambigu " : "       "} ${e.hint}`).join("\n"),
    };
  }
  const root = opts.root ?? repoRoot(opts.qaDir ?? findQaDir());
  const problems = checkErrorCodes(loadCheckInput(root));
  const ok = problems.length === 0;
  if (opts.json) return { exitCode: ok ? 0 : 1, stdout: JSON.stringify({ ok, problems }) };
  return {
    exitCode: ok ? 0 : 1,
    stdout: ok
      ? `OK taxonomie cohérente — ${CATALOG.length} codes (catalogue, doc, règles, fixtures, contrat agent-5)`
      : ["KO errors check :", ...problems.map((p) => `  - ${p}`)].join("\n"),
  };
}
