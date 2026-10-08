/**
 * Redaction des secrets — SOURCE UNIQUE, partagée par le kernel et les tests
 * Playwright (`utils/secrets.ts` importe ce fichier). Pur : aucune I/O, aucune
 * dépendance (ni `node:*`), pour être chargeable des deux côtés.
 *
 * Règles reprises du modèle de sécurité de tester-army/e2e (Apache-2.0, NOTICE) :
 *  - chaque occurrence d'une valeur enregistrée devient `<secret:nom>` ;
 *  - formes couvertes : brute, échappée JSON, échappée HTML, encodée URL
 *    (percent-encoding), en toute casse, et avec ses espaces internes repliés ;
 *  - un texte tronqué qui se termine par un préfixe de la valeur (au moins 8
 *    caractères, ou la moitié d'une valeur de moins de 16) est masqué aussi ;
 *  - une valeur de moins de 6 caractères est REFUSÉE : la masquer emporterait
 *    du texte ordinaire avec elle.
 *
 * Limites assumées (documentées dans docs/security.md) : une forme transformée
 * (4 derniers caractères, base64, hash) n'est pas la valeur et passe.
 */

export const MIN_SECRET_LENGTH = 6;
const PREFIX_MIN = 8;

export interface SecretValue {
  /** Nom logique (registre `qa.config.json#secrets`, ou `<rôle>.password`). */
  name: string;
  value: string;
}

export type Redactor = (text: string) => string;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function jsonEscaped(v: string): string {
  return JSON.stringify(v).slice(1, -1);
}

function htmlEscaped(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function variants(value: string): string[] {
  const collapsed = value.replace(/\s+/g, " ").trim();
  const forms = new Set<string>([value, jsonEscaped(value), htmlEscaped(value), encodeURIComponent(value), collapsed]);
  // encodeURIComponent n'encode pas certains caractères que d'autres encodeurs encodent.
  forms.add(encodeURIComponent(value).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()));
  forms.add(value.replace(/ /g, "+"));
  return [...forms].filter((f) => f.length >= MIN_SECRET_LENGTH);
}

/**
 * Construit un redacteur. Lève si un secret est trop court (refus explicite,
 * comme e2e) ; les valeurs vides (variable d'env absente) sont ignorées en amont.
 */
export function buildRedactor(secrets: SecretValue[]): Redactor {
  const rules: { re: RegExp; marker: string }[] = [];
  const prefixes: { prefix: string; value: string; marker: string }[] = [];

  // Les valeurs les plus longues d'abord : une valeur contenue dans une autre ne
  // doit pas casser le masquage de la plus longue.
  const sorted = [...secrets].sort((a, b) => b.value.length - a.value.length);
  for (const s of sorted) {
    if ([...s.value].length < MIN_SECRET_LENGTH) {
      throw new Error(`secret "${s.name}" trop court (< ${MIN_SECRET_LENGTH} caractères) : refusé`);
    }
    const marker = `<secret:${s.name}>`;
    for (const form of variants(s.value)) {
      // Espaces internes : tolère n'importe quelle suite d'espaces dans le texte.
      const pattern = form.split(/\s+/).map(escapeRegex).join("\\s+");
      rules.push({ re: new RegExp(pattern, "gi"), marker });
    }
    const len = s.value.length >= 2 * PREFIX_MIN ? PREFIX_MIN : Math.ceil(s.value.length / 2);
    prefixes.push({ prefix: s.value.slice(0, Math.max(len, MIN_SECRET_LENGTH)), value: s.value.toLowerCase(), marker });
  }

  return (text: string): string => {
    if (!text || rules.length === 0) return text;
    let out = text;
    for (const { re, marker } of rules) out = out.replace(re, marker);
    // Texte tronqué en fin de ligne (avec ou sans « … » / « ... ») qui se termine
    // par un préfixe d'au moins 8 caractères d'une valeur (moitié si < 16).
    for (const { prefix, value, marker } of prefixes) {
      const tail = new RegExp(`${escapeRegex(prefix)}\\S*?(?=(?:…|\\.\\.\\.)?$)`, "gim");
      out = out.replace(tail, (m) => (value.startsWith(m.toLowerCase()) ? marker : m));
    }
    return out;
  };
}

/** Applique un redacteur à toutes les chaînes d'une valeur JSON (clés comprises). */
export function redactDeep<T>(value: T, redact: Redactor): T {
  if (typeof value === "string") return redact(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, redact)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[redact(k)] = redactDeep(v, redact);
    return out as T;
  }
  return value;
}

/** Entrée de registre : un NOM de secret et le NOM de la variable qui le porte. */
export interface SecretRef {
  name: string;
  env: string;
}

/**
 * Registre déclaré : `qa.config.json#secrets` + le mot de passe de chaque rôle
 * (`<rôle>.password`). Ne contient que des noms — jamais de valeur.
 */
export function secretRegistry(config: unknown): SecretRef[] {
  const c = (config ?? {}) as {
    secrets?: { name: string; env: string }[];
    roles?: { name: string; password_env?: string }[];
  };
  const refs: SecretRef[] = [];
  for (const s of c.secrets ?? []) refs.push({ name: s.name, env: s.env });
  for (const r of c.roles ?? []) if (r.password_env) refs.push({ name: `${r.name}.password`, env: r.password_env });
  const seen = new Set<string>();
  return refs.filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));
}

/** Résout les valeurs présentes dans l'environnement ; une variable absente est ignorée. */
export function resolveSecrets(refs: SecretRef[], env: Record<string, string | undefined>): SecretValue[] {
  return refs.flatMap((r) => {
    const value = env[r.env];
    return value ? [{ name: r.name, value }] : [];
  });
}
