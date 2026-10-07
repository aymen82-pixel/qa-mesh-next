/**
 * Classification déterministe d'un échec Playwright -> code du catalogue.
 * Fonctions PURES (aucune I/O, aucun LLM). Les règles sont évaluées dans
 * l'ordre : la première qui reconnaît un message gagne. Plusieurs messages
 * (Playwright en produit plusieurs pour un timeout de test) : le code le plus
 * spécifique l'emporte, `TEST_TIMEOUT` seulement à défaut, `UNCLASSIFIED` en
 * dernier recours.
 *
 * Fixtures : messages réels de Playwright dans `fixtures/playwright-*.json`.
 */
import { catalogEntry, type ErrorCode, type FailureClass } from "./catalog";

export interface ClassifyContext {
  /** `qa.config.json#auth.login_url` (ex. `/login`) — détection d'une session perdue. */
  loginUrl?: string;
}

export interface Classification {
  code: ErrorCode;
  class: FailureClass;
  ambiguous: boolean;
  hint: string;
  /** Message (nettoyé, tronqué) qui a décidé du code. */
  evidence: string;
}

export interface Rule {
  code: ErrorCode;
  test: (message: string, ctx: ClassifyContext) => boolean;
}

const ANSI = /\x1b\[[0-9;]*m/g;
const MAX_EVIDENCE = 600;

/** Retire ANSI et code frame : ne garde que le diagnostic de Playwright. */
export function cleanMessage(raw: string): string {
  const lines: string[] = [];
  for (const line of raw.replace(ANSI, "").split(/\r?\n/)) {
    if (/^\s*>?\s*\d+ \|/.test(line) || /^\s+at /.test(line)) break;
    lines.push(line);
  }
  return lines.join("\n").trimEnd();
}

function receivedUrlPaths(message: string): string[] {
  const urls = [
    ...message.matchAll(/Received string:\s*"([^"]+)"/g),
    ...message.matchAll(/unexpected value "([^"]+)"/g),
  ].map((m) => m[1]);
  return urls.flatMap((u) => {
    try {
      return [new URL(u).pathname];
    } catch {
      return [];
    }
  });
}

/** Ordre significatif : du plus spécifique au plus générique. */
export const RULES: readonly Rule[] = [
  {
    code: "ENV_UNREACHABLE",
    test: (m) =>
      /net::ERR_(CONNECTION_REFUSED|NAME_NOT_RESOLVED|UNSAFE_PORT|ADDRESS_UNREACHABLE|INTERNET_DISCONNECTED|CONNECTION_RESET|CONNECTION_CLOSED|TIMED_OUT)/.test(m) ||
      /\b(ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ECONNRESET)\b/.test(m),
  },
  {
    code: "AUTH_EXPIRED",
    test: (m, ctx) =>
      /\(HTTP 40[13]\)/.test(m) ||
      (!!ctx.loginUrl && receivedUrlPaths(m).some((p) => p === ctx.loginUrl || p.startsWith(`${ctx.loginUrl}/`))),
  },
  {
    // Avant CONTRACT_MISMATCH : un corps d'erreur 5xx rompt aussi le schéma.
    code: "HTTP_5XX",
    test: (m) => /\(HTTP 5\d\d\)/.test(m) || (/Expected: [1-4]\d\d\b/.test(m) && /Received: 5\d\d\b/.test(m)),
  },
  {
    code: "CONTRACT_MISMATCH",
    test: (m) => /non conforme au schéma attendu/.test(m),
  },
  {
    code: "LOCATOR_AMBIGUOUS",
    test: (m) => /strict mode violation/.test(m),
  },
  {
    code: "NAV_TIMEOUT",
    test: (m) => /page\.(goto|waitForURL|reload|goBack|goForward|waitForNavigation): Timeout \d+ms exceeded/.test(m),
  },
  {
    // L'élément existe (« locator resolved to ») mais l'action échoue.
    code: "ACTION_FAILED",
    test: (m) =>
      /locator resolved to/.test(m) &&
      /element is not (enabled|visible|stable|editable|attached)|intercepts pointer events|element is outside of the viewport/.test(m),
  },
  {
    code: "LOCATOR_NOT_FOUND",
    test: (m) =>
      /element\(s\) not found/.test(m) ||
      (/locator\.\w+: (Test timeout of \d+ms|Timeout \d+ms) exceeded/.test(m) && /waiting for /.test(m) && !/locator resolved to/.test(m)),
  },
  {
    code: "ASSERTION_FAILED",
    test: (m) => /expect\(.+\)\.\w+\(.*\)/.test(m) && /(Expected|Received)/.test(m),
  },
  {
    code: "TEST_TIMEOUT",
    test: (m) => /Test timeout of \d+ms exceeded/.test(m),
  },
];

function classifyOne(message: string, ctx: ClassifyContext): ErrorCode | null {
  for (const rule of RULES) if (rule.test(message, ctx)) return rule.code;
  return null;
}

/**
 * Classe un échec à partir de ses messages d'erreur (ordre Playwright).
 * Ne lève jamais : un échec sans message est `UNCLASSIFIED`.
 */
export function classifyFailure(rawMessages: string[], ctx: ClassifyContext = {}): Classification {
  const messages = rawMessages.map(cleanMessage).filter((m) => m.length > 0);
  let fallback: { code: ErrorCode; evidence: string } | null = null;
  for (const message of messages) {
    const code = classifyOne(message, ctx);
    if (!code) continue;
    if (code === "TEST_TIMEOUT") {
      fallback ??= { code, evidence: message };
      continue;
    }
    return build(code, message);
  }
  if (fallback) return build(fallback.code, fallback.evidence);
  return build("UNCLASSIFIED", messages[0] ?? "(aucun message d'erreur)");
}

function build(code: ErrorCode, evidence: string): Classification {
  const entry = catalogEntry(code);
  return {
    code,
    class: entry.class,
    ambiguous: entry.ambiguous,
    hint: entry.hint,
    evidence: evidence.length > MAX_EVIDENCE ? `${evidence.slice(0, MAX_EVIDENCE)}…` : evidence,
  };
}
