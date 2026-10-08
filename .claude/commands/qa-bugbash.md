---
description: Bug bash avec preuve — explorateurs par charter, fusion, test de repro par bug (le kernel tranche)
---

Lance l'agent `qa-analyst` en **mode bug bash** sur : $ARGUMENTS

Procédure complète : `node kernel/dist/cli.js guide qa-mesh/bug-bash`. En bref :

1. **Préparer** : `bugbash.shared_env` dans `qa.config.json` (true = lecture
   seule imposée). Hors lecture seule, un rôle jetable `bb-<slug>` par charter
   et `session refresh --role bb-<slug>` pour chacun.
2. **Planifier** 5 à 10 charters (une zone, une posture chacun), puis
   `explore init --run <id> --goal "<périmètre>" --bugbash` et, par charter,
   `explore start … --posture <p> [--account <slug>]`.
3. **Explorer** : un `qa-explorer` par charter (en parallèle dans la limite de
   `explore.parallelism`), chacun fait `explore ingest`.
4. **Fusionner** : `findings merge --run <id>` (le kernel dédoublonne).
5. **Vérifier** : `qa-bug-verifier` par candidat (tri, puis test de repro) ;
   `bugbash verify` exécute le test et tranche.
6. **Rapporter** : `bugbash report --run <id>` → `bugbash/bugs_report.json`
   (confirmés seulement, chacun avec son test qui échoue) et `unconfirmed.json`.

Restituer : bugs confirmés (sévérité décroissante, test de repro, charters),
puis risques non vérifiables, rejetés par motif, warnings, et zones non couvertes.
