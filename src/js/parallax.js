import { stepSpring, isSettled, SPRINGS } from './spring.js';
import { addTask } from './loop.js';
import { motionAllowed, onMotionChange } from './motion.js';

const REACH_X = 18;
const REACH_Y = 12;
const SCROLL_PULL = 0.12;

export function initParallax() {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const layers = [...hero.querySelectorAll('[data-depth]')].map((el) => ({ el, depth: parseFloat(el.dataset.depth) || 0 }));
  const sx = { x: 0, v: 0 };
  const sy = { x: 0, v: 0 };
  let tx = 0;
  let ty = 0;
  let scrollY = 0;
  let stop = null;

  function apply() {
    const pull = Math.min(scrollY, window.innerHeight * 1.2) * SCROLL_PULL;
    for (const { el, depth } of layers) {
      el.style.translate = `${(sx.x * REACH_X * depth).toFixed(2)}px ${(sy.x * REACH_Y * depth - pull * depth).toFixed(2)}px`;
    }
  }

  function kick() {
    if (stop || !motionAllowed()) return;
    stop = addTask((dt) => {
      stepSpring(sx, tx, dt, SPRINGS.pointer);
      stepSpring(sy, ty, dt, SPRINGS.pointer);
      apply();
      if (isSettled(sx, tx, 0.001) && isSettled(sy, ty, 0.001)) { stop = null; return false; }
      return true;
    });
  }

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || !motionAllowed()) return;
    tx = (e.clientX / window.innerWidth - 0.5) * 2;
    ty = (e.clientY / window.innerHeight - 0.5) * 2;
    kick();
  }, { passive: true });

  window.addEventListener('scroll', () => {
    if (!motionAllowed()) return;
    scrollY = window.scrollY;
    apply();
  }, { passive: true });

  onMotionChange((calm) => {
    if (calm) { layers.forEach(({ el }) => { el.style.translate = ''; }); tx = ty = 0; sx.x = sy.x = sx.v = sy.v = 0; }
    else { scrollY = window.scrollY; apply(); }
  });
}
