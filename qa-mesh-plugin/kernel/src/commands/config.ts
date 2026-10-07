/**
 * `qa-mesh config check [fichier] [--json]` — valide la configuration projet
 * contre `.qa/contracts/qa-config.schema.json`. Défaut : `.qa/qa.config.json`.
 * Exit 0 conforme · 1 non conforme · 2 fichier absent ou JSON illisible.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { findQaDir } from "../paths";
import { ContractRegistry, validateConfig } from "../contracts";

export interface ConfigOptions {
  file?: string;
  json?: boolean;
  qaDir?: string;
}

export interface ConfigOutcome {
  exitCode: number;
  stdout: string;
}

export function runConfigCheck(opts: ConfigOptions): ConfigOutcome {
  const qaDir = opts.qaDir ?? findQaDir();
  const file = opts.file ? resolve(opts.file) : join(qaDir, "qa.config.json");
  const out = (exitCode: number, payload: unknown, human: string): ConfigOutcome => ({
    exitCode,
    stdout: opts.json ? JSON.stringify(payload) : human,
  });

  if (!existsSync(file)) {
    return out(2, { valid: false, error: `fichier introuvable : ${file}` },
      `config check : ${file} introuvable (cp .qa/qa.config.example.json .qa/qa.config.json)`);
  }
  let doc: unknown;
  try {
    doc = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    return out(2, { valid: false, error: `JSON invalide : ${(e as Error).message}` },
      `config check : JSON invalide dans ${file} — ${(e as Error).message}`);
  }
  const result = validateConfig(ContractRegistry.load(qaDir), doc);
  if (result.valid) return out(0, { valid: true, file }, `OK config conforme — ${file}`);
  const lines = [`KO config non conforme — ${file}`];
  for (const e of result.errors) lines.push(`  ${e.path} ${e.message}`);
  return out(1, { valid: false, file, errors: result.errors }, lines.join("\n"));
}
