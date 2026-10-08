import { test as base } from '@playwright/test';
import type { ZodType } from 'zod';
import { LoginPage } from '../pages/login.page';
import {
  createApiContext,
  typedRequest,
  type HttpMethod,
  type TypedRequestOptions,
  type TypedResponse,
} from '../utils/api-client';
import { SecretVault } from '../utils/secrets';
import type { SecretRef } from '../kernel/src/secrets/redact';

/**
 * Fixtures POM + API du projet.
 * Tous les specs importent { test, expect } depuis CE fichier,
 * jamais depuis '@playwright/test'.
 * L'Agent 4 (qa-automation-engineer) ajoute ici chaque nouveau POM (Edit,
 * jamais d'écrasement complet).
 */
type PageObjects = {
  loginPage: LoginPage;
};

/**
 * Requête API typée, validée par schéma Zod (voir schemas/). Contexte
 * indépendant de use.baseURL — pointe vers API_URL (+ API_TOKEN optionnel),
 * distinct de la cible UI du projet.
 */
export type ApiRequest = <TSchema extends ZodType>(
  method: HttpMethod,
  url: string,
  options: TypedRequestOptions<TSchema>,
) => Promise<TypedResponse<TSchema>>;

type ApiFixtures = {
  apiRequest: ApiRequest;
};

/**
 * Secrets (C7) : `secrets.fill(locator, 'nom')` remplit et masque un champ,
 * `secrets.screenshot(page)` capture avec `mask`, `secrets.redactor()` masque
 * un texte. Jamais de valeur dans un spec : uniquement des noms déclarés.
 */
type SecretFixtures = {
  /** Registre surchargeable (`test.use`) ; par défaut `qa.config.json`. */
  secretRegistry: SecretRef[] | undefined;
  secrets: SecretVault;
};

export const test = base.extend<PageObjects & ApiFixtures & SecretFixtures>({
  secretRegistry: [undefined, { option: true }],

  secrets: async ({ secretRegistry }, use) => {
    await use(new SecretVault(secretRegistry));
  },

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  apiRequest: async ({}, use) => {
    const context = await createApiContext({
      baseURL: process.env.API_URL,
      token: process.env.API_TOKEN,
    });
    await use((method, url, options) => typedRequest(context, method, url, options));
    await context.dispose();
  },
});

export { expect } from '@playwright/test';
