// Damped harmonic oscillator, fixed sub-steps so large frame gaps stay stable.
export const SPRINGS = {
  reveal: { stiffness: 170, damping: 20, mass: 1 },
  ui: { stiffness: 210, damping: 26, mass: 1 },
  count: { stiffness: 120, damping: 22, mass: 1 },
  pointer: { stiffness: 90, damping: 16, mass: 1 },
};

const STEP = 1 / 240;

export function dampingRatio({ stiffness, damping, mass }) {
  return damping / (2 * Math.sqrt(stiffness * mass));
}

/** Advance state {x, v} toward target by dt seconds. Mutates and returns the state. */
export function stepSpring(state, target, dt, cfg) {
  const { stiffness, damping, mass } = cfg;
  let left = dt;
  while (left > 1e-9) {
    const h = Math.min(STEP, left);
    const a = (-stiffness * (state.x - target) - damping * state.v) / mass;
    state.v += a * h;
    state.x += state.v * h;
    left -= h;
  }
  return state;
}

export function isSettled(state, target, eps = 0.0008) {
  return Math.abs(state.x - target) < eps && Math.abs(state.v) < eps;
}
