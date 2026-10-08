# Sécurité : secrets et redaction

Modèle adapté de la page *Security model* de tester-army/e2e (Apache-2.0, voir
`NOTICE`), réimplémenté sur Playwright et le kernel qa-mesh.

## Registre des secrets

`.qa/qa.config.json` ne contient que des **noms** :

```json
"roles":   [{ "name": "admin", "username_env": "QA_ADMIN_USER", "password_env": "QA_ADMIN_PASSWORD" }],
"secrets": [{ "name": "api-token", "env": "API_TOKEN" }]
```

Le mot de passe de chaque rôle est enregistré automatiquement sous
`<rôle>.password`. Les valeurs sont lues dans l'environnement au moment de
l'exécution, jamais écrites. `qa-mesh secrets list` affiche noms, variables et
présence, jamais une valeur. `qa-mesh config check` refuse une valeur à la
place d'un nom de variable.

## Connexion sans agent

`qa-mesh session refresh --role <r>` lance le projet Playwright `setup`
(`tests/auth.setup.ts` + `pages/login.page.ts`), vérifie que la connexion a
quitté `auth.login_url`, puis enregistre le storageState dans AgentDB. Le mot de
passe est lu par le code de test : **il ne passe jamais par le contexte d'un
modèle**. L'Agent 0 n'a plus les outils MCP de saisie (`browser_type`,
`browser_click`…). Les agents démarrent tous d'un storageState.

## Redaction

Moteur unique : `kernel/src/secrets/redact.ts`, partagé par le kernel et les
tests (`utils/secrets.ts`). Chaque valeur enregistrée devient `<secret:nom>` :

- formes couvertes : brute, échappée JSON, échappée HTML, encodée URL (y compris
  `+` pour l'espace), en toute casse, espaces internes repliés ou élargis ;
- texte tronqué : une fin de ligne qui est un préfixe d'au moins 8 caractères
  de la valeur (la moitié pour une valeur de moins de 16) est masquée ;
- une valeur de moins de 6 caractères est **refusée** (elle masquerait du texte
  ordinaire) : la commande échoue plutôt que d'écrire un artefact mal masqué.

Appliquée à : `pipeline.log` (journal), `qa-mesh redact <fichier|->` pour tout
rapport ou sortie d'outil, et à venir `trace.md` (C6) et les findings (C3/C4).

## Captures d'écran

`secrets.fill(locator, 'nom')` remplit le champ puis le rend visuellement
illisible (texte transparent, `-webkit-text-security`) : la capture automatique
d'échec et la vidéo ne montrent pas la valeur. `secrets.screenshot(page)` ajoute
le `mask` Playwright sur tous les champs remplis par un secret. Preuve :
`tests/secrets/secrets.masking.spec.ts` (deux valeurs différentes donnent des
captures identiques).

## Jetons dans les fichiers

Le hook `qa-guard.js` bloque toute écriture d'agent contenant un JWT, un
`Bearer <jeton>` ou une clé `sk-…`, sur **tous** les chemins. Les gabarits
(`${token}`, `<token>`, `sk-...`) restent autorisés.

## Où la protection s'arrête

- **Flux Playwright MCP en direct** : ce que le serveur MCP renvoie au modèle
  (snapshot, valeur affichée par l'app) n'est pas notre code et n'est pas
  redacté. La seule garantie est de ne jamais faire transiter un secret par ce
  canal : connexion par `session refresh`, jamais par un agent.
- Une forme transformée de la valeur (4 derniers caractères, base64, hash) n'est
  pas la valeur et passe.
- Une valeur répartie sur plusieurs nœuds (clavier de code PIN) n'est pas une
  chaîne et passe.
- Le masquage visuel couvre le champ rempli ; si l'application réaffiche la
  valeur ailleurs à l'écran, seule `secrets.screenshot` avec un `mask` ciblé la
  cache.
- Les journaux propres de l'application testée ne sont pas réécrits.
