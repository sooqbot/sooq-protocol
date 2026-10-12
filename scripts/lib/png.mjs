import { readFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

/** Minimal PNG reader: 8-bit, non-interlaced, colour type 2 or 6. Returns RGBA. */
export function decodePng(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let p = 8; let ihdr; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p + 4, p + 8);
    if (type === 'IHDR') ihdr = { w: buf.readUInt32BE(p + 8), h: buf.readUInt32BE(p + 12), depth: buf[p + 16], ct: buf[p + 17], interlace: buf[p + 20] };
    if (type === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    p += 12 + len;
    if (type === 'IEND') break;
  }
  if (ihdr.depth !== 8 || ![2, 6].includes(ihdr.ct) || ihdr.interlace) throw new Error('unsupported PNG layout');
  const bpp = ihdr.ct === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = ihdr.w * bpp;
  const out = Buffer.alloc(ihdr.h * stride);
  for (let y = 0; y < ihdr.h; y += 1) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1; const dst = y * stride;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[src + i];
      const a = i >= bpp ? out[dst + i - bpp] : 0;
      const b = y ? out[dst - stride + i] : 0;
      const c = i >= bpp && y ? out[dst - stride + i - bpp] : 0;
      let v;
      if (f === 0) v = x;
      else if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else { const pp = a + b - c; const pa = Math.abs(pp - a); const pb = Math.abs(pp - b); const pc = Math.abs(pp - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      out[dst + i] = v & 255;
    }
  }
  const rgba = Buffer.alloc(ihdr.w * ihdr.h * 4);
  for (let i = 0, j = 0; i < out.length; i += bpp, j += 4) {
    rgba[j] = out[i]; rgba[j + 1] = out[i + 1]; rgba[j + 2] = out[i + 2]; rgba[j + 3] = bpp === 4 ? out[i + 3] : 255;
  }
  return { w: ihdr.w, h: ihdr.h, data: rgba, header: ihdr };
}

export const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** 4-bit-per-channel cluster means over opaque pixels. Returns Map<hex, count>. */
export function clusters(img, box = { x: 0, y: 0, w: img.w, h: img.h }) {
  const bins = new Map();
  for (let y = box.y; y < box.y + box.h; y += 1) {
    for (let x = box.x; x < box.x + box.w; x += 1) {
      const o = (y * img.w + x) * 4;
      if (img.data[o + 3] !== 255) continue;
      const r = img.data[o]; const g = img.data[o + 1]; const b = img.data[o + 2];
      const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 };
      e.n += 1; e.r += r; e.g += g; e.b += b; bins.set(k, e);
    }
  }
  const out = new Map();
  for (const e of bins.values()) out.set(hex(Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)), e.n);
  return out;
}

// ── encoding and resampling, used to cut web-sized logos from the brand master ──
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function chunk(type, body) {
  const head = Buffer.alloc(8); head.writeUInt32BE(body.length, 0); head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, tail]);
}

export function encodePng(rgba, w, h) {
  const rows = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    rows[y * (w * 4 + 1)] = 1;
    for (let i = 0; i < w * 4; i += 1) {
      const left = i >= 4 ? rgba[y * w * 4 + i - 4] : 0;
      rows[y * (w * 4 + 1) + 1 + i] = (rgba[y * w * 4 + i] - left) & 255;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Crops a square window (padded with transparency) and area-averages it to `size`, alpha-weighted. */
export function cropResize(img, box, size) {
  const side = Math.max(box.w, box.h);
  const sx0 = box.x - (side - box.w) / 2; const sy0 = box.y - (side - box.h) / 2;
  const out = Buffer.alloc(size * size * 4);
  const k = side / size;
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    let r = 0; let g = 0; let b = 0; let a = 0; let n = 0;
    for (let yy = Math.floor(sy0 + y * k); yy < Math.ceil(sy0 + (y + 1) * k); yy += 1) for (let xx = Math.floor(sx0 + x * k); xx < Math.ceil(sx0 + (x + 1) * k); xx += 1) {
      n += 1;
      if (xx < 0 || yy < 0 || xx >= img.w || yy >= img.h) continue;
      const o = (yy * img.w + xx) * 4; const al = img.data[o + 3];
      r += img.data[o] * al; g += img.data[o + 1] * al; b += img.data[o + 2] * al; a += al;
    }
    const o = (y * size + x) * 4;
    if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); out[o + 3] = Math.round(a / n); }
  }
  return out;
}
