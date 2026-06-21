// Generates the PWA home-screen icons with zero dependencies (Node's zlib only),
// so the build stays installable without pulling in an image toolchain.
// Mark: a brand-green "plate" ring + center dot on near-black — echoes the
// green ● bullet used across the Command Center. Re-run: `node scripts/gen-icons.mjs`.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const BG = [10, 10, 10]; // #0a0a0a
const GREEN = [84, 209, 126]; // #54d17e

function crc32(buf) {
  const table =
    crc32.table ||
    (crc32.table = (() => {
      const t = [];
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
      }
      return t;
    })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.42;
  const rInner = size * 0.24;
  const rDot = size * 0.1;
  const raw = Buffer.alloc(size * (1 + size * 3));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // row filter: none
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const col = (d <= rOuter && d >= rInner) || d <= rDot ? GREEN : BG;
      raw[p++] = col[0];
      raw[p++] = col[1];
      raw[p++] = col[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const s of [192, 512]) {
  writeFileSync(new URL(`../public/icon-${s}.png`, import.meta.url), png(s));
  console.log(`wrote public/icon-${s}.png`);
}
