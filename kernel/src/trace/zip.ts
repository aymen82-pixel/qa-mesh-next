/**
 * Lecteur ZIP minimal (zéro dépendance) pour le `trace.zip` de Playwright :
 * répertoire central + entrées `stored` (0) ou `deflate` (8) via node:zlib.
 * ZIP64, chiffrement et multi-volumes ne sont pas supportés : erreur explicite.
 */
import { inflateRawSync } from "node:zlib";

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

export interface ZipEntry {
  name: string;
  read(): Buffer;
}

export function readZip(buf: Buffer): Map<string, ZipEntry> {
  // L'EOCD est dans les 65 557 derniers octets (22 + commentaire max 65 535).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip : fin de répertoire central introuvable (fichier tronqué ou non ZIP)");
  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new Error("zip : ZIP64 non supporté");

  const entries = new Map<string, ZipEntry>();
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== CENTRAL_SIG) throw new Error("zip : répertoire central corrompu");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    entries.set(name, {
      name,
      read: () => {
        if (flags & 0x1) throw new Error(`zip : entrée chiffrée non supportée (${name})`);
        if (buf.readUInt32LE(localOffset) !== LOCAL_SIG) throw new Error(`zip : en-tête local corrompu (${name})`);
        const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
        const data = buf.subarray(start, start + compSize);
        if (method === 0) return Buffer.from(data);
        if (method === 8) return inflateRawSync(data);
        throw new Error(`zip : méthode de compression ${method} non supportée (${name})`);
      },
    });
  }
  return entries;
}
