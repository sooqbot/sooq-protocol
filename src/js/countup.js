import { stepSpring, isSettled, SPRINGS } from './spring.js';
import { addTask } from './loop.js';
import { motionAllowed } from './motion.js';
import { isNum, moveClass } from './format.js';

function flash(el, dir) {
  const cls = dir === 'up' ? 'flash-up' : 'flash-down';
  el.classList.remove('flash-up', 'flash-down');
  void el.offsetWidth;
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

/** Counts a node toward `to`. First paint counts up from zero; later changes flash. */
export function setNumber(el, to, fmt, { tone = false } = {}) {
  if (el._stop) el._stop();
  if (!isNum(to)) {
    el.textContent = '—';
    el._v = undefined;
    return;
  }
  const first = el._v === undefined;
  const from = first ? 0 : el._v;
  if (tone) el.classList.remove('up', 'down', 'flat');
  if (tone) el.classList.add(moveClass(to));

  if (!motionAllowed() || (!first && from === to)) {
    el._v = to;
    el.textContent = fmt(to);
    return;
  }
  if (!first) flash(el.closest('.cell, .stat') || el, to > from ? 'up' : 'down');

  const s = { x: 0, v: 0 };
  el._stop = addTask((dt) => {
    stepSpring(s, 1, dt, SPRINGS.count);
    const value = from + (to - from) * s.x;
    el._v = value;
    if (isSettled(s, 1, 0.002)) {
      el._v = to;
      el.textContent = fmt(to);
      return false;
    }
    el.textContent = fmt(value);
    return true;
  });
}
