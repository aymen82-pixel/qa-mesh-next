# Mode explore (`/qa-explore`)

Explorer l'application vers un objectif sans test écrit : voir ce qu'elle fait,
chercher des régressions, repérer ce qui mérite un test. Rôles :

| Qui | Fait |
| --- | --- |
| Planificateur (`qa-analyst`) | Choisit le charter suivant (une zone, une posture) ou déclare l'objectif couvert ; rédige l'évaluation finale |
| `qa-explorer` | Mène UN charter via Playwright MCP et rapporte les findings (contrat `agent-explore`) |
| Kernel | État, budgets, arrêt, verdict, redaction, `PROGRESS.md`, `explore_report.json` |

## Boucle

```bash
node kernel/dist/cli.js explore init --run <id> --goal "<objectif>" [--session <rôle>] [--read-only]
node kernel/dist/cli.js explore context --run <id>          # à injecter dans le prompt du planificateur et de l'explorateur
node kernel/dist/cli.js explore start --run <id> --title "<t>" --instruction "<i>" [--posture <p>] --json
#   -> { index, output, evidence_dir, max_steps } : lancer qa-explorer avec le contexte + ce charter
node kernel/dist/cli.js explore ingest --run <id> .qa/runs/<id>/explore/charter-<n>.json   # fait par qa-explorer
node kernel/dist/cli.js explore decide --run <id> [--finished] --json   # continue | stop
node kernel/dist/cli.js explore close --run <id> --assessment "<texte>"
```

- Planifier à partir du contexte : objectif, charters déjà menés, findings déjà
  rapportés, temps et charters restants. Un charter = une phrase : route de
  départ, zone, posture (« Depuis /cart, changer les quantités et vérifier
  chaque prix et total contre le reste de la page »). Un charter qui couvre
  toute l'app ne couvre rien.
- `--finished` sur `decide` quand l'objectif est couvert.
- Arrêt calculé par le kernel : objectif couvert, budget de charters, durée
  (dernière minute réservée à la clôture), ou 3 charters consécutifs ratés ou
  bloqués sans finding.
- Verdict (`close`) : `failed` dès une issue (exit 1), `blocked` si tout a été
  bloqué (exit 2), sinon `passed` (exit 0, warnings tolérés).

## Budgets (`qa.config.json#explore`)

| Clé | Défaut | Plage |
| --- | --- | --- |
| `max_charters` | 8 | 1-12 |
| `max_steps_per_charter` | 40 actions | 1-100 |
| `max_duration_min` | 10 | 3-15 |
| `parallelism` | 1 | 1-4 (voir topic `bug-bash`) |

`known_non_bugs[]` (config) est injecté dans le contexte pour réduire les faux positifs.

## Sessions et secrets

`--session <rôle>` : la session doit exister (`session refresh --role <r>`) ;
l'explorateur la charge par `browser_set_storage_state` et ne saisit jamais de
mot de passe. Un charter où un secret a été saisi (`tainted`) perd ses captures.

## Lire le résultat

`.qa/runs/<id>/explore/PROGRESS.md` (lisible) et `explore_report.json`
(contrat `explore-report`). Un finding est une affirmation de modèle avec
preuve, pas un bug confirmé : `/qa-bugbash` le prouve par un test de repro.
