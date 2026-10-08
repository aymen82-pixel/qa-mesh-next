// Preuve du masquage des secrets (C7) : une valeur saisie via `secrets.fill`
// n'apparaît ni dans une capture masquée, ni dans une capture automatique, ni
// dans un texte passé au redacteur. Valeurs générées à l'exécution (aucun
// secret dans le code) ; page construite en mémoire (aucune URL).

import { test, expect } from '../../fixtures/pages.fixture';
import { uniqueId } from '../../utils/test-data';

const FORM = '<label>Clé API <input id="key" type="text" style="font-size:24px;width:600px"></label>';

test.describe('Secrets — masquage et redaction', () => {
  test.use({ secretRegistry: [{ name: 'demo-token', env: 'QA_DEMO_TOKEN' }] });

  // @scenario SEC-NOM-01
  test('SEC-NOM-01: une valeur saisie ne se voit sur aucune capture', async ({ page, secrets }) => {
    await page.setContent(FORM);
    const field = page.getByLabel('Clé API');

    process.env.QA_DEMO_TOKEN = uniqueId('tokenA');
    const valueA = process.env.QA_DEMO_TOKEN;
    await secrets.fill(field, 'demo-token');
    // Le champ contient bien le secret : le masquage est visuel, pas fonctionnel.
    await expect(field, 'le champ doit contenir la valeur saisie').toHaveValue(valueA);
    const maskedA = await secrets.screenshot(page);
    const rawA = await field.screenshot();

    process.env.QA_DEMO_TOKEN = uniqueId('tokenB-différent');
    await secrets.fill(field, 'demo-token');
    const maskedB = await secrets.screenshot(page);
    const rawB = await field.screenshot();

    expect(maskedA.equals(maskedB), 'capture masquée identique quelle que soit la valeur').toBe(true);
    expect(rawA.equals(rawB), 'capture brute du champ identique : le texte est invisible').toBe(true);
  });

  // @scenario SEC-NOM-02
  test('SEC-NOM-02: le redacteur remplace la valeur par son nom', async ({ secrets }) => {
    process.env.QA_DEMO_TOKEN = uniqueId('tokenR');
    const value = process.env.QA_DEMO_TOKEN;
    const redact = secrets.redactor();
    expect(redact(`Authorization échouée pour ${value}`), 'valeur masquée').toBe(
      'Authorization échouée pour <secret:demo-token>',
    );
    expect(redact(JSON.stringify({ token: value })), 'forme JSON masquée').toContain('<secret:demo-token>');
  });

  // @scenario SEC-ERR-01
  test('SEC-ERR-01: un nom non déclaré est refusé', async ({ page, secrets }) => {
    await page.setContent(FORM);
    await expect(secrets.fill(page.getByLabel('Clé API'), 'inconnu'), 'nom non déclaré refusé').rejects.toThrow(
      /non déclaré/,
    );
  });
});
