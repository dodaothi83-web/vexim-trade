import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const source = readFileSync(new URL('../app/crm/products/quantity-review/page.tsx', import.meta.url), 'utf8');
const start = source.indexOf('    async function pending(');
const end = source.indexOf('    [prices, names, products, suppliers]', start);
const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'];
for (const productId of [...ids, null]) {
  const calls = [];
  const db = { from(table) {
    let selected = ids.map((id) => ({ product_id: id }));
    const query = {
      select() { return query; },
      eq(key, value) { calls.push([table, key, value]); if (key === 'product_id') selected = selected.filter((r) => r.product_id === value); return query; },
      order() { return query; },
      async range() { return { data: selected, error: null }; },
    };
    return query;
  } };
  const pending = vm.runInNewContext(`${code}; pending`, { db, productId });
  for (const table of ['product_quantity_price_revisions', 'product_english_name_revisions']) {
    const rows = await pending(table);
    assert.deepEqual(Array.from(rows, (r) => r.product_id), productId ? [productId] : ids);
  }
  assert.equal(calls.filter((c) => c[1] === 'product_id').length, productId ? 2 : 0);
}
const listing = readFileSync(new URL('../app/crm/products/page.tsx', import.meta.url), 'utf8');
assert.match(listing, /quantity-review\?product_id=\$\{encodeURIComponent\(r.id\)\}/);
assert.match(source, /params.product_id !== undefined/);
console.log('OK: three product-specific price/name queues stay isolated; global queue preserved.');
