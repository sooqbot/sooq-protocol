import { motionAllowed } from './motion.js';

/** Scroll progress bar. Position-driven, so it never animates on its own. */
export function initProgress() {
  const bar = document.querySelector('[data-progress]');
  if (!bar) return;
  let queued = false;
  const paint = () => {
    queued = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    bar.style.setProperty('--prog', p.toFixed(4));
  };
  window.addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(paint); } }, { passive: true });
  window.addEventListener('resize', paint, { passive: true });
  paint();
}

/** Spotlight follows the pointer over any [data-spot] element, including ones added later. */
export function initSpotlight() {
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || !motionAllowed()) return;
    const host = e.target.closest && e.target.closest('[data-spot]');
    if (!host) return;
    const r = host.getBoundingClientRect();
    host.style.setProperty('--mx', `${(e.clientX - r.left).toFixed(1)}px`);
    host.style.setProperty('--my', `${(e.clientY - r.top).toFixed(1)}px`);
  }, { passive: true });
}
