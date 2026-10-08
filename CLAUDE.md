# Plateforme QA Autonome — Instructions équipe

Plateforme de test multi-agents agnostique au métier : 14 agents spécialisés
orchestrés par `qa-analyst` produisent couverture, parcours, scénarios, tests
Playwright, exécution, auto-réparation, exploration et bug bash prouvé par test
de repro. Le travail mécanique est fait par le kernel `qa-mesh`, sans LLM.
Règles de contribution (contrats, invariants, pièges) : `AGENTS.md`.

## Structure du projet

```
.claude/            # agents GÉNÉRÉS, skills (routeur + references/), commands, rules, hooks, settings.json
agents/             # manifest.yaml (source unique des agents) + bodies/
kernel/             # CLI qa-mesh déterministe (node kernel/dist/cli.js --help)
docs/               # errors, debugging, security, ai-judge, observability
demo/todo/          # app de démo locale (bugs plantés) + preuves explore / bug bash
.claude-plugin/     # marketplace.json — ce repo est installable comme plugin
qa-mesh-plugin/     # plugin distribuable GÉNÉRÉ (`qa-mesh plugin build`) — ne jamais l'éditer à la main
plugin-src/         # sources propres au plugin (plugin.json, README, hooks.json)
.qa/                # config projet, contrats JSON inter-agents, AgentDB (mémoire persistante)
tests/              # specs Playwright organisés PAR FEATURE : tests/<feature>/<feature>.<flux>.spec.ts
pages/              # Page Object Model : une classe par page (<nom>.page.ts), composants dans pages/components/
fixtures/           # fixtures custom — tout spec importe { test, expect } depuis fixtures/pages.fixture.ts
utils/              # helpers, test-data (credentials via env), client API
examples/           # exemples de plans de test
ARCHITECTURE.md     # architecture détaillée des agents, diagramme, stratégie MCP
```

## Règles non négociables

- Lire et appliquer `.claude/rules/` : `code-style.md`, `testing.md`, `selectors.md`.
- TypeScript exclusivement. Compilation `npm run typecheck` obligatoire avant livraison.
- Jamais d'URL en dur (utiliser `baseURL`), jamais de credentials en dur
  (utiliser `utils/test-data.ts` + variables d'environnement).
- Jamais `waitForTimeout` ni `networkidle`. Ces interdits (+ `test.only`,
  URL/credentials en dur) sont appliqués automatiquement par les hooks
  `.claude/hooks/qa-guard.js` (blocage à l'écriture) et `qa-typecheck.js`
  (compilation TS après chaque écriture).
- `qa-mesh-plugin/` et `.claude/agents/` sont générés : modifier les sources
  (`agents/manifest.yaml`, `agents/bodies/`, `.claude/`, `kernel/`, `plugin-src/`)
  puis `qa-mesh compile --target claude` et `qa-mesh plugin build`.
- Ne pas modifier `utils/test-data.ts` ni `playwright.config.ts` sans demande explicite.
- Toute donnée spécifique au projet testé vit dans `.qa/qa.config.json` — aucun
  agent ne contient de règle métier.

## Lancer une campagne QA

1. `cp .qa/qa.config.example.json .qa/qa.config.json` puis renseigner base_url et rôles.
2. Exporter les credentials (`QA_DEFAULT_USER`, `QA_DEFAULT_PASSWORD`, …) puis
   `node kernel/dist/cli.js session refresh --role default`.
3. Invoquer l'agent `qa-analyst` (ou `/qa-campaign`). Phases : couverture →
   découverte → parcours → [conception sur demande] → automatisation →
   exécution → healing. Détails : `ARCHITECTURE.md`.

## Commandes

- `npm test` — suite complète ; `npm run test:chromium` — un seul navigateur
- `npm run typecheck` — validation TS sans émission
- `/qa-campaign`, `/qa-coverage`, `/qa-heal`, `/qa-sdd`, `/qa-explore`, `/qa-bugbash` — workflows agents
- `node kernel/dist/cli.js guide qa-mesh/<topic>` — lire UN topic de doc (kernel,
  contracts, loop, explore, bug-bash, debugging, secrets, tokens)
- Diagnostiquer un échec : `classify` puis `trace render`, lire `trace.md`
- Avant de déclarer une tâche finie : skill `qa-verify` (exécution réelle)
