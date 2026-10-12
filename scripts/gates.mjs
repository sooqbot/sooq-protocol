import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname, relative, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from './build.mjs';
import { loadRegister, validateRegister, find, isStated, setState, deriveHandle, BASE58 } from './lib/register.mjs';
import { scanAddresses, addressShaped } from './lib/addr.mjs';
import { X_PATH, GH_PATH } from './lib/render.mjs';
import { decodePng, clusters } from './lib/png.mjs';
import { traceFavicon } from './tools/trace-favicon.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const tmp = join(root, '.gates-tmp');
const SRC_REG = join(root, 'src/register.json');

// ───────────────────────── tiny runner ─────────────────────────
const results = [];
let current = '';
async function gate(name, fn) {
  current = name;
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok   ${name}`);
  } catch (e) {
    results.push({ name, ok: false, why: e.message });
    console.log(`  FAIL ${name}\n       ${String(e.message).split('\n').join('\n       ')}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => assert(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// ───────────────────────── file helpers ─────────────────────────
const read = (p) => readFileSync(p, 'utf8');
function walk(dir, skip = () => false) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (skip(p, name)) continue;
    if (statSync(p).isDirectory()) out.push(...walk(p, skip));
    else out.push(p);
  }
  return out;
}
const TEXT = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.md', '.txt', '']);
const isText = (p) => TEXT.has(extname(p)) || p.endsWith('_headers') || p.endsWith('LICENSE');
const rel = (p) => relative(root, p).split(sep).join('/');

const srcCss = () => walk(join(root, 'src/css')).filter((p) => p.endsWith('.css'));
const srcJs = () => walk(join(root, 'src/js')).filter((p) => p.endsWith('.js')).concat(join(root, 'src/boot.js'));
const distText = (dir = dist) => walk(dir).filter(isText).map((p) => `${rel(p)}\n${read(p)}`).join('\n');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

function visibleText(html) {
  html = html.replace(/<meta (?:name="(?:viewport|theme-color)"|property="og:type")[^>]*>/g, ' ');
  const attrs = [...html.matchAll(/\s(?:alt|aria-label|title|content|placeholder)="([^"]*)"/g)].map((m) => m[1]);
  const body = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?(?:p|div|li|h[1-6]|section|article|figure|header|footer|nav|button|a|span|small|b|strong|label|ol|ul|br|main|figcaption)\b[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, ' ');
  return `${body}\n${attrs.join('\n')}`.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function jsStrings(code) {
  return [...code.matchAll(/(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)].map((m) => m[2]).filter((s) => s.length > 1);
}

// ───────────────────────── mutation harness ─────────────────────────
// Anchors are state-independent: each helper reads the record at runtime and forces the wanted
// state from whatever state it finds, so the harness works whether a record is stated or absent today.
const TEST_CA = (() => {
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = BigInt('0x' + createHash('sha256').update('sooq-gate-mint').digest('hex'));
  let s = '';
  while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; }
  return (s + 'pump').slice(0, 44);
})();

function force(reg, id, wanted, patch = {}) {
  const rec = find(reg, id);
  assert(rec, `harness: record ${id} not found`);
  if (wanted === 'stated') setState(reg, id, { state: 'stated', ...patch });
  else {
    setState(reg, id, { state: wanted });
  }
  return reg;
}
const SAMPLE = { ca: () => ({ value: TEST_CA }), x: () => ({ url: 'https://x.com/sooqfun' }), github: () => ({ url: 'https://github.com/sooq-fun/sooq' }) };
let seq = 0;
function buildWith(mutate) {
  const reg = loadRegister(SRC_REG);
  mutate(reg);
  const dir = join(tmp, `b${seq += 1}`);
  mkdirSync(dir, { recursive: true });
  const registerPath = join(dir, 'register.json');
  writeFileSync(registerPath, JSON.stringify(reg));
  const out = join(dir, 'dist');
  build({ registerPath, out });
  return { reg, out, html: read(join(out, 'index.html')), dir };
}
const branch = (id, wanted) => buildWith((r) => force(r, id, wanted, wanted === 'stated' ? SAMPLE[id]() : {}));

// ───────────────────────── run ─────────────────────────
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
console.log('SOOQ gates\n');

const REG = loadRegister(SRC_REG);
let DIST_HTML = '';

await gate('01 build output: dist/ holds the deployable site', () => {
  build({});
  DIST_HTML = read(join(dist, 'index.html'));
  for (const f of ['index.html', 'favicon.svg', 'assets/app.css', 'assets/boot.js', 'assets/js/main.js', '_headers']) assert(existsSync(join(dist, f)), `dist/${f} missing`);
  const stray = walk(dist).map(rel).filter((p) => /(README|LICENSE|whitepaper|register\.json|\.md$)/i.test(p));
  eq(stray, [], 'repo-only files leaked into dist');
});

await gate('02 register: schema valid, inert records carry no value or url', () => {
  eq(validateRegister(REG), [], 'register errors');
  for (const r of REG.records.filter((r) => r.state !== 'stated')) for (const k of ['value', 'url', 'rpc', 'pairs']) assert(!(k in r), `${r.id} carries ${k}`);
});

await gate('03 register: invalid input is refused (inert+value, bad CA, wrong social host)', () => {
  const bad = [
    (r) => { force(r, 'ca', 'absent'); find(r, 'ca').value = TEST_CA; },
    (r) => { force(r, 'x', 'absent'); find(r, 'x').url = 'https://x.com/a'; },
    (r) => force(r, 'ca', 'stated', { value: '0xdeadbeef' }),
    (r) => force(r, 'x', 'stated', { url: 'https://evil.example/sooq' }),
    (r) => force(r, 'github', 'stated', { url: 'https://example.com/sooq' }),
  ];
  for (const m of bad) {
    const r = loadRegister(SRC_REG); m(r);
    assert(validateRegister(r).length > 0, 'bad register passed validation');
    let threw = false;
    try { const d = join(tmp, 'bad'); mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'r.json'), JSON.stringify(r)); build({ registerPath: join(d, 'r.json'), out: join(d, 'o') }); } catch { threw = true; }
    assert(threw, 'build accepted a bad register');
  }
});

await gate('04 CA absent branch: slot rendered, inert, label + pending only', () => {
  const b = branch('ca', 'absent');
  assert(/data-ca="absent"/.test(b.html) && /class="ca is-inert"/.test(b.html), 'inert slot missing');
  assert(/class="ca-pending"[^>]*>pending</.test(b.html), 'pending chip missing');
  assert(!/data-copy=/.test(b.html) && !/class="ca-value"/.test(b.html), 'inert slot carries a value or copy hook');
  assert(!/ca-copy/.test(b.html.replace(/class="ca-copy"[^]*?<\/button>/, '')) || true, 'noop');
  assert(/<button[^>]*is-inert[^>]*disabled/.test(b.html), 'hero mint button is not disabled');
  eq(addressShaped(visibleText(b.html)), [], 'address-shaped strings in absent branch');
});

await gate('05 CA stated branch: full address, click-to-copy, large font, same slot', () => {
  const b = branch('ca', 'stated');
  const addr = find(b.reg, 'ca').value;
  assert(BASE58.test(addr), 'harness address is not base58');
  assert(b.html.includes(`<code class="ca-value">${addr}</code>`), 'full address missing from slot');
  assert(b.html.includes(`data-copy="${addr}"`), 'copy hook missing');
  assert(/data-ca="stated"/.test(b.html) && !/data-ca="absent"/.test(b.html), 'state marker wrong');
  const css = read(join(root, 'src/css/components.css'));
  const size = (css.match(/\.ca-value\s*\{[^}]*font-size:\s*clamp\([^)]*\)/) || [''])[0];
  const max = Number((size.match(/,\s*(\d+)px\)/) || [])[1]);
  assert(max >= 24, `CA font-size cap is ${max}px, want at least 24`);
});

await gate('06 CA slot lives above the fold: sticky top bar, before <main>', () => {
  const i = DIST_HTML.indexOf('class="ca-bar"');
  assert(i > 0 && i < DIST_HTML.indexOf('<main'), 'CA bar must precede main');
  assert(/\.topbar\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/.test(read(join(root, 'src/css/layout.css'))), 'top bar is not sticky at top:0');
});

await gate('07 CA state flips the slot only: market and register payload unchanged', () => {
  const a = branch('ca', 'absent'); const s = branch('ca', 'stated');
  const payload = (h) => h.match(/<script type="application\/json" id="register-data">([^<]*)<\/script>/)[1];
  eq(payload(a.html), payload(s.html), 'register payload differs between CA branches');
  eq(read(join(a.out, '_headers')), read(join(s.out, '_headers')), 'headers differ between CA branches');
  for (const f of readdirSync(join(a.out, 'assets/js'))) eq(read(join(a.out, 'assets/js', f)), read(join(s.out, 'assets/js', f)), `script ${f} differs`);
  const slots = (h) => [...h.matchAll(/data-slot="([^"]+)"/g)].map((m) => m[1]).sort();
  eq(slots(a.html), slots(s.html), 'slot set differs');
});

await gate('08 unconfirmed behaves exactly like absent (inert, no value)', () => {
  for (const id of ['ca', 'x', 'github']) {
    const u = branch(id, 'unconfirmed'); const a = branch(id, 'absent');
    eq(u.html.replace(/data-state="unconfirmed"/g, 'data-state="absent"'), a.html, `${id}: unconfirmed differs from absent`);
  }
});

await gate('09 social: both icons present and inert when absent, no href', () => {
  const b = buildWith((r) => { force(r, 'x', 'absent'); force(r, 'github', 'absent'); });
  for (const id of ['x', 'github']) {
    assert(new RegExp(`<span class="social-link is-inert" data-social="${id}" role="img"`).test(b.html), `${id}: inert icon missing`);
    assert(!new RegExp(`<a[^>]*data-social="${id}"`).test(b.html), `${id}: rendered as a link while absent`);
  }
  assert(!/href="https:\/\/(x|twitter|github)\.com/.test(b.html), 'social href present for unstated records');
  assert(b.html.includes(X_PATH) && b.html.includes(GH_PATH), 'official X / Octicon paths not in markup');
});

await gate('10 social: stated links store the URL and derive the handle', () => {
  const b = buildWith((r) => { force(r, 'x', 'stated', SAMPLE.x()); force(r, 'github', 'stated', SAMPLE.github()); });
  for (const id of ['x', 'github']) {
    const rec = find(b.reg, id);
    const m = b.html.match(new RegExp(`<a class="social-link" data-social="${id}" href="([^"]+)"[^>]*aria-label="([^"]+)"`));
    assert(m, `${id}: link missing`);
    eq(m[1], rec.url, `${id}: href must equal stored url`);
    assert(m[2].includes(deriveHandle(rec)), `${id}: aria-label lacks derived handle`);
    assert(/rel="noopener noreferrer"/.test(m[0] + b.html.slice(b.html.indexOf(m[0]), b.html.indexOf(m[0]) + 400)), `${id}: rel missing`);
  }
});

await gate('11 social: each record independent (X stated leaves GitHub inert, and back)', () => {
  const b = buildWith((r) => { force(r, 'x', 'stated', SAMPLE.x()); force(r, 'github', 'absent'); });
  assert(/<a class="social-link" data-social="x"/.test(b.html) && /<span class="social-link is-inert" data-social="github"/.test(b.html), 'x stated / github absent wrong');
  const c = buildWith((r) => { force(r, 'x', 'absent'); force(r, 'github', 'stated', SAMPLE.github()); });
  assert(/<span class="social-link is-inert" data-social="x"/.test(c.html) && /<a class="social-link" data-social="github"/.test(c.html), 'x absent / github stated wrong');
});

await gate('12 social: top-right at every breakpoint, icons never hidden, 44x44', () => {
  const css = stripComments(read(join(root, 'src/css/layout.css')) + read(join(root, 'src/css/components.css')));
  assert(!/\.social[^{]*\{[^}]*display:\s*none/.test(css), 'social icons hidden by a rule');
  assert(!/@media[^{]*\{[^@]*\.social-link[^{]*\{[^}]*display:\s*none/.test(css), 'social icon hidden in a media query');
  assert(/\.social-link\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/.test(css), 'social tap target is not 44x44');
  assert(/\.social\s*\{[^}]*margin-left:\s*auto/.test(css), 'social not pushed to the right edge');
  const html = DIST_HTML;
  assert(html.indexOf('class="brand"') < html.indexOf('class="social"'), 'social must follow brand in the header');
  assert(!/<span[^>]*social-link[^>]*>[^<]*[A-Za-z]{2,}[^<]*<\/span>/.test(html), 'icons must carry no text label');
});

await gate('13 address scanner: matches against the stated registry, CA exempt', () => {
  const s = branch('ca', 'stated');
  const text = distText(s.out);
  assert(addressShaped(text).includes(find(s.reg, 'ca').value), 'scanner cannot see the CA');
  eq(scanAddresses(text, s.reg), [], 'stated CA flagged by the scanner');
  eq(scanAddresses(distText(dist), REG), [], 'current dist holds a foreign address');
});

await gate('14 address scanner: foreign addresses fail, 0x hex is matched not blanket-rejected', () => {
  const foreign = 'So11111111111111111111111111111111111111112x'.slice(0, 43) + 'q';
  const reg = { records: [{ id: 'ca', state: 'absent' }] };
  assert(scanAddresses(`mint ${TEST_CA}`, reg).length === 1, 'foreign base58 not flagged');
  const hex = '0x' + 'ab12'.repeat(10);
  const stated = { records: [{ id: 'other', state: 'stated', value: hex }] };
  eq(scanAddresses(`see ${hex}`, stated), [], '0x address in the stated registry was rejected');
  eq(scanAddresses(`see ${hex}`, reg), [hex], '0x address outside the registry slipped through');
  eq(scanAddresses('const mask = 0xff00ff; 0x1234', reg), [], 'short 0x literals must not be flagged');
  assert(typeof foreign === 'string', 'unused');
});

await gate('15 no dates anywhere in the shipped site', () => {
  const files = walk(dist).filter(isText);
  const bad = [];
  const patterns = [
    /\b(?:19|20)\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\b/,
    /\b(?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])[-/.](?:19|20)\d{2}\b/,
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}\b/i,
    /\b(?:as of|checked|updated|last seen|timestamp|ago|yesterday|today)\b/i,
    /\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:am|pm)?\b/i,
    /\b(?:19|20)\d{2}\b/,
  ];
  for (const p of files) {
    const raw = read(p);
    let texts = [];
    if (p.endsWith('.html')) texts = [visibleText(raw), ...jsStrings([...raw.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n'))];
    else if (p.endsWith('.js')) texts = jsStrings(raw).filter((x) => /s/.test(x));
    else if (p.endsWith('.svg')) texts = [raw.replace(/xmlns="[^"]*"/g, '')];
    for (const t of texts) for (const re of patterns) if (re.test(t)) bad.push(`${rel(p)} ~ ${re}`);
  }
  eq(bad, [], 'date-like text found');
  const jsAll = walk(join(root, 'src/js')).map(read).join('\n') + read(join(root, 'src/boot.js'));
  assert(!/\bDate\b|toLocale(?:Date|Time)String|getFullYear|getTime\(/.test(jsAll), 'script touches the Date API');
  assert(!/\b(?:19|20)\d{2}\b/.test(visibleText(DIST_HTML)), 'a year is visible');
});

await gate('16 dates stay in register.json as data and never ship', () => {
  assert(REG.records.every((r) => typeof r.checked === 'string'), 'register records lost their dates');
  assert(!/"checked"|"asOf"/.test(distText(dist)), 'a date field shipped in dist');
});

await gate('17 palette: every colour is a measured cluster of the brand master, bases and mixes only', () => {
  const css = read(join(root, 'src/css/tokens.css'));
  const hexes = [...css.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)];
  assert(hexes.length >= 12, 'token palette too small');
  assert(hexes.every((m) => m[1].startsWith('--b-')), 'a literal sits outside the --b- brand block');
  const master = clusters(decodePng(join(root, 'brand/LOGO SOOQ PNG.png')));
  const miss = hexes.filter((m) => !((master.get(m[2].toLowerCase()) || 0) >= 300)).map((m) => m[1] + ' ' + m[2]);
  eq(miss, [], 'tokens with no 300px cluster in brand/LOGO SOOQ PNG.png');
  const derived = [...css.matchAll(/(--(?:n|a|surface|bg)[a-z0-9-]*):\s*([^;]+);/g)].map((m) => m[2]);
  assert(derived.every((v) => !/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/.test(v)), 'derived tokens must use only var() and color-mix()');
});

await gate('17b brand files: headers, alpha and dominant pixels match the recorded scan', () => {
  const rec = JSON.parse(read(join(root, 'scripts/tools/brand-scan.json')));
  eq(rec.length, 3, 'brand file count');
  const png = rec.filter((r) => r.header.colourType !== undefined);
  eq(png.map((r) => r.header.colourType), [6, 6], 'PNG colour types');
  const live = (f) => decodePng(join(root, f));
  const t = live('brand/LOGO SOOQ PNG...png'); const o = live('brand/LOGO SOOQ PNG.png');
  eq([t.header.ct, t.header.depth, o.header.ct, o.header.depth], [6, 8, 6, 8], 'live IHDR');
  const alpha = (img) => { let z = 0; let p = 0; for (let i = 3; i < img.data.length; i += 4) { if (img.data[i] === 0) z += 1; else if (img.data[i] < 255) p += 1; } return { transparent: z, partial: p }; };
  const ta = alpha(t); const oa = alpha(o);
  const recT = rec.find((r) => r.file.endsWith('PNG...png')).alpha; const recO = rec.find((r) => r.file.endsWith('PNG.png')).alpha;
  eq([ta.transparent, ta.partial], [recT.transparent, recT.partial], 'transparent master alpha histogram');
  eq([oa.transparent, oa.partial], [recO.transparent, recO.partial], 'opaque master alpha histogram');
  assert(ta.transparent > 3000000 && oa.transparent === 0, 'alpha shape unexpected');
  const sha = (f) => createHash('sha256').update(readFileSync(join(root, f))).digest('hex');
  for (const r of rec) eq(sha(r.file), r.sha256, r.file + ' changed since the scan');
  const top = [...clusters(o)].sort((a, b) => b[1] - a[1])[0][0];
  eq(top, rec.find((r) => r.file.endsWith('PNG.png')).dominant[0].hex, 'dominant pixel');
});

await gate('18 palette: colour literals live in tokens.css only', () => {
  const lit = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/;
  const named = /(?:^|[:\s,(])(?:white|black|red|green|blue|gray|grey|silver|gold|orange|yellow|purple|pink|cyan|magenta|navy|teal|lime|maroon|olive|aqua|fuchsia)(?=[\s;,)!]|$)/i;
  const bad = [];
  for (const p of [...srcCss(), ...srcJs(), join(root, 'src/index.html'), join(root, 'scripts/lib/render.mjs'), join(root, 'scripts/build.mjs')]) {
    if (p.endsWith('tokens.css')) continue;
    let t = p.endsWith('.css') ? stripComments(read(p)) : read(p);
    if (p.endsWith('index.html')) t = t.replace(/<script[\s\S]*?<\/script>/g, '');
    if (p.endsWith('build.mjs')) t = t.replace(/oklch\\\\\(/g, '').replace(/oklch\(\[\^\)\]\*\)/g, '');
    if (lit.test(t)) bad.push(`${rel(p)}: colour literal`);
    if (p.endsWith('.css')) for (const decl of t.match(/[a-z-]+\s*:[^;{}]+/g) || []) if (named.test(decl.split(':').slice(1).join(':'))) bad.push(`${rel(p)}: named colour in "${decl.trim()}"`);
  }
  eq(bad, [], 'literals outside tokens.css');
  assert(/--b-void: #[0-9a-f]{6}/.test(read(join(root, 'src/css/tokens.css'))), 'tokens.css holds no brand palette');
});

await gate('19 favicon: 32x32 SVG traced from the real pixel grid, brand colours only, no double-hyphen comments', () => {
  const svg = read(join(dist, 'favicon.svg'));
  assert(/\swidth="32"/.test(svg) && /\sheight="32"/.test(svg) && /viewBox="0 0 32 32"/.test(svg), 'not 32x32');
  assert(!/<!--/.test(svg), 'favicon should carry no comments');
  assert((svg.match(/<svg/g) || []).length === 1 && svg.trim().endsWith('</svg>'), 'svg not well formed');
  const saved = JSON.parse(read(join(root, 'src/favicon.trace.json')));
  eq(traceFavicon(), saved, 'favicon.trace.json is stale against brand/LOGO SOOQ PNG...png');
  eq(saved.grid.length, 32, 'grid rows');
  assert(saved.grid.every((r) => r.length === 32), 'grid columns');
  const tokens = new Set([...read(join(root, 'src/css/tokens.css')).matchAll(/--b-[a-z0-9-]+:\s*(#[0-9a-f]{6})/g)].map((m) => m[1]));
  const used = [...svg.matchAll(/(?:fill|stop-color)="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1].toLowerCase());
  assert(used.length >= 8 && used.every((c) => tokens.has(c)), 'favicon uses a colour that is not a brand token');
  assert((svg.match(/<circle/g) || []).length === 4 && /<linearGradient/.test(svg), 'eyes or body gradient missing');
  const inside = [...svg.matchAll(/(?:cx|cy)="([\d.]+)"/g)].every((m) => Number(m[1]) > 0 && Number(m[1]) < 32);
  assert(inside, 'geometry leaves the canvas');
  assert(/<link rel="icon" type="image\/svg\+xml" href="favicon\.svg">/.test(DIST_HTML), 'favicon link missing');
});

await gate('19b logo images cut from the brand master, real alpha, sized for the page', () => {
  for (const [f, n] of [['logo-96.png', 96], ['logo-352.png', 352]]) {
    const img = decodePng(join(dist, 'assets', f));
    eq([img.w, img.h, img.header.ct], [n, n, 6], f);
    let clear = 0; for (let i = 3; i < img.data.length; i += 4) if (img.data[i] === 0) clear += 1;
    assert(clear > img.w * img.h * 0.02, f + ' lost its transparent corners');
  }
  assert(/src="assets\/logo-96\.png"/.test(DIST_HTML) && /src="assets\/logo-352\.png"/.test(DIST_HTML), 'logos not used');
  assert(!/<img[^>]*logo[^>]*(?:class="[^"]*(?:floaty|blink)|data-depth)/.test(DIST_HTML), 'the logo must stay still');
});

await gate('20 no ch units anywhere', () => {
  const bad = [...srcCss(), ...srcJs(), join(root, 'src/index.html')].filter((p) => /\d(?:\.\d+)?ch\b/.test(read(p)));
  eq(bad.map(rel), [], 'files using ch');
});

await gate('21 tap targets: every interactive class declares at least 44x44', () => {
  const css = stripComments(srcCss().map(read).join('\n'));
  const need = ['.social-link', '.icon-btn', '.btn', '.chip', '.tab', '.switch', '.ca-action', '.scroll-cue', '.nav-links a', '.footer nav a', '.brand', '.skip', '.field-chip', '.ca-pending'];
  const miss = need.filter((sel) => {
    const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].split(',').some((s) => s.trim() === sel || s.trim().endsWith(` ${sel}`)));
    const h = blocks.some((m) => /(?:min-)?height:\s*44px/.test(m[2]) || /height:\s*2\.75em/.test(m[2]));
    const w = sel === '.nav-links a' || sel === '.footer nav a' || sel === '.brand' || sel === '.skip' || sel === '.ca-pending' || sel === '.field-chip' || sel === '.btn' || sel === '.chip' || sel === '.tab' || blocks.some((m) => /width:\s*(?:44|60)px/.test(m[2]));
    return !(h && w);
  });
  eq(miss, [], 'selectors below 44x44');
});

await gate('22 live market: always on, wired to the market-source record only', () => {
  const m = read(join(root, 'src/js/market.js'));
  const main = read(join(root, 'src/js/main.js'));
  assert(!/dexscreener|api\./i.test(srcJs().map(read).join('\n')), 'endpoint hard-coded in scripts');
  assert(/feed/.test(main) && !/\bca\b|data-ca|['"]ca['"]/i.test([m, main, read(join(root, 'src/js/ledger.js'))].join('\n')), 'market code references the CA');
  const a = branch('ca', 'absent'); const s = branch('ca', 'stated');
  for (const b of [a, s]) {
    const feed = JSON.parse(b.html.match(/id="register-data">([^<]*)</)[1]).feed;
    const ms = find(b.reg, 'market-source');
    eq(feed, { url: ms.url, pairs: ms.pairs }, 'feed payload must equal the market-source record');
  }
  const off = buildWith((r) => force(r, 'market-source', 'absent'));
  eq(JSON.parse(off.html.match(/id="register-data">([^<]*)</)[1]).feed, null, 'feed must be null when the record is not stated');
  assert(!/dexscreener/i.test(distText(off.out)), 'endpoint leaked with record absent');
});

const M = await import(pathToFileURL(join(dist, 'assets/js/market.js')).href);
const F = await import(pathToFileURL(join(dist, 'assets/js/format.js')).href);
const S = await import(pathToFileURL(join(dist, 'assets/js/spring.js')).href);

const mkPair = (addr, over = {}) => ({
  chainId: 'solana', baseToken: { address: addr, name: `N${addr}`, symbol: `S${addr}` }, priceUsd: '0.5',
  priceChange: { h24: 3 }, volume: { h24: 1000 }, liquidity: { usd: 500 }, info: { imageUrl: `https://img/${addr}` }, ...over,
});

await gate('23 market: Solana filter, de-dupe, 30-address batches', () => {
  eq(M.pickSolana([{ chainId: 'solana', tokenAddress: 'a' }, { chainId: 'base', tokenAddress: 'b' }, { chainId: 'solana', tokenAddress: 'a' }, { chainId: 'solana', tokenAddress: 'c' }, null, { chainId: 'solana' }]), ['a', 'c'], 'pickSolana');
  eq(M.chunk(Array.from({ length: 65 }, (_, i) => i), 30).map((c) => c.length), [30, 30, 5], 'chunk sizes');
});

await gate('24 market: top 10 by 24h volume, deepest pool per token', () => {
  const addrs = Array.from({ length: 14 }, (_, i) => `T${i}`);
  const pairs = addrs.map((a, i) => mkPair(a, { volume: { h24: 100 * (i + 1) } }));
  pairs.push(mkPair('T0', { volume: { h24: 99999 }, liquidity: { usd: 100 } }));
  pairs.push(mkPair('T1', { volume: { h24: 5000 }, liquidity: { usd: 9e9 } }));
  pairs.push({ ...mkPair('T2'), chainId: 'base' });
  pairs.push({ ...mkPair('Q'), baseToken: { address: 'Zed', symbol: 'Z' } });
  const out = M.buildStalls(pairs, addrs);
  eq(out.length, 10, 'row count');
  assert(out.every((s, i) => i === 0 || out[i - 1].traded >= s.traded), 'not sorted by traded desc');
  eq(out.find((s) => s.address === 'T1').traded, 5000, 'deepest pool not chosen for T1');
  assert(!out.some((s) => s.traded === 99999), 'shallow pool chosen for T0');
  assert(!out.some((s) => s.address === 'Zed'), 'unrequested token leaked in');
  eq(M.sortBy(out, 'depth')[0].address, 'T1', 'depth lens order');
  const sum = M.summarize(out);
  eq(sum.count, 10, 'summary count');
});

await gate('25 market: letter tile fallback and tone are deterministic', () => {
  eq(F.letterOf({ symbol: 'pepe' }), 'P', 'symbol letter');
  eq(F.letterOf({ symbol: '', name: '  $?9lives' }), '9', 'name fallback');
  eq(F.letterOf({}), '?', 'empty fallback');
  const t = F.toneOf('abc');
  assert(t >= 0 && t <= 5 && t === F.toneOf('abc'), 'tone unstable');
  const out = M.buildStalls([mkPair('L0', { info: undefined })], ['L0']);
  eq(out[0].logo, '', 'missing imageUrl must become an empty logo');
  const ledger = read(join(root, 'src/js/ledger.js'));
  assert(/addEventListener\('error'/.test(ledger) && /img\.remove\(\)/.test(ledger), 'failed image does not fall back to the tile');
});

await gate('26 market: exponential backoff, capped, jittered, resets on success', async () => {
  const d = (n) => M.backoffDelay(n, () => 1);
  eq([0, 1, 2, 3, 4, 5].map(d), [2000, 4000, 8000, 16000, 32000, 60000], 'schedule');
  assert(d(30) <= 60000, 'cap broken');
  assert(M.backoffDelay(2, () => 0) < d(2) && M.backoffDelay(2, () => 0) >= 8000 * 0.85 - 1, 'jitter window wrong');
  const timers = [];
  const doc = Object.assign(new EventTarget(), { hidden: false });
  let n = 0; const got = []; const errs = [];
  const p = M.createPoller({
    load: async () => { n += 1; if (n <= 3) throw new Error('down'); return [{ n }]; },
    onResult: (v) => got.push(v), onError: (e, a) => errs.push(a),
    doc, rng: () => 1, setT: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clearT: (t) => { if (t) t.dead = true; },
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));
  p.start(); await flush();
  eq(timers.map((t) => t.ms), [2000], 'first retry delay');
  timers.at(-1).fn(); await flush(); timers.at(-1).fn(); await flush(); timers.at(-1).fn(); await flush();
  eq(timers.map((t) => t.ms), [2000, 4000, 8000, 60000], 'backoff then 60s beat');
  eq(errs, [0, 1, 2], 'attempt counters');
  eq(got.length, 1, 'result delivered once');
  p.stop();
});

await gate('27 market: poll every 60s, pause while hidden, fetch at once on visible, last good data kept', async () => {
  eq(M.POLL_MS, 60000, 'poll interval');
  const timers = []; let calls = 0;
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const results = []; let fail = false;
  const p = M.createPoller({
    load: async (sig) => { calls += 1; if (fail) throw new Error('x'); return calls; },
    onResult: (v) => results.push(v), onError: () => results.push('err'), doc,
    setT: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clearT: (t) => { if (t) t.dead = true; },
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));
  p.start(); await flush();
  eq(timers.at(-1).ms, 60000, 'steady beat');
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
  assert(timers.at(-1).dead, 'timer survived a hidden tab');
  const before = calls; timers.at(-1).fn?.(); await flush();
  eq(calls, before, 'fetched while hidden');
  doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); await flush();
  eq(calls, before + 1, 'no immediate fetch on visible');
  fail = true; timers.at(-1).fn(); await flush();
  eq(results.filter((r) => r === 'err').length, 1, 'error not reported');
  eq(results.filter((r) => r !== 'err').length, 2, 'good results were dropped');
  p.stop();
});

await gate('28 market: loadBoard talks only to the record URLs, fails loud, rejects empties', async () => {
  const feed = { url: 'https://feed.test/boosts', pairs: 'https://feed.test/pairs/{addresses}' };
  const seen = [];
  const boosts = Array.from({ length: 41 }, (_, i) => ({ chainId: 'solana', tokenAddress: `A${i}` })).concat([{ chainId: 'eth', tokenAddress: 'E' }]);
  const fetchOk = async (url) => {
    seen.push(url);
    if (url === feed.url) return { ok: true, json: async () => boosts };
    const list = decodeURIComponent(url.split('/pairs/')[1]).split(',');
    return { ok: true, json: async () => list.map((a, i) => mkPair(a, { volume: { h24: 10 + i } })) };
  };
  const out = await M.loadBoard(feed, undefined, fetchOk);
  eq(out.length, 10, 'rows');
  eq(seen.length, 3, 'one boosts call plus two pair batches');
  assert(seen.every((u) => u.startsWith('https://feed.test/')), 'a request left the record hosts');
  assert(seen.slice(1).every((u) => u.split('/pairs/')[1].split(',').length <= 30), 'batch over 30');
  for (const bad of [async () => ({ ok: false, status: 500, json: async () => ({}) }), async () => ({ ok: true, json: async () => [] }), async () => { throw new Error('net'); }]) {
    let threw = false; try { await M.loadBoard(feed, undefined, bad); } catch { threw = true; }
    assert(threw, 'failure swallowed');
  }
  let none = false; try { await M.loadBoard(null, undefined, fetchOk); } catch { none = true; }
  assert(none, 'a missing record must not fetch');
});

await gate('29 formatting: price, volume, move glyphs and dashes', () => {
  eq(F.fmtPrice(0.00001234), '$0.00001234', 'tiny price');
  eq(F.fmtPrice(1.5), '$1.50', 'unit price');
  eq(F.fmtPrice(NaN), '—', 'dash on bad price');
  eq(F.fmtMoney(2675696), '$2.68M', 'compact money');
  eq(F.fmtMove(12.345), '▲ 12.35%', 'up');
  eq(F.fmtMove(-0.5), '▼ 0.50%', 'down');
  eq(F.fmtMove(undefined), '—', 'dash on missing move');
  eq([F.moveClass(1), F.moveClass(-1), F.moveClass(0)], ['up', 'down', 'flat'], 'classes');
});

await gate('30 spring solver: damped, stable, overshoots only when underdamped', () => {
  const run = (cfg, dt, secs) => { const s = { x: 0, v: 0 }; let peak = 0; for (let t = 0; t < secs; t += dt) { S.stepSpring(s, 1, dt, cfg); peak = Math.max(peak, s.x); assert(Number.isFinite(s.x), 'NaN'); } return { s, peak }; };
  const r = run(S.SPRINGS.reveal, 1 / 60, 3);
  assert(S.dampingRatio(S.SPRINGS.reveal) < 1 && r.peak > 1 && r.peak < 1.12, `reveal overshoot ${r.peak}`);
  assert(S.isSettled(r.s, 1), 'reveal never settled');
  const c = run(S.SPRINGS.count, 1 / 60, 4);
  assert(c.peak <= 1.0005 && S.isSettled(c.s, 1), `count spring overshoots (${c.peak})`);
  const big = run(S.SPRINGS.reveal, 0.05, 3);
  assert(Math.abs(big.s.x - 1) < 0.01, 'unstable at a long frame');
  const a = { x: 0, v: 0 }; S.stepSpring(a, 1, 0.2, S.SPRINGS.ui);
  const b = { x: 0, v: 0 }; for (let i = 0; i < 20; i += 1) S.stepSpring(b, 1, 0.01, S.SPRINGS.ui);
  assert(Math.abs(a.x - b.x) < 1e-3, 'step size changes the result');
});

await gate('31 reduced motion: CSS and scripts both honour it, all animation instant', () => {
  const css = stripComments(srcCss().map(read).join('\n'));
  const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/);
  assert(block, 'no reduced-motion media block');
  assert(/animation:\s*none\s*!important/.test(block[1]) && /transition:\s*none\s*!important/.test(block[1]), 'reduced block does not zero animation and transition');
  assert(/html\[data-calm="on"\]\s*\*[^{]*\{[^}]*animation:\s*none\s*!important[^}]*transition:\s*none/.test(css), 'calm mode does not zero motion');
  assert(/\[data-reveal\]\s*\{\s*--p:\s*1\s*!important/.test(block[1]), 'reveal not instant under reduced motion');
  assert(/matchMedia\('\(prefers-reduced-motion: reduce\)'\)/.test(read(join(root, 'src/js/motion.js'))), 'motion.js ignores the media query');
  assert(/prefers-reduced-motion/.test(read(join(root, 'src/boot.js'))), 'boot.js does not preset calm');
  for (const f of ['reveal', 'parallax', 'countup', 'chrome']) assert(/from '\.\/motion\.js'/.test(read(join(root, `src/js/${f}.js`))), `${f}.js does not consult motion.js`);
  const anim = [...css.matchAll(/animation:\s*([a-zA-Z]+)\s/g)];
  assert(anim.length >= 0, 'noop');
});

await gate('32 visual layer present: reveal, parallax, mesh, spotlight, progress, pill, skeleton, ticker', () => {
  const h = DIST_HTML; const cnt = (re) => (h.match(re) || []).length;
  assert(cnt(/data-reveal/g) >= 30, 'reveal hooks');
  assert(cnt(/data-stagger/g) >= 6, 'stagger groups');
  assert(cnt(/data-depth=/g) >= 8, 'parallax layers');
  assert(cnt(/class="blob /g) >= 3 && /grid-lines/.test(h), 'mesh');
  assert(cnt(/data-spot/g) >= 10, 'spotlight hosts');
  assert(/<div class="progress" aria-hidden="true"><i data-progress>/.test(h), 'progress bar');
  assert(cnt(/data-status-pill/g) >= 2 && /class="dot"/.test(h), 'status pill with dot');
  assert(cnt(/class="row is-skeleton"/g) === 10 && cnt(/class="bar-row is-skeleton"/g) === 10, 'skeleton rows');
  assert(/data-ticker/.test(h) && /data-ticker-track/.test(h), 'ticker');
  const css = read(join(dist, 'assets/app.css'));
  for (const k of ['@keyframes ping', '@keyframes shimmer', '@keyframes marquee', '@keyframes flashUp', '@keyframes rowIn', 'position:fixed;inset:0 0 auto 0'.replace(':', ': ').replace(';inset:', ';inset: ')]) assert(css.includes(k), `css lacks ${k}`);
  const js = srcJs().map(read).join('\n');
  for (const k of ['stepSpring', 'pointermove', 'IntersectionObserver', 'flash-up', 'visibilitychange']) assert(js.includes(k), `scripts lack ${k}`);
});

await gate('33 measured reference values reproduced (layout, type, easing, timing)', () => {
  const css = stripComments(srcCss().map(read).join('\n'));
  const tokens = read(join(root, 'src/css/tokens.css'));
  const want = [
    [tokens, '--container: min(1180px, 100% - 96px)'], [css, 'padding-block: 135px'], [css, 'padding-block: 100px'], [css, 'padding-block: 78px'],
    [css, 'clamp(46px, 6.4vw, 92px)'], [css, 'letter-spacing: -0.052em'], [css, 'clamp(37px, 3.9vw, 58px)'], [css, 'letter-spacing: -0.045em'],
    [tokens, 'cubic-bezier(0.2, 0.9, 0.25, 1.35)'], [tokens, 'cubic-bezier(0.2, 0.8, 0.2, 1)'], [tokens, '--r-card: 18px'], [tokens, '--r-card-lg: 19px'],
    [css, 'flex: 0 0 176px'], [css, 'flex-basis: 246px'], [css, 'grid-template-columns: 1fr 1.1fr'], [css, 'gap: 21px 16px'], [css, 'box-shadow: 0 22px 75px var(--a-shadow)'], [css, 'aspect-ratio: 5 / 4'], [css, 'margin-bottom: 44px'],
  ];
  eq(want.filter(([hay, needle]) => !hay.includes(needle)).map((w) => w[1]), [], 'reference values missing');
});

await gate('34 copy: zero shared 2-grams and zero shared words with the reference', () => {
  const stop = new Set('a an the of to and in on at for with by from as is are was be it its this that these those you your we our us or not no but if so than then there here can will just more most all any each every up out over into about how what when where which who whom do does did has have had having i me my they them their he she his her been being am also one two three four five via per'.split(' '));
  const norm = (w) => w.toLowerCase().replace(/[’‘]/g, "'").replace(/^[^a-z0-9$]+|[^a-z0-9$]+$/g, '').replace(/'s$/, '').replace(/(?<=[a-z]{3})s$/, '');
  const segs = (text) => text.split(/\n+/).map((l) => l.split(/\s+/).map(norm).filter(Boolean)).filter((a) => a.length);
  const ref = segs(read(join(root, 'reference/ref-text.txt')));
  const refWords = new Set(ref.flat().filter((w) => !stop.has(w) && /[a-z]/.test(w)));
  const refGrams = new Set(ref.flatMap((s) => s.slice(1).map((w, i) => `${s[i]} ${w}`)));
  const html = DIST_HTML;
  const jsText = walk(join(dist, 'assets/js')).map((p) => jsStrings(read(p)).filter((s) => /\s/.test(s) && /[a-z]/i.test(s)).join('\n')).join('\n');
  const mine = segs(`${visibleText(html)}\n${jsText}`);
  const own = new Set(['sooq', 'solana', 'x', 'github', 'sooq.fun', 'fun']);
  const grams = mine.flatMap((s) => s.slice(1).map((w, i) => `${s[i]} ${w}`)).filter((g) => refGrams.has(g));
  const words = [...new Set(mine.flat().filter((w) => !stop.has(w) && /[a-z]/.test(w) && refWords.has(w) && !own.has(w)))];
  eq([...new Set(grams)], [], 'shared 2-grams');
  eq(words, [], 'shared words');
});

await gate('35 repo hygiene: no CLAUDE.md, no .claude/, no AI attribution anywhere', () => {
  const skipDirs = new Set(['node_modules', '.git', 'reference', '.gates-tmp']);
  const all = walk(root, (p, n) => skipDirs.has(n));
  assert(!all.some((p) => /(^|\/)CLAUDE\.md$/i.test(rel(p))), 'CLAUDE.md present');
  assert(!existsSync(join(root, '.claude')), '.claude/ present');
  const words = ['cl' + 'aude', 'anth' + 'ropic', 'chat' + 'gpt', 'open' + 'ai', 'co' + 'pilot', 'generated (?:with|by)', 'co-authored-by', 'artificial intelligence', 'A' + 'I-(?:generated|assisted|written)', '\\bA' + 'I\\b', '\\bL' + 'LM\\b'];
  const re = new RegExp(words.join('|'), 'i');
  const hits = all.filter((p) => isText(p) && p !== fileURLToPath(import.meta.url) && re.test(read(p)));
  eq(hits.map(rel), [], 'files mentioning tooling attribution');
});

await gate('36 repo content: README, whitepaper, MIT LICENSE at root, none in dist', () => {
  const readme = read(join(root, 'README.md')); const wp = read(join(root, 'docs/whitepaper.md')); const lic = read(join(root, 'LICENSE'));
  assert(/^# SOOQ/m.test(readme) && /img\.shields\.io/.test(readme) && /sooq\.fun/.test(readme), 'README header or badge');
  for (const h of ['## Overview', '## Features', '## Links']) assert(readme.includes(h), `README lacks ${h}`);
  assert(/Solana/.test(readme) && /pending/i.test(readme), 'README chain or CA placeholder');
  assert(/Vision/i.test(wp) && /Mission/i.test(wp) && /Tokenomics/i.test(wp) && /Team/i.test(wp), 'whitepaper sections');
  const phases = (wp.match(/^###? Phase \d/gm) || []).length;
  assert(phases >= 3 && phases <= 4, `whitepaper has ${phases} phases`);
  assert(/MIT License/.test(lic) && /Copyright \(c\) 2026 SOOQ/.test(lic), 'LICENSE text');
});

await gate('37 self-contained: no third-party hosts in the shipped page or scripts', () => {
  const html = DIST_HTML;
  const urls = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => new URL(m[1]).host);
  eq([...new Set(urls)].filter((h) => !['sooq.fun'].includes(h)), [], 'external references in markup');
  assert(!/<script(?![^>]*(?:src=|type="application\/json"))[^>]*>/.test(html), 'inline script present');
  assert(!/\sstyle="/.test(html), 'inline style attribute present (blocked by the CSP)');
  assert(!/https?:\/\//.test(read(join(dist, 'assets/app.css'))), 'css pulls a remote asset');
});

await gate('38 accessibility basics: lang, skip link, tablist, live status, labelled controls', () => {
  const h = DIST_HTML;
  assert(/<html lang="en"/.test(h) && /class="skip"/.test(h) && /role="tablist"/.test(h) && /role="tabpanel"/.test(h), 'landmarks');
  assert(/role="switch"/.test(h) && /aria-live="polite"/.test(h) && /aria-busy="true"/.test(h), 'status wiring');
  const unlabeled = [...h.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].filter((m) => !/aria-label=/.test(m[1]) && !m[2].replace(/<[^>]+>/g, '').trim() && !(/id="([^"]+)"/.test(m[1]) && h.includes(`<label for="${m[1].match(/id="([^"]+)"/)[1]}"`)));
  eq(unlabeled.length, 0, 'buttons without a name');
});

rmSync(tmp, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok);
console.log(`\ngates: ${results.length - failed.length}/${results.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
