import { deflateRawSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import {
  decodedAttachmentBodies,
  extractEmbeddedZips,
  hasEmbeddedReport,
  readZipTextEntries,
} from "../../src/support/report/embedded-report.js";
import { findSecretHits } from "../../src/support/report/secret-scan.js";

/** Minimal ZIP writer for the tests (CRC left 0; the reader does not check it). */
function zipOf(entries: readonly { name: string; text: string; deflate: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const plain = Buffer.from(e.text);
    const data = e.deflate ? deflateRawSync(plain) : plain;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(e.deflate ? 8 : 0, 8);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(plain.length, 22);
    lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(e.deflate ? 8 : 0, 10);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(plain.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, name, data);
    centrals.push(ch, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

test.describe("embedded report scan", () => {
  test("a secret inside the base64 report ZIP in index.html is found", { tag: ["@unit"] }, () => {
    const zip = zipOf([
      { name: "report.json", text: '{"ok":true}', deflate: false },
      { name: "abc.json", text: '{"body":"set-cookie: sid=1"}', deflate: true },
    ]);
    const html = `<script>window.playwrightReportBase64 = "data:application/zip;base64,${zip.toString("base64")}";</script>`;
    expect(findSecretHits("index.html", html)).toEqual([]);
    expect(hasEmbeddedReport(html)).toBe(true);
    const zips = extractEmbeddedZips(html);
    expect(zips).toHaveLength(1);
    const entries = readZipTextEntries(zips[0] ?? Buffer.alloc(0));
    expect(entries.map((e) => e.name)).toEqual(["report.json", "abc.json"]);
    const hits = entries.flatMap((e) => findSecretHits(e.name, e.text));
    expect(hits.map((h) => h.pattern)).toEqual(["set-cookie header"]);
  });

  test("a non-zip payload throws instead of passing silently", { tag: ["@unit"] }, () => {
    expect(() => readZipTextEntries(Buffer.from("not a zip at all, definitely not"))).toThrow(
      /end of central directory/,
    );
  });

  test("base64 attachment bodies in results.json are decoded", { tag: ["@unit"] }, () => {
    const body = Buffer.from("Authorization: Bearer abcdefgh123").toString("base64");
    const json = JSON.stringify({
      suites: [{ attachments: [{ name: "x", contentType: "text/plain", body }] }],
    });
    expect(findSecretHits("results.json", json)).toEqual([]);
    const decoded = decodedAttachmentBodies(json);
    expect(decoded).toEqual(["Authorization: Bearer abcdefgh123"]);
    expect(findSecretHits("results.json", decoded[0] ?? "").map((h) => h.pattern)).toEqual([
      "bearer token",
    ]);
    expect(decodedAttachmentBodies("not json")).toEqual([]);
  });
});
