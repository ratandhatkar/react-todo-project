// Run: node test/parsers.test.js   (fixtures are the markup captured from the live sites on 2026-11-09)
const assert = require('assert');
const { parseTanishq, parseMalabar, updatedMalabar } = require('../parsers');

const malabar = '<div class="sc-guWVcn kobkGZ"><h2 class="sc-hSjcQI iJgOaU">Malabar Gold Rate</h2><div class="sc-jTzXrq jYxSbk"><h3 class="sc-jnlrJd kxJmCg">13255.00 INR/gms</h3><p class="sc-gPZzfO dPLZmA">22k (916)</p></div><div class="sc-jTzXrq jYxSbk"><h3 class="sc-jnlrJd kxJmCg">14460.00 INR/gms</h3><p class="sc-gPZzfO dPLZmA">24k (999)</p></div><p class="sc-gLLmNS bfQdMv">Last updated:2026-11-09,10:09:56</p></div>';
assert.deepStrictEqual(parseMalabar(malabar), { '22K': 13255, '24K': 14460 });
assert.strictEqual(updatedMalabar(malabar), '2026-11-09T04:39:56.000Z'); // 10:09:56 IST
assert.deepStrictEqual(parseMalabar('<html>blocked</html>'), {});

const tanishq = '<span class="goldpurity-rate" data-goldrate22kt="13305" data-goldrate24kt="14515" data-goldrate18kt="10886"></span>';
assert.deepStrictEqual(parseTanishq(tanishq), { '22K': 13305, '24K': 14515, '18K': 10886 });
const tableOnly = '<h3>22 Kt Gold Rate</h3><table class="table goldrate-table fixedhgt"><thead><tr><th>Grammage</th></tr></thead><tbody><tr><td>1 G</td><td><span>₹ 13305</span><div>';
assert.deepStrictEqual(parseTanishq(tableOnly), { '22K': 13305 });
assert.deepStrictEqual(parseTanishq('<html>Access Denied</html>'), {});
console.log('parsers ok');
