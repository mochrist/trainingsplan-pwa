// Erzeugt die App-Icons (Hantel-Motiv) als PNG, ohne Abhängigkeiten.
// Aufruf: node tools/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x11, 0x13, 0x17];
const FG = [0x4f, 0x9c, 0xff];
const SUPERSAMPLE = 4;

// Rechtecke in normierten Koordinaten (0..1): [x0, y0, x1, y1]
const SHAPES = [
  [0.22, 0.465, 0.78, 0.535], // Stange
  [0.25, 0.28, 0.33, 0.72], // innere Scheiben
  [0.67, 0.28, 0.75, 0.72],
  [0.17, 0.36, 0.25, 0.64], // äußere Scheiben
  [0.75, 0.36, 0.83, 0.64],
];

function coverage(x, y, scale) {
  // Motiv um die Mitte skalieren (maskable braucht Rand für die Sicherheitszone)
  const u = (x - 0.5) / scale + 0.5;
  const v = (y - 0.5) / scale + 0.5;
  return SHAPES.some(([x0, y0, x1, y1]) => u >= x0 && u <= x1 && v >= y0 && v <= y1);
}

function renderIcon(size, scale) {
  const rowBytes = size * 3 + 1;
  const raw = Buffer.alloc(rowBytes * size);
  for (let py = 0; py < size; py++) {
    raw[py * rowBytes] = 0; // Filtertyp "None"
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = (px + (sx + 0.5) / SUPERSAMPLE) / size;
          const y = (py + (sy + 0.5) / SUPERSAMPLE) / size;
          if (coverage(x, y, scale)) hits++;
        }
      }
      const a = hits / (SUPERSAMPLE * SUPERSAMPLE);
      const offset = py * rowBytes + 1 + px * 3;
      for (let c = 0; c < 3; c++) raw[offset + c] = Math.round(BG[c] + (FG[c] - BG[c]) * a);
    }
  }
  return encodePng(size, size, raw);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 2; // Farbtyp RGB (ohne Alpha, iOS mag keine Transparenz)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = new URL('../icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });

const icons = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.75],
  ['apple-touch-icon-180.png', 180, 0.9],
];

for (const [name, size, scale] of icons) {
  writeFileSync(new URL(name, outDir), renderIcon(size, scale));
  console.log(`icons/${name}`);
}
