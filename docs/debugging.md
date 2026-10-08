# Diagnostiquer un échec : `trace.md`

Chaque test en échec a une page `trace.md` lisible par un humain et par les
Agents 5 et 6 — qui ne lisent **jamais** le `trace.zip` brut. Structure inspirée
des pages de trace de tester-army/e2e (Apache-2.0, voir `NOTICE`).

```bash
PLAYWRIGHT_JSON_OUTPUT_NAME=.qa/runs/<run_id>/playwright.json \
  npx playwright test <specs> --reporter=json
node kernel/dist/cli.js trace render --run <run_id> --report .qa/runs/<run_id>/playwright.json
# -> .qa/runs/<run_id>/results/<test>-<hash>/trace.md
```

Prérequis : `trace: 'retain-on-failure'` dans `playwright.config.ts` (réglage du
dépôt). Sans trace.zip, la page est rendue quand même depuis le rapport JSON,
avec la mention « Trace indisponible ».

## Contenu de la page

| Section | Source | Borne |
| --- | --- | --- |
| En-tête : code, classe, piste, message, `Look at` | rapport JSON + `qa-mesh classify` (`docs/errors.md`) | message ≤ 600 caractères |
| Étapes du test (✓/✗, durée, ligne) | `test.trace` du trace.zip | 40 dernières |
| Journal de l'application : console error/warning/info, erreurs de page, requêtes 4xx/5xx | `*-trace.trace`, `*-trace.network` | 50 lignes, erreurs d'abord |
| Écran à l'échec (snapshot d'accessibilité YAML) | attachment `error-context.md` | 120 lignes |
| Pièces (trace.zip, error-context, captures) | attachments | — |

Toute la page passe par la redaction des secrets (`docs/security.md`).

## Lire la page

- Une assertion qui a lu la même valeur pendant toute l'attente : attendu faux,
  ou état que l'application n'atteint jamais — regarder le journal (une requête
  5xx l'explique souvent).
- `LOCATOR_NOT_FOUND` : comparer le nom cherché au snapshot d'accessibilité.
- `ACTION_FAILED` : l'élément existe (snapshot) mais n'est pas actionnable.
- Requalifier un code ambigu (Agent 5) uniquement à partir de cette page, avec
  `failure.requalified_reason`.

Le format interne du trace.zip n'est pas une API publique de Playwright : le
lecteur (`kernel/src/trace/`) est tolérant et testé sur un trace réel de
Playwright 1.56 ; le vérifier à chaque montée de version.
