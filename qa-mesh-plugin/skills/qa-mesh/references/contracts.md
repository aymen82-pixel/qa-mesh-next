# Contrats et protocole d'échange (qa-mesh/2.0)

Chaque agent lit et écrit des fichiers — jamais de contexte conversationnel
partagé. Tout livrable est un fichier JSON dans `.qa/runs/{run_id}/` enveloppé
ainsi :

```json
{
  "protocol": "qa-mesh/2.0",
  "run_id": "",
  "agent": "agent-N",
  "status": "ok | partial | error",
  "domain": "",
  "payload": {},
  "errors": [],
  "metrics": { "duration_ms": 0, "items_produced": 0 }
}
```

Codes courts obligatoires partout :
- Priorité → `C | E | M | F` (Critique / Élevée / Moyenne / Faible)
- Statut test → `OK | KO | INS | IGN`
- Type parcours → `NOM | ALT | ERR | LIMITE`
- Classification échec → `PRODUIT | SCRIPT | ENV`

## Validation et règle de modification

- Valider chaque livrable avec `node kernel/dist/cli.js validate <fichier> --json`
  (exit 0 = conforme ; sinon `errors[]` avec `layer`/`path`/`message`). Jamais
  de validation « à l'œil ».
- Config projet : `node kernel/dist/cli.js config check`.
- Chaque schéma de `.qa/contracts/` a une fixture valide et une invalide
  (`.qa/contracts/fixtures/`). Un changement de contrat touche le schéma, ses
  deux fixtures et le producteur dans le même commit (voir `AGENTS.md`).
