#!/usr/bin/env node
/**
 * Hook PreToolUse (Edit|Write) — applique .claude/rules/testing.md de façon
 * déterministe : un agent ne peut pas écrire un spec qui viole les interdits,
 * ni écrire un jeton (JWT, Bearer, clé sk-…) dans aucun fichier (C7).
 * Exit 0 = autorisé · Exit 2 = bloqué (stderr renvoyé à l'agent pour correction).
 */
'use strict';

const GUARDED_PATH = /(^|[\\/])(tests|pages|fixtures)[\\/].*\.ts$|\.(spec|page|fixture)\.ts$/;

const RULES = [
  {
    pattern: /\bwaitForTimeout\s*\(/,
    message: 'waitForTimeout est interdit — utiliser une assertion web-first auto-retry, waitForURL ou waitForResponse (.claude/rules/testing.md).',
  },
  {
    pattern: /['"`]networkidle['"`]/,
    message: "networkidle est interdit — attendre un élément ou une réponse réseau précise à la place (.claude/rules/testing.md).",
  },
  {
    pattern: /\b(?:test|describe|it)\.only\s*\(/,
    message: 'test.only / describe.only ne doit jamais être committé (.claude/rules/testing.md).',
  },
  {
    pattern: /(?:goto|navigate)\s*\(\s*['"`]https?:\/\//,
    message: "URL en dur interdite — utiliser baseURL (page.goto('/chemin')) (.claude/rules/testing.md).",
  },
  {
    pattern: /\b(?:password|mot_de_passe|passwd)\s*[:=]\s*['"`][^'"`]{4,}['"`]/i,
    message: 'Credentials en dur interdits — utiliser utils/test-data.ts + variables d\'environnement (QA_DEFAULT_PASSWORD, …).',
  },
];

// Formes courantes de jetons (C7) : bloquées sur TOUT chemin écrit par un agent.
// Les gabarits (`${token}`, `<token>`, `...`) ne correspondent pas : les classes
// de caractères excluent `$`, `{`, `<`, et une longueur minimale est exigée.
const TOKEN_RULES = [
  {
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
    message: 'JWT en clair interdit — déclarer un secret (qa.config.json#secrets) et le lire dans l\'environnement.',
  },
  {
    pattern: /\bBearer\s+[A-Za-z0-9\-._~+/]{20,}=*/,
    message: 'Jeton Bearer en clair interdit — utiliser API_TOKEN (variable d\'environnement) via la fixture apiRequest.',
  },
  {
    pattern: /\bsk-(?:ant-|proj-|live_|test_)?[A-Za-z0-9_-]{20,}/,
    message: 'Clé d\'API (sk-…) en clair interdite — la déclarer dans qa.config.json#secrets et la lire dans l\'environnement.',
  },
];

/**
 * C8 : un test qui appelle le juge IA (`x.evaluate(` / `x.judge(` sur aiJudge
 * ou AiJudge) doit contenir au moins une assertion déterministe, c'est-à-dire
 * un `expect(` dont le sujet n'est pas un verdict du juge. Heuristique statique,
 * bloc par bloc (`test(`).
 */
function aiJudgeAlone(content) {
  if (!/aiJudge|AiJudge/.test(content)) return [];
  const offenders = [];
  for (const block of content.split(/\btest\(/).slice(1)) {
    if (!/\.(?:evaluate|judge)\(/.test(block)) continue;
    const verdictVars = [...block.matchAll(/(?:const|let)\s+(\w+)\s*=\s*await\s+\w+\.(?:evaluate|judge)\(/g)].map((m) => m[1]);
    const subjects = [...block.matchAll(/expect\(\s*([^,)]*)/g)].map((m) => m[1].trim());
    const deterministic = subjects.filter(
      (s) => s && !/aiJudge|judge\b/.test(s) && !verdictVars.some((v) => s === v || s.startsWith(`${v}.`)),
    );
    if (!deterministic.length) offenders.push(block.slice(0, 60).split('\n')[0]);
  }
  return offenders;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
  });
}

(async () => {
  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    process.exit(0); // entrée illisible → ne jamais bloquer par accident
  }

  const toolInput = input.tool_input || {};
  const filePath = toolInput.file_path || '';

  // Write → content ; Edit → new_string. On ne contrôle que ce qui est AJOUTÉ.
  const added = [toolInput.content, toolInput.new_string].filter(Boolean).join('\n');
  if (!added) process.exit(0);

  // Jetons : partout. Règles de test (.claude/rules/testing.md) : fichiers de test seulement.
  const rules = GUARDED_PATH.test(filePath) ? [...TOKEN_RULES, ...RULES] : TOKEN_RULES;
  const violations = rules.filter((r) => r.pattern.test(added)).map((r) => `- ${r.message}`);
  if (GUARDED_PATH.test(filePath)) {
    for (const t of aiJudgeAlone(added)) {
      violations.push(`- aiJudge utilisé seul dans « ${t} » : ajouter au moins une assertion déterministe dans le même test (.claude/rules/testing.md).`);
    }
  }

  if (violations.length > 0) {
    console.error(`qa-guard : écriture bloquée dans ${filePath}\n${violations.join('\n')}`);
    process.exit(2);
  }
  process.exit(0);
})();
