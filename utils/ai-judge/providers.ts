/**
 * Fournisseurs du juge IA, par `fetch` natif (aucun SDK, aucune dépendance) :
 * - `anthropic` : API Messages ;
 * - `openai-compatible` : `/v1/chat/completions` (vLLM, Ollama, modèle hébergé en interne…).
 * Les clés et URLs viennent de variables d'environnement NOMMÉES dans la config.
 */
export interface ProviderConfig {
  provider: 'anthropic' | 'openai-compatible';
  model: string;
  /** URL de base (sans /v1). Anthropic : https://api.anthropic.com par défaut. */
  baseUrl?: string;
  apiKey?: string;
  timeoutMs: number;
}

export async function callProvider(cfg: ProviderConfig, system: string, user: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    if (cfg.provider === 'anthropic') {
      if (!cfg.apiKey) throw new Error('aiJudge : clé API Anthropic absente');
      const res = await fetch(`${(cfg.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: cfg.model, max_tokens: 400, temperature: 0, system, messages: [{ role: 'user', content: user }] }),
      });
      if (!res.ok) throw new Error(`aiJudge : fournisseur HTTP ${res.status}`);
      const body = (await res.json()) as { content?: { type: string; text?: string }[] };
      return (body.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
    }
    if (!cfg.baseUrl) throw new Error('aiJudge : URL de base absente pour le fournisseur openai-compatible');
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', ...(cfg.apiKey ? { authorization: ['Bearer', cfg.apiKey].join(' ') } : {}) },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`aiJudge : fournisseur HTTP ${res.status}`);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return body.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}
