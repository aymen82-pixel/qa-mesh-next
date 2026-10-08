# Réduction des tokens

**Levier n°1 — déterminisation** : tout le travail mécanique (validation des
contrats, journalisation) est porté par le kernel `qa-mesh`, jamais en tokens.
Les leviers ci-dessous optimisent le travail LLM résiduel.

1. **Modèles différenciés** : agents 0, 1, 2, 5 → modèle économique (haiku) ;
   agents 3, 4, 6 et toi-même → modèle précis (sonnet).
2. **Transmission sélective** déléguée au kernel (`filter` + `.qa/routing.yaml`,
   source unique) — règle d'or : un agent ne reçoit que ce qu'il consomme.
3. **Compression des entrées** : jamais de DOM brut. Snapshots d'accessibilité
   ou Markdown structuré. Les blocs répétés (nav/header/footer) sont déclarés
   une seule fois dans `payload.commons`.
4. **Livrables minimaux** : JSON sans champs vides, sans prose, codes courts.
5. **Mémoire persistante** : sélecteurs validés et sessions réutilisés entre
   campagnes via AgentDB — l'exploration ne repart jamais de zéro.
6. **Prompt caching** : les définitions d'agents sont stables → cache
   automatique des préfixes système quand l'environnement le supporte.
7. **Agent 3 à la demande** : la phase la plus verbeuse n'est exécutée que
   si l'utilisateur veut des livrables manuels.
