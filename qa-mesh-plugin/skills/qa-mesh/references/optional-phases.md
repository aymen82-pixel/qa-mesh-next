# Phases optionnelles : spécialistes et conception manuelle

## Phase 2-bis — Spécialistes (optionnel, parallèle)
- Déclenchée sur demande explicite ou si `qa.config.json#specialists`
  active `a11y`, `compliance` et/ou `perf`.
- Lancer `qa-a11y-auditor`, `qa-compliance-checker` et/ou `qa-perf-tester`
  EN PARALLÈLE des phases 3 à 5 (fork de contexte : chaque spécialiste a le sien).
- Entrée filtrée : `pages[].{url,title}` + `storage_state_path` uniquement —
  jamais les sélecteurs ni les API.
- Valider contre `agent-a11y.schema.json` / `agent-compliance.schema.json` ;
  livrables agrégés en clôture (ils ne bloquent jamais le flux principal).

## Phase 3 — Conception (Agent 3, optionnel)
- Uniquement sur demande explicite de livrables manuels.
- Entrée : parcours complets + catalogue de contexte (sans sélecteurs).
- Valider : syntaxe Gherkin parsable, tags présents, ≤ 7 étapes par scénario.
