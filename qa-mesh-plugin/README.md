# QA-mesh — Plugin Claude Code

Plateforme QA autonome multi-agents Playwright, packagée pour être installée
sur **n'importe quel projet d'automatisation** sans copier de fichiers.

## Contenu

| Composant | Détail |
|---|---|
| `agents/` | `qa-analyst` (orchestrateur) + agents 0–6 + spécialistes parallèles (`qa-a11y-auditor`, `qa-compliance-checker`, `qa-perf-tester`) + chaîne SDD amont (`qa-spec-writer`, `qa-product-owner`) |
| `commands/` | `/qa-campaign`, `/qa-coverage`, `/qa-heal`, `/qa-sdd` |
| `skills/` | `playwright-best-practices`, `qa-test-data-factory`, `qa-strategy-docs`, `qa-report-generator`, `qa-sdd-docs` |
| `kernel/` | CLI TypeScript déterministe (validation de contrats, AgentDB SQLite, priorisation par le risque, **loops autonomes**) — voir `kernel/README.md`. À builder une fois dans le projet cible (§ installation). |
| `hooks/` | `qa-guard.js` (PreToolUse : bloque `waitForTimeout`, `networkidle`, `test.only`, URL/credentials en dur) · `qa-typecheck.js` (PostToolUse : `npm run typecheck` après toute écriture `.ts`) · `loop-guard.js` (PreToolUse : bloque toute écriture hors de la whitelist d'un loop actif) |
| `.mcp.json` | serveur MCP `playwright-test` (`npx playwright run-test-mcp-server`) |
| `templates/.qa/` | contrats JSON, `routing.yaml`, `qa.config.example.json`, schéma AgentDB — à copier une fois dans le projet cible |

## Installation sur un nouveau projet

```bash
# 1. Ajouter la marketplace (ce repo) puis installer le plugin
/plugin marketplace add aymen82-pixel/qa-mesh-next
/plugin install qa-mesh@qa-mesh-marketplace

# 2. Dans le projet cible : initialiser la config locale
mkdir .qa
# copier <plugin-install-dir>/templates/.qa/ dans le projet (contrats, routing.yaml,
# qa.config.example.json, agentdb/schema.json), puis
# .qa/qa.config.example.json → .qa/qa.config.json et renseigner base_url, rôles

# 3. Copier le kernel dans le projet cible (le kernel vit TOUJOURS dans le
#    projet — jamais dans le cache du plugin — car il maintient l'AgentDB
#    locale du projet) puis le builder une fois :
cp -r <plugin-install-dir>/kernel .
npm --prefix kernel ci && npm --prefix kernel run build
node kernel/dist/cli.js --version   # doit répondre 2.0.0-alpha.1

# 4. Exporter les credentials

# macOS / Linux
export QA_DEFAULT_USER="..." QA_DEFAULT_PASSWORD="..."

# Windows (PowerShell)
$env:QA_DEFAULT_USER = "..."; $env:QA_DEFAULT_PASSWORD = "..."

# 5. Lancer
/qa-campaign

# 6. (Optionnel) Non-régression ciblée sur un module — voir kernel/README.md
node kernel/dist/cli.js loop init --loop <id> --whitelist "tests/<module>/**,pages/<module>/**"
```

`<plugin-install-dir>` est l'emplacement où Claude Code a installé le plugin
(visible via `${CLAUDE_PLUGIN_ROOT}` dans un hook, ou le cache local des
plugins). Le kernel embarque son `package-lock.json` : `npm --prefix kernel ci`
installe exactement les versions testées.

## Ce qui reste LOCAL au projet (jamais dans le plugin)

- `kernel/dist/`, `kernel/node_modules/` — artefacts de build (générés à l'étape 3)
- `.qa/qa.config.json` — seules données spécifiques au projet testé
- `.qa/contracts/`, `.qa/routing.yaml` — schémas/routage (versionnés avec le projet, copiés une fois depuis le plugin)
- `.qa/agentdb/` — mémoire persistante (sélecteurs, sessions, couverture, loops)
- `.qa/runs/` — livrables de campagne
- `loops/` — définitions de loops du projet (`loop.yaml`/`TASK.md` par module ciblé)
- `tests/`, `pages/`, `fixtures/`, `utils/` — le code généré
- `playwright.config.ts`, `tsconfig.json`

Le plugin est 100 % agnostique au métier : aucune URL, aucun credential,
aucune règle projet. Conforme au principe de neutralité de `ARCHITECTURE.md`.

## Génération (ne jamais éditer ce dossier à la main)

`qa-mesh-plugin/` est **généré** depuis les sources uniques du dépôt qa-mesh-next :
manifeste des agents (`agents/`), `.claude/{commands,skills,hooks}`, `kernel/`
(sources seules), `.qa/` (gabarits) et `plugin-src/` (ce README, `plugin.json`,
`hooks.json`).

```bash
npm --prefix kernel run build
node kernel/dist/cli.js plugin build          # régénère qa-mesh-plugin/
node kernel/dist/cli.js plugin build --check  # échoue si le dossier commité a dérivé
```

Puis incrémenter `version` dans `plugin-src/.claude-plugin/plugin.json` (et la
description dans `.claude-plugin/marketplace.json` si le contenu a changé).
