# Kernel qa-mesh : travail déterministe (CLI)

Tout travail mécanique (validation de contrats, journalisation, et à terme
filtrage/routage, résolution de sélecteurs, AgentDB) est exécuté par le kernel
`qa-mesh` — un CLI TypeScript dans `kernel/` — et JAMAIS en tokens LLM. C'est le
principe central de qa-mesh/2.0 : 0 token et 0 non-déterminisme sur ces tâches.

- Invocation depuis la racine du projet : `node kernel/dist/cli.js <commande>`.
- Build unique (idempotent) : si `kernel/dist/cli.js` est absent, lancer
  `npm --prefix kernel ci && npm --prefix kernel run build` une seule fois.
- Commandes (`node kernel/dist/cli.js --help` pour l'usage exact) :

| Besoin | Commande |
| --- | --- |
| Valider un livrable / la config | `validate <f> --json` · `config check` |
| Journaliser une phase | `journal <run_id> --agent <a> --status <s>` |
| Transmission sélective | `filter --from <a> --to <b> <f>` |
| Mémoire (sélecteurs, sessions, couverture) | `db init|put|get|pack|similar|record-results|passed-scenarios|session-get|coverage-*` |
| Connexion d'un rôle (sans agent) | `session refresh --role <r>` |
| Priorisation par le risque | `prioritize --top <n> --json` · `score --domain <d>` · `ci put-metric` |
| Classer les échecs | `classify --report <playwright.json> --json` · `errors list` |
| Page de diagnostic | `trace render --run <id> --report <playwright.json>` |
| Secrets | `secrets list` · `redact <f>` |
| Loops | `loop init|verify|decide|status` |
| Exploration et bug bash | `explore …` · `findings merge` · `bugbash verify|report` |
| Observabilité des agents | `usage [--run <id>]` |
| Documentation | `guide [skill[/topic]]` |
| Génération | `manifest build` · `compile --target <t>` · `plugin build` |
- Toujours préférer `--json` pour parser la sortie de façon fiable.
