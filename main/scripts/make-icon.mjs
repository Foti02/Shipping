// Genera build/icon.png (1024x1024): icona segnaposto, un quadrato accento su fondo ardesia neutro.
// Nessun arancione, nessun logo. Si puo' sostituire il file con un'icona definitiva.
import { deflateSync, crc32 } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const N = 1024;
const ARDESIA = [0x1e, 0x29, 0x3b], ACCENTO = [0x5b, 0x8d, 0xc4];
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x < x1 && y >= y0 && y < y1;

function pixel(x, y) {
  // angoli arrotondati: fuori dal rettangolo con raggio 200 resta trasparente
  const R = 200, cx = Math.min(Math.max(x, R), N - 1 - R), cy = Math.min(Math.max(y, R), N - 1 - R);
  if ((x - cx) ** 2 + (y - cy) ** 2 > R * R) return [0, 0, 0, 0];
  if (inRect(x, y, 372, 372, 652, 652)) return [...ACCENTO, 255]; // il quadrato accento
  return [...ARDESIA, 255];
}

const raw = Buffer.alloc(N * (N * 4 + 1));
for (let y = 0; y < N; y++) {
  const row = y * (N * 4 + 1);
  for (let x = 0; x < N; x++) Buffer.from(pixel(x, y)).copy(raw, row + 1 + x * 4);
}

const chunk = (type, data) => {
  const t = Buffer.from(type), len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6; // 8 bit RGBA

mkdirSync(new URL('../build/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('../build/icon.png', import.meta.url),
  Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]),
);
console.log('build/icon.png creata');
