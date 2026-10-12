import { setCalm, isCalm, onMotionChange } from './motion.js';

const LENSES = {
  traded: ['Where the crowd is.', 'Dollars changing hands in the past day. The widest bar wins the day.'],
  depth: ['Room to move.', 'Money parked in each stall’s deepest pool. Thick pools swallow big orders without lurching.'],
  move: ['Who is sprinting.', 'How big the day’s swing ran, up or down. Direction stays in the ledger above.'],
  churn: ['How hard it spins.', 'Traffic divided by depth. A high number means the pool is being worked overtime.'],
};

const STAGES = {
  all: 'Each refresh starts at the top, walks the four stages in order, and hands the finished board to all corners at once.',
  boosts: 'Pulls the list of promoted stalls. Promotion marks who is loud, never who is sound.',
  filter: 'Drops every row that is not on Solana, along with any mint seen twice.',
  pools: 'Requests live pools for thirty stalls per call, then holds on to each stall’s deepest one.',
  rank: 'Sorts what is left by the day’s traffic and shows the first ten.',
};

export function initTabs(ledger) {
  const root = document.querySelector('[data-tabs]');
  if (!root) return;
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const panel = root.querySelector('[role="tabpanel"]');
  const tag = root.querySelector('[data-lens-tagline]');
  const desc = root.querySelector('[data-lens-desc]');

  function select(tab, focus) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    const key = tab.dataset.lens;
    panel.setAttribute('aria-labelledby', tab.id);
    tag.textContent = LENSES[key][0];
    desc.textContent = LENSES[key][1];
    ledger.setLens(key);
    if (focus) tab.focus();
  }

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t, false));
    t.addEventListener('keydown', (e) => {
      const map = { ArrowRight: 1, ArrowLeft: -1 };
      if (e.key in map) { e.preventDefault(); select(tabs[(i + map[e.key] + tabs.length) % tabs.length], true); }
      if (e.key === 'Home') { e.preventDefault(); select(tabs[0], true); }
      if (e.key === 'End') { e.preventDefault(); select(tabs[tabs.length - 1], true); }
    });
  });
}

export function initSort(ledger) {
  const chips = [...document.querySelectorAll('[data-sort]')];
  chips.forEach((c) => c.addEventListener('click', () => {
    chips.forEach((o) => { const on = o === c; o.classList.toggle('is-on', on); o.setAttribute('aria-pressed', String(on)); });
    ledger.setSort(c.dataset.sort);
  }));
}

export function initStages() {
  const net = document.querySelector('.team-network');
  const desc = document.querySelector('[data-pick-desc]');
  const picks = [...document.querySelectorAll('[data-pick]')];
  if (!net || !desc) return;
  net.dataset.pick = 'all';
  picks.forEach((b) => b.addEventListener('click', () => {
    const key = b.dataset.pick;
    picks.forEach((o) => { const on = o === b; o.classList.toggle('is-on', on); o.setAttribute('aria-pressed', String(on)); });
    net.dataset.pick = key;
    desc.textContent = STAGES[key];
  }));
}

export function initCalm() {
  const sw = document.querySelector('[data-calm-switch]');
  if (!sw) return;
  const sync = () => sw.setAttribute('aria-checked', String(isCalm()));
  sync();
  sw.addEventListener('click', () => setCalm(!isCalm()));
  onMotionChange(sync);
}
