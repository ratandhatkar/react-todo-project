'use strict';
// Page parsers for jeweller/benchmark rate pages. Each returns {'24K':n,'22K':n,...} in INR per gram.
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
// Tanishq: server-rendered gold-rate page exposes <span class="goldpurity-rate" data-goldrate24kt="14515" data-goldrate22kt="13305" data-goldrate18kt="10886">.
function parseTanishq(text) {
  const out = {};
  for (const m of text.matchAll(/data-goldrate(\d{1,2})kt\s*=\s*["']([\d,.]+)["']/gi)) out[m[1] + 'K'] = num(m[2]);
  if (!out['22K']) { // fallback: first "1 G" row of the "22 Kt Gold Rate" table
    const m = text.match(/22\s*Kt Gold Rate[\s\S]{0,600}?<td>\s*1\s*G\s*<\/td>\s*<td>\s*<span>\s*₹\s*([\d,]+)/i);
    if (m) out['22K'] = num(m[1]);
  }
  return out;
}
// Malabar: server-rendered <h3>13255.00 INR/gms</h3><p>22k (916)</p> ... <p>Last updated:2026-11-09,10:09:56</p> (no 18K shown).
function parseMalabar(text) {
  const out = {};
  for (const m of text.matchAll(/([\d,]+(?:\.\d+)?)\s*INR\s*\/\s*gms?\s*<\/h3>\s*<p[^>]*>\s*(\d{1,2})\s*k/gi)) out[m[2] + 'K'] = num(m[1]);
  return out;
}
function updatedMalabar(text) { // site time is IST
  const m = text.match(/Last updated:\s*(\d{4}-\d{2}-\d{2}),\s*(\d{2}:\d{2}:\d{2})/i);
  return m ? new Date(`${m[1]}T${m[2]}+05:30`).toISOString() : null;
}
module.exports = { parseGoodreturns, parseGeneric, parseTanishq, parseMalabar, updatedMalabar };
