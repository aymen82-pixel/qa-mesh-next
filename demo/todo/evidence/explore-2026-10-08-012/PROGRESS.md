# Exploration — Explorer la liste de tâches comme un nouvel utilisateur : ajouter, cocher, filtrer, supprimer, et vérifier que les compteurs et libellés sont cohérents

> Fichier généré par le kernel (`qa-mesh explore`). Ne jamais éditer à la main.

Run `2026-10-08-012` · budgets : 3 charters, 30 actions/charter, 15 min, parallélisme 1

## Charters

1. **Ajout et compteur de tâches** — passed · 1 finding(s)
   - Ajout de 3 tâches (dont une avec espaces, balises HTML, &, guillemets : rendue en texte, trimée, OK). Compteur correct à l'ajout (1 item left, 2 items left, 3 items left, singulier/pluriel OK). Cocher/décocher : le compteur ne change pas (reste 3 avec 2 cochées), y compris après 
2. **Filtres, suppression et Clear completed** — passed · 0 finding(s)
   - Couvert : ajout de 4 puis 3 taches, cocher/decocher (vues All, Active, Completed), filtres All/Active/Completed (contenu correct, y compris acces direct a #/completed et #/active), suppression depuis Completed, Clear completed depuis All, Completed et Active, suppression de la de
3. **Bascule globale, édition et saisies limites** — blocked (ENV_UNREACHABLE) · 0 finding(s)
   - Aucune action menée : planner_setup_page a expiré deux fois (180 s) et les outils browser_* n'ont pas été exposés. Rien couvert (bascule globale, édition, saisies limites).

## Findings

- ⚑ high issue `F-001` Le compteur 'items left' ne tient pas compte des tâches cochées (`/`, charter 1)

## Décision du kernel

**stop** (step-limit) — budget de 3 charters atteint · restant : 0 charter(s), 6.2 min
