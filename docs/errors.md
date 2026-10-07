# Codes d'échec

Chaque test Playwright en échec reçoit un **code**, une **classe** et une
**piste de correction**. Le code est attribué par le kernel, de façon
déterministe, avant tout raisonnement LLM :

```bash
PLAYWRIGHT_JSON_OUTPUT_NAME=.qa/runs/<run_id>/playwright.json \
  npx playwright test <specs> --reporter=json
node kernel/dist/cli.js classify --report .qa/runs/<run_id>/playwright.json --json
```

Source unique : `kernel/src/errors/catalog.ts`. Structure inspirée de la
référence d'erreurs de tester-army/e2e (Apache-2.0, voir `NOTICE`).

## Classes

| Classe | Sens | Qui traite |
| --- | --- | --- |
| PRODUIT | L'application dévie du comportement attendu | `bugs_report.json`, humain |
| SCRIPT | Le test est faux ou périmé | `qa-healing-coordinator` (Agent 6), **seule classe qu'il reçoit** |
| ENV | L'environnement empêche de conclure | consigné, jamais réparé |

## Codes

Un code **ambigu** a une classe par défaut qui peut être fausse. Seuls les codes
ambigus peuvent être requalifiés par l'Agent 5, et seulement avec un motif écrit
(`failure.requalified_reason`, imposé par le contrat `agent-5.schema.json`). Un
code non ambigu impose sa classe.

| Code | Classe | Ambigu | Signature reconnue | Piste |
| --- | --- | --- | --- | --- |
| `LOCATOR_NOT_FOUND` | SCRIPT | oui | `element(s) not found`, ou `locator.<action>: Timeout` en attente d'un locator jamais résolu | Vérifier le nom accessible réel, `qa-mesh db similar` ; élément réellement disparu = PRODUIT |
| `LOCATOR_AMBIGUOUS` | SCRIPT | non | `strict mode violation` | Scoper dans un parent, `exact: true`, `.filter()` |
| `ACTION_FAILED` | SCRIPT | oui | locator résolu mais `element is not enabled/visible/stable`, `intercepts pointer events` | Attendre l'état par une assertion web-first, fermer l'overlay ; désactivé à tort = PRODUIT |
| `NAV_TIMEOUT` | ENV | oui | `page.goto` / `page.waitForURL` … `Timeout` | Vérifier l'environnement ; URL jamais atteinte = parcours cassé ou attente fausse |
| `TEST_TIMEOUT` | SCRIPT | oui | `Test timeout of …ms exceeded` sans erreur plus précise | Scinder le test, attendre un signal précis ; jamais de timeout augmenté à l'aveugle |
| `AUTH_EXPIRED` | ENV | non | `(HTTP 401)` / `(HTTP 403)`, ou URL reçue sur `auth.login_url` | Rafraîchir le storageState du rôle, relancer |
| `ENV_UNREACHABLE` | ENV | non | `net::ERR_CONNECTION_REFUSED`, `ERR_NAME_NOT_RESOLVED`, `ECONNREFUSED`… | Vérifier `base_url` / `API_URL` ; ne pas réparer le test |
| `HTTP_5XX` | PRODUIT | non | `(HTTP 5xx)` dans `typedRequest`, ou statut attendu 1xx-4xx et reçu 5xx | Bug serveur : remonter requête et réponse |
| `CONTRACT_MISMATCH` | PRODUIT | oui | `non conforme au schéma attendu` (`utils/api-client.ts`) | Contrat API rompu ; schéma périmé par un changement voulu = SCRIPT |
| `ASSERTION_FAILED` | PRODUIT | oui | `expect(…).<matcher>(…) failed` avec Expected/Received | Comparer au scénario ; assertion périmée = SCRIPT avec motif, jamais l'affaiblir |
| `UNCLASSIFIED` | SCRIPT | oui | aucune règle ne reconnaît le message | Seul cas de raisonnement libre de l'Agent 5 ; doute PRODUIT/SCRIPT -> SCRIPT |

## Ordre de décision

Les règles sont évaluées dans l'ordre du tableau `RULES` de
`kernel/src/errors/classify.ts` (du plus spécifique au plus générique).
Quand Playwright produit plusieurs messages (timeout de test + action en
attente), le code le plus spécifique gagne ; `TEST_TIMEOUT` seulement à défaut.

## Ajouter ou modifier un code

Dans le même commit : `catalog.ts`, une règle dans `classify.ts`, une fixture de
**message réel** dans `kernel/src/errors/fixtures/playwright-<version>.json`, ce
tableau, et l'enum + les liens code -> classe de `.qa/contracts/agent-5.schema.json`
(avec ses fixtures). `node kernel/dist/cli.js errors check` (lancé aussi par
`npm --prefix kernel test`) échoue sinon : code non documenté, documenté mais
jamais levé, sans fixture, absent du contrat, ou cité dans un prompt d'agent
sans exister.

Les fixtures de messages sont liées à une version de Playwright : à chaque
montée de version, les régénérer et relancer les tests.
