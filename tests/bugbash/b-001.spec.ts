// @finding B-001
import { test, expect } from '../../fixtures/pages.fixture';

test.describe('Todos - compteur', () => {
  test('B-001 le compteur diminue quand une tâche est cochée @bugbash', async ({ page }) => {
    // Ouvrir l'app (liste vide)
    await page.goto('/');

    // Saisir Alpha, Beta, Gamma + Entrée
    const input = page.getByRole('textbox', { name: 'New todo' });
    for (const name of ['Alpha', 'Beta', 'Gamma']) {
      await input.fill(name);
      await input.press('Enter');
    }
    const counter = page.getByText(/\d+ items? left/);
    await expect(counter, 'le compteur initial doit valoir 3').toHaveText('3 items left');

    // Cocher la case 'Toggle Alpha'
    await page.getByRole('checkbox', { name: 'Toggle Alpha' }).check();

    // Le compteur doit ne compter que les tâches non cochées
    await expect(counter, '[BUG:B-001] le compteur doit valoir 2 après avoir coché Alpha').toHaveText('2 items left');
  });
});
