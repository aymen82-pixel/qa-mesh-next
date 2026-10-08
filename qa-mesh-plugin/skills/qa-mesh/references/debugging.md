# Lire un échec : codes et trace.md

1. Exécuter avec le reporter JSON dans le run :
   `PLAYWRIGHT_JSON_OUTPUT_NAME=.qa/runs/<id>/playwright.json npx playwright test <specs> --reporter=json`
2. Classer : `node kernel/dist/cli.js classify --report .qa/runs/<id>/playwright.json --json`
   — un code par échec (`errors list` pour le catalogue), sa classe et une piste.
3. Rendre les pages : `node kernel/dist/cli.js trace render --run <id> --report .qa/runs/<id>/playwright.json`
   — `.qa/runs/<id>/results/<test>/trace.md`.
4. Lire `trace.md`, jamais le `trace.zip` : en-tête (code, Expected/Received,
   ligne), étapes ✓/✗, journal de l'application (erreurs console, requêtes
   4xx/5xx), snapshot d'accessibilité à l'échec.

| Signe dans trace.md | Lecture |
| --- | --- |
| L'assertion a lu la même valeur toute l'attente | attendu faux, ou état jamais atteint : chercher une requête 5xx dans le journal |
| `LOCATOR_NOT_FOUND` et le nom existe sous une autre forme dans le snapshot | sélecteur périmé (SCRIPT) |
| `LOCATOR_NOT_FOUND` et l'élément manque du snapshot alors que le scénario l'exige | requalifier PRODUIT avec motif |
| `ACTION_FAILED` | l'élément existe mais n'est pas actionnable : attendre l'état, fermer l'overlay |
| `ENV_UNREACHABLE`, `AUTH_EXPIRED` | ne pas réparer : environnement ou `session refresh` |

Règles : seuls les codes ambigus se requalifient, avec `failure.requalified_reason` ;
ne jamais affaiblir une assertion ; ne jamais augmenter un timeout à l'aveugle.
Référence humaine complète : `docs/errors.md`, `docs/debugging.md`.
