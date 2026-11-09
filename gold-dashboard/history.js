'use strict';
// Daily history store: data/history.json = [{d:'YYYY-MM-DD', xau, xag, inr, src, retail?}]
//  xau/xag = USD per troy oz, inr = USD/INR.
//  src 'yahoo' = backfilled (COMEX front-month futures GC=F / SI=F closes, a close proxy for spot, small premium + contract rolls)
//  src 'live'  = recorded by this server from live spot; the day's last poll wins, so it ends as the day's close.
const fs = require('fs');
const path = require('path');
const FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'history.json');
const OZ = 31.1034768;
let rows = [];
let dirty = false;

const istDate = (t = Date.now()) => new Date(t + 5.5 * 3600e3).toISOString().slice(0, 10);
function load() { try { rows = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { rows = []; } }
function save() {
  if (!dirty || process.env.MOCK === '1') return;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(rows)); fs.renameSync(tmp, FILE); dirty = false;
}
function find(d) { return rows.find(r => r.d === d); }
function sortRows() { rows.sort((a, b) => (a.d < b.d ? -1 : 1)); }

function upsertSpot({ xau, xag, inr }) {
  const d = istDate(); let r = find(d);
  if (!r) { r = { d }; rows.push(r); sortRows(); }
  Object.assign(r, { xau: +xau.toFixed(2), xag: +xag.toFixed(3), inr: +inr.toFixed(4), src: 'live' }); dirty = true;
}
function upsertRetail(list) {
  const r = find(istDate()); if (!r) return;
  r.retail = r.retail || {};
  for (const x of list) if (x.rates && x.rates['24K'] && (x.status === 'live' || x.status === 'manual'))
    r.retail[x.id] = { ...x.rates, status: x.status };
  dirty = true;
}

// ---- Yahoo backfill ----
async function yahoo(get, sym, range) {
  const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d`, true);
  const res = j.chart && j.chart.result && j.chart.result[0];
  if (!res) throw new Error(`${sym}: empty response`);
  const out = new Map(), ts = res.timestamp || [], cl = res.indicators.quote[0].close || [];
  ts.forEach((t, i) => { if (cl[i] != null) out.set(new Date(t * 1000).toISOString().slice(0, 10), cl[i]); });
  return out;
}
async function backfill(get, range) {
  const [au, ag, fx] = await Promise.all([yahoo(get, 'GC=F', range), yahoo(get, 'SI=F', range), yahoo(get, 'INR=X', range)]);
  const dates = [...new Set([...au.keys(), ...ag.keys()])].sort();
  let lastAg = null, lastFx = null, added = 0;
  const fxDates = [...fx.keys()].sort(); let fi = 0;
  for (const d of dates) {
    while (fi < fxDates.length && fxDates[fi] <= d) lastFx = fx.get(fxDates[fi++]);
    if (ag.has(d)) lastAg = ag.get(d);
    if (!au.has(d) || lastAg == null || lastFx == null) continue;
    const ex = find(d); if (ex && ex.src === 'live') continue; // never overwrite our own recorded data
    if (ex) Object.assign(ex, { xau: +au.get(d).toFixed(2), xag: +lastAg.toFixed(3), inr: +lastFx.toFixed(4), src: 'yahoo' });
    else { rows.push({ d, xau: +au.get(d).toFixed(2), xag: +lastAg.toFixed(3), inr: +lastFx.toFixed(4), src: 'yahoo' }); added++; }
  }
  sortRows(); dirty = true; save();
  return added;
}
// Decide what to fetch: full 5y if store is thin, otherwise just fill the gap since the last row.
async function ensure(get, log = console.log) {
  load();
  const last = rows.length ? rows[rows.length - 1].d : null;
  const gapDays = last ? Math.floor((Date.parse(istDate()) - Date.parse(last)) / 864e5) : Infinity;
  if (rows.length >= 1000 && gapDays <= 1) return;
  const range = rows.length < 1000 ? '5y' : gapDays > 25 ? '5y' : gapDays > 5 ? '1mo' : '5d';
  const n = await backfill(get, range);
  log(`history: backfilled ${n} day(s) (range ${range}); ${rows.length} rows total`);
}

function query(range) {
  const days = { '1m': 31, '3m': 92, '6m': 183, '1y': 366, '5y': 1830 }[range];
  const from = days ? istDate(Date.now() - days * 864e5) : '0000';
  return rows.filter(r => r.d >= from);
}
function synthetic() { // MOCK only: in-memory 5y random walk
  rows = []; let g = 1750, s = 23, fx = 74; const t0 = Date.now() - 1826 * 864e5; let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  for (let i = 0; i < 1826; i++) {
    g *= 1 + rnd() * 0.012 + 0.0004; s *= 1 + rnd() * 0.02 + 0.0003; fx *= 1 + rnd() * 0.002 + 0.0002;
    const dt = new Date(t0 + i * 864e5); if ([0, 6].includes(dt.getUTCDay())) continue;
    rows.push({ d: dt.toISOString().slice(0, 10), xau: +g.toFixed(2), xag: +s.toFixed(3), inr: +fx.toFixed(4), src: 'mock' });
  }
}
module.exports = { ensure, upsertSpot, upsertRetail, save, query, synthetic, istDate, load, OZ };
