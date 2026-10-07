# AGENTS.md

Règles pour tout agent (humain ou IA) qui modifie **qa-mesh-next**. Complété au
chantier C12 ; cette version pose les contrats et leurs invariants.

## Contrats

Il n'y a pas de spécification séparée : le contrat est épinglé à trois endroits.

- **Livrables inter-agents** : `.qa/contracts/*.schema.json` (enveloppe
  `qa-mesh/2.0` + un payload par agent) et `.qa/contracts/qa-config.schema.json`
  pour `.qa/qa.config.json`. Validation mécanique par le kernel
  (`qa-mesh validate`, `qa-mesh config check`), jamais par un LLM.
- **Fixtures** : chaque schéma a `.qa/contracts/fixtures/<nom>.valid.json` et
  `<nom>.invalid.json`. Les fixtures d'agent sont des enveloppes complètes
  (on teste aussi le lien `$ref` vers l'enveloppe). La fixture invalide porte une
  seule violation et la déclare dans `_expect_error: { layer, path }` : le test
  exige qu'elle échoue **pour cette raison**, pas par accident.
  `kernel/src/contracts.fixtures.test.ts` échoue sur une fixture manquante,
  orpheline, une valide rejetée ou une invalide acceptée.
- **Règle de modification** : un changement de contrat touche, **dans le même
  commit**, le schéma, ses deux fixtures et le producteur (corps d'agent dans
  `agents/bodies/`, ou code kernel). Une nouvelle clé de config passe par
  `qa-config.schema.json` (qui refuse les clés inconnues) dans le commit de son
  consommateur.

## Sources uniques et fichiers générés

| Généré | Depuis | Commande | Garde |
|---|---|---|---|
| `.claude/agents/*.md`, `.mcp.json` | `agents/manifest.yaml` + `agents/bodies/` | `qa-mesh compile --target claude` | `compile --check` (byte-identique) |
| `qa-mesh-plugin/` | manifeste, `.claude/`, `kernel/`, `.qa/`, `plugin-src/` | `qa-mesh plugin build` | `plugin build --check` |

Ne jamais éditer un fichier généré. `compile --target codex|gemini|copilot`
refuse d'écraser un `AGENTS.md`, `GEMINI.md` ou `copilot-instructions.md` écrit
à la main (ce fichier-ci, par exemple) : les bundles se compilent dans le projet
cible.

## Fin de chantier

`npm run typecheck`, `npm --prefix kernel test`, `compile --target claude --check`,
`plugin build --check`, doc à jour, un commit Conventional Commits.
