---
name: qa-verify
description: Prouver qu'un changement de qa-mesh-next (kernel, hooks, agents, contrats, fixtures, specs Playwright, plugin) fonctionne par une exécution réelle - le CLI compilé, les hooks alimentés comme Claude Code le fait, Playwright en headed ou en vidéo quand c'est visible, main contre branche pour un correctif. Use while iterating and before declaring a task done, when asked to run, test, check or reproduce something, or whenever you would otherwise conclude "ça compile donc ça marche".
---

# qa-verify : la preuve par l'exécution

Chaque changement est livré avec la preuve qu'il marche **tel qu'un
utilisateur le voit**. « Ça compile », « les tests unitaires passent » ou « le
code a l'air juste » ne sont pas des preuves. Adapté du skill `verify` de
tester-army/e2e (Apache-2.0, voir `NOTICE`).

## Préparer

```bash
npm ci && npm --prefix kernel ci
npm --prefix kernel run build      # tout ce qui suit lit kernel/dist : reconstruire après CHAQUE changement
```

Un `kernel/dist` périmé est la première cause de faux résultat.

## Choisir la surface

| Changement | Exécuter | Prouve |
| --- | --- | --- |
| Commande kernel | `node kernel/dist/cli.js <commande> … --json` sur un cas réel, puis le cas d'erreur | La sortie et le code de sortie qu'un agent recevra |
| Contrat (`.qa/contracts/`) | `validate` sur un vrai livrable + `npm --prefix kernel test` (fixtures) | Le livrable réel passe, l'invalide est rejeté pour la bonne raison |
| Hook (`.claude/hooks/*.js`) | `echo '{"tool_input":{"file_path":"tests/a/a.spec.ts","content":"…"}}' \| node .claude/hooks/qa-guard.js; echo $?` | Exit 2 et message pour un contenu interdit, exit 0 sinon |
| Agent (manifeste, corps) | `compile --target claude` puis une session réelle (`claude -p` avec le serveur MCP) sur l'app de démo | L'agent appelle les bons outils et produit un livrable que `validate` accepte |
| Fixture, POM, spec | `npx playwright test <fichier> --project=chromium`, puis `--headed` ou `--video=on` si le changement se voit | Le comportement dans un vrai navigateur |
| Classement, trace | Un échec réel → `classify` → `trace render` → lire `trace.md` | Le code et la page que les Agents 5 et 6 liront |
| Secrets | Lancer avec un secret factice puis `grep -r "<valeur>" .qa/ test-results/` | Zéro occurrence |
| Plugin | `plugin build` puis `plugin build --check` | Le plugin publié est à jour |

App de démo : `node demo/todo/server.ts` (http://127.0.0.1:4280), config
`demo/todo/qa.config.demo.json`.

## Faire comme un utilisateur

- Lancer le vrai CLI compilé, pas une fonction isolée ; lire ce qu'il imprime
  ET ce qu'il écrit (`.qa/runs/<id>/…`).
- Déclencher aussi le chemin d'échec : un code d'erreur, un refus, un budget
  dépassé se vérifient en les provoquant et en lisant le message obtenu.
- Vérifier les effets de bord : fichiers aux chemins annoncés, aucun secret
  dans les artefacts, `PROGRESS.md` régénéré.

## Correctif : main contre branche

1. Écrire d'abord le test qui reproduit le bug et le lancer **avant** le
   correctif : il doit échouer (capturer la sortie).
2. Si le code est déjà modifié : `git worktree add /tmp/qa-main main`, puis
   `npm ci && npm --prefix kernel ci && npm --prefix kernel run build` dans ce
   worktree, et la même commande des deux côtés.
3. Présenter un tableau main / branche : commande, résultat, code de sortie.
4. `git worktree remove /tmp/qa-main` à la fin.

## Preuves à fournir

- **Sortie terminal** : les lignes utiles, en bloc `text`, chemins raccourcis.
  C'est la preuve principale pour le kernel, les hooks et les rapports.
- **Vidéo ou capture** (`--video=on`, `--headed`) pour ce qui se voit à l'écran ;
  attention, une vidéo ne masque rien : aucun secret à l'écran pendant
  l'enregistrement.
- **Fichiers produits** : chemin + extrait (rapport, `trace.md`, `bugs_report.json`).

Si quelque chose n'a pas pu être vérifié, le dire et nommer l'obstacle.
Une affirmation sûre d'elle sans preuve est pire que « non concluant ».
