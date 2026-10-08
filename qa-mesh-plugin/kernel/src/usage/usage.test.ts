import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aggregate, MAIN, transcriptTokens, type HookEvent } from "./aggregate";
import { runUsage } from "../commands/usage";

const t = (s: number) => new Date(Date.parse("2026-10-08T10:00:00Z") + s * 1000).toISOString();
const ev = (o: Partial<HookEvent>): HookEvent => ({ ts: t(0), event: "PreToolUse", session_id: "s1", ...o });

test("aggregate : appels, durée Pre->Post, erreurs, par agent", () => {
  const events = [
    ev({ ts: t(0), tool: "Bash", tool_use_id: "a" }),
    ev({ ts: t(2), event: "PostToolUse", tool: "Bash", tool_use_id: "a", output_bytes: 100 }),
    ev({ ts: t(3), tool: "mcp__playwright-test__browser_click", tool_use_id: "b", agent_type: "qa-explorer" }),
    ev({ ts: t(4), event: "PostToolUse", tool_use_id: "b", agent_type: "qa-explorer", error: true }),
    ev({ ts: t(5), tool: "mcp__playwright-test__browser_click", tool_use_id: "c", agent_type: "qa-explorer" }),
  ];
  const rows = aggregate(events);
  const explorer = rows.find((r) => r.agent === "qa-explorer")!;
  assert.equal(explorer.calls, 2);
  assert.equal(explorer.errors, 1);
  assert.equal(explorer.tool_ms, 1000);
  assert.deepEqual(explorer.top_tools, [{ tool: "mcp__playwright-test__browser_click", calls: 2 }]);
  assert.equal(rows.find((r) => r.agent === MAIN)!.tool_ms, 2000);
});

test("transcriptTokens : somme des usages assistant, dédoublonnés par message", () => {
  const lines = [
    { type: "user", message: { content: "x" } },
    { type: "assistant", message: { id: "m1", usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100 } } },
    { type: "assistant", message: { id: "m1", usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100 } } },
    { type: "assistant", message: { id: "m2", usage: { input_tokens: 1, output_tokens: 2 } } },
  ];
  assert.deepEqual(transcriptTokens(lines), { input: 11, output: 7, cache_read: 100, cache_creation: 0 });
});

test("usage : lit .qa/events + transcripts, borne la sortie, ignore les lignes corrompues", () => {
  const qaDir = join(mkdtempSync(join(tmpdir(), "qa-mesh-usage-")), ".qa");
  mkdirSync(join(qaDir, "events"), { recursive: true });
  const transcript = join(qaDir, "sub.jsonl");
  writeFileSync(transcript, JSON.stringify({ type: "assistant", message: { id: "m", usage: { input_tokens: 1200, output_tokens: 300 } } }) + "\n");
  const lines = [
    ev({ tool: "Bash", tool_use_id: "a" }),
    ev({ ts: t(1), event: "PostToolUse", tool_use_id: "a" }),
    ev({ ts: t(2), event: "SubagentStop", agent_type: "qa-explorer", agent_transcript_path: transcript }),
  ].map((e) => JSON.stringify(e));
  writeFileSync(join(qaDir, "events", "s1.jsonl"), [...lines, "{ligne corrompue"].join("\n"));
  const out = JSON.parse(runUsage({ qaDir, json: true }).stdout);
  assert.equal(out.events, 3);
  assert.deepEqual(out.agents.find((a: any) => a.agent === "qa-explorer").tokens, { input: 1200, output: 300, cache_read: 0, cache_creation: 0 });
  assert.match(runUsage({ qaDir }).stdout, /qa-explorer/);
  assert.equal(JSON.parse(runUsage({ qaDir, json: true, top: 1 }).stdout).agents.length, 1);
});

test("usage : sans événement, message explicite ; run inconnu -> exit 2", () => {
  const qaDir = join(mkdtempSync(join(tmpdir(), "qa-mesh-usage-")), ".qa");
  mkdirSync(qaDir, { recursive: true });
  assert.match(runUsage({ qaDir }).stdout, /Aucun événement/);
  mkdirSync(join(qaDir, "events"));
  assert.equal(runUsage({ qaDir, run: "2026-01-01-001" }).exitCode, 2);
});
