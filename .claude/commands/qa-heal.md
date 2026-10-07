---
description: Répare les tests Playwright cassés (Agent 6 — Self-Healing)
---

Lance l'agent `qa-healing-coordinator` (Agent 6) sur : $ARGUMENTS

Si aucun fichier n'est précisé : exécuter d'abord la suite avec le reporter JSON
(`PLAYWRIGHT_JSON_OUTPUT_NAME=.qa/runs/<run_id>/playwright.json npx playwright test --reporter=json`),
classer les échecs avec le kernel (`node kernel/dist/cli.js classify --report <json> --json`),
puis ne traiter que les échecs de classe SCRIPT.

Rappels de garde-fous : maximum 3 tentatives par test, jamais le même correctif
deux fois, jamais d'affaiblissement d'assertion ; si l'app est en cause,
requalifier en bug PRODUIT et marquer `test.fixme()` documenté.
Persister chaque sélecteur corrigé via le kernel (`qa-mesh db put`), jamais par écriture de fichier.
