// Connexion DÉTERMINISTE d'un rôle (C7) — remplace la connexion de l'Agent 0
// via Playwright MCP : le mot de passe est lu dans l'environnement par ce code
// et ne transite jamais par le contexte d'un modèle.
//
// Lancé par `qa-mesh session refresh --role <r>` (projet Playwright "setup"),
// qui fournit QA_SETUP_ROLE et QA_STORAGE_STATE puis enregistre la session dans
// AgentDB. Adapter `pages/login.page.ts` aux libellés réels de l'application.

import { test, expect } from '../fixtures/pages.fixture';
import { loadQaConfig } from '../utils/qa-config';

const config = loadQaConfig();
const roleName = process.env.QA_SETUP_ROLE ?? config.roles?.find((r) => r.default)?.name ?? config.roles?.[0]?.name;
const role = config.roles?.find((r) => r.name === roleName);
const loginUrl = config.auth?.login_url ?? '/login';

test(`authentifier le rôle ${roleName ?? '(aucun)'}`, async ({ page, loginPage, secrets }) => {
  test.skip(!role, 'aucun rôle dans .qa/qa.config.json (ou QA_SETUP_ROLE inconnu)');
  test.skip(
    !process.env[role!.username_env] || !process.env[role!.password_env],
    `variables ${role!.username_env} / ${role!.password_env} non définies`,
  );
  test.skip(!process.env.QA_STORAGE_STATE, 'QA_STORAGE_STATE absent — lancer via `qa-mesh session refresh --role <r>`');

  await loginPage.goto(loginUrl);
  await loginPage.usernameInput.fill(process.env[role!.username_env]!);
  // Mot de passe par son NOM (`<rôle>.password`) : rempli et masqué, jamais affiché.
  await secrets.fill(loginPage.passwordInput, `${role!.name}.password`);
  await loginPage.submitButton.click();

  // Prouver la connexion avant d'enregistrer la session.
  await expect(page, 'la connexion doit quitter la page de login').not.toHaveURL(
    new RegExp(`${loginUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\?|$)`),
  );
  await page.context().storageState({ path: process.env.QA_STORAGE_STATE! });
});
