import { z } from 'zod';

/**
 * Ressource générique "item" — exemple du mode API-first. Remplacer les champs
 * par ceux du contrat d'interface réel de l'API testée ; garder `.strict()` :
 * un champ inattendu dans la réponse doit faire échouer le test.
 */
export const ItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    createdAt: z.string(),
  })
  .strict();

export type Item = z.infer<typeof ItemSchema>;

export const ItemListSchema = z.array(ItemSchema);
