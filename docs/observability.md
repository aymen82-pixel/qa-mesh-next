# Observabilité des agents (`qa-mesh usage`)

Combien d'appels d'outils, combien de temps, combien de tokens, et par quel
agent ? `qa-mesh usage` répond sans lire de trace brute, en lecture seule et
avec une sortie bornée. Discipline reprise d'`unbox-ai` (tester-army) : partir
large, puis zoomer.

## Source des données

Le hook `.claude/hooks/qa-events.js` (PreToolUse, PostToolUse, SubagentStop,
Stop) ajoute une ligne JSONL par événement dans `.qa/events/<session>.jsonl` :
horodatage, événement, outil, identifiant d'appel, agent (`agent_type` fourni
par Claude Code dans un subagent), tailles d'entrée et de sortie, chemins des
transcripts. **Jamais le contenu des entrées ou sorties d'outils.** Le dossier
est local et gitignoré : aucune télémétrie, rien ne quitte la machine.

## Commandes

```bash
node kernel/dist/cli.js usage                       # toutes les sessions enregistrées
node kernel/dist/cli.js usage --run 2026-10-08-014  # fenêtre d'un run (journal + fichiers du run)
node kernel/dist/cli.js usage --session <id> --top 5
node kernel/dist/cli.js usage --json                # même contenu, pour un script
```

Colonnes : agent, appels d'outils, erreurs, durée cumulée des outils (Pre →
Post), tokens entrée / sortie (et lecture de cache) lus dans les transcripts
Claude Code, outils les plus appelés.

## Limites

- Les tokens ne sont disponibles que si Claude Code fournit le chemin du
  transcript (session principale) et `agent_transcript_path` (subagents) dans
  les événements de hook ; sinon la colonne affiche `-`.
- L'attribution à un run se fait par fenêtre temporelle : deux campagnes
  simultanées sur la même machine se mélangent.
- La durée mesurée est celle des outils, pas le temps de réflexion du modèle.
