# qa-mesh-next — Plateforme QA autonome Playwright multi-agents

Plateforme de test agnostique au métier : un orchestrateur (`qa-analyst`) pilote
14 agents spécialisés pour découvrir les zones non couvertes, explorer
l'application, générer parcours et scénarios, automatiser en Playwright
(POM/TypeScript), exécuter et auto-réparer les tests, explorer librement une
application et chasser les bugs en ne gardant que ceux prouvés par un test qui
échoue - avec un coût LLM minimal : tout ce qui est mécanique (validation,
classification des échecs, dédoublonnage, verdicts, rendu) est fait par un
kernel Node déterministe, sans appel LLM.

qa-mesh-next reprend qa-mesh et y intègre, réimplémentés sur `@playwright/test`,
des patterns de [tester-army/e2e](https://github.com/tester-army/e2e)
(Apache-2.0, voir [NOTICE](NOTICE)). Historique : [CHANGELOG.md](CHANGELOG.md).

Compatible Claude Code, OpenCode, Codex, GitHub Copilot Agent Mode, Gemini CLI
et tout environnement MCP.

## Démarrage rapide

```bash
npm install && npx playwright install
cp .qa/qa.config.example.json .qa/qa.config.json   # renseigner base_url et rôles
export QA_DEFAULT_USER=... QA_DEFAULT_PASSWORD=...
```

Puis dans Claude Code : `/qa-campaign` (ou invoquer l'agent `qa-analyst`).
Guide pas à pas : [QUICKSTART.md](QUICKSTART.md).

## Mode opératoire pas à pas (débutant)

> Vous n'avez jamais utilisé la plateforme ? Suivez ces étapes dans l'ordre.
> Aucune connaissance de Playwright ou des agents n'est requise pour démarrer.

### Ce qu'il vous faut

- **Node.js ≥ 22.5** (le kernel utilise `node:sqlite` intégré) — vérifiez avec `node --version`.
- **Claude Code** ouvert dans ce dossier.
- L'**URL** de l'application web à tester et **un compte de test** (identifiant + mot de passe)
  que vous avez le droit d'utiliser.

### Étape 1 — Installer les dépendances

```bash
npm install && npx playwright install   # navigateurs Playwright
npm --prefix kernel ci                  # dépendances du kernel qa-mesh
npm --prefix kernel run build           # compile kernel/dist/ (les agents l'appellent)
```

> Le **kernel** est un petit programme qui fait le travail mécanique (validation,
> mémoire, priorisation) sans consommer de tokens. Il doit être compilé une fois.

### Étape 2 — Configurer le projet testé

```bash
cp .qa/qa.config.example.json .qa/qa.config.json
```

Ouvrez `.qa/qa.config.json` et renseignez **au minimum** (puis vérifiez avec
`node kernel/dist/cli.js config check` : une clé mal orthographiée est signalée) :
- `base_url` : l'adresse de votre application (ex. `https://app.exemple.com`).
- `roles[].username_env` / `password_env` : les **noms** des variables d'environnement
  qui contiendront les identifiants (jamais les identifiants en clair dans le fichier).
- `auth.login_url` et `auth.steps` : comment se connecter (déjà pré-rempli, à adapter).

C'est le **seul** fichier contenant des données de votre projet. Les agents, eux, sont génériques.

### Étape 3 — Fournir les identifiants (variables d'environnement)

```bash
# macOS / Linux
export QA_DEFAULT_USER="mon.compte@exemple.com"
export QA_DEFAULT_PASSWORD="motdepasse"

# Windows PowerShell
$env:QA_DEFAULT_USER = "mon.compte@exemple.com"
$env:QA_DEFAULT_PASSWORD = "motdepasse"
```

Utilisez les mêmes noms que dans `qa.config.json`. Les secrets ne sont jamais écrits sur disque.

Puis créez la session du rôle (connexion faite par du code Playwright, jamais
par un agent : le mot de passe ne passe pas par le modèle) :

```bash
node kernel/dist/cli.js session refresh --role default
```

Si la connexion échoue, adaptez les libellés de `pages/login.page.ts` à votre
écran de connexion. Clés d'API et autres secrets : déclarez leur **nom** dans
`qa.config.json#secrets` ; détails dans [docs/security.md](docs/security.md).

### Étape 4 — (Optionnel) Indiquer les zones à risque

Pour que la plateforme teste en priorité ce qui compte, ajoutez dans
`qa.config.json` la section `coverage_intelligence.business_risk` (note 0 à 10 par
domaine), par ex. `{ "checkout": 10, "login": 8, "profile": 2 }`. Si vous l'ignorez,
des valeurs par défaut s'appliquent. Détails : [COVERAGE-INTELLIGENCE.md](COVERAGE-INTELLIGENCE.md).

### Étape 5 — Lancer une campagne

Dans Claude Code, tapez :

```
/qa-campaign
```

L'orchestrateur `qa-analyst` enchaîne alors automatiquement, **domaine par domaine
et par ordre de risque** :

1. **Couverture** — repère les zones non testées et les priorise (`prioritize`).
2. **Découverte** — explore l'application et inventorie pages/éléments/API.
3. **Parcours** — déduit les scénarios (nominal, alternatif, erreur, limite).
4. **Automatisation** — génère les tests Playwright (POM + fixtures, TypeScript).
5. **Exécution** — lance les tests et classe chaque échec : **PRODUIT** (vrai bug),
   **SCRIPT** (test à réparer) ou **ENV** (environnement).
6. **Auto-réparation** — corrige les échecs SCRIPT (sélecteurs cassés…) et relance.

Vous n'avez rien à piloter : répondez seulement si l'agent demande une confirmation.

### Étape 6 — Lire les résultats

Chaque campagne écrit dans `.qa/runs/<date>-<NNN>/` :
- `report.json` — synthèse de la campagne ;
- `execution_report.json` — résultats détaillés ;
- `bugs_report.json` — bugs PRODUIT (à transmettre aux développeurs) ;
- `pipeline.log` — journal de l'orchestration.

Pour un rapport lisible : `npm run report` (HTML Playwright) ou demandez à l'agent
« génère le rapport de la dernière campagne » (skill `qa-report-generator`).

### Étape 7 — Au quotidien

- **Réparer des tests cassés** sans tout relancer : `/qa-heal`.
- **Voir uniquement les manques de couverture** : `/qa-coverage`.
- **Voir l'ordre de priorité calculé** (sans lancer de campagne) :
  `node kernel/dist/cli.js prioritize --top 5` — affiche chaque domaine, sa
  priorité (0-100) et la raison (`business_risk`, `recent_git_changes`, …).
- **Partir d'un besoin écrit** (brief → spécifications → user stories) : `/qa-sdd`.

### Étape 8 — Non-régression ciblée avec un loop (v3)

**`/qa-campaign`** (étape 5) traite l'application entière, domaine par domaine.
Pour ne re-tester **qu'un seul module** de façon bornée et déterministe
(après un échec CI, une correction de sélecteur, ou en routine), utilisez un
**loop** à la place : cycle *exécution → vérification → décision*, où c'est
le kernel — pas un agent — qui calcule le verdict et tranche.

**Créer le loop (une fois par module) :**

```bash
node kernel/dist/cli.js loop init --loop checkout-regression \
  --target "tests/checkout (module paiement)" \
  --whitelist "tests/checkout/**,pages/checkout*.page.ts" \
  --agents qa-test-executor,qa-healing-coordinator \
  --max-iterations 3
```

`--whitelist` définit les seuls fichiers que le loop a le droit de modifier —
tout écrit en dehors est bloqué automatiquement (hook `loop-guard.js`) tant
que le loop est actif.

**Le lancer :**

```
Lance le loop "checkout-regression"
```

L'agent `qa-analyst` (section « Mode loop » de son prompt) exécute alors le
cycle : test → `loop verify` (rapport Playwright + conformité + scope, 0
jugement LLM) → `loop decide` → `done` (succès, stop), `retry` (échec sous 3
tentatives, relance avec le motif), ou `needs_human` (échec persistant,
escalade — jamais de boucle infinie). Un bug **PRODUIT** (vrai bug
applicatif) n'est jamais un échec de loop, seuls SCRIPT/ENV le sont.

**Suivre l'état :**

```bash
node kernel/dist/cli.js loop status                       # tous les loops actifs
cat loops/checkout-regression/PROGRESS.md                 # historique lisible, généré automatiquement
```

**Quand utiliser quoi :**

| Besoin | Commande |
|---|---|
| Couvrir toute l'application, découvrir de nouvelles zones | `/qa-campaign` (étape 5) |
| Re-tester un module précis après un échec CI ou une correction | `loop verify` / `loop decide` sur un loop existant |
| Non-régression périodique sur un module sensible | Loop dédié, relancé régulièrement |

### Étape 9 - Explorer une application sans test écrit (`/qa-explore`)

Pour découvrir ce qui cloche sur un écran ou un parcours, sans avoir écrit de
test, donnez un **objectif** :

```
/qa-explore "vérifier qu'on peut ajouter, cocher et supprimer des tâches"
```

L'orchestrateur découpe l'objectif en **charters** (petites missions), l'agent
`qa-explorer` en exécute un à la fois dans un vrai navigateur (Playwright MCP),
et le kernel tient l'état, les budgets et l'arrêt. Chaque anomalie devient un
**finding** (titre, attendu, observé, étapes de repro, capture). Résultat dans
`.qa/runs/<id>/explore/` : `PROGRESS.md` (lisible) et `explore_report.json`.

Réglages utiles dans `qa.config.json` :
- `explore` : budgets (nombre de charters, actions par charter, durée max) ;
  l'exploration s'arrête seule après 3 charters ratés d'affilée sans finding.
- `known_non_bugs` : comportements voulus, pour éviter les faux positifs.

### Étape 10 - Bug bash avec preuve (`/qa-bugbash`)

Un bug bash lance plusieurs charters orientés « casser l'application », fusionne
les findings en double, puis l'agent `qa-bug-verifier` écrit pour chacun un
**test de repro** Playwright. C'est le **kernel** qui tranche : un bug n'est
confirmé que si ce test échoue, deux fois de suite, sur l'assertion annoncée.

```
/qa-bugbash "le panier et le paiement"
```

- `bugs_report.json` : uniquement les bugs **prouvés**, chacun avec son test
  (`tests/bugbash/b-NNN.spec.ts`, exclu de la suite normale).
- `unconfirmed.json` : le reste (non reproduit, instable, test invalide), avec la raison.
- Environnement partagé avec d'autres personnes : mettez
  `"bugbash": { "shared_env": true }` - le kernel impose alors la lecture seule
  (pas d'inscription, pas de soumission, pas d'injection dans les URL).
- Comptes jetables : déclarez des rôles `bb-<slug>` dans `roles[]` (un par charter).

Démonstration complète sur une application de démo locale : `demo/todo/`
(deux bugs plantés, tous deux prouvés ; preuves dans `demo/todo/evidence/`).

### Étape 11 - Comprendre un échec

```bash
node kernel/dist/cli.js classify --report <rapport-json-playwright>          # code d'échec + classe
node kernel/dist/cli.js trace render --run <id> --report <rapport-json-playwright>
```

Le rapport JSON s'obtient avec `npx playwright test --reporter=json > report.json`
(l'agent `qa-test-executor` le fait pour vous pendant une campagne).

Chaque échec reçoit un **code** du catalogue (`LOCATOR_NOT_FOUND`, `NAV_TIMEOUT`,
`ASSERTION_FAILED`…) et une classe PRODUIT / SCRIPT / ENV avant tout
raisonnement LLM (liste : [docs/errors.md](docs/errors.md)). `trace render`
écrit une page `trace.md` par test en échec : étapes, code, logs console et
réseau utiles, écran au moment de l'échec ([docs/debugging.md](docs/debugging.md)).

### Étape 12 - Options avancées

- **Sorties GenAI / RAG** : fixture `aiJudge`, désactivée par défaut, toujours
  combinée à une assertion déterministe ([docs/ai-judge.md](docs/ai-judge.md)).
- **Coût des agents** : `node kernel/dist/cli.js usage --run <id>` (appels
  d'outils, durée, tokens par agent ; tout reste local) - [docs/observability.md](docs/observability.md).
- **Prouver un changement de la plateforme** : skill `qa-verify`.

### En cas de souci

| Symptôme | Cause probable / solution |
|---|---|
| `node: command not found` ou version < 22.5 | Installer/mettre à jour Node.js ≥ 22.5. |
| L'agent dit que le kernel est absent | Relancer l'étape 1 (`npm --prefix kernel run build`). |
| Connexion échoue | Vérifier `base_url`, `auth.steps` et les variables d'environnement (étape 3). |
| Aucun test généré | Vérifier que `coverage_gaps` n'est pas vide (l'app est peut-être déjà couverte). |
| Tests « flaky » | Ne jamais augmenter un timeout à l'aveugle — voir `.claude/rules/testing.md`. |
| Écriture bloquée par `qa-guard` (JWT, `Bearer`, `sk-…`) | Un secret en clair : le déclarer par son nom dans `qa.config.json#secrets` et passer par la fixture `secrets` (étape 3). |
| Un test a échoué, pourquoi ? | `node kernel/dist/cli.js classify` puis `trace render` (étape 11) : lire `trace.md`, pas le trace.zip. |
| Écriture bloquée par `loop-guard` | Le fichier est hors de la `whitelist` d'un loop actif (étape 8) — élargissez `loops/<id>/loop.yaml` (toujours modifiable) ou attendez que le loop passe à `done`. |

## Documentation à la demande

Les agents (et vous) lisent un sujet à la fois :
`node kernel/dist/cli.js guide` liste les skills, `guide qa-mesh/<topic>` imprime
un topic (kernel, contracts, loop, debugging, secrets…).

## Structure

```
.claude/
├── agents/        GÉNÉRÉS depuis agents/manifest.yaml + agents/bodies/
├── skills/        qa-mesh (routeur), playwright-best-practices, qa-verify, qa-report-generator, …
├── commands/      /qa-campaign, /qa-coverage, /qa-heal, /qa-sdd, /qa-explore, /qa-bugbash
├── hooks/         qa-guard, loop-guard, qa-typecheck, qa-events
├── rules/         code-style, testing, selectors
└── settings.json  permissions et hooks
agents/            manifest.yaml (source unique) + bodies/
kernel/            CLI déterministe qa-mesh (contrats, AgentDB, explore, bug bash, erreurs, trace, secrets, usage)
plugin-src/        sources propres au plugin ; qa-mesh-plugin/ est GÉNÉRÉ
.qa/               config projet, contrats + fixtures, AgentDB (mémoire persistante)
docs/              errors, debugging, security, ai-judge, observability
demo/todo/         application de démo locale (bugs plantés) + preuves explore / bug bash
tests/             specs par feature : tests/<feature>/<feature>.<flux>.spec.ts
pages/             Page Object Model (une classe par page)
fixtures/          pages.fixture.ts — source unique de { test, expect } ET de apiRequest
schemas/           schémas Zod des réponses API, par domaine : schemas/<domaine>/<ressource>.schema.ts
utils/             test-data.ts, api-client.ts, secrets.ts (SecretVault), ai-judge/, qa-config.ts
examples/          exemples de plans de test
```

## Tests API (mode API-first, Zod)

Pour les cibles testées principalement via API plutôt que via UI (ex. cartographie
d'endpoints), une fixture `apiRequest` est disponible depuis
`fixtures/pages.fixture.ts` — indépendante de `use.baseURL` (utilisée par les
tests UI), elle pointe vers `API_URL` (+ `API_TOKEN` en Bearer s'il est défini).

```ts
import { test, expect } from '../../fixtures/pages.fixture';
import { ItemSchema } from '../../schemas/items/item.schema';

test('création nominale', async ({ apiRequest }) => {
  const { status, body } = await apiRequest('POST', process.env.ITEMS_ENDPOINT!, {
    schema: ItemSchema,
    data: { name: 'mon-item' },
  });
  expect(status).toBe(201);
  expect(body.name).toBe('mon-item'); // body est typé depuis le schéma Zod
});
```

Règles :
- Chaque réponse API validée contre un schéma **Zod strict** (`.strict()`) défini
  dans `schemas/<domaine>/`, jamais un `z.object()` ad hoc dans le test.
- Un contrat rompu lève une erreur explicite (diff Zod) — jamais avalé silencieusement.
- Tant qu'un contrat n'est pas confirmé, utiliser `UnknownSchema`
  (`schemas/common.schema.ts`) en placeholder temporaire, jamais laissé tel
  quel sur un endpoint validé.
- Variables d'environnement requises non définies → `test.skip(...)` avec message
  explicite, jamais un test qui échoue faute de configuration (voir
  `tests/items/items.crud.spec.ts` pour l'exemple).

## Les agents

| Agent | Rôle |
|---|---|
| `qa-analyst` | Orchestration, validation des contrats, transmission sélective |
| `qa-coverage-gap-analyzer` (0) | Gaps de couverture, sélection du domaine, sessions |
| `qa-context-discovery` (1) | Exploration Playwright, catalogue compressé, sélecteurs |
| `qa-journey-mapper` (2) | Parcours NOM/ALT/ERR/LIMITE |
| `qa-test-designer` (3) | Gherkin + CSV Xray/Zephyr/TestRail — à la demande |
| `qa-automation-engineer` (4) | Scénarios → Playwright TS avec POM et fixtures |
| `qa-test-executor` (5) | Exécution, classification PRODUIT/SCRIPT/ENV par le catalogue de codes, puis lecture de `trace.md` |
| `qa-healing-coordinator` (6) | Auto-réparation bornée des échecs de classe SCRIPT uniquement |
| `qa-explorer` | Un charter d'exploration via Playwright MCP, findings au contrat `agent-explore` |
| `qa-bug-verifier` | Un test de repro par finding ; le kernel décide confirmé / non confirmé |
| `qa-a11y-auditor`, `qa-compliance-checker`, `qa-perf-tester` | Spécialistes optionnels (WCAG, RGPD/AI Act, Web Vitals/k6) |
| `qa-spec-writer`, `qa-product-owner` | Chaîne SDD amont (brief → SFD → user stories) |

## Commandes

```bash
npm test               # suite complète
npm run test:chromium  # un navigateur
npm run typecheck      # validation TS
npm run report         # rapport HTML
npm run plugin:build   # régénère qa-mesh-plugin/ (ne jamais l'éditer à la main)
npm run plugin:check   # échoue si qa-mesh-plugin/ a dérivé des sources
```

Documentation complète : [ARCHITECTURE.md](ARCHITECTURE.md) ·
Instructions Claude Code : [CLAUDE.md](CLAUDE.md) ·
Règles de contribution (contrats, invariants, pièges) : [AGENTS.md](AGENTS.md)
