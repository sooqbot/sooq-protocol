let live;

export function announce(text) {
  if (!live) {
    live = document.createElement('div');
    live.className = 'sr-only';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    document.body.appendChild(live);
  }
  live.textContent = '';
  requestAnimationFrame(() => { live.textContent = text; });
}

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* fall through to the legacy path */ }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.className = 'sr-only';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  area.remove();
  return ok;
}

function swapIcon(btn, id) {
  const use = btn.querySelector('use');
  if (use) use.setAttribute('href', `#${id}`);
}

/** Any element with data-copy (static slots) or data-addr (market rows) is click-to-copy. */
export function initCopy() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy], [data-addr]');
    if (!btn || btn.disabled) return;
    const text = btn.getAttribute('data-copy') || btn.getAttribute('data-addr');
    if (!text) return;
    const ok = await copyText(text);
    if (!ok) { announce('Clipboard is blocked here'); return; }
    const label = btn.querySelector('[data-copy-label]');
    const before = label ? label.textContent : '';
    btn.classList.add('is-copied');
    swapIcon(btn, 'i-check');
    if (label) label.textContent = 'Clipped';
    announce('Clipped');
    clearTimeout(btn._t);
    btn._t = setTimeout(() => {
      btn.classList.remove('is-copied');
      swapIcon(btn, 'i-copy');
      if (label) label.textContent = before;
    }, 1600);
  });
}
