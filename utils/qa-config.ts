import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

/**
 * Lecture de `.qa/qa.config.json` côté tests (seul fichier de données projet).
 * `$QA_DIR` prioritaire, sinon recherche ascendante depuis ce fichier — même
 * résolution que le kernel. Config absente : objet vide (les tests qui en
 * dépendent se sautent explicitement).
 */
export interface QaRole {
  name: string;
  username_env: string;
  password_env: string;
  default?: boolean;
}

export interface QaConfig {
  base_url?: string;
  roles?: QaRole[];
  auth?: { login_url?: string; session_ttl_hours?: number };
  secrets?: { name: string; env: string }[];
}

export function qaDir(): string | undefined {
  if (process.env.QA_DIR && existsSync(process.env.QA_DIR)) return resolve(process.env.QA_DIR);
  let dir = resolve(__dirname);
  for (;;) {
    if (existsSync(join(dir, '.qa'))) return join(dir, '.qa');
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export function loadQaConfig(): QaConfig {
  const dir = qaDir();
  const file = dir ? join(dir, 'qa.config.json') : undefined;
  if (!file || !existsSync(file)) return {};
  return JSON.parse(readFileSync(file, 'utf8')) as QaConfig;
}
