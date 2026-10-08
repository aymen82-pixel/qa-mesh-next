# Bug bash avec preuve (`/qa-bugbash`)

Plusieurs explorations à la fois, une par charter, puis une vérification qui
transforme chaque bug annoncé en test de repro qui échoue pour la raison
annoncée. **Seuls les bugs confirmés par le kernel sont rapportés.**

## 1. Préparer

- `qa.config.json#bugbash.shared_env` : `true` si d'autres utilisent
  l'environnement → **lecture seule imposée** (pas d'inscription, pas de
  soumission, rien de forme injection dans les URLs, pas de boucle de requêtes ;
  un blocage WAF n'est pas un finding). Les postures qui écrivent
  (`first-time-user`, `edge-input`, `state`) sont alors refusées par le kernel.
- Hors lecture seule : un compte jetable par charter, déclaré comme rôle
  `bb-<slug>` dans `roles[]`, session créée par `session refresh --role bb-<slug>`.
  Des explorateurs qui partagent un compte rapportent les modifications des
  autres comme des bugs.
- `known_non_bugs[]` : y mettre les angles morts connus de l'explorateur.
- Explorer un build de production quand il existe (un serveur de dev qui
  compile à la première visite ressemble à un lien mort).

## 2. Planifier les charters

5 à 10 charters, chacun une phrase : route de départ, zone, posture.

| Posture (`--posture`) | Forme |
| --- | --- |
| `first-time-user` | « Depuis /signup, s'inscrire et finir l'onboarding comme un nouvel utilisateur » |
| `numbers-and-copy` | « Depuis /cart, changer les quantités ; recouper chaque prix, total et libellé » |
| `edge-input` | « Depuis /settings/profile, soumettre chaque champ vide, à 300 caractères, en unicode, avec espaces en tête » (nommer la matrice) |
| `state` | « Depuis /projects, créer, renommer, supprimer, en rechargeant et revenant en arrière après chaque étape » |
| `error-paths` | « Depuis /login, mauvais mot de passe, compte inconnu ; erreurs manquantes, trompeuses ou trop bavardes » |

## 3. Explorer

```bash
node kernel/dist/cli.js explore init --run <id> --goal "<périmètre>" --bugbash
node kernel/dist/cli.js explore start --run <id> --title "<t>" --instruction "<i>" --posture <p> [--account <slug>] --json
```

Un `qa-explorer` par charter avec `explore context` + le charter. Parallélisme
borné par `explore.parallelism` : le serveur `playwright-test` n'a qu'un
navigateur, donc au-delà de 1 il faut un serveur MCP par explorateur.

## 4. Fusionner

`node kernel/dist/cli.js findings merge --run <id> [--threshold 0.3]` : même
route + titres proches (Levenshtein relatif) = un candidat `B-NNN` (repro la
plus courte, sévérité max, tous les charters). Warnings à part (`W-NNN`).

## 5-6. Trier et vérifier

Un vérificateur à la fois (même limite que les explorateurs : un seul navigateur
MCP partagé ; deux vérificateurs simultanés se polluent l'état, constaté en démo).

`qa-bug-verifier` par candidat (topic de son prompt) : tri en `artifact`,
`environment`, `design`, `fixture` ou `candidate` ; pour un candidat, test
`tests/bugbash/b-nnn.spec.ts` (`// @finding B-NNN`, tag `@bugbash`, marqueur
`[BUG:B-NNN]` sur l'assertion du bug). `bugbash verify` rejoue le test 2 fois
sans retry : **confirmé** seulement si chaque exécution échoue en
`ASSERTION_FAILED` sur le marqueur.

## 7. Rapporter

`node kernel/dist/cli.js bugbash report --run <id>` :
`.qa/runs/<id>/bugbash/bugs_report.json` (confirmés, chacun avec son test) et
`unconfirmed.json` (non vérifié, non reproduit, instable, test invalide,
rejeté par bucket, warnings). Les tests `@bugbash` sont exclus de la suite
normale (`playwright.config.ts`) ; une fois le bug corrigé, retirer le tag et
garder le test comme non-régression.
