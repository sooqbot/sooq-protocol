// Traces the favicon from the real pixel grid of brand/LOGO SOOQ PNG...png (transparent, colour type 6).
// Geometry is measured from the alpha mask, colours are snapped to the tokens in src/css/tokens.css.
//   node scripts/tools/trace-favicon.mjs        writes src/favicon.trace.json
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePng } from '../lib/png.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const SOURCE = 'brand/LOGO SOOQ PNG...png';
const CANVAS = 32;
const PLACE = 28; // the subject's long side on the 32 grid, leaving a 2px margin

export function tokenPalette() {
  const css = readFileSync(join(root, 'src/css/tokens.css'), 'utf8');
  return [...css.matchAll(/(--b-[a-z0-9-]+):\s*(#[0-9a-f]{6})/g)].map((m) => ({ token: m[1], hex: m[2], rgb: [1, 3, 5].map((i) => parseInt(m[2].slice(i, i + 2), 16)) }));
}

function snap(palette, rgb) {
  let best = null;
  for (const p of palette) {
    const d = (p.rgb[0] - rgb[0]) ** 2 + (p.rgb[1] - rgb[1]) ** 2 + (p.rgb[2] - rgb[2]) ** 2;
    if (!best || d < best.d) best = { d, p };
  }
  return best.p;
}

export function traceFavicon() {
  const file = join(root, SOURCE);
  const buf = readFileSync(file);
  const img = decodePng(file);
  const palette = tokenPalette();
  const { w, h, data } = img;
  const px = (x, y) => { const o = (y * w + x) * 4; return [data[o], data[o + 1], data[o + 2], data[o + 3]]; };
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

  // subject box from the alpha mask
  let x0 = w; let y0 = h; let x1 = 0; let y1 = 0;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (data[(y * w + x) * 4 + 3] >= 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };

  // corner radius: rows until the left or right edge reaches the straight side
  const edgeL = (y) => { for (let x = box.x; x < box.x + box.w; x += 1) if (px(x, y)[3] >= 128) return x - box.x; return box.w; };
  const edgeR = (y) => { for (let x = box.x + box.w - 1; x >= box.x; x -= 1) if (px(x, y)[3] >= 128) return box.x + box.w - 1 - x; return box.w; };
  const radii = [];
  for (const [edge, ys] of [[edgeL, 1], [edgeR, 1], [edgeL, -1], [edgeR, -1]]) {
    const start = ys === 1 ? box.y : box.y + box.h - 1;
    let d = 0; while (d < box.h / 2 && edge(start + ys * d) > 3) d += 1;
    radii.push(d);
  }
  const radius = radii.reduce((a, b) => a + b, 0) / radii.length;

  const s = PLACE / Math.max(box.w, box.h);
  const ox = (CANVAS - box.w * s) / 2; const oy = (CANVAS - box.h * s) / 2;
  const toCanvas = (x, y) => [ox + (x - box.x) * s, oy + (y - box.y) * s];
  const r2 = (n) => Math.round(n * 100) / 100;

  // eyes: connected dark regions inside the body
  const seen = new Set(); const comps = [];
  for (let y = box.y + 40; y < box.y + box.h - 40; y += 2) {
    for (let x = box.x + 40; x < box.x + box.w - 40; x += 2) {
      const k = y * w + x;
      if (seen.has(k)) continue;
      const c = px(x, y);
      if (c[3] !== 255 || lum(c) > 40) continue;
      const stack = [[x, y]]; seen.add(k); let n = 0; let sx = 0; let sy = 0; let minx = x; let maxx = x;
      while (stack.length) {
        const [cx, cy] = stack.pop(); n += 1; sx += cx; sy += cy; if (cx < minx) minx = cx; if (cx > maxx) maxx = cx;
        for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
          const nx = cx + dx; const ny = cy + dy; const nk = ny * w + nx;
          if (nx < box.x || ny < box.y || nx >= box.x + box.w || ny >= box.y + box.h || seen.has(nk)) continue;
          const q = px(nx, ny); if (q[3] === 255 && lum(q) <= 40) { seen.add(nk); stack.push([nx, ny]); }
        }
      }
      comps.push({ n, cx: sx / n, cy: sy / n, r: (maxx - minx) / 2 + 1 });
    }
  }
  const eyes = comps.sort((a, b) => b.n - a.n).slice(0, 2).sort((a, b) => a.cx - b.cx).map((e) => {
    let gx = 0; let gy = 0; let gn = 0; let gmin = 1e9; let gmax = -1e9;
    for (let y = Math.floor(e.cy - e.r); y <= e.cy + e.r; y += 1) for (let x = Math.floor(e.cx - e.r); x <= e.cx + e.r; x += 1) {
      if ((x - e.cx) ** 2 + (y - e.cy) ** 2 > e.r * e.r) continue;
      if (lum(px(x, y)) > 150) { gx += x; gy += y; gn += 1; if (x < gmin) gmin = x; if (x > gmax) gmax = x; }
    }
    const [cx, cy] = toCanvas(e.cx, e.cy); const [gcx, gcy] = toCanvas(gx / gn, gy / gn);
    return { cx: r2(cx), cy: r2(cy), r: r2(e.r * s), glint: { cx: r2(gcx), cy: r2(gcy), r: r2(Math.max(0.3, ((gmax - gmin) / 2 + 1) * s)) } };
  });

  // gloss: brightest sheen in the upper-left of the body
  let bx0 = 1e9; let by0 = 1e9; let bx1 = -1; let by1 = -1;
  for (let y = box.y; y < box.y + box.h / 2; y += 2) for (let x = box.x; x < box.x + box.w / 2; x += 2) {
    const c = px(x, y); if (c[3] === 255 && lum(c) > 225) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
  }
  const [gcx, gcy] = toCanvas((bx0 + bx1) / 2, (by0 + by1) / 2);
  const gloss = { cx: r2(gcx), cy: r2(gcy), rx: r2(((bx1 - bx0) / 2) * s), ry: r2(((by1 - by0) / 2) * s) };

  // body gradient: samples down the diagonal, eyes and gloss skipped
  const stops = [];
  const mean = (cx, cy, rad) => {
    let r = 0; let g = 0; let b = 0; let n = 0;
    for (let y = cy - rad; y <= cy + rad; y += 1) for (let x = cx - rad; x <= cx + rad; x += 1) {
      const c = px(x, y); if (c[3] !== 255 || lum(c) < 45 || lum(c) > 232) continue; r += c[0]; g += c[1]; b += c[2]; n += 1;
    }
    return n ? [r / n, g / n, b / n] : null;
  };
  for (let i = 0; i <= 8; i += 1) {
    const t = 0.1 + (0.8 * i) / 8;
    const c = mean(Math.round(box.x + box.w * t), Math.round(box.y + box.h * t), 12);
    if (c) stops.push({ offset: r2(t), token: snap(palette, c).token });
  }

  // the 32x32 pixel grid, each cell snapped to a token
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const grid = [];
  const used = [...new Set(palette.map((p) => p.token))];
  for (let cy = 0; cy < CANVAS; cy += 1) {
    let row = '';
    for (let cx = 0; cx < CANVAS; cx += 1) {
      const sx = box.x + (cx + 0.5 - ox) / s; const sy = box.y + (cy + 0.5 - oy) / s;
      const half = Math.max(1, Math.round(0.5 / s));
      let r = 0; let g = 0; let b = 0; let n = 0; let total = 0;
      for (let y = Math.round(sy - half); y <= Math.round(sy + half); y += 2) for (let x = Math.round(sx - half); x <= Math.round(sx + half); x += 2) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue; total += 1;
        const c = px(x, y); if (c[3] < 128) continue; r += c[0]; g += c[1]; b += c[2]; n += 1;
      }
      row += total && n / total > 0.5 ? letters[used.indexOf(snap(palette, [r / n, g / n, b / n]).token)] : '.';
    }
    grid.push(row);
  }

  return {
    source: { file: SOURCE, sha256: createHash('sha256').update(buf).digest('hex'), width: w, height: h, subjectBox: box },
    canvas: CANVAS, scale: r2(s * 1000) / 1000,
    rect: { x: r2(ox), y: r2(oy), w: r2(box.w * s), h: r2(box.h * s), rx: r2(radius * s) },
    eyes, gloss, stops, gridKey: used, grid,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t = traceFavicon();
  writeFileSync(join(root, 'src/favicon.trace.json'), JSON.stringify(t, null, 1));
  console.log(JSON.stringify({ rect: t.rect, eyes: t.eyes, gloss: t.gloss, stops: t.stops.length }, null, 1));
  console.log(t.grid.join('\n'));
}
