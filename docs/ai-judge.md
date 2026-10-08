# Juge IA (`aiJudge`) pour sorties non déterministes

Quand une réponse GenAI ou RAG ne peut pas être vérifiée par égalité exacte,
la fixture `aiJudge` demande un verdict à un modèle. Elle est **désactivée par
défaut** et ne remplace jamais une assertion déterministe. Inspirée de
`agent.assert` de tester-army/e2e (Apache-2.0, voir `NOTICE`).

## Configuration (`.qa/qa.config.json`)

```json
"ai_judge": {
  "enabled": true,
  "provider": "anthropic",
  "model": "claude-sonnet-4-5",
  "api_key_env": "ANTHROPIC_API_KEY",
  "min_confidence": 0.8,
  "cache": true
}
```

- `provider` : `anthropic` (API Messages) ou `openai-compatible`
  (`/v1/chat/completions` : vLLM, Ollama, modèle hébergé en interne ; URL dans
  la variable nommée par `base_url_env`).
- Appels par `fetch` natif : aucun SDK, aucune dépendance ajoutée.
- `cache` : verdicts mis en cache dans `.qa/ai-judge-cache/` par hash de
  (fournisseur, modèle, version du prompt, critère, sortie, contexte).

## Utilisation

```ts
import { test, expect } from '../../fixtures/pages.fixture';

test('RAG-NOM-01: la réponse cite le bon délai @rag', async ({ page, aiJudge }) => {
  // … obtenir `answer` depuis l'application …
  expect(answer, 'assertion déterministe : le chiffre attendu est présent').toContain('14 jours');
  const verdict = await aiJudge.evaluate({
    output: answer,
    criterion: 'La réponse indique un délai de rétractation de 14 jours et cite une source du corpus.',
    context: 'Question posée : quel est le délai de rétractation ?',
  });
  expect(verdict.ok, verdict.reason).toBe(true);
});
```

- `evaluate` renvoie `{ pass, confidence, reason, ok, cached }` ; `ok` = `pass`
  et `confidence >= min_confidence`.
- Verdict validé par un schéma Zod strict ; une réponse illisible a droit à une
  réparation, puis le test échoue avec un message explicite.
- Le texte envoyé passe par la redaction des secrets ; seule donnée qui quitte
  la machine, et uniquement vers le fournisseur configuré.
- Désactivé : tout test qui demande `aiJudge` est sauté avec un message.

## Règles

- **Jamais seul** : au moins une assertion déterministe dans le même test.
  `qa-guard` bloque l'écriture d'un test qui juge par IA sans assertion
  déterministe.
- Formuler le critère comme une exigence observable, juger le sens et pas la
  formulation exacte.
- Le juge vit côté tests ; le kernel reste sans appel LLM.

Preuve : `tests/ai-judge/ai-judge.spec.ts` (fournisseur simulé en local : pass,
seuil, réparation, cache, redaction, désactivation).
