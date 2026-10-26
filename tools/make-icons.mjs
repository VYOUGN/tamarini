// Draws the app icon (a loaded barbell in IWF plate colors) and writes PNGs with no dependencies.
// Run: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex('#15171A');
// [x0, y0, x1, y1, radius, color] in 0..1 units, painted in order.
const SHAPES = [
  [0.10, 0.475, 0.90, 0.525, 0.012, hex('#B9BEC4')], // bar
  [0.27, 0.25, 0.335, 0.75, 0.02, hex('#D22B2B')],   // 25 kg
  [0.665, 0.25, 0.73, 0.75, 0.02, hex('#D22B2B')],
  [0.205, 0.31, 0.265, 0.69, 0.02, hex('#2453C2')],  // 20 kg
  [0.735, 0.31, 0.795, 0.69, 0.02, hex('#2453C2')],
  [0.34, 0.43, 0.365, 0.57, 0.008, hex('#E8EAED')],  // collars
  [0.635, 0.43, 0.66, 0.57, 0.008, hex('#E8EAED')],
];

function inside(px, py, [x0, y0, x1, y1, r]) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const cx = Math.min(Math.max(px, x0 + r), x1 - r);
  const cy = Math.min(Math.max(py, y0 + r), y1 - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function draw(size) {
  const px = Buffer.alloc(size * size * 3);
  const S = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const u = (x + (sx + 0.5) / S) / size, v = (y + (sy + 0.5) / S) / size;
          let c = BG;
          for (const sh of SHAPES) if (inside(u, v, sh)) c = sh[5];
          acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
        }
      }
      const i = (y * size + x) * 3;
      px[i] = Math.round(acc[0] / (S * S));
      px[i + 1] = Math.round(acc[1] / (S * S));
      px[i + 2] = Math.round(acc[2] / (S * S));
    }
  }
  return px;
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const rgb = draw(size);
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [180, 192, 512]) {
  const file = join(out, `icon-${size}.png`);
  writeFileSync(file, png(size));
  console.log('wrote', file);
}
