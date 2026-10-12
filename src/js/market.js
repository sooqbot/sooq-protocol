// Board logic. No DOM here, so it can be exercised from node.
export const MAX_ROWS = 10;
export const CHUNK = 30;
export const POLL_MS = 60000;
export const BACKOFF_BASE_MS = 2000;
export const BACKOFF_CAP_MS = 60000;
export const REQUEST_TIMEOUT_MS = 12000;

const num = (v) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

export function pickSolana(boosts) {
  const seen = new Set();
  const out = [];
  if (!Array.isArray(boosts)) return out;
  for (const b of boosts) {
    if (b && b.chainId === 'solana' && typeof b.tokenAddress === 'string' && b.tokenAddress && !seen.has(b.tokenAddress)) {
      seen.add(b.tokenAddress);
      out.push(b.tokenAddress);
    }
  }
  return out;
}

export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** One entry per wanted address, using its deepest pool; ranked by 24h traffic; first ten. */
export function buildStalls(pairs, wanted) {
  const want = new Set(wanted);
  const best = new Map();
  for (const p of Array.isArray(pairs) ? pairs : []) {
    if (!p || p.chainId !== 'solana') continue;
    const address = p.baseToken && p.baseToken.address;
    if (!want.has(address)) continue;
    const depth = num(p.liquidity && p.liquidity.usd);
    const prev = best.get(address);
    if (!prev || (depth ?? -1) > (prev.depth ?? -1)) {
      best.set(address, {
        address,
        name: String((p.baseToken && p.baseToken.name) || ''),
        symbol: String((p.baseToken && p.baseToken.symbol) || ''),
        logo: typeof (p.info && p.info.imageUrl) === 'string' ? p.info.imageUrl : '',
        price: num(p.priceUsd),
        move: num(p.priceChange && p.priceChange.h24),
        traded: num(p.volume && p.volume.h24),
        depth,
      });
    }
  }
  return [...best.values()]
    .filter((s) => s.traded !== null)
    .sort((a, b) => b.traded - a.traded)
    .slice(0, MAX_ROWS);
}

export const LENS = {
  traded: (s) => s.traded,
  depth: (s) => s.depth,
  move: (s) => (s.move === null ? null : Math.abs(s.move)),
  churn: (s) => (s.depth && s.traded !== null ? s.traded / s.depth : null),
};

export function sortBy(stalls, key) {
  const f = LENS[key] || LENS.traded;
  return [...stalls].sort((a, b) => (f(b) ?? -Infinity) - (f(a) ?? -Infinity));
}

export function summarize(stalls) {
  const sum = (k) => stalls.reduce((t, s) => t + (s[k] || 0), 0);
  let top = null;
  for (const s of stalls) if (s.move !== null && (top === null || Math.abs(s.move) > Math.abs(top.move))) top = s;
  return { count: stalls.length, traded: sum('traded'), depth: sum('depth'), mover: top };
}

export function backoffDelay(attempt, rng = Math.random) {
  const raw = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt);
  return Math.round(raw * (0.85 + 0.15 * rng()));
}

async function getJson(url, outer, fetchImpl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const relay = () => ctrl.abort();
  if (outer) outer.addEventListener('abort', relay, { once: true });
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`feed answered ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    if (outer) outer.removeEventListener('abort', relay);
  }
}

/** Follows the market-source record and nothing else. */
export async function loadBoard(feed, signal, fetchImpl = fetch) {
  if (!feed || !feed.url || !feed.pairs) throw new Error('feed record not stated');
  const boosts = await getJson(feed.url, signal, fetchImpl);
  const addresses = pickSolana(boosts);
  if (!addresses.length) throw new Error('no Solana stalls in the boosted list');
  const batches = await Promise.all(
    chunk(addresses, CHUNK).map((c) => getJson(feed.pairs.replace('{addresses}', c.map(encodeURIComponent).join(',')), signal, fetchImpl)),
  );
  const stalls = buildStalls(batches.flat(), addresses);
  if (!stalls.length) throw new Error('no pools found for the boosted list');
  return stalls;
}

/** Polls on a steady beat, backs off on failure, sleeps while the tab is hidden. */
export function createPoller({ load, onResult, onError, interval = POLL_MS, doc = document, setT = setTimeout, clearT = clearTimeout, rng = Math.random }) {
  let timer = null;
  let attempt = 0;
  let ctrl = null;
  let live = false;

  const schedule = (ms) => {
    clearT(timer);
    timer = setT(() => { timer = null; run(); }, ms);
  };

  async function run() {
    if (!live || doc.hidden) return;
    const mine = new AbortController();
    ctrl = mine;
    try {
      const data = await load(mine.signal);
      if (mine.signal.aborted) return;
      attempt = 0;
      onResult(data);
      schedule(interval);
    } catch (err) {
      if (mine.signal.aborted) return;
      onError(err, attempt);
      schedule(backoffDelay(attempt++, rng));
    }
  }

  function onVisibility() {
    if (doc.hidden) {
      clearT(timer);
      timer = null;
      if (ctrl) ctrl.abort();
    } else if (live) {
      clearT(timer);
      run();
    }
  }

  return {
    start() {
      if (live) return;
      live = true;
      doc.addEventListener('visibilitychange', onVisibility);
      run();
    },
    stop() {
      live = false;
      doc.removeEventListener('visibilitychange', onVisibility);
      clearT(timer);
      if (ctrl) ctrl.abort();
    },
  };
}
