# Plateforme QA Autonome — Architecture multi-agents

Architecture agnostique au projet métier, orchestrée par l'agent **QA Analyst**,
compatible Claude Code, OpenCode, Codex, GitHub Copilot Agent Mode, Gemini CLI
et tout environnement MCP.

## 1. Vue d'ensemble

```mermaid
flowchart TD
    QA[QA Analyst<br/>Orchestrateur · sonnet] --> A0

    A0[Agent 0<br/>qa-coverage-gap-analyzer<br/>haiku] -->|gaps_coverage.json<br/>domain + session| V0{Validation<br/>schéma 0}
    V0 -->|ok| A1
    V0 -->|invalide ×2| STOP0[STOP + rapport]

    A1[Agent 1<br/>qa-context-discovery<br/>haiku] -->|context_catalog.json| V1{Validation<br/>schéma 1}
    A1 <-->|sélecteurs| DB[(AgentDB<br/>browser-selectors<br/>browser-sessions<br/>coverage-memory)]
    A0 <-->|sessions / scores| DB

    V1 -->|ok · extrait filtré| A2[Agent 2<br/>qa-journey-mapper<br/>haiku]
    A2 -->|user_journeys.json| V2{Validation<br/>schéma 2}

    V2 -->|demande livrables manuels| A3[Agent 3<br/>qa-test-designer<br/>sonnet · à la demande]
    V2 -->|flux automatique| IDX[QA Analyst :<br/>index scénarios +<br/>résolution sélecteurs AgentDB]
    A3 -->|.feature + CSV + matrice<br/>scénarios automatable| IDX

    IDX --> A4[Agent 4<br/>qa-automation-engineer<br/>sonnet]
    A4 <-->|réutilise / ajoute| DB
    A4 -->|pages/ tests/ fixtures/<br/>tsc --noEmit OK| A5[Agent 5<br/>qa-test-executor<br/>haiku]

    A5 -->|rapport JSON Playwright| CLS[kernel : classify<br/>code du catalogue → classe<br/>+ trace render → trace.md]
    CLS -->|execution_report.json| TRI{Classification}
    TRI -->|PRODUIT| BUGS[bugs_report.json]
    TRI -->|ENV| LOG[pipeline.log]
    TRI -->|SCRIPT ≥ 1| A6[Agent 6<br/>qa-healing-coordinator<br/>sonnet]
    TRI -->|0 SCRIPT| FIN

    A6 <-->|sélecteurs alternatifs<br/>+ mises à jour| DB
    A6 -->|healing_report.json<br/>max 3 tentatives/test · 1 passe| RERUN[Re-run ciblé<br/>Agent 5]
    RERUN --> FIN[Clôture :<br/>coverage-memory MAJ<br/>report.json + critères succès]
```

### 1.1 Mode explore (`/qa-explore`)

```mermaid
flowchart LR
    G[Objectif] --> PL[qa-analyst<br/>planificateur]
    PL -->|explore init / context| K[(kernel<br/>explore state<br/>budgets · arrêt)]
    PL -->|charter| EX[qa-explorer<br/>Playwright MCP]
    EX -->|agent-explore.json<br/>findings redactés| K
    K -->|explore decide| PL
    K -->|continue| PL
    K -->|stop : finished / stuck ×3 / budget / temps| R[PROGRESS.md<br/>explore_report.json]
```

Le planificateur et l'explorateur sont des agents ; l'état, les budgets
(`qa.config.json#explore`), l'arrêt après 3 charters ratés ou bloqués sans
finding, le verdict et le rendu sont dans `kernel/src/explore/`. Démarrage
possible depuis une session sauvegardée (`storage_state`), `known_non_bugs[]`
injecté dans le contexte de chaque charter.

### 1.2 Bug bash avec preuve (`/qa-bugbash`)

```mermaid
flowchart LR
    P[Préparation<br/>comptes bb-slug · read_only si shared_env] --> C[Charters orientés bug<br/>qa-explorer]
    C -->|findings| M[kernel : findings merge<br/>route + Levenshtein]
    M -->|merged.json| V[qa-bug-verifier<br/>test de repro par finding]
    V -->|agent-bugverify.json + spec @bugbash| J{kernel : bugbash verify<br/>2 passes, 0 retry}
    J -->|échoue 2/2 en ASSERTION_FAILED<br/>sur l'assertion BUG:id| OK[bugs_report.json]
    J -->|sinon| NO[unconfirmed.json<br/>avec la raison]
```

Le verdict (confirmé ou non) n'est jamais celui d'un agent : le kernel exécute le
test et applique `judgeRepro` (`kernel/src/bugbash/verdict.ts`). Les tests de
repro (`tests/bugbash/`, tag `@bugbash`) sont exclus de la suite normale
(`grepInvert`) et ne tournent qu'avec `QA_BUGBASH=1`.

## 2. Principes structurants

**Kernel sans LLM.** Tout ce qui est mécanique passe par `kernel/` (CLI
`qa-mesh`) : validation des contrats, filtrage, priorisation, classification
des échecs par code, rendu de `trace.md` et `PROGRESS.md`, état d'exploration,
dédoublonnage des findings, verdict des tests de repro, redaction, agrégation de
l'usage. Un agent ne tranche jamais ce qu'une règle peut trancher.

**Neutralité métier.** Aucun agent ne contient de donnée projet. Tout le
spécifique (URL, rôles, credentials via variables d'environnement, routes
exclues, commandes) vit dans `.qa/qa.config.json` (voir
`.qa/qa.config.example.json`).

**Échange par fichiers.** Les agents ne partagent jamais de contexte
conversationnel. Chaque livrable est un JSON enveloppé `qa-mesh/2.0` écrit dans
`.qa/runs/{run_id}/`, validé contre son schéma (`.qa/contracts/*.schema.json`)
par le QA Analyst avant transmission. C'est ce qui rend l'architecture portable :
n'importe quel runtime capable de lire/écrire des fichiers peut héberger un agent.

**Transmission sélective.** Le QA Analyst est l'unique détenteur des livrables
complets et ne transmet à chaque agent que les champs qu'il consomme. Depuis
qa-mesh/2.0, cette table est DÉCLARATIVE dans `.qa/routing.yaml` (source unique)
et exécutée par `qa-mesh filter --from <a> --to <b>` — le tableau ci-dessous
n'est plus que documentaire :

| De → vers | Champs transmis |
|---|---|
| 0 → 1 | `domain`, routes du domaine, `session.storage_state_path`, sélecteurs connus |
| 1 → 2 | `pages[].{url,title,complexity}`, `elements[].{page,label,type,action}` |
| 1+2 → 3 | parcours complets + catalogue sans sélecteurs |
| 2/3 → 4 | index scénarios automatisables + index sélecteurs résolus AgentDB |
| 4 → 5 | chemins des specs + commande d'exécution |
| 5 → 6 | uniquement les échecs SCRIPT + chemin de `trace.md` + sélecteurs candidats |

**Priorisation par le risque (Coverage Intelligence, étape 9).** Le kernel
calcule un score de priorité déterministe par domaine (`qa-mesh prioritize`),
somme pondérée de 5 facteurs mesurables — risque métier (config), criticité
(graphe de parcours), taux d'échec (historique), activité git récente, stabilité
(campagnes vertes consécutives) — avec plancher métier et plafond de péremption
(anti-angle-mort). Le QA Analyst traite les domaines dans cet ordre et dimensionne
le budget de chaque agent en conséquence. C'est un module du kernel, **pas un
agent** : un score doit être reproductible et auditable. Détails :
`COVERAGE-INTELLIGENCE.md`.

**Codes d'échec avant raisonnement.** Chaque échec reçoit un code du catalogue
(`kernel/src/errors/catalog.ts`, 11 codes, classe PRODUIT/SCRIPT/ENV et piste de
correction) par `qa-mesh classify`, avant tout LLM. Un code non ambigu impose sa
classe (contrat agent-5) ; requalifier un code ambigu exige `requalified_reason`.
`qa-healing-coordinator` ne reçoit que des codes SCRIPT. `qa-mesh errors check`
échoue si un code est levé sans être documenté, ou documenté sans être levé.

**Secrets par nom.** `qa.config.json#secrets` ne contient que des noms ; les
valeurs sont lues dans l'environnement, redactées dans les journaux, rapports,
`trace.md` et findings, masquées sur les captures (`mask`). La connexion se fait
par `qa-mesh session refresh` (code Playwright), jamais par un agent via MCP.
`qa-guard.js` bloque JWT, `Bearer …` et clés `sk-…` dans tout fichier écrit.
Aucune télémétrie : les événements d'agents (`.qa/events/`) restent locaux.

**Budgets explicites.** Tous les retries sont bornés et configurables
(`qa.config.json#budgets`) : 2 relances max par agent, 1 passe de healing,
3 tentatives par test, 2 rafraîchissements de session par campagne.

## 3. Structure du projet

```
your-project/
├── CLAUDE.md                  # Instructions équipe (committed)
├── CLAUDE.local.md            # Overrides perso (gitignored)
├── .claude/
│   ├── settings.json          # Permissions + config (committed)
│   ├── settings.local.json    # Permissions perso (gitignored)
│   ├── commands/              # /qa-campaign, /qa-coverage, /qa-heal, /qa-sdd, /qa-explore, /qa-bugbash
│   ├── rules/                 # code-style.md, testing.md, selectors.md
│   ├── hooks/                 # qa-guard, loop-guard, qa-typecheck, qa-events
│   ├── skills/                # routeurs SKILL.md courts + references/ à la demande
│   │   ├── qa-mesh/           # routeur plateforme (kernel, contrats, loop, explore, bug-bash, debugging, secrets, tokens)
│   │   ├── playwright-best-practices/
│   │   └── qa-verify/ …
│   └── agents/                # GÉNÉRÉS (qa-mesh compile) depuis agents/manifest.yaml + agents/bodies/
├── agents/                    # manifest.yaml (source unique) + bodies/
├── kernel/                    # CLI qa-mesh déterministe (TypeScript, node:sqlite)
├── plugin-src/                # sources du plugin ; qa-mesh-plugin/ est GÉNÉRÉ
├── docs/                      # errors, debugging, security, ai-judge, observability
├── .qa/                       # config, contrats, AgentDB, runs
│   ├── qa.config.json         # SEULES données spécifiques projet (gitignoré)
│   ├── contracts/             # envelope + payloads d'agents + rapports kernel + qa-config, fixtures/
│   ├── events/                # événements d'agents JSONL, locaux (gitignored)
│   ├── agentdb/               # schema.json, browser-selectors.json, coverage-memory.json
│   │   └── sessions/          # storageState par rôle (gitignored)
│   └── runs/{run_id}/         # livrables + pipeline.log (gitignored)
├── tests/                     # specs PAR FEATURE : tests/<feature>/<feature>.<flux>.spec.ts
│   ├── seed.spec.ts           # seed pour la génération (seedFile explicite côté MCP)
│   └── bugbash/               # tests de repro @bugbash (hors suite normale)
├── pages/                     # POM : <nom>.page.ts ; composants dans pages/components/
├── fixtures/                  # pages.fixture.ts — source unique de { test, expect }
├── utils/                     # test-data.ts, api-client.ts, secrets.ts, ai-judge/, qa-config.ts
├── examples/                  # exemples de plans de test
├── playwright.config.ts
└── tsconfig.json
```

## 4. Les agents

| # | Nom | Modèle | Rôle | Livrable |
|---|---|---|---|---|
| — | `qa-analyst` | sonnet | Orchestration, validation, routage, filtrage, journalisation | `report.json`, `pipeline.log` |
| 0 | `qa-coverage-gap-analyzer` | haiku | Gaps de couverture, sélection du domaine, sessions persistantes | `gaps_coverage.json` |
| 1 | `qa-context-discovery` | haiku | Exploration Playwright, inventaire UI/API, persistance sélecteurs | `context_catalog.json` |
| 2 | `qa-journey-mapper` | haiku | Parcours NOM/ALT/ERR/LIMITE, factorisation parent/variantes | `user_journeys.json` |
| 3 | `qa-test-designer` | sonnet | Gherkin, CSV Xray/Zephyr/TestRail, matrice — **à la demande** | `.feature`, CSV, matrice |
| 4 | `qa-automation-engineer` | sonnet | Gherkin/parcours → Playwright TS, POM, fixtures, validation MCP | `pages/*`, `tests/*`, `fixtures/*` |
| 5 | `qa-test-executor` | haiku | Exécution, classification par le catalogue de codes puis lecture de `trace.md` | `execution_report.json`, `bugs_report.json` |
| 6 | `qa-healing-coordinator` | sonnet | Auto-réparation bornée des codes SCRIPT, sélecteurs alternatifs, requalification | `healing_report.json` |
| EXP | `qa-explorer` | sonnet | Un charter d'exploration via Playwright MCP (`/qa-explore`, `/qa-bugbash`) | findings `agent-explore` |
| BBV | `qa-bug-verifier` | sonnet | Un test de repro par finding fusionné ; verdict tranché par le kernel | spec `tests/bugbash/*` + `agent-bugverify` |
| A11Y | `qa-a11y-auditor` | haiku | Audit accessibilité WCAG (axe-core) — **optionnel, parallèle dès l'Agent 1** | `a11y_report.json` |
| COMP | `qa-compliance-checker` | sonnet | Indices de conformité RGPD / EU AI Act — **optionnel, parallèle dès l'Agent 1** | `compliance_report.json` |
| PERF | `qa-perf-tester` | haiku | Web Vitals vs budgets + charge k6 (gated `perf.load.allowed`) — **optionnel, parallèle dès l'Agent 1** | `perf_report.json` |
| SPEC | `qa-spec-writer` | sonnet | Brief/notes → SFD structurée (`F-NNN`) — **chaîne SDD amont, à la demande** | `sfd.md` + `spec_index.json` |
| PO | `qa-product-owner` | sonnet | SFD → user stories + critères d'acceptation (`US-NNN`), **checkpoint humain avant la suite** | `user_stories.json` |

### Héritage des agents Playwright d'origine

Les agents 1, 4 et 6 intègrent et étendent la méthodologie des trois agents
Playwright officiels (planner, generator, healer) — ceux-ci ne sont plus
nécessaires en tant que fichiers séparés :

| Méthodologie héritée | Intégrée dans | Extensions |
|---|---|---|
| `playwright-test-planner` (exploration + plan) | Agent 1 (+ alimente Agent 2) | multi-pages, extraction API, persistance sélecteurs AgentDB, sortie JSON compressée au lieu du plan Markdown |
| `playwright-test-generator` (exécution MCP réelle avant écriture) | Agent 4 | POM automatique, fixtures, réutilisation sélecteurs persistants, compilation `tsc --noEmit`, index de couverture |
| `playwright-test-healer` (debug → diagnostic → fix → re-run) | Agent 6 | recherche de sélecteurs similaires dans AgentDB, retry borné (3/test, 1 passe), requalification SCRIPT→PRODUIT, rapport structuré |

## 5. Contrats JSON

Tous dans `.qa/contracts/` :

- `envelope.schema.json` — enveloppe commune `qa-mesh/2.0` + définitions
  partagées (priorités `C|E|M|F`, statuts `OK|KO|INS|IGN`, types
  `NOM|ALT|ERR|LIMITE`, échecs `PRODUIT|SCRIPT|ENV`)
- `agent-0.schema.json` … `agent-6.schema.json` — payloads par agent
- `agent-a11y`, `agent-compliance`, `agent-perf`, `agent-spec`, `agent-po` —
  spécialistes et chaîne SDD
- `agent-explore.schema.json` — livrable d'un charter (findings : `title`,
  `kind`, `severity` 1-5, `expected`, `actual`, `repro_steps[]`, `route`,
  `screenshot_path`)
- `agent-bugverify.schema.json` — livrable du vérificateur
- `explore-report`, `bugbash-bugs`, `bugbash-unconfirmed` — rapports écrits par
  le kernel

- `qa-config.schema.json` — configuration projet `.qa/qa.config.json`
  (`qa-mesh config check`)
- `fixtures/<nom>.valid.json` + `<nom>.invalid.json` — une paire par schéma,
  vérifiée par le kernel ; tout changement de contrat touche schéma, fixtures et
  producteur dans le même commit (voir `AGENTS.md`)

Règle de validation : le QA Analyst valide chaque livrable avant transmission
(JSON valide, non vide, champs requis, schéma). Invalide → relance avec motif
précis, max 2, puis STOP avec `status: error` dans `pipeline.log`.

## 6. AgentDB — mémoire persistante

Schéma complet : `.qa/agentdb/schema.json`. Implémentation : SQLite intégré à
Node (`node:sqlite`, WAL) via le kernel, zéro dépendance native ; tables
d'exploration (`explore_*`) et de bug bash ajoutées par qa-mesh-next. Le backend est
interchangeable (serveur MCP de mémoire, base vectorielle) sans toucher aux
contrats.

| Namespace | Contenu | Écrit par | Lu par |
|---|---|---|---|
| `browser-selectors` | sélecteurs validés `{domain,page,label,selector_primary,selector_fallback,validated}` | 1, 4, 6 | Analyst, 1, 4, 5, 6 |
| `browser-sessions` | sessions `{session_id,role,storage_state_path,created_at,expires_at}` ; storageState Playwright dans `.qa/agentdb/sessions/` (hors VCS) | 0 | Analyst, 0, 1, 4 |
| `coverage-memory` | `{domain,coverage_score,last_run_id,last_pass_rate_pct}` | 0, Analyst | Analyst, 0 |
| `run-journal` | `pipeline.log` JSONL par run | Analyst | Analyst |

Cycle de vie d'un sélecteur : découvert (Agent 1) → réutilisé (Agent 4) →
réparé (Agent 6, ancien primaire → fallback). Le drift DOM mineur ne coûte plus
une exploration : l'Agent 6 cherche par page + label similaire avant tout debug.

Sessions : le login est exécuté une seule fois par `qa-mesh session refresh
--role <r>` (projet Playwright `setup`, `tests/auth.setup.ts` : le mot de passe ne
passe jamais par le modèle), persisté en storageState Playwright, réutilisé par
0, 1, 4 et `qa-explorer` (`expires_at` contrôlé, TTL 24 h
par défaut). Équivalent agnostique du session-replay : aucun agent ne refait
jamais un login si une session valide existe.

## 7. Stratégie MCP multi-environnements

Le seul serveur MCP requis est `playwright-test` (fourni par Playwright ≥ 1.40 :
`npx playwright run-test-mcp-server`). Les agents 2, 3 et 5 n'utilisent aucun
outil MCP — ils restent purs fichiers/terminal, ce qui maximise la portabilité.

| Environnement | Déclaration MCP | Définitions d'agents |
|---|---|---|
| **Claude Code** | `.mcp.json` (déjà présent dans ce repo) | `.claude/agents/*.md` (subagents natifs, frontmatter `tools`/`model`) ; orchestration via outil Task |
| **OpenCode** | `opencode.json` → bloc `mcp` | `agent/*.md` ou conversion du frontmatter dans `opencode.json` ; mode `subagent` |
| **Codex (CLI)** | `~/.codex/config.toml` → `[mcp_servers.playwright-test]` | contenu des `.md` injecté comme instructions de phase (`AGENTS.md` ou prompts) ; orchestration séquentielle mono-agent |
| **Copilot Agent Mode** | `.vscode/mcp.json` → `servers.playwright-test` | prompts réutilisables `.github/prompts/*.prompt.md` ; un prompt par agent |
| **Gemini CLI** | `.gemini/settings.json` → `mcpServers` | `GEMINI.md` + prompts par phase |

Déclaration de référence (adapter la syntaxe au fichier cible) :

```json
{ "mcpServers": { "playwright-test": { "command": "npx", "args": ["playwright", "run-test-mcp-server"] } } }
```

Deux modes d'orchestration, prévus dans la définition du QA Analyst :

1. **Mode subagents** (Claude Code, OpenCode) : le QA Analyst lance chaque agent
   par son nom via l'outil Task. Isolation de contexte native → coût minimal.
2. **Mode séquentiel** (Codex, Copilot, Gemini) : un seul agent exécute les
   phases l'une après l'autre en chargeant la définition de chaque agent comme
   instructions de phase. Les contrats fichiers garantissent un comportement
   identique ; le contexte est purgé entre phases en relisant uniquement les
   livrables filtrés.

## 8. Réduction des coûts tokens

1. **Modèles différenciés** : les agents 0, 1, 2, 5 (et a11y, perf) tournent
   sur le modèle économique - ce sont les plus volumineux en E/S.
2. **Jamais de DOM brut** : snapshots d'accessibilité, éléments interactifs
   uniquement, blocs communs (nav/header/footer) déclarés une fois
   (`payload.commons`). Gain type : −60 à −70 % sur les entrées d'exploration.
3. **Transmission sélective** (tableau §2) : le filtrage est une responsabilité
   de l'orchestrateur, pas une bonne volonté des agents.
4. **Codes courts** : `C|E|M|F`, `OK|KO|INS|IGN`, `NOM|ALT|ERR|LIMITE`,
   `PRODUIT|SCRIPT|ENV` — appliqués dans tous les contrats.
5. **JSON minimal** : pas de champs vides, pas de prose, IDs stables.
6. **Mémoire AgentDB** : sélecteurs et sessions réutilisés entre campagnes ;
   la campagne N+1 sur un domaine connu saute la majeure partie de
   l'exploration.
7. **Prompt caching** : définitions d'agents stables en tête de contexte →
   cache automatique des préfixes (Claude) ; sur API directe, `cache_control:
   ephemeral` sur les blocs système.
8. **Agent 3 à la demande** : la génération Gherkin/CSV (phase la plus
   verbeuse) n'est pas dans le chemin critique automatique.
9. **Budgets** : snapshots/page, retries, passes de healing — tout est borné.
10. **Progressive disclosure** : chaque skill est un routeur court (< 160
    lignes) et des `references/` lues une à une (`qa-mesh guide <skill>/<topic>`).
    Le corps du `qa-analyst` est passé de 16,1 Ko à 11,5 Ko ; le détail des phases
    optionnelles, des loops, de l'explore et du bug bash n'est chargé que si la
    campagne en a besoin.
11. **`trace.md` au lieu du trace.zip** : les agents 5 et 6 lisent une page
    bornée (40 étapes, 50 lignes de logs, 120 lignes de snapshot).

## 9. Skills embarqués

Tous suivent le modèle routeur + références (inspiré de `skills/e2e/`,
tester-army/e2e) ; `kernel/src/commands/guide.test.ts` vérifie chaque routeur
(< 160 lignes, liens valides, aucune référence non routée).

- `qa-mesh/` — routeur de la plateforme (kernel, contrats, phases optionnelles,
  loop, explore, bug-bash, debugging, secrets, tokens).
- `qa-verify/` — prouver un changement par une exécution réelle, main contre
  branche pour un correctif.
- `qa-report-generator/`, `qa-sdd-docs/`, `qa-strategy-docs/`, `qa-test-data-factory/`.
- `playwright-best-practices/` — sous-ensemble curaté de
[testdino-hq/playwright-skill](https://github.com/testdino-hq/playwright-skill)
(MIT) : golden rules + 5 références (locators, POM, fixtures, authentication,
flaky-tests) consommées par les agents 1, 4 et 6. Pour les 65+ autres guides :
`npx skills add testdino-hq/playwright-skill`.

## 10. Recommandations

**Évolutivité.** Ajouter un agent = une entrée dans `agents/manifest.yaml` + un corps dans
`agents/bodies/` + un schéma de contrat et ses deux fixtures + une phase dans le
QA Analyst, puis `qa-mesh compile` ; rien d'autre ne bouge. Cibles naturelles : agent
accessibilité (axe-core), agent visuel (screenshot diff), agent API pure
(contrats depuis `api_calls` de l'Agent 1). Multi-projets : AgentDB est par
repo ; pour mutualiser, exposer AgentDB comme serveur MCP partagé.

**Coûts.** Suivre `metrics` de chaque enveloppe dans `pipeline.log` ; alerter
si une phase dépasse 2× sa moyenne. Premier levier si dérive : réduire
`max_snapshots_per_page`, puis resserrer la transmission sélective.

**Performance.** Le mur du temps est l'exécution navigateur, pas le LLM :
paralléliser Agent 5 (`--workers`), shard par domaine en CI. Lancer la
campagne en tâche planifiée nocturne ; le matin, seuls bugs PRODUIT et
`unresolved` demandent un humain.

**Maintenance.** Versionner `.qa/contracts/` et `.qa/agentdb/*.json` (PAS
`.qa/agentdb/sessions/` — credentials/cookies, à mettre dans `.gitignore`).
Purger `browser-selectors` des entrées non revalidées depuis > 30 jours
(champ `last_validated_at`). Traçabilité bout en bout : gap → journey
(`J-NNN`) → scénario → `// @scenario` → résultat → fix.

**Observabilité.** `pipeline.log` JSONL est la source unique : statuts par
phase, retries, anomalies, durées. Côté agents, le hook `qa-events.js` écrit
des événements sans contenu d'outil dans `.qa/events/` et `qa-mesh usage`
agrège appels, erreurs, durée et tokens par agent et par campagne (lecture
seule, sortie bornée). En CI, publier `report.json` +
`execution_report.json` comme artefacts ; un dashboard se construit par simple
agrégation des runs (`coverage-memory` donne la tendance de couverture).

**Résilience.** Idempotence par `run_id` (reprise sans rejouer les phases
`ok`) ; sessions auto-rafraîchies (max 2) ; healing borné avec requalification
PRODUIT plutôt qu'assertions affaiblies ; arrêt d'urgence si > 50 % d'échecs
persistants (rupture applicative probable) ou > 30 % d'échecs ENV (environnement
instable — inutile de réparer des tests sur une app qui ne répond pas).

## 11. Installation

1. `npm install && npx playwright install` — le serveur MCP `playwright-test`
   est déclaré dans `.mcp.json` (`npx playwright run-test-mcp-server`).
2. `cp .qa/qa.config.example.json .qa/qa.config.json` et renseigner base_url,
   rôles (variables d'environnement), routes exclues.
3. Exporter les credentials : `QA_DEFAULT_USER`, `QA_DEFAULT_PASSWORD`, … puis
   `node kernel/dist/cli.js session refresh --role default`.
4. Lancer : invoquer `qa-analyst` ou `/qa-campaign` (ou `/qa-explore`, `/qa-bugbash`).

Pour réutiliser la plateforme sur un autre projet : copier `.claude/`, `.qa/`
(sans `agentdb/sessions/` ni `runs/`), `fixtures/`, `utils/`, `tsconfig.json`
et `playwright.config.ts`, puis refaire les étapes 1-4.
