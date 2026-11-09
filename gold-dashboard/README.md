# India Gold & Silver Live Dashboard

Zero-dependency Node server (Node >= 18) + single-page UI. Pushes updates to the browser over Server-Sent Events.

```bash
cd gold-dashboard
node server.js            # http://localhost:4000
MOCK=1 node server.js     # synthetic data for UI testing
```

## What it shows
- **Spot**: XAU/XAG in USD/oz (api.gold-api.com) and USD/INR (open.er-api.com), polled every 15s, with tick change and a sparkline.
- **India parity**: spot ÷ 31.1035 × USD/INR × (1 + `IMPORT_DUTY`, default 0.06). Retail will sit above it (making charges, margins, local premium); the "vs parity" column tracks that gap live.
- **Jewellers**: Goodreturns India average (verified parser), plus Tanishq, Malabar, Kalyan, Joyalukkas, PNG, polled every 5 min.

## History (5 years, then daily)
On first start the server backfills ~5 years of daily gold, silver and USD/INR into `data/history.json` (Yahoo Finance: COMEX `GC=F`/`SI=F` daily closes + `INR=X`). From then on it records each day (IST) from live spot, plus every jeweller's rates, so jeweller history builds up from day one (no free source exists for 5 years of Tanishq/PNG/Malabar retail rates).
- The day's last poll becomes that day's close; live data is never overwritten by a backfill.
- If the server was off for a while, it fills the gap on the next start (and re-checks every 6 h).
- The file is written every 5 min and on shutdown. **Keep the server running and `data/` on persistent disk** (e.g. a small VPS/Raspberry Pi with `systemd` or `pm2`; not an ephemeral container). Set `DATA_FILE` to move it.
- Caveats: backfilled gold/silver are futures closes (a slight premium to spot, with contract-roll jumps); the ₹/g history is spot x USD/INR with no duty/GST/making, because India's import duty changed during the period.

## Jeweller feeds
| Seller | Source | Status |
|---|---|---|
| Goodreturns | goodreturns.in/gold-rates | verified live parse |
| Tanishq | tanishq.co.in/gold-rate.html (`data-goldrate24kt/22kt/18kt` attributes) | parser tested on captured markup (9 Nov 2026) |
| Malabar | malabargoldanddiamonds.com/in/pan-india/en/live-gold-rate.html (22K, 24K only; site shows no 18K) | parser tested on captured markup (9 Nov 2026) |

Tanishq and Malabar are server-rendered but sit behind bot protection / geo-restriction: plain fetches from outside India returned empty pages, while a browser session on an Indian IP saw the rates. Run the server from an Indian connection. If a feed still shows `no feed`, hover the badge for the error. Parser tests: `node test/parsers.test.js`.

## Data honesty
Jeweller sites have no public API and many render rates with JavaScript or block bots. Each seller shows one badge:
`live` (parsed from the site) · `manual` (from `manual-rates.json`) · `stale` (last good value, feed now failing) · `no feed` (nothing available). No numbers are invented.
To fill gaps, edit `manual-rates.json` (reloaded each poll; PNG is pre-filled from the app screenshot dated 7 Nov 2026). To fix a feed, change its URL with `FEED_TANISHQ=<url>` etc. or edit the `FEEDS` list / parser in `server.js`.

Env: `PORT`, `DATA_FILE`, `SPOT_INTERVAL_MS`, `RETAIL_INTERVAL_MS`, `IMPORT_DUTY`.
