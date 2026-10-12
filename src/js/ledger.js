import { sortBy, summarize, LENS } from './market.js';
import { fmtPrice, fmtMoney, fmtMove, fmtRatio, fmtInt, letterOf, toneOf, isNum, moveClass } from './format.js';
import { setNumber } from './countup.js';
import { motionAllowed } from './motion.js';

const STATUS_TEXT = { loading: 'Syncing', live: 'Live', retry: 'Retrying', offline: 'Offline' };
const NOTES = {
  retry: 'The feed missed a beat. The last good board stays up as retries tick on.',
  offline: 'The feed is not answering. Trying again shortly.',
  pending: 'The feed record is pending, so the board stays blank.',
};
const LENS_FMT = { traded: fmtMoney, depth: fmtMoney, move: (n) => `${n.toFixed(2)}%`, churn: fmtRatio };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function node(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function makeLogo(s, size) {
  const wrap = node('span', 'logo');
  const tile = node('span', 'tile', letterOf(s));
  tile.dataset.tone = String(toneOf(s.address));
  wrap.appendChild(tile);
  if (s.logo) {
    const img = document.createElement('img');
    img.alt = '';
    img.width = size;
    img.height = size;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('load', () => img.classList.add('is-loaded'));
    img.addEventListener('error', () => img.remove());
    img.src = s.logo;
    wrap.appendChild(img);
  }
  return wrap;
}

function cell(cls, label) {
  const c = node('span', `cell ${cls}`);
  c.setAttribute('role', 'cell');
  if (label) c.dataset.label = label;
  return c;
}

export function createLedger() {
  const body = $('[data-ledger-body]');
  const table = $('[data-ledger]');
  const bars = $('[data-bars]');
  const trackEl = $('[data-ticker-track]');
  const note = $('[data-feed-note]');
  const rows = new Map();
  const barRows = new Map();
  let stalls = [];
  let sortKey = 'traded';
  let lens = 'traded';
  let painted = false;
  let state = 'loading';

  function setStatus(next) {
    state = next;
    $$('[data-status-pill]').forEach((p) => {
      p.dataset.state = next;
      $('[data-status-text]', p).textContent = STATUS_TEXT[next];
    });
    table.setAttribute('aria-busy', next === 'loading' ? 'true' : 'false');
    if (NOTES[next]) { note.textContent = NOTES[next]; note.hidden = false; } else { note.hidden = true; }
  }

  function dashRows() {
    body.replaceChildren();
    for (let i = 0; i < 10; i += 1) {
      const row = node('div', 'row is-dash');
      row.setAttribute('role', 'row');
      const rank = cell('c-rank'); rank.textContent = String(i + 1);
      const stall = cell('c-stall'); stall.appendChild(node('span', 'tname')).appendChild(node('b', '', '—'));
      row.append(rank, stall);
      [['c-quote', 'Quote'], ['c-move', '24h move'], ['c-traded', 'Traded'], ['c-depth', 'Depth']].forEach(([c, l]) => {
        const x = cell(`${c} num`, l); x.textContent = '—'; row.appendChild(x);
      });
      row.appendChild(cell('c-act'));
      body.appendChild(row);
    }
    rows.clear();
    bars.replaceChildren();
    barRows.clear();
    painted = false;
  }

  function makeRow(s, i) {
    const row = node('div', 'row enter');
    row.setAttribute('role', 'row');
    row.setAttribute('data-spot', '');
    row.style.setProperty('--i', String(i));
    const rank = cell('c-rank'); rank.dataset.k = 'rank';
    const stall = cell('c-stall');
    const nm = node('span', 'tname');
    nm.append(node('b', '', s.name || s.symbol || 'Unnamed'), node('small', '', s.symbol));
    stall.append(makeLogo(s, 36), nm);
    const q = cell('c-quote num', 'Quote'); q.appendChild(node('span')).dataset.k = 'price';
    const m = cell('c-move num', '24h move'); m.appendChild(node('span')).dataset.k = 'move';
    const t = cell('c-traded num', 'Traded'); t.appendChild(node('span')).dataset.k = 'traded';
    const d = cell('c-depth num', 'Depth'); d.appendChild(node('span')).dataset.k = 'depth';
    const act = cell('c-act');
    const btn = node('button', 'icon-btn');
    btn.type = 'button';
    btn.dataset.addr = s.address;
    btn.setAttribute('aria-label', `Clip the mint for ${s.symbol || s.name || 'this stall'}`);
    btn.innerHTML = '<svg width="18" height="18" aria-hidden="true"><use href="#i-copy"/></svg>';
    act.appendChild(btn);
    row.append(rank, stall, q, m, t, d, act);
    return row;
  }

  function fill(row, s, i) {
    $('[data-k="rank"]', row).textContent = String(i + 1);
    setNumber($('[data-k="price"]', row), s.price, fmtPrice);
    setNumber($('[data-k="move"]', row), s.move, fmtMove, { tone: true });
    setNumber($('[data-k="traded"]', row), s.traded, fmtMoney);
    setNumber($('[data-k="depth"]', row), s.depth, fmtMoney);
  }

  function paintRows() {
    const ordered = sortBy(stalls, sortKey);
    if (!painted) { body.replaceChildren(); painted = true; }
    const keep = new Set(ordered.map((s) => s.address));
    for (const [addr, row] of rows) if (!keep.has(addr)) { row.remove(); rows.delete(addr); }
    ordered.forEach((s, i) => {
      let row = rows.get(s.address);
      if (!row) { row = makeRow(s, i); rows.set(s.address, row); }
      fill(row, s, i);
      body.appendChild(row);
    });
  }

  function paintBars() {
    const f = LENS[lens];
    const ordered = sortBy(stalls, lens).filter((s) => isNum(f(s)));
    const max = Math.max(...ordered.map((s) => f(s)), 0) || 1;
    if (!barRows.size) bars.replaceChildren();
    const keep = new Set(ordered.map((s) => s.address));
    for (const [addr, r] of barRows) if (!keep.has(addr)) { r.remove(); barRows.delete(addr); }
    ordered.forEach((s, i) => {
      let r = barRows.get(s.address);
      if (!r) {
        r = node('div', 'bar-row enter');
        r.style.setProperty('--i', String(i));
        const track = node('div', 'bar-track');
        track.appendChild(document.createElement('i'));
        r.append(node('span', 'bar-name'), track, node('span', 'bar-val'));
        barRows.set(s.address, r);
      }
      $('.bar-name', r).textContent = s.symbol || s.name;
      $('.bar-val', r).textContent = LENS_FMT[lens](f(s));
      const w = f(s) / max;
      const fillEl = $('.bar-track i', r);
      if (motionAllowed() && !r._seen) {
        fillEl.style.setProperty('--w', '0');
        requestAnimationFrame(() => requestAnimationFrame(() => fillEl.style.setProperty('--w', String(w))));
      } else {
        fillEl.style.setProperty('--w', String(w));
      }
      r._seen = true;
      bars.appendChild(r);
    });
  }

  let tickerPainted = false;
  function tickItem(s, i, dup) {
    const t = node('span', 'tick');
    t.setAttribute('role', 'listitem');
    const mv = node('span', `tm ${moveClass(s.move)}`, fmtMove(s.move));
    t.append(makeLogo(s, 24), node('b', '', s.symbol || s.name), node('span', 'tq', fmtPrice(s.price)), mv);
    if (dup) { t.classList.add('dup'); t.setAttribute('aria-hidden', 'true'); }
    else if (!tickerPainted) { t.classList.add('enter'); t.style.setProperty('--i', String(i)); }
    return t;
  }

  function paintTicker() {
    const ordered = sortBy(stalls, 'traded');
    const items = ordered.map((s, i) => tickItem(s, i, false));
    const dupes = ordered.map((s, i) => tickItem(s, i, true));
    tickerPainted = true;
    trackEl.replaceChildren(...items, ...dupes);
    trackEl.parentElement.setAttribute('role', 'list');
    trackEl.style.setProperty('--marquee-dur', `${Math.max(24, items.length * 7)}s`);
  }

  function paintStats() {
    const sum = summarize(stalls);
    setNumber($('[data-stat="count"]'), sum.count, fmtInt);
    setNumber($('[data-stat="traded"]'), sum.traded, fmtMoney);
    setNumber($('[data-stat="depth"]'), sum.depth, fmtMoney);
    const mover = $('[data-stat="mover"]');
    if (sum.mover) {
      setNumber(mover, sum.mover.move, fmtMove, { tone: true });
      $('[data-stat="mover-name"]').textContent = sum.mover.symbol || sum.mover.name;
    }
  }

  function showError() {
    $$('[data-stat]').forEach((el) => { if (el.dataset.stat !== 'mover-name') { el.textContent = '—'; el._v = undefined; } });
    $('[data-stat="mover-name"]').textContent = 'No board yet.';
    trackEl.replaceChildren();
    tickerPainted = false;
    dashRows();
    bars.replaceChildren(node('p', 'bars-empty', '—'));
  }

  return {
    setStatus,
    get state() { return state; },
    setSort(key) { sortKey = key; if (stalls.length) paintRows(); },
    setLens(key) { lens = key; if (stalls.length) paintBars(); },
    update(next) {
      stalls = next;
      paintRows();
      paintBars();
      paintTicker();
      paintStats();
      setStatus('live');
    },
    fail(hasData) {
      if (hasData) { setStatus('retry'); return; }
      showError();
      setStatus('offline');
    },
    pending() {
      showError();
      setStatus('offline');
      note.textContent = NOTES.pending;
      note.hidden = false;
    },
  };
}
