'use strict';
// Zero-dependency live gold/silver dashboard server (Node >= 18).
// Run:  node server.js        (MOCK=1 node server.js for synthetic data)
const http = require('http');
const fs = require('fs');
const path = require('path');
const H = require('./history');

const PORT = Number(process.env.PORT) || 4000;
const MOCK = process.env.MOCK === '1';
const SPOT_MS = Number(process.env.SPOT_INTERVAL_MS) || 15000;
const RETAIL_MS = Number(process.env.RETAIL_INTERVAL_MS) || 300000;
const OZ = 31.1034768;
// India landed-cost parity assumptions (override via env). Duty on gold; GST excluded from parity.
const IMPORT_DUTY = Number(process.env.IMPORT_DUTY ?? 0.06);

const UA = 'Mozilla/5.0 (compatible; GoldDashboard/1.0)';
async function get(url, asJson) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return asJson ? r.json() : r.text();
}

// ---------- state ----------
const state = {
  spot: { gold: null, silver: null, usdinr: null, updatedAt: null, error: null },
  retail: {}, // id -> {id,name,rates:{24K..},updatedAt,source,status,error}
  history: { gold: [], silver: [] }, // [{t, v}] spot, INR/g parity
  serverTime: null,
};
const MAX_HIST = 720;

// ---------- spot (international) ----------
async function fetchSpot() {
  try {
    let gold, silver, usdinr;
    if (MOCK) {
      const t = Date.now() / 1000;
      gold = 4072 + 6 * Math.sin(t / 20) + (Math.random() - 0.5) * 3;
      silver = 48.2 + 0.2 * Math.sin(t / 25) + (Math.random() - 0.5) * 0.1;
      usdinr = 93.9 + 0.02 * Math.sin(t / 60);
    } else {
      const [g, s, fx] = await Promise.all([
        get('https://api.gold-api.com/price/XAU', true),
        get('https://api.gold-api.com/price/XAG', true),
        get('https://open.er-api.com/v6/latest/USD', true).then(j => j.rates.INR),
      ]);
      gold = g.price; silver = s.price; usdinr = fx;
    }
    const prev = state.spot;
    state.spot = {
      gold: { usdOz: gold, prevUsdOz: prev.gold ? prev.gold.usdOz : gold },
      silver: { usdOz: silver, prevUsdOz: prev.silver ? prev.silver.usdOz : silver },
      usdinr, updatedAt: new Date().toISOString(), error: null,
    };
    const now = Date.now();
    H.upsertSpot({ xau: gold, xag: silver, inr: usdinr });
    pushHist('gold', now, (gold / OZ) * usdinr);
    pushHist('silver', now, (silver / OZ) * usdinr);
  } catch (e) {
    state.spot.error = e.message;
  }
}
function pushHist(k, t, v) {
  const h = state.history[k]; h.push({ t, v });
  if (h.length > MAX_HIST) h.shift();
}

// ---------- retail (Indian jewellers / benchmarks) ----------
const num = s => Number(String(s).replace(/[₹,\s]/g, ''));
// Parses Goodreturns' "Gold Rate Today" markdown/html: first row of the per-gram table.
function parseGoodreturns(text) {
  const out = {};
  for (const k of ['24', '22', '18']) {
    const m = text.match(new RegExp(`${k}\\s*karat gold[^₹]*₹\\s*([\\d,]+)`, 'i'));
    if (m) out[k + 'K'] = num(m[1]);
  }
  return out;
}
// Generic "24K Gold ₹14,195" style parser for jeweller pages that expose plain text.
function parseGeneric(text) {
  const out = {};
  const plain = text.replace(/<[^>]+>/g, ' ').replace(/&#8377;|&rupee;/g, '₹');
  for (const k of ['24', '22', '18', '14', '9']) {
    const m = plain.match(new RegExp(`\\b${k}\\s*k(?:t|arat)?\\b[^\\d₹]{0,40}₹?\\s*([\\d,]{4,7})`, 'i'));
    if (m) out[k + 'K'] = num(m[1]);
  }
  return out;
}
// Add/adjust jeweller feeds here. URLs can be overridden with env FEED_<ID>.
// Only goodreturns is verified; the others depend on the jeweller serving rates in static HTML,
// and show "no feed" in the UI if they don't. Use manual-rates.json to fill gaps.
const FEEDS = [
  { id: 'goodreturns', name: 'Goodreturns (India avg)', url: 'https://www.goodreturns.in/gold-rates/', parse: parseGoodreturns },
  { id: 'tanishq', name: 'Tanishq', url: 'https://www.tanishq.co.in/gold-rate.html', parse: parseGeneric },
  { id: 'malabar', name: 'Malabar Gold & Diamonds', url: 'https://www.malabargoldanddiamonds.com/gold-rate-today', parse: parseGeneric },
  { id: 'kalyan', name: 'Kalyan Jewellers', url: 'https://www.kalyanjewellers.net/gold-rate-today.php', parse: parseGeneric },
  { id: 'joyalukkas', name: 'Joyalukkas', url: 'https://www.joyalukkas.in/gold-rate', parse: parseGeneric },
  { id: 'png', name: 'PNG Jewellers', url: 'https://www.pngjewellers.com/todays-rates', parse: parseGeneric },
];

function mockRetail() {
  const g = state.spot.gold ? (state.spot.gold.usdOz / OZ) * state.spot.usdinr : 12600;
  const s = state.spot.silver ? (state.spot.silver.usdOz / OZ) * state.spot.usdinr : 150;
  const mk = (name, prem) => ({ name, rates: {
    '24K': Math.round(g * (1 + IMPORT_DUTY) * prem), '22K': Math.round(g * (1 + IMPORT_DUTY) * prem * 22 / 24),
    '18K': Math.round(g * (1 + IMPORT_DUTY) * prem * 18 / 24), silver: Math.round(s * (1 + 0.06) * prem) } });
  return { goodreturns: mk('Goodreturns (India avg)', 1.0), tanishq: mk('Tanishq', 1.004),
    malabar: mk('Malabar Gold & Diamonds', 0.998), kalyan: mk('Kalyan Jewellers', 1.002),
    joyalukkas: mk('Joyalukkas', 0.999), png: mk('PNG Jewellers', 1.001) };
}

async function fetchRetail() {
  const now = new Date().toISOString();
  if (MOCK) {
    for (const [id, v] of Object.entries(mockRetail()))
      state.retail[id] = { id, name: v.name, rates: v.rates, updatedAt: now, fetchedAt: now, source: 'mock', status: 'mock', error: null };
    H.upsertRetail(Object.values(state.retail).map(r => ({ ...r, status: 'live' })));
    return;
  }
  await Promise.all(FEEDS.map(async f => {
    const prev = state.retail[f.id];
    try {
      const rates = f.parse(await get(process.env['FEED_' + f.id.toUpperCase()] || f.url, false));
      if (!rates['24K'] && !rates['22K']) throw new Error('no rates found in page');
      state.retail[f.id] = { id: f.id, name: f.name, rates, prevRates: prev && prev.rates, updatedAt: now, fetchedAt: now, source: 'live', status: 'live', error: null };
    } catch (e) {
      if (!prev || prev.source === 'live' || prev.status === 'nofeed')
        state.retail[f.id] = { ...(prev && prev.rates ? prev : { id: f.id, name: f.name, rates: {} }), status: prev && prev.rates && prev.rates['24K'] ? 'stale' : 'nofeed', error: e.message };
    }
  }));
  applyManual();
  H.upsertRetail(Object.values(state.retail));
}
// Manual file fills in jewellers whose live feed is unavailable.
function applyManual() {
  let m; try { m = JSON.parse(fs.readFileSync(path.join(__dirname, 'manual-rates.json'), 'utf8')); } catch { return; }
  for (const [id, v] of Object.entries(m)) {
    if (id.startsWith('_') || !v.rates) continue;
    const cur = state.retail[id];
    if (cur && cur.status === 'live') continue;
    state.retail[id] = { id, name: v.name || id, rates: v.rates, prevRates: cur && cur.prevRates, updatedAt: v.updatedAt ? new Date(v.updatedAt).toISOString() : null, source: 'manual', status: 'manual', error: null };
  }
}

// ---------- derived ----------
function snapshot() {
  const { spot } = state;
  let parity = null;
  if (spot.gold && spot.usdinr) {
    const g = (spot.gold.usdOz / OZ) * spot.usdinr, s = (spot.silver.usdOz / OZ) * spot.usdinr;
    const gPrev = (spot.gold.prevUsdOz / OZ) * spot.usdinr;
    parity = { gold24Raw: g, gold24Landed: g * (1 + IMPORT_DUTY), silverRaw: s, gold24Prev: gPrev, importDuty: IMPORT_DUTY };
  }
  const retail = Object.values(state.retail).map(r => {
    const out = { ...r };
    if (parity && r.rates && r.rates['24K']) out.premiumPct24 = (r.rates['24K'] / parity.gold24Landed - 1) * 100;
    return out;
  });
  return { serverTime: new Date().toISOString(), mock: MOCK, spot, parity, retail, history: state.history };
}

// ---------- http ----------
const clients = new Set();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/rates') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(snapshot())); }
  if (url === '/api/history') {
    const range = new URL(req.url, 'http://x').searchParams.get('range') || '1y';
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ mock: MOCK, rows: H.query(range) }));
  }
  if (url === '/api/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
    clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  const file = path.join(__dirname, 'public', url === '/' ? 'index.html' : path.normalize(url).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(buf);
  });
}).listen(PORT, () => console.log(`Gold dashboard on http://localhost:${PORT}${MOCK ? ' (MOCK data)' : ''}`));

function broadcast() { const d = `data: ${JSON.stringify(snapshot())}\n\n`; for (const c of clients) c.write(d); }
async function syncHistory() {
  try { if (MOCK) H.synthetic(); else await H.ensure(get); } catch (e) { console.error('history sync failed:', e.message); }
}
setInterval(() => { try { H.save(); } catch (e) { console.error(e.message); } }, 300000);
setInterval(syncHistory, 6 * 3600e3); // fills gaps if the server was off for a while
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { H.save(); } finally { process.exit(0); } });
(async () => {
  H.load(); syncHistory();
  await fetchSpot(); await fetchRetail(); broadcast();
  setInterval(async () => { await fetchSpot(); broadcast(); }, SPOT_MS);
  setInterval(async () => { await fetchRetail(); broadcast(); }, RETAIL_MS);
  setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 25000);
})();
