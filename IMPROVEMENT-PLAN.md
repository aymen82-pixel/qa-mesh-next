# IMPROVEMENT-PLAN - qa-mesh-next

> Statut : **validé le 2026-10-07**, **exécuté le 2026-10-08** (C1 à C12). Décisions appliquées : §4 ; bilan : §5.
> Références lues (lecture seule) : `_refs/qa-mesh/` @ `669d35e`, `_refs/e2e/` @ `6d5c24a`.

## 0. Constat de la phase 0

### 0.1 Baseline qa-mesh (vérifiée sur une copie jetable, pas dans `_refs/`)

| Vérification | Résultat |
|---|---|
| `npm --prefix kernel test` | 119/119 verts |
| `npm run typecheck` (racine) | vert |
| `qa-mesh compile --target claude --check` | byte-identique, 14 fichiers |
| `tests/seed.spec.ts` (chromium) | **rouge avec `@playwright/test` 1.63** (résolu depuis `^1.56.1`, navigateur absent), **vert en 1.56.1** |
| `kernel/` vs `qa-mesh-plugin/kernel/` | identiques aujourd'hui, mais copie manuelle (rsync documenté) |

### 0.2 Écarts trouvés dans qa-mesh (à traiter, pas seulement à copier)

1. **Aucun lockfile, ni à la racine ni dans `kernel/`** : la version de Playwright dérive (1.63 installé pour `^1.56.1`), ce qui casse `seed.spec.ts`.
2. **Fichiers clients** hors des deux dossiers exclus : `fixtures/pages.fixture.ts` (variables d'API préfixées par le client), `utils/api-client.ts` (commentaire client), `schemas/common.schema.ts` (commentaire outil documentaire client), `README.md` (section API).
3. **`tests/simple-input-form.spec.ts` viole les règles du projet** : URL en dur, import depuis `@playwright/test`, deux tests sans assertion, site externe (`practiceautomatedtesting.com`, aussi cité dans `playwright.config.ts` et `examples/`). Les hooks ne le bloquent pas car il est antérieur.
4. `seed.spec.ts` existe en double (racine et `tests/`) ; celui de la racine n'est pas dans `testDir`, donc jamais exécuté.
5. **Le plugin n'embarque ni `.qa/contracts/`, ni `routing.yaml`, ni `qa.config.example.json`** : son README demande de les copier à la main.
6. **Fuite potentielle existante** : l'Agent 0 se connecte en tapant le mot de passe via Playwright MCP (`auth.steps` avec `$password`). La valeur transite donc par le contexte du modèle.
7. Dérive de doc : `ARCHITECTURE.md`/`README.md` parlent de "7 agents" (il y en a 13), `COVERAGE-INTELLIGENCE.md` cite `kernel/src/coverage/` (le code est dans `kernel/src/ci/`), `/qa-heal` et `qa-report-generator` citent les fichiers JSON legacy d'AgentDB au lieu du kernel.
8. Aucun hook n'écrit d'événements JSONL aujourd'hui : C10 doit créer la source de données, pas seulement la lire.
9. Pas de fichier `LICENSE` dans qa-mesh (`package.json` dit ISC) alors que le skill `playwright-best-practices` est dérivé de testdino (MIT).

### 0.3 Contraintes d'environnement de cette session

- **`demo.playwright.dev` est bloqué par le proxy du bac à sable** (403 au CONNECT). La démo de bout en bout ne peut pas viser ce site d'ici (voir C3/C4, "Démo").
- Le dépôt `qa-mesh-next` vit pour l'instant dans un conteneur cloud éphémère, sans remote. Il faudra décider où il vit (voir §4).

## 1. Ordre d'exécution proposé

L'ordre de la mission (C1 → C12) crée des dépendances à l'envers : le bug bash (C4) a besoin du catalogue d'erreurs (C5) pour trancher `ASSERTION_FAILED`, et `trace.md` (C6) comme les findings (C3) doivent être redactés (C7) dès leur création. Je propose :

**C1 → C11 → C5 → C7 → C6 → C2 → C3 → C4 → C8 → C9 → C10 → C12**

- C11 tôt : chaque nouveau contrat (C3, C4, C5) naît avec ses deux fixtures.
- C5 puis C7 avant C6 : `trace.md` sort directement classé et redacté.
- C2 avant C3 : les nouveaux topics (explore, bug-bash, debugging) naissent au format routeur.

Chaque chantier se termine par : `npm run typecheck`, `npm --prefix kernel test`, `qa-mesh compile --target claude --check`, `qa-mesh plugin build --check` (dès C1), mise à jour de doc, commit Conventional Commits, point en 5 lignes, attente du go.

## 2. Chantiers

### C1 - Bootstrap

**Repris de e2e** : rien (hors principe "une seule source, les copies sont générées").

**Adaptation**
- Copie de `_refs/qa-mesh/` sans `.git`, sans le dossier de schémas client, `tests/knowledge-base/`, `qa-mesh-plugin/kernel/` (supprimé, régénéré).
- Nettoyage des mentions client (grep des noms du client et de ses outils → 0 hit, motif dans le message du dernier commit) et remplacement de l'exemple API par une ressource générique :
  - `schemas/items/item.schema.ts` (`ItemSchema` `.strict()`, `ItemListSchema`) ;
  - `tests/items/items.crud.spec.ts` (NOM + ERR, `UnknownSchema` sur le DELETE et l'ERR, `test.skip` si `API_URL`/`ITEMS_ENDPOINT`/`API_TOKEN` absents) ;
  - fixture `apiRequest` sur `API_URL`/`API_TOKEN` (génériques).
- `qa-mesh plugin build [--check]` : nouvelle commande kernel (TS, testée, multi-OS, remplace le rsync/robocopy du README) qui génère `qa-mesh-plugin/` depuis `.claude/agents` (compilés), `.claude/commands`, `.claude/skills`, `.claude/hooks`, `kernel/src` + `package.json` + lockfile, et **ajoute** `templates/.qa/` (contrats, `routing.yaml`, `qa.config.example.json`) pour corriger l'écart 0.2-5. `--check` échoue si le plugin commité diverge (même logique que `compile --check`).
- Ajout d'un `package-lock.json` racine et pin de `@playwright/test` sur la version dont le navigateur est installable de façon reproductible (1.56.1 vérifié ici ; à confirmer sur ta machine).
- `.gitignore` : `_refs/`, `kernel/dist*`, `.qa/runs/`, `.qa/agentdb/sessions/`, `.qa/events/`, `test-results/`.

**Fichiers** : tout le squelette ; `kernel/src/commands/plugin.ts` (+ test) ; `schemas/items/` ; `tests/items/` ; suppression de `qa-mesh-plugin/kernel/`.

**Contrats** : aucun.

**Tests** : baseline complète (typecheck, 119 tests kernel, `compile --check`, `seed.spec.ts`) **avant** toute modification, puis les mêmes après + test de `plugin build --check`.

**Points à trancher** (§4) : sort de `simple-input-form.spec.ts` et du `seed.spec.ts` racine ; plugin généré commité ou non ; un ou deux commits pour C1.

### C11 - Contrats renforcés

**Repris de e2e** : `AGENTS.md` §Contracts, une fixture valide et une invalide par schéma de fil, test qui les vérifie, règle "schéma + 2 fixtures + producteur dans la même revue".

**Adaptation**
- `.qa/contracts/fixtures/<nom>.valid.json` et `<nom>.invalid.json`, **en enveloppe complète** (on teste aussi le lien `$ref` vers `envelope.schema.json`, via `ContractRegistry.validateDeliverable`).
- Test kernel `contracts.fixtures.test.ts` : chaque schéma a ses deux fixtures, la valide passe, l'invalide échoue, aucune fixture orpheline.
- Nouveau contrat `qa-config.schema.json` pour valider `.qa/qa.config.json` (la config va gagner `explore`, `bugbash`, `secrets`, `known_non_bugs`, `ai_judge`) + commande `qa-mesh config check`.
- Règle documentée dans `AGENTS.md` (créé ici, complété en C12).

**Fichiers** : 13 × 2 fixtures + celles de `qa-config` ; `kernel/src/contracts.fixtures.test.ts` ; `kernel/src/commands/config.ts`.

**Contrats** : ajout de `qa-config.schema.json` (aucun schéma existant modifié).

**Tests** : le test ci-dessus ; `config check` sur `qa.config.example.json` (valide) et une config cassée (invalide).

### C5 - Taxonomie de codes d'erreur

**Repris de e2e** : `docs/reference/errors.mdx` (code → classe → piste), principe "un modèle ne choisit jamais le code", `scripts/check-error-codes.ts` (code utilisé non documenté ou documenté jamais levé = échec).

**Adaptation**
- `kernel/src/errors/catalog.ts` : `{ code, class: PRODUIT|SCRIPT|ENV, hint, ambiguous? }`. Codes initiaux : `LOCATOR_NOT_FOUND`, `LOCATOR_AMBIGUOUS`, `ACTION_FAILED` (élément couvert/désactivé), `NAV_TIMEOUT`, `TEST_TIMEOUT`, `AUTH_EXPIRED`, `ENV_UNREACHABLE`, `HTTP_5XX`, `CONTRACT_MISMATCH`, `ASSERTION_FAILED`, `UNCLASSIFIED`.
- `kernel/src/errors/classify.ts` (pur) : règles sur le message/stack Playwright (ex. `strict mode violation` → `LOCATOR_AMBIGUOUS`, `net::ERR_CONNECTION_REFUSED` → `ENV_UNREACHABLE`, redirection vers `auth.login_url` → `AUTH_EXPIRED`, erreur de `typedRequest` → `CONTRACT_MISMATCH`).
- Commande `qa-mesh classify --report <playwright.json> [--json]` : un code par test KO, sans LLM.
- `qa-test-executor` appelle `classify` d'abord ; il ne raisonne que sur `UNCLASSIFIED` et les codes `ambiguous`, avec justification écrite.
- `qa-healing-coordinator` ne reçoit que les codes de classe SCRIPT : l'arête `agent-5->agent-6` de `routing.yaml` filtre sur `failure.class==SCRIPT`.
- Script `kernel/scripts/check-error-codes.ts` (lancé par `npm --prefix kernel test`) : tout code littéral du kernel est au catalogue et dans `docs/errors.md` ; tout code du catalogue a au moins une règle de classification ou un émetteur, et une fixture de message réel.

**Tension à trancher** : la doctrine actuelle dit "doute PRODUIT/SCRIPT → SCRIPT, le healing tranchera". Si `ASSERTION_FAILED` est PRODUIT, une assertion obsolète ne passe plus par le healing. Proposition : `ASSERTION_FAILED` = PRODUIT avec `ambiguous: true`, l'Agent 5 peut le requalifier SCRIPT avec motif, et la requalification est journalisée.

**Fichiers** : `kernel/src/errors/{catalog,classify}.ts` (+ tests et fixtures de messages) ; `kernel/src/commands/classify.ts` ; `docs/errors.md` ; corps des agents 5 et 6 ; `routing.yaml`.

**Contrats** : `agent-5.schema.json`, `failure` gagne `code` (enum du catalogue) et `class` ; `kind` reste accepté (rétrocompatible). Fixtures C11 mises à jour dans le même commit.

**Tests** : un cas par code depuis de vrais messages Playwright 1.56 ; `check-error-codes` en vert et en rouge (code fantôme injecté).

### C7 - Secrets et redaction

**Repris de e2e** : `docs/security.mdx` (registre nommé, valeurs uniquement en env, `<secret:name>`, variantes JSON/HTML/percent-encoding/casse, préfixe tronqué ≥ 8 caractères, valeur < 6 caractères refusée, pas de screenshot après saisie d'un secret, "où la redaction s'arrête").

**Adaptation**
- `qa.config.json#secrets: [{ name, env }]` (noms seulement) ; les `password_env` des rôles sont enregistrés automatiquement.
- `kernel/src/secrets/redact.ts` (pur, zéro dépendance) : utilisé par `journal`, `trace render`, `explore finding`, `findings merge`, le rendu des rapports. Côté tests, le même fichier est importé depuis `utils/` (une seule source).
- Fixture `secretFill(locator, name)` dans `fixtures/pages.fixture.ts` : remplit depuis l'env et enregistre le locator pour `mask` sur tout screenshot ultérieur du test.
- `qa-guard.js` : JWT, `Bearer <token>`, `sk-…` bloqués **sur tous les chemins** (pas seulement `tests/`), avec seuils de longueur pour éviter les faux positifs de doc.
- **Correction de l'écart 0.2-6** : la connexion passe par un setup Playwright déterministe (`tests/auth.setup.ts`, lancé par `qa-mesh session refresh --role <r>`) qui écrit le `storage_state` ; l'Agent 0 ne tape plus jamais de mot de passe. Les explorateurs démarrent de cette session, donc leurs screenshots restent autorisés.

**Limite à accepter** : la redaction protège tout ce que **nous** écrivons (rapports, `trace.md`, findings, journaux). Elle ne peut pas filtrer en direct ce que le serveur Playwright MCP renvoie au modèle : ce canal n'est pas notre code. La mitigation est de ne jamais faire transiter un secret par ce canal (connexion par setup, pas par MCP).

**Fichiers** : `kernel/src/secrets/` ; `utils/redact.ts` ; `fixtures/pages.fixture.ts` ; `tests/auth.setup.ts` ; `.claude/hooks/qa-guard.js` ; corps de l'Agent 0 ; `qa.config.example.json`.

**Contrats** : `qa-config.schema.json` (`secrets`) ; aucun payload d'agent.

**Tests** : unitaires de redaction (chaque variante d'encodage, préfixe tronqué, valeur courte refusée, absence de faux positif) ; test de `qa-guard` par stdin JSON (JWT/Bearer/sk- bloqués, placeholders autorisés) ; `grep -r` de la valeur d'un secret factice dans `.qa/runs/` après un run = 0.

### C6 - Page `trace.md` par test échoué

**Repris de e2e** : la structure de la page (`docs/debugging.mdx`) : en-tête avec code, Expected/Observed, "Look at" (ligne), steps, journal de l'app plafonné (50 lignes, erreurs d'abord), screen at failure.

**Adaptation**
- `qa-mesh trace render --run <id> --report <playwright.json>` écrit `.qa/runs/<id>/results/<slug-test>/trace.md` pour chaque test KO/flaky.
- Sources : le reporter JSON (erreur, steps, attachments), le `trace.zip` (événements d'actions, console, `pageError`, réseau 4xx/5xx), l'attachment `error-context.md` de Playwright pour le snapshot d'accessibilité à l'échec.
- **Lecture du zip sans dépendance** : petit lecteur ZIP sur `node:zlib` (`inflateRaw`) ; zip64 non supporté, échec explicite. Le format interne du trace Playwright n'est pas documenté : parseur tolérant, et la page se rend quand même depuis le seul rapport JSON si le zip manque ou change.
- Code d'erreur issu de C5, contenu redacté par C7.
- Agents 5 et 6 : lisent `trace.md`, plus jamais les traces brutes.

**Point à valider** : il faut `trace: 'retain-on-failure'` dans `playwright.config.ts` (aujourd'hui `on-first-retry`, donc aucune trace en local avec `retries: 0`). Ce fichier est protégé par les règles : je ne le modifie qu'avec ton accord. Le reporter JSON passe par `PLAYWRIGHT_JSON_OUTPUT_NAME`, sans toucher la config.

**Fichiers** : `kernel/src/trace/{zip,parse,render}.ts` (+ tests) ; `kernel/src/commands/trace.ts` ; corps des agents 5 et 6.

**Contrats** : aucun nouveau ; `agent-5` `failure.trace_path` (optionnel).

**Tests** : fixtures réelles (rapport JSON + trace.zip produits par un test volontairement KO) → snapshot du `trace.md` ; zip absent ; zip corrompu ; troncature à 50 lignes ; secret factice absent du rendu.

### C2 - Skills en progressive disclosure

**Repris de e2e** : `skills/e2e/SKILL.md` (routeur court, table "Topic | Fichier | À lire quand") et `e2e guide [topic]`.

**Constat honnête** : `playwright-best-practices` est **déjà** un routeur (45 lignes) avec 5 références, et Claude Code charge déjà les références à la demande. Les 4 autres skills font 2,8 à 3,2 Ko chacun : les découper rapporterait peu.

**Mesure (≈ 4 caractères/token)**

| Élément | Taille | Tokens ≈ |
|---|---|---|
| Pack `playwright-best-practices` complet | 41,5 Ko | 10 400 |
| Son routeur seul | 2,7 Ko | 670 |
| Une référence moyenne | 7,8 Ko | 1 900 |
| 4 autres skills | 12,2 Ko | 3 000 |
| Corps `qa-analyst` (chargé à chaque orchestration) | 15,9 Ko | 4 000 |
| Sections conditionnelles de `qa-analyst` (mode loop, stratégie tokens, spécialistes, phase 3, protocole, détail CLI) | ≈ 5,5 Ko | ≈ 1 400 |

**Mesure réelle (C2 livré)** : corps `qa-analyst` 16,1 Ko (après C5/C7) → 11,5 Ko,
soit **-28 % (≈ 1 150 tokens) par orchestration**, alors qu'il route désormais vers
9 topics (dont explore et bug-bash) au lieu de les embarquer. Routeurs : `qa-mesh`
47 lignes, `playwright-best-practices` 48 lignes. Les 4 petits skills ne sont pas
découpés (gain nul, conforme au plan) ; le test de forme de `guide.test.ts`
s'applique à tous.

**Où est le vrai gain**
1. **Le corps de `qa-analyst`** : sortir les sections conditionnelles en topics `qa-mesh guide orchestration/<topic>` économise ≈ 35 % (≈ 1 400 tokens) par orchestration, et évite d'ajouter ≈ 1 000 tokens de plus pour explore et bug bash en C3/C4. Comme ce préfixe est en cache, le gain en coût est plus faible que le gain en tokens.
2. **La portabilité** : les cibles codex, copilot et gemini ne chargent pas les skills. `qa-mesh guide` les rend lisibles par CLI sur les 5 runtimes, topic par topic, au lieu d'un bundle complet.

**Adaptation**
- `qa-mesh guide` (liste), `qa-mesh guide <skill>` (routeur), `qa-mesh guide <skill>/<topic>` (référence), lus depuis `.claude/skills/` ou depuis le plugin.
- Nouveau skill routeur `qa-mesh` (< 160 lignes) avec les topics `orchestration`, `loop`, `explore`, `bug-bash`, `debugging`, `secrets`, `contracts`.
- Les 4 skills monolithiques gardent leur contenu ; on ajoute seulement la table de topics si un découpage a du sens (je propose de **ne pas** les découper).

**Fichiers** : `kernel/src/commands/guide.ts` (+ test) ; `.claude/skills/qa-mesh/` ; corps `qa-analyst` allégé (recompilé).

**Contrats** : aucun.

**Tests** : `guide` liste, rend un routeur, rend un topic, topic inconnu → exit 2 avec liste ; test de taille (routeur < 160 lignes).

### C3 - Mode explore (`qa-explorer`, `/qa-explore`)

**Repris de e2e** : `references/explore.md` et `docs/explore.mdx` : boucle planificateur → charter → exécution → findings, `report_finding` (titre, issue/warning, sévérité 1-5, expected, actual, repro), budgets (8 charters, 1-12 ; 10 min, 3-15 ; 40 actions par charter), arrêt après 3 charters ratés ou bloqués sans finding, verdict (issue = échec, warnings tolérés, tout bloqué = bloqué), départ depuis une session, évaluation de clôture.

**Adaptation à qa-mesh (le kernel n'appelle aucun LLM)**
- Le planificateur est l'orchestrateur (`qa-analyst`) ; chaque charter est exécuté par l'agent `qa-explorer` (haiku ou sonnet à décider) via Playwright MCP, démarré par `browser_set_storage_state`.
- Le kernel tient l'état : `qa-mesh explore init|charter-start|charter-end|finding|decide|status`, tables `explore_runs`, `explore_charters`, `explore_findings` (AgentDB, DDL additif). `decide` calcule seul la suite (`continue`, `stop:finished|step-limit|time|stuck`) et régénère `PROGRESS.md` (même moteur de rendu que les loops).
- `qa-mesh explore context` imprime le bloc à injecter : objectif, budgets, `known_non_bugs[]`, règles `read_only`, posture du charter.
- `qa-mesh explore finding` valide, redacte et stocke ; un screenshot d'un charter "taché" (secret saisi) est refusé.
- Config : `explore: { max_charters, max_steps_per_charter, max_duration_min, parallelism }`, `known_non_bugs: []`.

**Risque majeur : parallélisme MCP.** Le serveur `playwright-test` est un seul processus avec un navigateur. Plusieurs subagents en parallèle risquent de se marcher dessus (e2e résout cela avec des sessions MCP multiples, que `playwright-test` n'a pas). Proposition : `parallelism: 1` par défaut, plus un spike en début de C3 pour vérifier si `run-test-mcp-server` isole les contextes. Si non, l'option est plusieurs serveurs déclarés (`playwright-explore-1..4`), éventuellement avec `@playwright/mcp --isolated` : ce serait la seule nouvelle dépendance, justifiée ici avant tout ajout.

**Fichiers** : `agents/manifest.yaml` + `agents/bodies/qa-explorer.md` (compilé) ; `.claude/commands/qa-explore.md` ; `kernel/src/explore/{state,decide,render}.ts` ; `kernel/src/commands/explore.ts` ; `qa.config.example.json`.

**Contrats** : nouveau `agent-explore.schema.json` (`charter`, `status`, `findings[]` : `title`, `kind`, `severity` 1-5, `expected`, `actual`, `repro_steps[]`, `route`, `screenshot_path?`) ; `envelope.schema.json` accepte `agent-explore`. Fixtures C11.

**Tests** : `decide` (budgets, 3 échecs consécutifs, fin du temps, tout bloqué), rendu `PROGRESS.md`, refus d'un screenshot taché, validation de finding.

### C4 - Bug bash avec preuve (`/qa-bugbash`)

**Repris de e2e** : `references/bug-bash.md` et `docs/bug-bash.mdx` : préparation (un compte jetable `bb-<slug>` par charter, lecture seule sur un environnement partagé), 5 à 10 charters avec postures (premier usage, chiffres et textes, saisies limites, état, chemins d'erreur), fusion, tri (artefact d'explorateur, environnement, design, fixture, candidat), un test de repro par candidat, confirmé seulement s'il échoue en `ASSERTION_FAILED` sur l'assertion qui encode le bug, rapport (confirmés d'abord, puis non vérifiés, rejetés par motif, warnings).

**Adaptation**
1. **Préparation** : `bugbash: { shared_env, accounts: [{ slug, username_env, password_env }] }`. `shared_env: true` impose `read_only` (injecté par `explore context`, et refus des charters de posture "saisies limites" ou "état" par le kernel).
2. **Exécution** : N `qa-explorer` via Task, un charter chacun (parallélisme limité par le spike C3).
3. **Fusion** : `qa-mesh findings merge --run <id>` : même `route` + titres normalisés proches (`db/distance.ts`, distance relative ≤ 0,3 par défaut, configurable), regroupement transitif, on garde la repro la plus courte et tous les charters d'origine. Seuil prudent : Levenshtein ne voit pas les doublons sémantiques, donc il vaut mieux deux doublons qu'une fusion abusive.
4. **Vérification** : nouvel agent `qa-bug-verifier` : tri (le bucket est un jugement LLM, enregistré avec sa justification), puis écriture de `tests/bugbash/<slug>.spec.ts` (règles du projet, fixtures, `// @finding <id>`, assertion porteuse du marqueur `expect(…, '[BUG:<id>] …')`). **Le kernel tranche** : `qa-mesh bugbash verify --finding <id>` lance lui-même `npx playwright test <spec> --retries=0 --repeat-each=2 --reporter=json`, puis confirme seulement si les deux runs échouent, avec le code `ASSERTION_FAILED` (C5) et le marqueur `[BUG:<id>]`. Test vert = non reproduit ; autre code = test faux (le vérificateur a 2 essais, ensuite non confirmé).
5. **Sortie** : `.qa/runs/<id>/bugbash/bugs_report.json` (confirmés, chacun avec son spec qui échoue) et `unconfirmed.json` (motif par finding). Je les range dans `bugbash/` pour éviter la collision avec le `bugs_report.json` existant de l'Agent 5.
- Les specs de repro portent `@bugbash` et sont exclues de la suite normale (`--grep-invert @bugbash`).

**Fichiers** : `agents/bodies/qa-bug-verifier.md` + manifeste ; `.claude/commands/qa-bugbash.md` ; `kernel/src/bugbash/{merge,verdict}.ts` ; `kernel/src/commands/{findings,bugbash}.ts`.

**Contrats** : `agent-bugverify.schema.json` (finding_id, bucket, repro_spec, test_title) ; `bugbash-report.schema.json` (sortie kernel : confirmés et non confirmés) ; enveloppe étendue. Fixtures C11.

**Tests** : fusion (doublons exacts, proches, routes différentes), verdict (KO marqué → confirmé, vert → non reproduit, `LOCATOR_NOT_FOUND` → test faux, un seul des deux runs KO → instable donc non confirmé).

**Démo (définition de terminé)** : `demo.playwright.dev` est inaccessible depuis ce bac à sable. Options : (a) une petite app TodoMVC locale dans `demo/todo/`, écrite par nous, servie par un script Node sans dépendance, avec un ou deux bugs plantés documentés à part (comme le web-benchmark de e2e) ; (b) tu lances la démo sur ta machine contre `demo.playwright.dev`. Je recommande (a) pour la CI et (b) en complément. L'exécution agentique (explorateurs) demande une session Claude Code avec le plugin : je tenterai `claude -p` ici si c'est authentifié, sinon la démo agentique se fera chez toi, avec la partie kernel démontrée ici.

### C8 - Fixture `aiJudge`

**Repris de e2e** : `agent.assert` (le juge ne voit que la question et l'état courant, réponse au schéma, une réparation puis échec, "inconclusive" = échec), et la règle "toujours apparier un jugement agentique avec une vérification déterministe".

**Adaptation**
- `fixtures/ai-judge.ts`, exposée par `pages.fixture.ts`, **désactivée par défaut** (`ai_judge.enabled: false` → `test.skip` explicite).
- Verdict Zod `{ pass, confidence, reason }`, seuil `minConfidence`, cache disque `.qa/ai-judge-cache/` par hash de (entrée + critère + modèle + version du prompt).
- Fournisseurs : Anthropic Messages API ou endpoint compatible OpenAI, via `fetch` natif : **aucune dépendance SDK**. Clé lue depuis l'env nommé dans la config, entrée redactée (C7) avant envoi.
- Contraintes respectées : ce code vit côté tests, **pas dans le kernel** (contrainte 9) ; seul le fournisseur configuré reçoit des données (contrainte 8).
- Règle "jamais seule" : `qa-guard` bloque l'écriture d'un test qui appelle `aiJudge` sans aucun autre `expect(` dans le même test (heuristique statique), et la règle est écrite dans `.claude/rules/testing.md`.

**Fichiers** : `fixtures/ai-judge.ts` ; `utils/ai-judge/{providers,cache}.ts` ; `qa-guard.js` ; `testing.md` ; `qa.config.example.json`.

**Contrats** : `qa-config.schema.json` (`ai_judge`).

**Tests** : avec un faux fournisseur HTTP local : pass, échec sous le seuil, réponse invalide puis réparation, cache touché (aucun appel au 2e run), désactivé → skip. Aucun appel réseau réel en CI.

### C9 - Skill `qa-verify`

**Repris de e2e** : `.dev/skills/verify/SKILL.md` : preuve par exécution réelle, choix de la surface, "ça compile" n'est pas une preuve, main contre branche pour un fix (`git worktree`), preuves (sortie CLI, vidéo, captures), "si non vérifiable, le dire".

**Adaptation** : surfaces qa-mesh (kernel `dist` reconstruit, hooks alimentés par stdin JSON, `compile --check`, `plugin build --check`, Playwright sur l'app de démo en `--headed`/`--video`, artefacts de run greppés pour les secrets).

**Fichiers** : `.claude/skills/qa-verify/SKILL.md` (+ références si > 160 lignes) ; `NOTICE`.

**Tests** : pas de code ; vérification en appliquant le skill au chantier suivant.

### C10 - Observabilité des agents (`qa-mesh usage`)

**Repris de e2e** : la discipline de `unbox-ai` (lecture seule, sortie bornée, "partir large puis zoomer", `--json` explicite). **Pas de copie de texte** : `unbox-ai` est un dépôt tiers (`tester-army/unbox-ai`) dont je n'ai pas pu vérifier la licence depuis ici.

**Adaptation**
- Nouveau hook `qa-events.js` (PreToolUse, PostToolUse, SubagentStop) qui ajoute en JSONL à `.qa/events/<session>.jsonl` : horodatage, événement, nom d'outil, `tool_use_id`, agent si fourni. **Jamais le contenu des entrées ou sorties d'outils** (secrets). Fichier local et gitignoré, aucune télémétrie.
- `qa-mesh usage [--run <id>] [--agent <a>] [--top N] [--json]` : appels d'outils, durées (Pre → Post), et tokens lus dans le transcript quand Claude Code les fournit. Les champs d'agent et de transcript dépendent de la version de Claude Code : vérifiés en début de chantier, avec un repli "agent inconnu".
- Attribution à une campagne : par fenêtre de temps croisée avec `pipeline.log`.

**Fichiers** : `.claude/hooks/qa-events.js` ; `settings.json` ; `hooks.json` (via `plugin build`) ; `kernel/src/usage/` ; `kernel/src/commands/usage.ts`.

**Tests** : JSONL de fixture (y compris lignes corrompues ignorées), bornage de sortie, agrégation par agent et par run.

### C12 - Documentation

`README.md` (mode opératoire débutant incluant explore et bug bash), `ARCHITECTURE.md` (nouveaux agents, flux explore et bug bash, diagramme mermaid à jour, correction des écarts 0.2-7), `CLAUDE.md`, `AGENTS.md` (contrats, invariants, gotchas), `CHANGELOG.md` (qa-mesh → qa-mesh-next), `NOTICE` final, grep client documenté dans le message du dernier commit.

## 3. Transverse

### Licences et `NOTICE`
- Apache-2.0 §4 : copie de la licence (`LICENSES/Apache-2.0.txt`), **reproduction du `NOTICE` de e2e** ("e2e, Copyright 2026 TesterArmy, Inc."), mention des modifications et liste fichier dérivé → source.
- Fichiers dérivés prévus : `.claude/skills/qa-mesh/references/{explore,bug-bash,debugging}.md`, `.claude/skills/qa-verify/SKILL.md`, `docs/errors.md` (structure), `kernel/scripts/check-error-codes.ts` (logique), `kernel/src/secrets/redact.ts` (règles), `kernel/src/trace/render.ts` (structure de page), `agents/bodies/qa-explorer.md` et `qa-bug-verifier.md`.
- Le skill `playwright-best-practices` (testdino, MIT) entre aussi dans `NOTICE`.

### Dépendances
**Aucune nouvelle dépendance prévue.** Lecteur ZIP sur `node:zlib`, appels LLM d'`aiJudge` via `fetch`, Zod déjà présent. Seule exception possible : `@playwright/mcp` si le spike C3 montre que l'isolation parallèle l'exige ; elle serait alors justifiée ici avant l'ajout.

### Ce que je ne reprends pas de e2e
Replay cache, modèles de décision, moteur mobile, OAuth et abonnements, télémétrie PostHog, `e2e feedback`, sessions chiffrées AES (Playwright `storageState` + `.gitignore` suffit ici), réécriture des téléchargements.

### Inutile ou risqué (synthèse)

| Point | Avis |
|---|---|
| Découper les 4 petits skills (C2) | Gain ≈ nul, je propose de ne pas le faire |
| Explorateurs en parallèle sur un seul MCP (C3/C4) | Risque de collision : séquentiel par défaut, spike |
| Redaction "partout" (C7) | Impossible sur le flux MCP en direct ; mitigation par connexion déterministe |
| Dédoublonnage Levenshtein (C4) | Rate les doublons sémantiques ; seuil prudent |
| Classification par regex (C5) | Fragile entre versions Playwright : fixtures par version, repli `UNCLASSIFIED` |
| Format interne de `trace.zip` (C6) | Non documenté : parseur tolérant, rendu dégradé possible |
| Tokens par agent (C10) | Dépend de ce que Claude Code expose : "si disponible" |
| `aiJudge` (C8) | Non déterministe et payant : désactivé par défaut, cache, jamais seul |

## 4. Décisions attendues avant C1

1. **Ordre** C1 → C11 → C5 → C7 → C6 → C2 → C3 → C4 → C8 → C9 → C10 → C12 : OK ?
2. **Où vit le dépôt** : ce conteneur est éphémère. Je pousse vers un nouveau repo GitHub que tu crées (lequel ?), ou je l'écris dans un dossier de ton ordinateur quand il sera relié ?
3. **Plugin généré** : commité (installable via marketplace, contrôlé par `plugin build --check`) ou seulement produit au build ?
4. **`tests/simple-input-form.spec.ts`** et `examples/` avec URL externe : supprimer (recommandé) ou réécrire ?
5. **`playwright.config.ts`** (fichier protégé) : j'ai ton accord pour `trace: 'retain-on-failure'`, retirer le commentaire de site externe et ajouter un projet `setup` (C6, C7) ?
6. **Agent 0** : OK pour remplacer la connexion par MCP par un setup déterministe (C7) ?
7. **`ASSERTION_FAILED`** : PRODUIT avec requalification possible par l'Agent 5 (proposé) ?
8. **Démo** : app locale avec bugs plantés (recommandé) et/ou démo sur ta machine contre `demo.playwright.dev` ?
9. **Licence** de qa-mesh-next (MIT, Apache-2.0, ISC, propriétaire) ?
10. **C1** en un commit, ou deux (copie vérifiée puis plugin à source unique) ?

### Décisions appliquées (2026-10-07)

- Q2 : nouveau dépôt GitHub `aymen82-pixel/qa-mesh-next` (à créer côté GitHub, voir point C1).
- Sans réponse explicite, les recommandations du plan s'appliquent : ordre proposé, plugin généré **et** commité (`plugin build --check`), `simple-input-form.spec.ts` et `seed.spec.ts` racine supprimés (`examples/` conservés comme documentation), C1 en un seul commit.
- C5 : `ASSERTION_FAILED` = PRODUIT requalifiable avec motif. C7 (validé) : projet `setup` dans `playwright.config.ts`, Agent 0 sans connexion MCP.
- Restent ouvertes : `trace` dans `playwright.config.ts` (C6), démo (C4), licence (C12).

## 5. Bilan d'exécution (2026-10-08)

| Chantier | Commit | Écart par rapport au plan |
|---|---|---|
| C1 Bootstrap | `chore(bootstrap)` | Playwright épinglé en 1.56.1 (navigateurs de l'environnement) |
| C11 Contrats | `feat(contracts)` | Ajout de `qa-config.schema.json` + `config check` |
| C5 Erreurs | `feat(errors)` | Le script de vérification est une commande kernel (`qa-mesh errors check`) et non `kernel/scripts/check-error-codes.ts` |
| C7 Secrets | `feat(secrets)` | Ajout de `session refresh` (connexion déterministe) |
| C6 trace.md | `feat(trace)` | - |
| C2 Skills | `feat(skills): progressive disclosure` | Routeur unique `qa-mesh` pour l'orchestrateur ; les 4 petits skills non découpés (gain nul) |
| C3 Explore | `feat(explore)` | `parallelism` borné 1-4 mais 1 recommandé (un seul navigateur MCP) ; pas de `@playwright/mcp` ajouté |
| C4 Bug bash | `feat(bugbash)` | Démo sur une app locale (`demo/todo/`), `demo.playwright.dev` étant bloqué par le proxy de la session ; B-001 et B-002 confirmés par le kernel |
| C8 aiJudge | `feat(ai-judge)` | - |
| C9 qa-verify | `feat(skills): skill qa-verify` | - |
| C10 Usage | `feat(usage)` | Hook dédié `qa-events.js` (les hooks existants n'écrivaient pas de JSONL) |
| C12 Docs | `docs` (dernier commit) | Grep client documenté dans le message du commit |

Dépendances : **aucune nouvelle dépendance** ajoutée (ZIP sur `node:zlib`,
fournisseurs `aiJudge` sur `fetch`, Zod déjà présent).

Restent ouverts : licence de qa-mesh-next (`package.json` garde `ISC` par
défaut), poussée vers `aymen82-pixel/qa-mesh-next` (dépôt à créer et à
autoriser pour la session ; un bundle git complet est fourni en attendant).
