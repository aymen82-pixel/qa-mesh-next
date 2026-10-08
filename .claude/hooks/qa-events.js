#!/usr/bin/env node
/**
 * Hook d'observabilité (C10) — PreToolUse, PostToolUse, SubagentStop, Stop.
 * Ajoute UNE ligne JSONL par événement dans `.qa/events/<session_id>.jsonl`,
 * lue par `qa-mesh usage`. Ne journalise JAMAIS le contenu des entrées ni des
 * sorties d'outils (secrets, données) : seulement nom d'outil, identifiants,
 * agent, tailles et horodatage. Fichier local, gitignoré : aucune télémétrie.
 *
 * Fail-open : quoi qu'il arrive, exit 0 (l'observabilité ne bloque jamais).
 */
'use strict';

const path = require('node:path');
const { appendFileSync, existsSync, mkdirSync } = require('node:fs');

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
  });
}

function findQaDir(start) {
  let dir = start;
  for (;;) {
    if (existsSync(path.join(dir, '.qa'))) return path.join(dir, '.qa');
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const size = (v) => (v === undefined || v === null ? undefined : Buffer.byteLength(typeof v === 'string' ? v : JSON.stringify(v)));

(async () => {
  try {
    const input = JSON.parse(await readStdin());
    const qaDir = process.env.QA_DIR || findQaDir(input.cwd || process.cwd());
    if (!qaDir) process.exit(0);
    const session = String(input.session_id || 'inconnue').replace(/[^A-Za-z0-9_-]/g, '_');
    const event = {
      ts: new Date().toISOString(),
      event: input.hook_event_name,
      session_id: input.session_id,
      ...(input.tool_name ? { tool: input.tool_name } : {}),
      ...(input.tool_use_id ? { tool_use_id: input.tool_use_id } : {}),
      ...(input.agent_id ? { agent_id: input.agent_id } : {}),
      ...(input.agent_type ? { agent_type: input.agent_type } : {}),
      ...(input.tool_input !== undefined ? { input_bytes: size(input.tool_input) } : {}),
      ...(input.tool_response !== undefined ? { output_bytes: size(input.tool_response) } : {}),
      ...(input.tool_response && typeof input.tool_response === 'object' && input.tool_response.is_error ? { error: true } : {}),
      // Chemins de transcript : pour additionner les tokens, jamais pour les copier.
      ...(input.transcript_path ? { transcript_path: input.transcript_path } : {}),
      ...(input.agent_transcript_path ? { agent_transcript_path: input.agent_transcript_path } : {}),
    };
    const dir = path.join(qaDir, 'events');
    mkdirSync(dir, { recursive: true });
    appendFileSync(path.join(dir, `${session}.jsonl`), JSON.stringify(event) + '\n');
  } catch {
    // fail-open
  }
  process.exit(0);
})();
