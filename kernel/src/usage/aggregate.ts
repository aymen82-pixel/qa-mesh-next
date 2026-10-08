/**
 * Agrégation PURE des événements de hooks (`.qa/events/*.jsonl`) et des
 * transcripts Claude Code : appels d'outils, durée, erreurs et tokens par
 * agent. Sortie bornée, lecture seule (discipline de `unbox-ai` : partir large,
 * puis zoomer). Aucune donnée ne quitte la machine.
 */

export interface HookEvent {
  ts: string;
  event: string;
  session_id?: string;
  tool?: string;
  tool_use_id?: string;
  agent_id?: string;
  agent_type?: string;
  input_bytes?: number;
  output_bytes?: number;
  error?: boolean;
  transcript_path?: string;
  agent_transcript_path?: string;
}

export interface Tokens {
  input: number;
  output: number;
  cache_read: number;
  cache_creation: number;
}

export interface AgentUsage {
  agent: string;
  calls: number;
  errors: number;
  tool_ms: number;
  output_bytes: number;
  top_tools: { tool: string; calls: number }[];
  tokens?: Tokens;
}

export const MAIN = "principal";

/** Lignes JSONL tolérantes (une ligne illisible est ignorée, jamais fatale). */
export function parseJsonl<T>(text: string): T[] {
  return text.split("\n").flatMap((l) => {
    if (!l.trim()) return [];
    try {
      return [JSON.parse(l) as T];
    } catch {
      return [];
    }
  });
}

/** Somme des `message.usage` des réponses assistant d'un transcript (dédoublonnées par message.id). */
export function transcriptTokens(lines: any[]): Tokens {
  const t: Tokens = { input: 0, output: 0, cache_read: 0, cache_creation: 0 };
  const seen = new Set<string>();
  for (const l of lines) {
    const m = l?.message;
    const u = m?.usage;
    if (l?.type !== "assistant" || !u) continue;
    const id = m.id ?? l.uuid;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    t.input += u.input_tokens ?? 0;
    t.output += u.output_tokens ?? 0;
    t.cache_read += u.cache_read_input_tokens ?? 0;
    t.cache_creation += u.cache_creation_input_tokens ?? 0;
  }
  return t;
}

export function inWindow(e: HookEvent, from?: number, to?: number): boolean {
  const ms = Date.parse(e.ts);
  return (from === undefined || ms >= from) && (to === undefined || ms <= to);
}

/**
 * Regroupe par agent (`agent_type`, sinon session principale). Durée = Post -
 * Pre du même `tool_use_id`. `tokensByAgent` vient des transcripts, si lus.
 */
export function aggregate(events: HookEvent[], tokensByAgent: Map<string, Tokens> = new Map(), top = 5): AgentUsage[] {
  const pre = new Map<string, HookEvent>();
  const by = new Map<string, { calls: number; errors: number; ms: number; bytes: number; tools: Map<string, number> }>();
  const bucket = (agent: string) => {
    if (!by.has(agent)) by.set(agent, { calls: 0, errors: 0, ms: 0, bytes: 0, tools: new Map() });
    return by.get(agent)!;
  };
  for (const e of [...events].sort((a, b) => a.ts.localeCompare(b.ts))) {
    const agent = e.agent_type ?? MAIN;
    if (e.event === "PreToolUse" && e.tool_use_id) {
      pre.set(e.tool_use_id, e);
      const b = bucket(agent);
      b.calls++;
      b.tools.set(e.tool ?? "?", (b.tools.get(e.tool ?? "?") ?? 0) + 1);
    } else if (e.event === "PostToolUse" || e.event === "PostToolUseFailure") {
      const b = bucket(agent);
      const start = e.tool_use_id ? pre.get(e.tool_use_id) : undefined;
      if (start) b.ms += Math.max(0, Date.parse(e.ts) - Date.parse(start.ts));
      b.bytes += e.output_bytes ?? 0;
      if (e.error || e.event === "PostToolUseFailure") b.errors++;
    }
  }
  for (const agent of tokensByAgent.keys()) bucket(agent);
  return [...by.entries()]
    .map(([agent, b]) => ({
      agent,
      calls: b.calls,
      errors: b.errors,
      tool_ms: b.ms,
      output_bytes: b.bytes,
      top_tools: [...b.tools.entries()].sort((x, y) => y[1] - x[1]).slice(0, top).map(([tool, calls]) => ({ tool, calls })),
      ...(tokensByAgent.has(agent) ? { tokens: tokensByAgent.get(agent)! } : {}),
    }))
    .sort((a, b) => b.calls - a.calls || a.agent.localeCompare(b.agent));
}
