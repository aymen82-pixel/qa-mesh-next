import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildRedactor, redactDeep, resolveSecrets, secretRegistry } from "./redact";

const VALUE = "S3cr3t Valeur&<x>/42";
const redact = buildRedactor([{ name: "api-token", value: VALUE }]);
const M = "<secret:api-token>";

test("valeur brute, en toute casse", () => {
  assert.equal(redact(`token=${VALUE} fin`), `token=${M} fin`);
  assert.equal(redact(`TOKEN=${VALUE.toUpperCase()}`), `TOKEN=${M}`);
});

test("formes échappées : JSON, HTML, URL (percent-encoding, + pour espace)", () => {
  assert.equal(redact(JSON.stringify({ t: VALUE })), JSON.stringify({ t: M }));
  assert.equal(redact("v=S3cr3t Valeur&amp;&lt;x&gt;/42"), `v=${M}`);
  assert.equal(redact(`q=${encodeURIComponent(VALUE)}`), `q=${M}`);
  assert.equal(redact(`q=${VALUE.replace(/ /g, "+")}`), `q=${M}`);
});

test("espaces internes repliés ou élargis", () => {
  assert.equal(redact("x S3cr3t    Valeur&<x>/42 y"), `x ${M} y`);
  assert.equal(redact("x S3cr3t\nValeur&<x>/42 y"), `x ${M} y`);
});

test("texte tronqué qui se termine par un préfixe de la valeur (>= 8 caractères)", () => {
  const long = buildRedactor([{ name: "k", value: "abcd1234efgh5678ijkl" }]);
  assert.equal(long("erreur: abcd1234efg…"), "erreur: <secret:k>…");
  assert.equal(long("erreur: abcd1234efg"), "erreur: <secret:k>");
  assert.equal(long("ligne1 abcd1234ef\nligne2"), "ligne1 <secret:k>\nligne2");
  // Un préfixe trop court, ou un mot qui ne prolonge pas la valeur, passe.
  assert.equal(long("erreur: abcd123"), "erreur: abcd123");
  assert.equal(long("erreur: abcd1234XYZ"), "erreur: abcd1234XYZ");
});

test("aucun faux positif sur du texte ordinaire", () => {
  assert.equal(redact("aucun secret ici, 42 éléments"), "aucun secret ici, 42 éléments");
});

test("une valeur trop courte (< 6) est refusée", () => {
  assert.throws(() => buildRedactor([{ name: "pin", value: "12345" }]), /trop court/);
});

test("la plus longue valeur gagne quand l'une contient l'autre", () => {
  const r = buildRedactor([
    { name: "court", value: "abcdef" },
    { name: "long", value: "abcdef-ghijkl" },
  ]);
  assert.equal(r("x abcdef-ghijkl y abcdef"), "x <secret:long> y <secret:court>");
});

test("redactDeep : toutes les chaînes d'un JSON, clés comprises", () => {
  const out = redactDeep({ [VALUE]: [VALUE, 1, { a: `x ${VALUE}` }] }, redact);
  assert.deepEqual(out, { [M]: [M, 1, { a: `x ${M}` }] });
});

test("registre : secrets déclarés + mot de passe de chaque rôle ; valeurs absentes ignorées", () => {
  const refs = secretRegistry({
    secrets: [{ name: "api-token", env: "API_TOKEN" }],
    roles: [{ name: "admin", password_env: "QA_ADMIN_PASSWORD" }],
  });
  assert.deepEqual(refs, [
    { name: "api-token", env: "API_TOKEN" },
    { name: "admin.password", env: "QA_ADMIN_PASSWORD" },
  ]);
  assert.deepEqual(resolveSecrets(refs, { QA_ADMIN_PASSWORD: "motdepasse-admin" }), [
    { name: "admin.password", value: "motdepasse-admin" },
  ]);
});

test("sans secret, le texte est inchangé", () => {
  assert.equal(buildRedactor([])("rien"), "rien");
});
