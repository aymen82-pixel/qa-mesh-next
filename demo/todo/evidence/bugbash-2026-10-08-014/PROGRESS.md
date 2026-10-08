# Exploration — Bug bash de la liste de tâches : ajout, saisies, coche, filtres, compteurs

> Fichier généré par le kernel (`qa-mesh explore`). Ne jamais éditer à la main.

Run `2026-10-08-014` · budgets : 3 charters, 30 actions/charter, 15 min, parallélisme 1

## Charters

1. **Compteurs et libellés** — passed · 1 finding(s)
   - Couvert : ajout de 3 tâches, coche/décoche, suppression (tâche cochée et non cochée), rechargement, Clear completed, singulier/pluriel du compteur. Le compteur 'items left' ignore l'état coché des tâches (reste égal au nombre total). Non couvert : filtres Active/Completed, saisie
2. **Saisies limites** — passed · 1 finding(s)
   - Couvert : saisie vide (Entrée sans texte : rien créé, OK), espaces seuls (tâche créée, défaut), espaces en tête/fin (rognés, OK), HTML <b>x</b> (affiché littéralement, échappé, OK), unicode/emoji (OK), doublons (acceptés, deux lignes 'dup', comportement standard), 300 caractères 
3. **Etat et filtres** — passed · 0 finding(s)
   - Couvert : ajout de 4 taches, coche/decoche, filtres Active/Completed/All (liste coherente, y compris ajout et decoche depuis un filtre), suppression (en All et en Completed), Clear completed, rechargements (persistance OK), retour arriere entre filtres (OK). Compteur 'items left'

## Findings

- ⚑ high issue `F-001` Le compteur 'items left' ne diminue pas quand une tâche est cochée (`/`, charter 1)
- ⚑ medium issue `F-002` Une saisie composée uniquement d'espaces crée une tâche au libellé vide (`/`, charter 2)

## Décision du kernel

**stop** (step-limit) — budget de 3 charters atteint · restant : 0 charter(s), 11.6 min
