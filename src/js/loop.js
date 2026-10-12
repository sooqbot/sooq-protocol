// One shared frame loop. A task returns false when it is done.
const tasks = new Set();
let raf = 0;
let last = 0;

function tick(now) {
  raf = 0;
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  for (const fn of [...tasks]) {
    if (fn(dt) === false) tasks.delete(fn);
  }
  if (tasks.size) raf = requestAnimationFrame(tick);
}

export function addTask(fn) {
  tasks.add(fn);
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  return () => tasks.delete(fn);
}
