import { find, isStated, deriveHandle, publicRegister } from './register.mjs';

export const X_PATH = 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z';
export const GH_PATH = 'M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656';

const ICONS = {
  x: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="${X_PATH}"/></svg>`,
  github: `<svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true" focusable="false"><path fill="currentColor" d="${GH_PATH}"/></svg>`,
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function socialHtml(reg) {
  return ['x', 'github'].map((id) => {
    const rec = find(reg, id);
    if (isStated(rec)) {
      const handle = deriveHandle(rec);
      const name = `${rec.label} ${handle}`;
      return `          <a class="social-link" data-social="${id}" href="${esc(rec.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(name)}" title="${esc(name)}">${ICONS[id]}</a>`;
    }
    const name = `${rec.label} — pending`;
    return `          <span class="social-link is-inert" data-social="${id}" role="img" aria-label="${esc(name)}" title="${esc(name)}">${ICONS[id]}</span>`;
  }).join('\n');
}

export function caHtml(reg) {
  const rec = find(reg, 'ca');
  if (isStated(rec)) {
    return `        <div class="ca" data-ca="stated" data-spot>
          <span class="ca-label">${esc(rec.label)}</span>
          <button type="button" class="ca-copy" data-copy="${esc(rec.value)}" aria-label="Clip the ${esc(rec.label.toLowerCase())}"><code class="ca-value">${esc(rec.value)}</code><span class="ca-action"><svg width="20" height="20" aria-hidden="true"><use href="#i-copy"/></svg><span data-copy-label>Clip</span></span></button>
        </div>`;
  }
  return `        <div class="ca is-inert" data-ca="absent">
          <span class="ca-label">${esc(rec.label)}</span>
          <span class="ca-pending" title="${esc(rec.label)} — pending">pending</span>
        </div>`;
}

export function heroActionsHtml(reg) {
  const rec = find(reg, 'ca');
  const primary = `          <a class="btn btn-primary" href="#ledger"><span>Walk the floor</span><svg width="18" height="18" aria-hidden="true"><use href="#i-arrow"/></svg></a>`;
  const second = isStated(rec)
    ? `          <button type="button" class="btn btn-ghost" data-copy="${esc(rec.value)}"><svg width="18" height="18" aria-hidden="true"><use href="#i-copy"/></svg><span data-copy-label>Clip the mint</span></button>`
    : `          <button type="button" class="btn btn-ghost is-inert" disabled aria-disabled="true" title="${esc(rec.label)} — pending"><span>${esc(rec.label)} · pending</span></button>`;
  return `${primary}\n${second}`;
}

export function recordFieldsHtml(reg) {
  return reg.records.map((rec) => {
    let chip;
    if (isStated(rec) && (rec.id === 'x' || rec.id === 'github')) {
      const handle = deriveHandle(rec);
      chip = `<a class="field-chip is-stated" href="${esc(rec.url)}" target="_blank" rel="noopener noreferrer">${esc(handle)}</a>`;
    } else if (isStated(rec)) {
      chip = `<span class="field-chip is-stated">${rec.id === 'chain' ? esc(rec.value) : 'stated'}</span>`;
    } else {
      chip = `<span class="field-chip is-inert">pending</span>`;
    }
    return `            <div class="form-field" data-record="${esc(rec.id)}" data-state="${esc(rec.state)}"><span class="field-label">${esc(rec.label)}</span>${chip}</div>`;
  }).join('\n');
}

export function skeletonRows(n = 10) {
  const row = `<div class="row is-skeleton" role="row" aria-hidden="true"><span class="cell c-rank"><i class="sk sk-xs"></i></span><span class="cell c-stall"><i class="sk sk-logo"></i><span class="tname"><i class="sk sk-l"></i><i class="sk sk-s"></i></span></span><span class="cell c-quote"><i class="sk sk-m"></i></span><span class="cell c-move"><i class="sk sk-m"></i></span><span class="cell c-traded"><i class="sk sk-m"></i></span><span class="cell c-depth"><i class="sk sk-m"></i></span><span class="cell c-act"><i class="sk sk-btn"></i></span></div>`;
  return Array.from({ length: n }, () => row).join('\n            ');
}

export function barSkeletons(n = 10) {
  const row = `<div class="bar-row is-skeleton" aria-hidden="true"><i class="sk sk-s"></i><div class="bar-track"><i class="sk"></i></div><i class="sk sk-m"></i></div>`;
  return Array.from({ length: n }, () => row).join('\n            ');
}

export function rpcHost(reg) {
  const c = find(reg, 'chain');
  return isStated(c) ? new URL(c.rpc).host : 'pending';
}

export function registerJson(reg) {
  return JSON.stringify(publicRegister(reg)).replace(/</g, '\\u003c');
}
