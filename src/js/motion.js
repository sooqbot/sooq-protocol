// Single switch for every animation: the OS preference or the calm toggle.
const root = document.documentElement;
const query = window.matchMedia('(prefers-reduced-motion: reduce)');
let calm = root.getAttribute('data-calm') === 'on' || query.matches;
const listeners = new Set();

root.setAttribute('data-calm', calm ? 'on' : 'off');

export const motionAllowed = () => !calm;
export const isCalm = () => calm;

export function setCalm(on) {
  calm = !!on;
  root.setAttribute('data-calm', calm ? 'on' : 'off');
  listeners.forEach((fn) => fn(calm));
}

export function onMotionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

query.addEventListener('change', (e) => {
  if (e.matches) setCalm(true);
});
