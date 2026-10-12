const DASH = '—';
const compact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

export function fmtPrice(n) {
  if (!isNum(n)) return DASH;
  if (n >= 1000) return whole.format(n);
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  if (n <= 0) return '$0';
  const decimals = Math.min(12, Math.ceil(-Math.log10(n)) + 3);
  return `$${n.toFixed(decimals)}`;
}

export function fmtMoney(n) {
  if (!isNum(n)) return DASH;
  return Math.abs(n) >= 1000 ? compact.format(n) : whole.format(n);
}

export function fmtMove(n) {
  if (!isNum(n)) return DASH;
  const body = `${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  if (n > 0) return `▲ ${body}`;
  if (n < 0) return `▼ ${body}`;
  return `■ ${body}`;
}

export const moveClass = (n) => (!isNum(n) || n === 0 ? 'flat' : n > 0 ? 'up' : 'down');

export function fmtRatio(n) {
  if (!isNum(n)) return DASH;
  return `${n.toFixed(n >= 10 ? 1 : 2)}×`;
}

export function fmtInt(n) {
  return isNum(n) ? Math.round(n).toLocaleString('en-US') : DASH;
}

export function letterOf(token) {
  const src = `${token?.symbol || ''}${token?.name || ''}`;
  const m = src.match(/[\p{L}\p{N}]/u);
  return m ? m[0].toUpperCase() : '?';
}

export function toneOf(key) {
  let h = 0;
  for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 6;
}
