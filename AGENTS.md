# AGENTS.md

Règles pour tout agent (humain ou IA) qui modifie **qa-mesh-next** : contrats,
invariants, pièges connus. Pour *utiliser* la plateforme : `README.md` ;
architecture : `ARCHITECTURE.md`.

## Contrats

Il n'y a pas de spécification séparée : le contrat est épinglé à trois endroits.

- **Livrables inter-agents** : `.qa/contracts/*.schema.json` (enveloppe
  `qa-mesh/2.0` + un payload par agent) et `.qa/contracts/qa-config.schema.json`
  pour `.qa/qa.config.json`. Validation mécanique par le kernel
  (`qa-mesh validate`, `qa-mesh config check`), jamais par un LLM.
- **Fixtures** : chaque schéma a `.qa/contracts/fixtures/<nom>.valid.json` et
  `<nom>.invalid.json`. Les fixtures d'agent sont des enveloppes complètes
  (on teste aussi le lien `$ref` vers l'enveloppe). La fixture invalide porte une
  seule violation et la déclare dans `_expect_error: { layer, path }` : le test
  exige qu'elle échoue **pour cette raison**, pas par accident.
  `kernel/src/contracts.fixtures.test.ts` échoue sur une fixture manquante,
  orpheline, une valide rejetée ou une invalide acceptée.
- **Règle de modification** : un changement de contrat touche, **dans le même
  commit**, le schéma, ses deux fixtures et le producteur (corps d'agent dans
  `agents/bodies/`, ou code kernel). Une nouvelle clé de config passe par
  `qa-config.schema.json` (qui refuse les clés inconnues) dans le commit de son
  consommateur.

## Sources uniques et fichiers générés

| Généré | Depuis | Commande | Garde |
|---|---|---|---|
| `.claude/agents/*.md`, `.mcp.json` | `agents/manifest.yaml` + `agents/bodies/` | `qa-mesh compile --target claude` | `compile --check` (byte-identique) |
| `qa-mesh-plugin/` | manifeste, `.claude/`, `kernel/`, `.qa/`, `plugin-src/` | `qa-mesh plugin build` | `plugin build --check` |

Ne jamais éditer un fichier généré. `compile --target codex|gemini|copilot`
refuse d'écraser un `AGENTS.md`, `GEMINI.md` ou `copilot-instructions.md` écrit
à la main (ce fichier-ci, par exemple) : les bundles se compilent dans le projet
cible.

## Invariants

- **Kernel sans LLM.** Validation, filtrage, classification des échecs,
  dédoublonnage, verdicts (loop, explore, repro de bug bash), redaction, rendu
  (`PROGRESS.md`, `trace.md`) et agrégation d'usage sont dans `kernel/`. Un agent
  ne décide jamais ce qu'une règle peut décider ; il fournit des faits au contrat.
- **Codes d'échec** : tout code levé par `kernel/src/errors/classify.ts` est dans
  `catalog.ts` et `docs/errors.md`, et inversement (`qa-mesh errors check`).
  Ajouter un code = catalogue + doc + règle + fixture dans le même commit.
- **Secrets par nom** : jamais de valeur dans un fichier, un rapport, un finding
  ou une capture. Valeurs lues dans l'environnement, redactées par
  `kernel/src/secrets/redact.ts`, masquées par `SecretVault`. La connexion passe
  par `qa-mesh session refresh` (code Playwright), jamais par un agent via MCP.
- **Aucune télémétrie** : rien ne sort de la machine hors appel au fournisseur de
  modèle configuré (et l'endpoint `ai_judge` si on l'active). `.qa/events/` est local.
- **Tests** : `{ test, expect }` uniquement depuis `fixtures/pages.fixture.ts` ;
  pas de `waitForTimeout`, `networkidle`, `test.only`, URL ni credential en dur
  (`qa-guard.js`) ; `aiJudge` jamais seul dans un test.
- **Données projet** uniquement dans `.qa/qa.config.json` (gitignoré) ;
  l'exemple versionné est `.qa/qa.config.example.json`. Aucune donnée client
  dans le dépôt.
- **Dépendances** : aucune nouvelle dépendance sans justification dans
  `IMPROVEMENT-PLAN.md`. Pas de package `e2e` ni `@e2e-dev/*`. Playwright est
  épinglé (`1.56.1`) pour rester aligné avec les navigateurs installés.
- **Attribution** : tout contenu adapté de tester-army/e2e a sa ligne dans `NOTICE`.

## Pièges connus

- **Serveur MCP `playwright-test`** : ses outils `browser_*` n'existent qu'après
  `planner_setup_page` (ou `generator_setup_page`). Toujours passer
  `seedFile: "tests/seed.spec.ts"` explicitement : sans lui, le serveur peut
  réécrire le seed.
- **Le seed est cherché dans le PREMIER projet** de `playwright.config.ts` :
  le projet `setup` doit rester en dernier. `kernel/src/repo.invariants.test.ts`
  le vérifie, ainsi que l'import du seed depuis les fixtures.
- **Un seul navigateur MCP** : deux explorateurs ou deux vérificateurs en
  parallèle se partagent la même page. En pratique `explore.parallelism = 1` et
  un `qa-bug-verifier` à la fois (topic `bug-bash`).
- **Captures MCP** : le serveur n'écrit que sous `.playwright-mcp/` ; l'explorateur
  copie la capture dans le `evidence_dir` du charter avant de la référencer.
- **Le canal MCP en direct n'est pas redacté** : ce que l'agent voit à l'écran
  passe par le modèle. Ne pas explorer un écran qui affiche un secret en clair.
- **Tests de repro** : tag `@bugbash`, exclus par `grepInvert` sauf avec
  `QA_BUGBASH=1`. L'assertion qui prouve le bug porte `[BUG:<id>]` dans son
  message ; sans ce marqueur le kernel ne confirme pas.
- **AgentDB** : `node:sqlite` exige Node >= 22.5. Toute nouvelle colonne ou clé
  primaire passe par une migration idempotente dans le store concerné.
- **Fichiers générés** : `.claude/agents/`, `.mcp.json`, `qa-mesh-plugin/`. Une
  modification à la main est écrasée et fait échouer `--check`.

## Fin de chantier

`npm run typecheck`, `npm --prefix kernel test`, `compile --target claude --check`,
`plugin build --check`, `errors check`, la suite Playwright concernée, doc à
jour, puis un commit Conventional Commits. Prouver par une exécution réelle
(skill `qa-verify`), jamais « ça compile donc ça marche ».
