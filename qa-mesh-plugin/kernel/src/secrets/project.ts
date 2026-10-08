/**
 * Redacteur du projet : registre de `.qa/qa.config.json` + valeurs lues dans
 * l'environnement du processus. Utilisé par toute commande kernel qui écrit
 * un fichier lisible (journal, rapports, trace.md, findings).
 *
 * Fail-closed : un secret trop court fait échouer la commande (comme une
 * config invalide) plutôt que d'écrire un artefact mal masqué.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildRedactor, resolveSecrets, secretRegistry, type Redactor, type SecretRef } from "./redact";

export function readProjectConfig(qaDir: string): unknown {
  const file = join(qaDir, "qa.config.json");
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, "utf8"));
}

export function projectSecretRefs(qaDir: string): SecretRef[] {
  return secretRegistry(readProjectConfig(qaDir));
}

export function projectRedactor(qaDir: string, env: Record<string, string | undefined> = process.env): Redactor {
  return buildRedactor(resolveSecrets(projectSecretRefs(qaDir), env));
}
