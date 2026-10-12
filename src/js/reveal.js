import { stepSpring, isSettled, SPRINGS } from './spring.js';
import { addTask } from './loop.js';
import { motionAllowed, onMotionChange } from './motion.js';

const STAGGER_MS = 70;

function finish(el) {
  el.style.setProperty('--p', '1');
  el.removeAttribute('data-reveal');
  el.classList.add('is-in');
}

export function initReveal() {
  const active = new Map();
  let stop = null;

  function pump() {
    if (stop) return;
    stop = addTask((dt) => {
      for (const [el, st] of active) {
        if (st.wait > 0) { st.wait -= dt; continue; }
        stepSpring(st, 1, dt, SPRINGS.reveal);
        if (isSettled(st, 1, 0.002)) { active.delete(el); finish(el); continue; }
        el.style.setProperty('--p', st.x.toFixed(4));
      }
      if (!active.size) { stop = null; return false; }
      return true;
    });
  }

  function delayFor(el) {
    const parent = el.closest('[data-stagger]');
    if (!parent) return 0;
    const siblings = [...parent.children].filter((c) => c.hasAttribute('data-reveal') || c.classList.contains('is-in'));
    const idx = siblings.indexOf(el);
    return idx < 0 ? 0 : idx * STAGGER_MS;
  }

  const targets = [...document.querySelectorAll('[data-reveal]')];
  const delays = new Map(targets.map((el) => [el, delayFor(el)]));

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      io.unobserve(el);
      if (!motionAllowed()) { finish(el); continue; }
      active.set(el, { x: 0, v: 0, wait: (delays.get(el) || 0) / 1000 });
      pump();
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

  targets.forEach((el) => io.observe(el));

  onMotionChange((calm) => {
    if (!calm) return;
    for (const el of active.keys()) finish(el);
    active.clear();
  });
}
