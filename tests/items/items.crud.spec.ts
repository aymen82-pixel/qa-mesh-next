// Exemple API-first générique : ressource "items" (créer / lister / supprimer).
// API_URL, ITEMS_ENDPOINT et API_TOKEN branchent le test sur l'API réelle
// sans toucher au code ; absents, le test est sauté explicitement.

import { test, expect } from '../../fixtures/pages.fixture';
import { ItemSchema, ItemListSchema } from '../../schemas/items/item.schema';
import { UnknownSchema } from '../../schemas/common.schema';
import { uniqueId } from '../../utils/test-data';

test.describe('Items — CRUD API', () => {
  test.skip(
    !process.env.API_URL || !process.env.ITEMS_ENDPOINT || !process.env.API_TOKEN,
    'API_URL / ITEMS_ENDPOINT / API_TOKEN non configurés — voir README section "Tests API (mode API-first, Zod)"',
  );

  // @scenario ITEM-NOM-01
  // Créer un item renvoie la ressource conforme au contrat et la fait apparaître
  // dans le listing (relation métamorphique création -> lecture).
  test('ITEM-NOM-01: création nominale', async ({ apiRequest }) => {
    const name = uniqueId('Item-TestE2E');
    const endpoint = process.env.ITEMS_ENDPOINT!;

    const created = await apiRequest('POST', endpoint, {
      schema: ItemSchema,
      data: { name },
    });

    try {
      expect(created.status, 'la création doit renvoyer 201').toBe(201);
      expect(created.body.name, 'le nom renvoyé doit correspondre au nom envoyé').toBe(name);

      const list = await apiRequest('GET', endpoint, { schema: ItemListSchema });

      expect(
        list.body.some((item) => item.id === created.body.id),
        "l'item créé doit apparaître dans le listing",
      ).toBe(true);
    } finally {
      // Nettoyage : ne pas accumuler de données sur un environnement partagé.
      await apiRequest('DELETE', `${endpoint}/${created.body.id}`, { schema: UnknownSchema });
    }
  });

  // @scenario ITEM-ERR-01
  // Créer un item sans nom doit être rejeté (4xx), pas accepté silencieusement.
  test('ITEM-ERR-01: création sans nom', async ({ apiRequest }) => {
    const result = await apiRequest('POST', process.env.ITEMS_ENDPOINT!, {
      schema: UnknownSchema,
      data: {},
    });

    expect(result.status, 'une création sans nom doit être rejetée (4xx)').toBeGreaterThanOrEqual(400);
    expect(result.status, 'un rejet ne doit pas être une erreur serveur (5xx)').toBeLessThan(500);
  });
});
