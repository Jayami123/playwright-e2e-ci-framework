import { inflateRawSync } from "node:zlib";

export interface ZipTextEntry {
  readonly name: string;
  readonly text: string;
}

/** Playwright's HTML report embeds its data (tests and inline text/JSON attachments) as a base64 ZIP in index.html. */
const EMBEDDED_ZIP = /data:application\/zip;base64,([A-Za-z0-9+/=]+)/g;

/** Pure. Every base64 ZIP embedded in an HTML report, decoded. */
export function extractEmbeddedZips(html: string): Buffer[] {
  return [...html.matchAll(EMBEDDED_ZIP)].map((m) => Buffer.from(m[1] ?? "", "base64"));
}

/** Pure. True when the text looks like a Playwright HTML report that carries embedded data. */
export function hasEmbeddedReport(html: string): boolean {
  return html.includes("data:application/zip;base64,");
}

/** Pure. Reads every entry of a ZIP (stored or deflate) through its central directory. Throws on anything else. */
export function readZipTextEntries(zip: Buffer): ZipTextEntry[] {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i -= 1) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip: end of central directory not found");
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const out: ZipTextEntry[] = [];
  for (let n = 0; n < count; n += 1) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("zip: bad central directory entry");
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    if (zip.readUInt32LE(local) !== 0x04034b50)
      throw new Error(`zip: bad local header for ${name}`);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + compSize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw);
    else throw new Error(`zip: unsupported method ${String(method)} for ${name}`);
    out.push({ name, text: data.toString("utf8") });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** Pure. Playwright JSON reports keep attachment bodies base64-encoded; decode them so they can be scanned. */
export function decodedAttachmentBodies(jsonText: string): string[] {
  let root: unknown;
  try {
    root = JSON.parse(jsonText) as unknown;
  } catch {
    return [];
  }
  const out: string[] = [];
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const x of v) visit(x);
    } else if (v !== null && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.body === "string" && typeof o.contentType === "string") {
        out.push(Buffer.from(o.body, "base64").toString("utf8"));
      }
      for (const x of Object.values(o)) visit(x);
    }
  };
  visit(root);
  return out;
}
