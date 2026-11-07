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

## Data honesty
Jeweller sites have no public API and many render rates with JavaScript or block bots. Each seller shows one badge:
`live` (parsed from the site) · `manual` (from `manual-rates.json`) · `stale` (last good value, feed now failing) · `no feed` (nothing available). No numbers are invented.
To fill gaps, edit `manual-rates.json` (reloaded each poll; PNG is pre-filled from the app screenshot dated 7 Nov 2026). To fix a feed, change its URL with `FEED_TANISHQ=<url>` etc. or edit the `FEEDS` list / parser in `server.js`.

Env: `PORT`, `SPOT_INTERVAL_MS`, `RETAIL_INTERVAL_MS`, `IMPORT_DUTY`.
