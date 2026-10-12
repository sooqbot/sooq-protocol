# SOOQ

A live bazaar for Solana stalls. Ten boosted pairs, ranked by the day's traffic, redrawn while you watch.

[![Live site](https://img.shields.io/badge/live-sooq.fun-111111?style=flat-square)](https://sooq.fun)

| | |
|---|---|
| Chain | Solana |
| Mint (CA) | pending |

## Overview

SOOQ is a single static page. It pulls the public boosted list, keeps the Solana entries, looks up their pools, and shows the ten busiest by 24h volume. Nothing is stored and nothing needs an account.

## Features

- Live ledger: logo, quote, 24h move, traded volume and depth for ten stalls, with one-tap address copy.
- Ticker and summary tiles fed by the same pull.
- Four lenses over the same ten stalls: traffic, room, swing and churn.
- Retries that double from two seconds up to a minute, the last good board kept on screen, polling paused while the tab is hidden.
- Calm mode and full `prefers-reduced-motion` support.
- A single register for every outside fact. Facts nobody has stated stay inert: no value, no link.

## Links

- Site: https://sooq.fun
- X: pending
- GitHub: pending

## Develop

```bash
npm run build   # writes dist/
npm run gates   # builds, then runs every check
npm run serve   # serves dist/ locally
```

Deploy by uploading the contents of `dist/`.

## License

MIT. See [LICENSE](LICENSE).
