// Reads brand/ and reports provenance: container header, alpha histogram, dominant pixels.
// PNG headers are parsed here. Pixel rows come from raw dumps (BGRA with a 12-byte header) so JPEG and PNG go through one path.
//   node scripts/tools/brand-scan.mjs <rawDir> [--write]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const brandDir = join(root, 'brand');
const rawDir = process.argv[2];
const write = process.argv.includes('--write');
if (!rawDir) { console.error('usage: brand-scan.mjs <rawDir> [--write]'); process.exit(2); }

const COLOR_TYPES = { 0: 'greyscale', 2: 'truecolour', 3: 'indexed', 4: 'greyscale+alpha', 6: 'truecolour+alpha' };

function pngHeader(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  const chunks = [];
  let p = 8; let ihdr = null;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p + 4, p + 8);
    if (type === 'IHDR') ihdr = { width: buf.readUInt32BE(p + 8), height: buf.readUInt32BE(p + 12), bitDepth: buf[p + 16], colourType: buf[p + 17], interlace: buf[p + 20] };
    if (!chunks.includes(type)) chunks.push(type);
    p += 12 + len;
    if (type === 'IEND') break;
  }
  return { ...ihdr, colourTypeName: COLOR_TYPES[ihdr.colourType], chunks };
}

function jpegHeader(buf) {
  let p = 2;
  while (p < buf.length) {
    if (buf[p] !== 0xff) { p += 1; continue; }
    const m = buf[p + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { height: buf.readUInt16BE(p + 5), width: buf.readUInt16BE(p + 7), components: buf[p + 9], precision: buf[p + 4], progressive: m === 0xc2 };
    p += 2 + buf.readUInt16BE(p + 2);
  }
  return null;
}

const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

function pixels(index) {
  const raw = readFileSync(join(rawDir, `img${index}.raw`));
  const w = raw.readInt32LE(0); const h = raw.readInt32LE(4); const stride = raw.readInt32LE(8);
  return { w, h, stride, data: raw.subarray(12) };
}

const files = readdirSync(brandDir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();
const report = [];
files.forEach((name, index) => {
  const buf = readFileSync(join(brandDir, name));
  const header = pngHeader(buf) || { format: 'jpeg', ...jpegHeader(buf) };
  const { w, h, stride, data } = pixels(index);
  const alpha = { transparent: 0, partial: 0, opaque: 0 };
  const bins = new Map();
  let minX = w; let minY = h; let maxX = 0; let maxY = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const o = y * stride + x * 4;
      const b = data[o]; const g = data[o + 1]; const r = data[o + 2]; const a = data[o + 3];
      if (a === 0) alpha.transparent += 1; else if (a === 255) alpha.opaque += 1; else alpha.partial += 1;
      if (a < 255) continue;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum > 40) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const e = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      e.n += 1; e.r += r; e.g += g; e.b += b; bins.set(key, e);
    }
  }
  const total = w * h;
  const dominant = [...bins.values()].sort((a, b) => b.n - a.n).slice(0, 40).map((e) => ({
    hex: hex(Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)), share: Number((e.n / total * 100).toFixed(3)),
  }));
  report.push({
    file: `brand/${name}`, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'),
    header, decoded: { width: w, height: h }, alpha, subjectBox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, dominant,
  });
});

for (const r of report) {
  console.log(`\n${r.file}  ${r.bytes}B`);
  console.log('  header', JSON.stringify(r.header));
  console.log('  alpha ', JSON.stringify(r.alpha), 'subject', JSON.stringify(r.subjectBox));
  console.log('  top   ', r.dominant.slice(0, 14).map((d) => `${d.hex} ${d.share}%`).join('  '));
}
if (write) writeFileSync(join(root, 'scripts/tools/brand-scan.json'), JSON.stringify(report, null, 2));
