# Secrets : règles pour les agents

- Un agent ne voit, ne lit et n'écrit **jamais** une valeur de secret. Il
  manipule des NOMS : `qa.config.json#secrets[].name`, ou `<rôle>.password`.
- Connexion d'un rôle : `node kernel/dist/cli.js session refresh --role <r>`
  (setup Playwright déterministe). Jamais de saisie de mot de passe via
  Playwright MCP, jamais de `echo $VAR` sur une variable de secret.
- Dans un test : `secrets.fill(locator, '<nom>')` (remplit et masque),
  `secrets.screenshot(page)` (capture avec `mask`).
- Tout texte destiné à un rapport passe par `node kernel/dist/cli.js redact <fichier|->`
  (`<secret:nom>`). Le journal, `trace.md` et les findings sont redactés par le kernel.
- `qa-guard` bloque l'écriture d'un JWT, d'un `Bearer <jeton>` ou d'une clé
  `sk-…` dans n'importe quel fichier : déclarer le secret et le lire dans l'env.
- Ce que le serveur Playwright MCP montre en direct n'est pas redacté : ne
  jamais faire afficher un secret à l'écran pendant une exploration.

Inventaire : `node kernel/dist/cli.js secrets list` (noms et présence, jamais les valeurs).
Référence humaine : `docs/security.md`.
