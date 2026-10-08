/**
 * `qa-mesh usage [--run <id>] [--session <id>] [--top N] [--json]`
 *
 * Par agent : appels d'outils, erreurs, durée cumulée des outils, octets
 * produits et tokens (lus dans les transcripts Claude Code quand ils sont
 * disponibles). `--run` borne la fenêtre au run (journal `pipeline.log` ou
 * exploration). Lecture seule, sortie bornée (N lignes).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { findQaDir, runDir } from "../paths";
import { aggregate, inWindow, MAIN, parseJsonl, transcriptTokens, type HookEvent, type Tokens } from "../usage/aggregate";

export interface UsageOptions {
  run?: string;
  session?: string;
  top?: number;
  json?: boolean;
  qaDir?: string;
}

/**
 * Fenêtre temporelle d'un run : horodatages du journal (`pipeline.log`) et, à
 * défaut, dates de modification des fichiers du run. Marge d'une minute.
 */
function runWindow(qaDir: string, runId: string): { from?: number; to?: number } {
  const dir = runDir(qaDir, runId);
  if (!existsSync(dir)) return {};
  const stamps: number[] = [];
  const log = join(dir, "pipeline.log");
  if (existsSync(log)) {
    for (const e of parseJsonl<{ start?: string; end?: string }>(readFileSync(log, "utf8"))) {
      for (const t of [e.start, e.end]) if (t) stamps.push(Date.parse(t));
    }
  }
  const walk = (d: string): void => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name);
      if (f.isDirectory()) walk(p);
      else stamps.push(statSync(p).mtimeMs);
    }
  };
  walk(dir);
  if (!stamps.length) return {};
  return { from: Math.min(...stamps) - 60_000, to: Math.max(...stamps) + 60_000 };
}

export function runUsage(opts: UsageOptions): { exitCode: number; stdout: string } {
  const qaDir = opts.qaDir ?? findQaDir();
  const dir = join(qaDir, "events");
  if (!existsSync(dir)) {
    const msg = "Aucun événement : le hook .claude/hooks/qa-events.js n'a encore rien enregistré (.qa/events/).";
    return { exitCode: 0, stdout: opts.json ? JSON.stringify({ agents: [], note: msg }) : msg };
  }
  let events: HookEvent[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".jsonl"))) {
    events.push(...parseJsonl<HookEvent>(readFileSync(join(dir, f), "utf8")));
  }
  if (opts.session) events = events.filter((e) => e.session_id === opts.session);
  if (opts.run) {
    const { from, to } = runWindow(qaDir, opts.run);
    if (from === undefined) return { exitCode: 2, stdout: opts.json ? JSON.stringify({ error: `run ${opts.run} introuvable` }) : `usage : run ${opts.run} introuvable` };
    events = events.filter((e) => inWindow(e, from, to));
  }

  // Tokens : transcript principal par session, transcripts de subagents via SubagentStop.
  const tokens = new Map<string, Tokens>();
  const add = (agent: string, t: Tokens) => {
    const cur = tokens.get(agent) ?? { input: 0, output: 0, cache_read: 0, cache_creation: 0 };
    tokens.set(agent, { input: cur.input + t.input, output: cur.output + t.output, cache_read: cur.cache_read + t.cache_read, cache_creation: cur.cache_creation + t.cache_creation });
  };
  const readTranscript = (p: string) => (existsSync(p) ? transcriptTokens(parseJsonl(readFileSync(p, "utf8"))) : null);
  const mains = new Set(events.filter((e) => e.transcript_path && !e.agent_type).map((e) => e.transcript_path!));
  for (const p of mains) {
    const t = readTranscript(p);
    if (t) add(MAIN, t);
  }
  for (const e of events.filter((x) => x.event === "SubagentStop" && x.agent_transcript_path)) {
    const t = readTranscript(e.agent_transcript_path!);
    if (t) add(e.agent_type ?? "subagent", t);
  }

  const top = Math.max(1, Math.min(opts.top ?? 20, 100));
  const agents = aggregate(events, tokens).slice(0, top);
  const total = { events: events.length, sessions: new Set(events.map((e) => e.session_id)).size };
  if (opts.json) return { exitCode: 0, stdout: JSON.stringify({ ...total, agents }) };
  if (!agents.length) return { exitCode: 0, stdout: "Aucun appel d'outil dans la fenêtre demandée." };
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  const lines = [
    `${total.events} événement(s), ${total.sessions} session(s)${opts.run ? ` · run ${opts.run}` : ""}`,
    "",
    "agent                     appels  erreurs  outils(s)  tokens in/out (cache lu)   outils principaux",
  ];
  for (const a of agents) {
    const tok = a.tokens ? `${k(a.tokens.input)}/${k(a.tokens.output)} (${k(a.tokens.cache_read)})` : "-";
    lines.push(
      `${a.agent.padEnd(25).slice(0, 25)} ${String(a.calls).padStart(6)}  ${String(a.errors).padStart(7)}  ${(a.tool_ms / 1000).toFixed(1).padStart(9)}  ${tok.padEnd(25)}  ${a.top_tools.map((t) => `${t.tool.replace("mcp__playwright-test__", "")}×${t.calls}`).join(", ")}`,
    );
  }
  return { exitCode: 0, stdout: lines.join("\n") };
}
