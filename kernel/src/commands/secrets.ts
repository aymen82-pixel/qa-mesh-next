/**
 * `qa-mesh secrets list [--json]` — registre des secrets (noms, variable, présence).
 *   N'affiche JAMAIS une valeur, ni sa longueur.
 * `qa-mesh redact <fichier|-> [--in-place]` — masque les secrets du registre
 *   dans un texte ou un JSON (toutes les chaînes, clés comprises).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { findQaDir } from "../paths";
import { redactDeep } from "../secrets/redact";
import { projectRedactor, projectSecretRefs } from "../secrets/project";

export interface SecretsOutcome {
  exitCode: number;
  stdout: string;
}

export function runSecretsList(opts: { json?: boolean; qaDir?: string; env?: Record<string, string | undefined> }): SecretsOutcome {
  const env = opts.env ?? process.env;
  const rows = projectSecretRefs(opts.qaDir ?? findQaDir()).map((r) => ({ name: r.name, env: r.env, present: !!env[r.env] }));
  if (opts.json) return { exitCode: 0, stdout: JSON.stringify(rows) };
  if (!rows.length) return { exitCode: 0, stdout: "Aucun secret déclaré (qa.config.json#secrets, roles[].password_env)." };
  return {
    exitCode: 0,
    stdout: rows.map((r) => `${r.name.padEnd(24)} ${r.env.padEnd(28)} ${r.present ? "défini" : "absent"}`).join("\n"),
  };
}

export function runRedact(opts: {
  file?: string;
  inPlace?: boolean;
  qaDir?: string;
  env?: Record<string, string | undefined>;
  stdin?: string;
}): SecretsOutcome {
  if (!opts.file) return { exitCode: 2, stdout: "redact : <fichier> ou '-' (stdin) requis" };
  if (opts.inPlace && opts.file === "-") return { exitCode: 2, stdout: "redact : --in-place impossible sur stdin" };
  const redact = projectRedactor(opts.qaDir ?? findQaDir(), opts.env ?? process.env);
  const text = opts.file === "-" ? (opts.stdin ?? readFileSync(0, "utf8")) : readFileSync(opts.file, "utf8");
  let out: string;
  try {
    out = JSON.stringify(redactDeep(JSON.parse(text), redact), null, 2) + "\n";
  } catch {
    out = redact(text);
  }
  if (opts.inPlace) {
    writeFileSync(opts.file, out, "utf8");
    return { exitCode: 0, stdout: `OK redacté — ${opts.file}` };
  }
  return { exitCode: 0, stdout: out.replace(/\n$/, "") };
}
