// Juge IA (C8) contre un fournisseur compatible OpenAI SIMULÉ en local :
// aucun appel réseau externe, aucune clé. Chaque test combine le verdict du
// juge avec une assertion déterministe (règle du projet).

import { createServer, type Server } from 'http';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { test, expect } from '../../fixtures/pages.fixture';
import { AiJudge, type AiJudgeConfig } from '../../utils/ai-judge/judge';
import { uniqueId } from '../../utils/test-data';

const PORT = 47123;
let replies: string[] = [];
let received: string[] = [];
let server: Server;

const config = (over: Partial<AiJudgeConfig> = {}): AiJudgeConfig => ({
  enabled: true,
  provider: 'openai-compatible',
  model: 'juge-local',
  baseUrl: `http://127.0.0.1:${PORT}`,
  minConfidence: 0.8,
  maxInputChars: 5000,
  timeoutMs: 5000,
  ...over,
});
const reply = (content: string) => JSON.stringify({ choices: [{ message: { content } }] });

test.describe.configure({ mode: 'serial' });

test.describe('aiJudge — juge IA des sorties non déterministes', () => {
  test.beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push(body);
        res.writeHead(200, { 'content-type': 'application/json' }).end(reply(replies.shift() ?? '{}'));
      });
    });
    await new Promise<void>((r) => server.listen(PORT, '127.0.0.1', () => r()));
  });
  test.afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });
  test.beforeEach(() => {
    replies = [];
    received = [];
  });

  test.use({ aiJudgeConfig: config() });

  // @scenario AIJ-NOM-01
  test('AIJ-NOM-01: verdict positif au-dessus du seuil', async ({ aiJudge }) => {
    const answer = 'Selon la note 12, le délai de rétractation est de 14 jours.';
    replies = ['{"pass": true, "confidence": 0.93, "reason": "cite la source et le bon délai"}'];
    const verdict = await aiJudge.evaluate({ output: answer, criterion: 'La réponse donne un délai de 14 jours et cite une source.' });
    expect(answer, 'assertion déterministe : le chiffre attendu est présent').toContain('14 jours');
    expect(verdict.ok, verdict.reason).toBe(true);
  });

  // @scenario AIJ-LIM-01
  test('AIJ-LIM-01: pass sous le seuil de confiance -> non ok', async ({ aiJudge }) => {
    replies = ['{"pass": true, "confidence": 0.5, "reason": "hésitant"}'];
    const output = 'peut-être 14 jours';
    const verdict = await aiJudge.evaluate({ output, criterion: 'délai exact' });
    expect(output, 'assertion déterministe : un délai est mentionné').toMatch(/\d+ jours/);
    expect(verdict.pass, 'le juge a dit pass').toBe(true);
    expect(verdict.ok, 'mais sous minConfidence (0.8) : refusé').toBe(false);
  });

  // @scenario AIJ-ERR-01
  test('AIJ-ERR-01: réponse invalide réparée une fois, puis échec explicite', async ({ aiJudge }) => {
    replies = ['pas du JSON', '{"pass": false, "confidence": 0.9, "reason": "hors sujet"}'];
    const repaired = await aiJudge.evaluate({ output: 'bonjour', criterion: 'donne un délai' });
    expect(repaired.ok, 'réparation acceptée, verdict négatif').toBe(false);
    expect(received.length, 'exactement deux appels (une réparation)').toBe(2);

    replies = ['toujours pas', 'encore non'];
    await expect(aiJudge.evaluate({ output: 'autre sortie', criterion: 'donne un délai' }), 'refus après une réparation').rejects.toThrow(/invalide après une réparation/);
  });

  // @scenario AIJ-NOM-02
  test('AIJ-NOM-02: cache par hash de l\'entrée — un jugement payé une seule fois', async () => {
    const judge = new AiJudge(config({ cacheDir: mkdtempSync(join(tmpdir(), 'ai-judge-')) }));
    const input = { output: uniqueId('sortie'), criterion: 'non vide' };
    replies = ['{"pass": true, "confidence": 0.99, "reason": "ok"}'];
    const first = await judge.evaluate(input);
    const second = await judge.evaluate(input);
    expect(first.cached, '1er appel : fournisseur').toBe(false);
    expect(second.cached, '2e appel : cache').toBe(true);
    expect(received.length, 'un seul appel réseau').toBe(1);
  });

  // @scenario AIJ-SEC-01
  test('AIJ-SEC-01: les secrets sont redactés avant envoi au fournisseur', async () => {
    process.env.QA_JUDGE_TOKEN = uniqueId('jeton-du-juge');
    const value = process.env.QA_JUDGE_TOKEN;
    const judge = new AiJudge(config(), (t) => t.split(value).join('<secret:token>'));
    replies = ['{"pass": true, "confidence": 0.9, "reason": "ok"}'];
    await judge.evaluate({ output: `réponse contenant ${value}`, criterion: 'non vide' });
    expect(received[0], 'la valeur ne quitte pas la machine').not.toContain(value);
    expect(received[0], 'le marqueur la remplace').toContain('<secret:token>');
  });
});

test.describe('aiJudge désactivé', () => {
  test.use({ aiJudgeConfig: config({ enabled: false }) });

  // @scenario AIJ-OFF-01
  test('AIJ-OFF-01: désactivé par défaut -> le test est sauté', async ({ aiJudge }) => {
    // Jamais exécuté : la fixture saute le test quand le juge est désactivé.
    expect(aiJudge, 'inatteignable').toBeUndefined();
  });
});
