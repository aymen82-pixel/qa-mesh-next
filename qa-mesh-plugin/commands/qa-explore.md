---
description: Explore l'application vers un objectif, sans test écrit (mode explore)
---

Lance l'agent `qa-analyst` en **mode explore** sur l'objectif : $ARGUMENTS

Procédure complète : `node kernel/dist/cli.js guide qa-mesh/explore`. En bref :

1. `node kernel/dist/cli.js explore init --run <run_id> --goal "<objectif>" [--session <rôle>] [--read-only]`
   (`--read-only` obligatoire sur un environnement partagé ; `--session` exige
   `session refresh` au préalable).
2. Boucle : `explore context` → planifier UN charter (titre + instruction :
   une zone, une posture, une route de départ) → `explore start` → lancer
   `qa-explorer` avec le contexte et le charter → il écrit son livrable et fait
   `explore ingest` → `explore decide`. S'arrêter dès que `decide` dit `stop`.
3. `explore close --assessment "<évaluation de clôture>"` : verdict et
   `explore_report.json` calculés par le kernel.

Restituer les findings issues d'abord, par sévérité, en rappelant qu'ils ne
sont pas encore prouvés : pour les confirmer, `/qa-bugbash`.
