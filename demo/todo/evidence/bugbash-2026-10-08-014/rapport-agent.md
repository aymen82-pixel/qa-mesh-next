# Rapport rendu par qa-analyst (claude -p, mode bug bash)

> Sortie finale de la session agentique du 2026-10-08, conservée telle quelle.

# Rapport du bug bash (run 2026-10-08-014)

Périmètre : liste de tâches sur http://127.0.0.1:4280/. J'ai mené 3 charters à la suite, car `parallelism` vaut 1. Ils ont donné 2 findings, fusionnés en 2 candidats. Le kernel a confirmé les deux : leur test de repro échoue 2 fois sur 2 en `ASSERTION_FAILED`, sur le marqueur annoncé. Le verdict d'exploration est `failed` (2 issues, 0 warning). L'arrêt vient du budget de 3 charters.

## Bugs confirmés

| ID | Sév. | Bug | Test de repro | Échec observé |
|---|---|---|---|---|
| B-001 | 4 | Le compteur « items left » ignore les tâches cochées et affiche toujours le nombre total | `tests/bugbash/b-001.spec.ts` | `[BUG:B-001]` : attendu « 2 items left », reçu « 3 items left » |
| B-002 | 3 | Une saisie d'espaces seuls crée une tâche sans libellé (case et bouton Delete sans texte). La saisie vide est bien ignorée. | `tests/bugbash/b-002.spec.ts` | `[BUG:B-002]` : attendu 0 élément de liste en plus, reçu 1 |

B-001 vient du charter 1 (posture `numbers-and-copy`) et B-002 du charter 2 (`edge-input`). Le charter 3 (`state`) n'a rien trouvé de nouveau : il n'a pas redéclaré F-001, déjà rapporté.

## Non confirmés

`unconfirmed.json` est vide : 0 non vérifié, 0 non reproduit, 0 instable, 0 test invalide, 0 rejeté, 0 warning.

## Points à connaître

- **Syntaxe de `bugbash verify`.** Votre déroulé ne donne pas la forme de la commande. Les deux vérificateurs ont constaté qu'elle n'a pas de flag `--id` : `bugbash verify --run <id> <verify.json>`. Chacun a écrit son fichier de soumission (`verify-b-001.json`, `verify-b-002.json`). Pour B-001, le vérificateur indique que `BASE_URL=http://127.0.0.1:4280` est nécessaire, sinon le projet pointe sur `localhost:3000`.
- **Seed Playwright MCP.** Le vérificateur de B-001 dit que `planner_setup_page` avec `tests/seed.spec.ts` a échoué. Il a inspecté l'app sans seed, et le rejeu MCP s'est interrompu avant l'étape qui coche. Le test repose donc sur les noms accessibles vus dans le snapshot, et le kernel a quand même confirmé l'échec attendu.
- **Item vide au chargement.** Ce même vérificateur a vu un item sans libellé déjà présent au chargement, sous Alpha. Il l'attribue à un état laissé par une session précédente, sans l'avoir creusé. Il correspond probablement à B-002 : les deux vérificateurs ont tourné en même temps sur un seul navigateur MCP.
- **Non couvert.** L'édition d'une tâche semble absente de l'interface : un double-clic n'ouvre aucun champ. Le rendu visuel d'un texte de 300 caractères n'a pas été examiné.
- **Fichiers ajoutés.** Je n'ai pas lancé `typecheck` ni de commit. Les deux specs et les rapports sont dans `.qa/runs/2026-10-08-014/bugbash/`. Les tests sont tagués `@bugbash` et exclus de la suite normale.
