import { readFileSync } from 'node:fs';

export const STATES = ['stated', 'absent', 'unconfirmed'];
export const IDS = ['chain', 'ca', 'x', 'github', 'market-source'];
const VALUE_KEYS = ['value', 'url', 'rpc', 'pairs'];
export const DATE_KEYS = ['checked', 'asOf'];

export const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function loadRegister(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function find(reg, id) {
  return reg.records.find((r) => r.id === id);
}

export function isStated(rec) {
  return !!rec && rec.state === 'stated';
}

export function setState(reg, id, patch) {
  const rec = find(reg, id);
  if (!rec) throw new Error(`no record ${id}`);
  for (const k of VALUE_KEYS) delete rec[k];
  Object.assign(rec, patch);
  return reg;
}

export function validateRegister(reg) {
  const errors = [];
  if (!reg || !Array.isArray(reg.records)) return ['register has no records array'];
  const seen = new Set();
  for (const r of reg.records) {
    if (!r.id) errors.push('record without id');
    if (seen.has(r.id)) errors.push(`duplicate record ${r.id}`);
    seen.add(r.id);
    if (!STATES.includes(r.state)) errors.push(`${r.id}: bad state ${r.state}`);
    if (!r.label) errors.push(`${r.id}: no label`);
    if (r.state !== 'stated') {
      for (const k of VALUE_KEYS) {
        if (k in r) errors.push(`${r.id}: ${r.state} record carries ${k}`);
      }
    }
  }
  for (const id of IDS) if (!seen.has(id)) errors.push(`missing record ${id}`);

  const ca = find(reg, 'ca');
  if (isStated(ca) && !BASE58.test(ca.value || '')) errors.push('ca: stated value is not a base58 address');
  const x = find(reg, 'x');
  if (isStated(x) && !/^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/?$/.test(x.url || '')) errors.push('x: url must be https://x.com/<handle>');
  const gh = find(reg, 'github');
  if (isStated(gh) && !/^https:\/\/github\.com\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)?\/?$/.test(gh.url || '')) errors.push('github: url must be https://github.com/<owner>[/<repo>]');
  const ms = find(reg, 'market-source');
  if (isStated(ms)) {
    if (!/^https:\/\//.test(ms.url || '')) errors.push('market-source: url must be https');
    if (!(ms.pairs || '').includes('{addresses}')) errors.push('market-source: pairs template needs {addresses}');
  }
  const chain = find(reg, 'chain');
  if (isStated(chain) && !/^https:\/\//.test(chain.rpc || '')) errors.push('chain: rpc must be https');
  return errors;
}

export function deriveHandle(rec) {
  if (!isStated(rec) || !rec.url) return null;
  const u = new URL(rec.url);
  const parts = u.pathname.split('/').filter(Boolean);
  if (rec.id === 'x') return parts[0] ? `@${parts[0]}` : null;
  if (rec.id === 'github') return parts.length ? parts.join('/') : null;
  return null;
}

/** What ships to the browser: no dates, nothing from inert records. */
export function publicRegister(reg) {
  const ms = find(reg, 'market-source');
  return {
    feed: isStated(ms) ? { url: ms.url, pairs: ms.pairs } : null,
  };
}

export function stripDates(reg) {
  const copy = JSON.parse(JSON.stringify(reg));
  for (const r of copy.records) for (const k of DATE_KEYS) delete r[k];
  return copy;
}
