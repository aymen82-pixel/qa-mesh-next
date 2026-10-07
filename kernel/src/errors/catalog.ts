/**
 * Taxonomie des codes d'échec qa-mesh-next — SOURCE UNIQUE.
 *
 * Chaque code d'un test Playwright en échec correspond à une classe
 * (PRODUIT | SCRIPT | ENV) et à une piste de correction. Le code est attribué
 * par le kernel (`classify.ts`, règles déterministes), jamais par un modèle.
 *
 * `ambiguous: true` : la classe par défaut peut être fausse (ex. un élément
 * absent peut être un vrai bug). Seuls ces codes (et `UNCLASSIFIED`) peuvent
 * être requalifiés par l'Agent 5, avec un motif écrit (`requalified_reason`).
 *
 * Toute modification : `docs/errors.md`, `.qa/contracts/agent-5.schema.json`
 * (enum + liens code -> classe) et les fixtures de messages, dans le même
 * commit. `qa-mesh errors check` (et `npm --prefix kernel test`) le vérifie.
 */

export type FailureClass = "PRODUIT" | "SCRIPT" | "ENV";

export interface ErrorCodeEntry {
  code: string;
  class: FailureClass;
  ambiguous: boolean;
  /** Piste de correction, une phrase. */
  hint: string;
}

export const CATALOG = [
  {
    code: "LOCATOR_NOT_FOUND",
    class: "SCRIPT",
    ambiguous: true,
    hint: "Aucun élément ne correspond : vérifier le nom accessible réel (snapshot), chercher un sélecteur proche (`qa-mesh db similar`). Si l'élément a vraiment disparu de l'app, requalifier PRODUIT.",
  },
  {
    code: "LOCATOR_AMBIGUOUS",
    class: "SCRIPT",
    ambiguous: false,
    hint: "Plusieurs éléments correspondent (strict mode) : scoper dans un parent, `exact: true` ou `.filter()` (.claude/rules/selectors.md).",
  },
  {
    code: "ACTION_FAILED",
    class: "SCRIPT",
    ambiguous: true,
    hint: "Élément trouvé mais non actionnable (désactivé, masqué, recouvert, instable) : attendre l'état attendu par une assertion web-first avant l'action, fermer l'overlay. Si l'élément reste désactivé à tort, requalifier PRODUIT.",
  },
  {
    code: "NAV_TIMEOUT",
    class: "ENV",
    ambiguous: true,
    hint: "Navigation ou attente d'URL trop longue : vérifier la disponibilité de l'environnement ; si l'URL attendue n'arrive jamais, c'est un parcours cassé (PRODUIT) ou une attente fausse (SCRIPT).",
  },
  {
    code: "TEST_TIMEOUT",
    class: "SCRIPT",
    ambiguous: true,
    hint: "Le test a dépassé son timeout sans erreur plus précise : scinder le test ou attendre un signal précis. Ne jamais augmenter un timeout à l'aveugle.",
  },
  {
    code: "AUTH_EXPIRED",
    class: "ENV",
    ambiguous: false,
    hint: "Session expirée ou refusée (redirection vers auth.login_url, HTTP 401/403) : rafraîchir le storageState du rôle, puis relancer.",
  },
  {
    code: "ENV_UNREACHABLE",
    class: "ENV",
    ambiguous: false,
    hint: "Hôte injoignable (connexion refusée, DNS, port) : vérifier base_url / API_URL et l'état de l'environnement. Ne pas réparer le test.",
  },
  {
    code: "HTTP_5XX",
    class: "PRODUIT",
    ambiguous: false,
    hint: "Le serveur a répondu 5xx : bug applicatif à remonter avec la requête et la réponse.",
  },
  {
    code: "CONTRACT_MISMATCH",
    class: "PRODUIT",
    ambiguous: true,
    hint: "La réponse API ne respecte pas son schéma Zod : contrat rompu côté API (PRODUIT), sauf si le schéma est périmé par un changement voulu (SCRIPT, mettre à jour schemas/).",
  },
  {
    code: "ASSERTION_FAILED",
    class: "PRODUIT",
    ambiguous: true,
    hint: "La valeur observée diffère de l'attendue : comparer Expected/Received au scénario. Assertion périmée = SCRIPT (requalifier avec motif), jamais affaiblir l'assertion.",
  },
  {
    code: "UNCLASSIFIED",
    class: "SCRIPT",
    ambiguous: true,
    hint: "Aucune règle ne reconnaît ce message : seul cas où l'Agent 5 raisonne librement. En cas de doute PRODUIT/SCRIPT, SCRIPT (le healing tranchera).",
  },
] as const satisfies readonly ErrorCodeEntry[];

export type ErrorCode = (typeof CATALOG)[number]["code"];

export const ERROR_CODES: readonly ErrorCode[] = CATALOG.map((e) => e.code);

export function catalogEntry(code: ErrorCode): ErrorCodeEntry {
  const entry = CATALOG.find((e) => e.code === code);
  if (!entry) throw new Error(`Code d'erreur inconnu : ${code}`);
  return entry;
}
