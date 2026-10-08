// @finding B-002
import { test, expect } from '../../fixtures/pages.fixture';

test('B-002 une saisie d\'espaces seuls ne crée aucune tâche @bugbash', async ({ page }) => {
  // Ouvrir l'application
  await page.goto('/');
  const input = page.getByRole('textbox', { name: 'New todo' });
  const items = page.getByRole('list', { name: 'Todo list' }).getByRole('listitem');
  const before = await items.count();

  // Saisir 5 espaces puis Entrée
  await input.fill('     ');
  await input.press('Enter');

  // L'assertion qui ENCODE le bug : la liste doit rester inchangée.
  await expect(items, '[BUG:B-002] une saisie d\'espaces seuls ne doit créer aucune tâche').toHaveCount(before);
});
