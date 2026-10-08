# Défauts plantés (app de démonstration)

Ne PAS donner ce fichier aux explorateurs : il sert à mesurer ce que
`/qa-explore` puis `/qa-bugbash` trouvent et prouvent seuls.

| # | Défaut | Où |
| --- | --- | --- |
| 1 | Le compteur « items left » compte aussi les tâches terminées | `app.js`, `render()` |
| 2 | Une saisie faite uniquement d'espaces crée une tâche vide | `app.js`, gestionnaire `keydown` |

Le code est original (TodoMVC simplifié écrit pour qa-mesh-next), servi par
`node demo/todo/server.ts` sur `http://127.0.0.1:4280/`.
