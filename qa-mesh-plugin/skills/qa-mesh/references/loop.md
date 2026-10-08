# Mode loop : non-régression ciblée et bornée

Pour une non-régression ciblée et bornée sur un module précis (déclenchée par
un échec CI, un run périodique, ou une demande explicite), utiliser le cycle
loop plutôt que la campagne complète. Le kernel calcule le verdict et la
décision — jamais un jugement LLM sur « est-ce que ça a marché ». Agents 0-6
inchangés, aucun nouveau subagent.

1. **Trigger** : commande ou hook externe désigne un `loop_id` (dossier
   `loops/<loop_id>/`, créé une fois via `node kernel/dist/cli.js loop init
   --loop <id> --whitelist <p1,p2,...>`).
2. **Context** : lire UNIQUEMENT `loops/<loop_id>/TASK.md` +
   `LOOP_INSTRUCTIONS.md` + `PROGRESS.md` (+ motifs du dernier rejet s'il y en
   a). Jamais les rapports complets des runs précédents — reset de contexte
   entre itérations.
3. **Action** : déléguer à l'agent concerné (4 pour corriger, 5 pour exécuter,
   6 pour réparer) comme dans une campagne normale.
4. **Verification** : `node kernel/dist/cli.js loop verify --loop <id> --run
   <run_id> --agent <a> --json`. Vérification MÉCANIQUE (rapport Playwright —
   seuls SCRIPT/ENV bloquent, un KO PRODUIT est un vrai bug pas un défaut de
   loop —, conformité de contrat, fichiers modifiés ⊆ whitelist). Ne jamais
   remplacer par un jugement de l'agent : `loop verify` valide ou rejette avec
   motif, il ne corrige jamais.
5. **Decision** : `node kernel/dist/cli.js loop decide --loop <id> --run
   <run_id> --json` → `done` (stop), `retry` (relancer l'action avec les motifs
   injectés), ou `needs_human` (escalade — STOP, ne pas retenter). `PROGRESS.md`
   est régénéré par le kernel à chaque décision ; ne jamais l'éditer à la main.

Le hook `loop-guard.js` bloque toute écriture hors whitelist pendant qu'un loop
est actif — ne pas tenter de le contourner.
