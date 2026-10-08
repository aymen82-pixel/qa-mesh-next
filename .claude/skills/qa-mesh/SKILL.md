---
name: qa-mesh
description: Routeur de la plateforme qa-mesh-next pour l'orchestrateur et les agents QA - kernel déterministe, contrats, loops, exploration, bug bash avec preuve, lecture d'un échec (codes, trace.md), secrets, coûts. Use when orchestrating a QA campaign, calling the qa-mesh kernel, validating a deliverable, running a loop, exploring an app, running a bug bash, diagnosing a failed test, or handling credentials. Lire un seul topic à la fois via `node kernel/dist/cli.js guide qa-mesh/<topic>`.
---

# qa-mesh : routeur

Plateforme QA multi-agents Playwright. Principe : **le kernel fait le
mécanique** (validation, classement, verdicts, dédoublonnage, rendu, mémoire),
**les agents font le jugement**. Un agent ne refait jamais en tokens ce qu'une
commande du kernel fait.

## Topics

Lire le topic du moment, pas le pack. Les fichiers sont à côté de celui-ci ;
le kernel imprime le même texte : `node kernel/dist/cli.js guide qa-mesh/<topic>`
(`guide` seul liste tous les skills et leurs topics).

| Topic | Fichier | À lire quand |
| --- | --- | --- |
| `kernel` | [references/kernel.md](references/kernel.md) | Avant le premier appel au kernel : build, table des commandes |
| `contracts` | [references/contracts.md](references/contracts.md) | Écrire une enveloppe `qa-mesh/2.0`, comprendre un rejet de `validate`, modifier un contrat |
| `optional-phases` | [references/optional-phases.md](references/optional-phases.md) | Spécialistes a11y / compliance / perf, ou livrables manuels de l'Agent 3 |
| `loop` | [references/loop.md](references/loop.md) | Non-régression ciblée et bornée sur un module |
| `explore` | [references/explore.md](references/explore.md) | Explorer une app vers un objectif sans test écrit (`/qa-explore`) |
| `bug-bash` | [references/bug-bash.md](references/bug-bash.md) | Chasser les bugs en parallèle et prouver chacun par un test de repro (`/qa-bugbash`) |
| `debugging` | [references/debugging.md](references/debugging.md) | Un test a échoué : code du catalogue, `trace.md` |
| `secrets` | [references/secrets.md](references/secrets.md) | Credentials, clés, redaction, captures d'écran |
| `tokens` | [references/tokens.md](references/tokens.md) | Revue ou réduction du coût d'une campagne |

Autres skills : `playwright-best-practices` (locators, POM, fixtures, auth,
flaky), `qa-report-generator`, `qa-sdd-docs`, `qa-strategy-docs`,
`qa-test-data-factory`, `qa-verify` (prouver un changement par une exécution réelle).

## Règles

- Tout livrable est une enveloppe `qa-mesh/2.0` validée par le kernel avant
  transmission ; un agent ne reçoit que les champs de `.qa/routing.yaml`.
- Aucune donnée projet hors de `.qa/qa.config.json` ; aucune règle métier
  dans un prompt.
- Un échec est classé par `classify` avant tout raisonnement ; l'Agent 6 ne
  traite que la classe SCRIPT.
- Un finding d'exploration n'est un bug que si son test de repro échoue pour la
  raison annoncée, et c'est le kernel qui tranche.
- Jamais de secret dans un prompt, un fichier ou un rapport (topic `secrets`).
- Jamais `waitForTimeout` ni `networkidle`, jamais d'URL ni de credential en
  dur, `{ test, expect }` depuis `fixtures/pages.fixture.ts` (`.claude/rules/`).
