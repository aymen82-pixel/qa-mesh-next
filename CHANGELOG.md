# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
qa-mesh-next part de qa-mesh (`aymen82-pixel/playwright-ai-agents`) et y
intègre, réimplémentés sur `@playwright/test`, des patterns de
[tester-army/e2e](https://github.com/tester-army/e2e) (Apache-2.0, voir `NOTICE`).
Le plan et les arbitrages sont dans `IMPROVEMENT-PLAN.md`.

## [0.1.0] - 2026-10-08 - qa-mesh -> qa-mesh-next

### Repris de qa-mesh, inchangé dans son principe

- Orchestrateur `qa-analyst` et agents 0-6, spécialistes a11y / compliance /
  perf, chaîne SDD (spec-writer, product-owner).
- Kernel déterministe : contrats Ajv, manifeste + `compile` multi-runtimes,
  `filter` (`.qa/routing.yaml`), AgentDB SQLite, `prioritize` (Coverage
  Intelligence), loops `verify` / `decide`.
- Hooks `qa-guard`, `loop-guard`, `qa-typecheck` ; mode API-first Zod `.strict()`.

### Modifié

- **Bootstrap (C1)** : aucune donnée client ; l'exemple API devient une ressource
  générique `items` (`schemas/items/`, `tests/items/`). Le plugin
  `qa-mesh-plugin/` est généré depuis une source unique (`qa-mesh plugin build`,
  `--check`) : plus de doublon `kernel/` vs `qa-mesh-plugin/kernel/`.
  Playwright épinglé en `1.56.1`.
- **Exécution** : `qa-test-executor` classe chaque échec par un code du catalogue
  avant tout raisonnement ; un code non ambigu impose sa classe (contrat
  agent-5, `failure.code` requis, `requalified_reason` pour requalifier).
  `qa-healing-coordinator` ne traite que les codes SCRIPT et lit `trace.md`.
- **Sessions** : la connexion passe par `qa-mesh session refresh --role <r>`
  (projet Playwright `setup`) ; l'Agent 0 n'a plus d'outil de saisie MCP.
- **`playwright.config.ts`** : projet `setup` en dernier (seed MCP), `baseURL`
  lu dans `.qa/qa.config.json`, traces `retain-on-failure`, tests `@bugbash`
  exclus hors bug bash.
- **`qa-analyst`** : corps réduit de 16,1 Ko à 11,5 Ko, détail chargé à la
  demande via le skill routeur `qa-mesh`.

### Ajouté

- **Contrats renforcés (C11)** : une fixture valide et une invalide par schéma
  (`_expect_error` déclaré), `qa-config.schema.json` et `qa-mesh config check`,
  garde de `compile` contre l'écrasement d'un `AGENTS.md` écrit à la main.
- **Taxonomie d'erreurs (C5)** : `kernel/src/errors/` (11 codes, classe
  PRODUIT/SCRIPT/ENV, piste de correction), `qa-mesh classify`,
  `qa-mesh errors check`, `docs/errors.md`.
- **Secrets (C7)** : registre par nom (`qa.config.json#secrets`), redaction des
  journaux, rapports, `trace.md` et findings, fixture `secrets` (remplissage
  masqué, captures avec `mask`), blocage des JWT / `Bearer` / `sk-` par `qa-guard`,
  `docs/security.md`.
- **`trace.md` (C6)** : `qa-mesh trace render`, lecteur ZIP sur `node:zlib`,
  page bornée par test en échec, `docs/debugging.md`.
- **Progressive disclosure (C2)** : skills en routeur court + `references/`,
  skill `qa-mesh`, commande `qa-mesh guide [skill[/topic]]`, test des routeurs.
- **Mode explore (C3)** : agent `qa-explorer`, `/qa-explore`,
  `kernel/src/explore/` (état, budgets, arrêt après 3 charters ratés, verdict,
  `PROGRESS.md`), contrats `agent-explore` et `explore-report`,
  `known_non_bugs[]`, démarrage sur `storage_state`.
- **Bug bash avec preuve (C4)** : `/qa-bugbash`, agent `qa-bug-verifier`,
  `qa-mesh findings merge` (sur `db/distance.ts`), `qa-mesh bugbash
  verify|report|status` ; un bug n'est confirmé que si son test de repro échoue
  deux fois en `ASSERTION_FAILED` sur l'assertion `[BUG:<id>]`. Lecture seule
  imposée si `bugbash.shared_env`, comptes jetables `bb-<slug>`. Démo de bout en
  bout sur `demo/todo/` (B-001 et B-002 prouvés).
- **`aiJudge` (C8)** : fixture optionnelle, désactivée par défaut, verdict Zod,
  seuil, cache, fournisseurs Anthropic et compatible OpenAI, jamais seule dans un
  test (bloqué par `qa-guard`), `docs/ai-judge.md`.
- **Skill `qa-verify` (C9)** : prouver un changement par une exécution réelle,
  main contre branche pour un correctif.
- **Observabilité (C10)** : hook `qa-events.js`, `qa-mesh usage` (appels,
  erreurs, durée, tokens par agent), `docs/observability.md`.
- **Documentation (C12)** : `AGENTS.md`, `CHANGELOG.md`, `NOTICE`,
  `LICENSES/Apache-2.0.txt` ; README (mode opératoire débutant étendu),
  ARCHITECTURE, CLAUDE.md, QUICKSTART mis à jour.

### Retiré

- Fichiers et mentions spécifiques à un client, exemples de formulaire hors
  périmètre, `seed.spec.ts` racine en double.

### Limites connues

- Un seul navigateur MCP : exploration et vérification en séquence
  (`parallelism = 1` recommandé).
- Le canal MCP en direct n'est pas redacté.
- `aiJudge` envoie l'entrée jugée au fournisseur configuré : à n'activer
  qu'avec un fournisseur autorisé.
