import './motion.js';
import { initReveal } from './reveal.js';
import { initParallax } from './parallax.js';
import { initProgress, initSpotlight } from './chrome.js';
import { initCopy } from './copy.js';
import { initTabs, initSort, initStages, initCalm } from './ui.js';
import { createLedger } from './ledger.js';
import { createPoller, loadBoard } from './market.js';

function readRegister() {
  try {
    return JSON.parse(document.getElementById('register-data').textContent);
  } catch (e) {
    return { feed: null };
  }
}

initReveal();
document.documentElement.classList.add('ready');
initProgress();
initSpotlight();
initParallax();
initCopy();
initCalm();
initStages();

const ledger = createLedger();
initTabs(ledger);
initSort(ledger);

// The board follows the market-source record and nothing else.
const { feed } = readRegister();
if (!feed) {
  ledger.pending();
} else {
  let hasData = false;
  createPoller({
    load: (signal) => loadBoard(feed, signal),
    onResult: (stalls) => { hasData = true; ledger.update(stalls); },
    onError: () => ledger.fail(hasData),
  }).start();
}
