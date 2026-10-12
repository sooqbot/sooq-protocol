import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, cpSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng, cropResize } from './lib/png.mjs';
import { loadRegister, validateRegister, stripDates, find, isStated } from './lib/register.mjs';
import { socialHtml, caHtml, heroActionsHtml, recordFieldsHtml, skeletonRows, barSkeletons, rpcHost, registerJson } from './lib/render.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function tokenValue(name) {
  const css = readFileSync(join(root, 'src/css/tokens.css'), 'utf8');
  const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token ${name} missing`);
  return m[1];
}

const trace = () => JSON.parse(readFileSync(join(root, 'src/favicon.trace.json'), 'utf8'));

function faviconSvg() {
  const t = trace();
  const { rect: r, eyes, gloss } = t;
  const stops = t.stops.map((s) => `<stop offset="${s.offset}" stop-color="${tokenValue(s.token)}"/>`).join('');
  const eye = eyes.map((e) => `<circle cx="${e.cx}" cy="${e.cy}" r="${e.r}" fill="${tokenValue('--b-void')}"/><circle cx="${e.glint.cx}" cy="${e.glint.cy}" r="${e.glint.r}" fill="${tokenValue('--b-white')}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
<defs><linearGradient id="body" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient><clipPath id="clip"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${r.rx}"/></clipPath></defs>
<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${r.rx}" fill="url(#body)"/>
<ellipse cx="${gloss.cx}" cy="${gloss.cy}" rx="${gloss.rx}" ry="${gloss.ry}" fill="${tokenValue('--b-ivory')}" opacity="0.35" clip-path="url(#clip)"/>
${eye}
</svg>
`;
}

/** Monochrome mark built from the same traced geometry, for inline use. */
function markSymbol() {
  const { rect: r, eyes } = trace();
  const eye = eyes.map((e) => `<circle class="mark-eye" cx="${e.cx}" cy="${e.cy}" r="${e.r}"/>`).join('');
  return `<symbol id="i-mark" viewBox="0 0 32 32"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${r.rx}" fill="currentColor"/>${eye}</symbol>`;
}

function logos(out) {
  const t = trace();
  const img = decodePng(join(root, t.source.file));
  for (const size of [96, 352]) writeFileSync(join(out, `assets/logo-${size}.png`), encodePng(cropResize(img, t.source.subjectBox, size), size, size));
}

function minCss(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/ ?([{};]) ?/g, '$1').trim();
}

export function build({ registerPath = join(root, 'src/register.json'), out = join(root, 'dist') } = {}) {
  const reg = loadRegister(registerPath);
  const errors = validateRegister(reg);
  if (errors.length) throw new Error('register invalid:\n - ' + errors.join('\n - '));

  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'assets/js'), { recursive: true });

  const order = ['tokens', 'base', 'layout', 'components', 'sections', 'motion'];
  const css = minCss(order.map((n) => readFileSync(join(root, `src/css/${n}.css`), 'utf8')).join('\n'));
  const cssHash = createHash('sha256').update(css).digest('hex').slice(0, 8);
  writeFileSync(join(out, 'assets/app.css'), css);

  const jsHash = createHash('sha256');
  for (const f of readdirSync(join(root, 'src/js')).sort()) {
    const body = readFileSync(join(root, 'src/js', f));
    jsHash.update(body);
    writeFileSync(join(out, 'assets/js', f), body);
  }
  cpSync(join(root, 'src/boot.js'), join(out, 'assets/boot.js'));
  writeFileSync(join(out, 'favicon.svg'), faviconSvg());
  logos(out);

  const slots = {
    THEME_COLOR: tokenValue('--b-void'),
    MARK_SYMBOL: markSymbol(),
    ASSET_CSS: `assets/app.css?v=${cssHash}`,
    ASSET_JS: `assets/js/main.js?v=${jsHash.digest('hex').slice(0, 8)}`,
    SOCIAL: socialHtml(reg),
    CA_SLOT: caHtml(reg),
    HERO_ACTIONS: heroActionsHtml(reg),
    RECORD_FIELDS: recordFieldsHtml(reg),
    SKELETON_ROWS: skeletonRows(),
    BAR_SKELETONS: barSkeletons(),
    RPC_HOST: rpcHost(reg),
    REGISTER_JSON: registerJson(reg),
  };
  let html = readFileSync(join(root, 'src/index.html'), 'utf8');
  html = html.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => {
    if (!(k in slots)) throw new Error(`template slot ${k} has no renderer`);
    return slots[k];
  });
  writeFileSync(join(out, 'index.html'), html);

  const ms = find(reg, 'market-source');
  const connect = isStated(ms) ? new URL(ms.url).origin : "'none'";
  writeFileSync(join(out, '_headers'), `/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src ${connect}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/assets/*
  Cache-Control: public, max-age=3600
`);
  writeFileSync(join(out, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  return { out, register: stripDates(reg) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? resolve(process.argv[i + 1]) : undefined; };
  try {
    const r = build({ registerPath: arg('--register'), out: arg('--out') });
    console.log(`built -> ${r.out}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
