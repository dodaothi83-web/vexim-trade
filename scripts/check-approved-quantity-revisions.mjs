// node scripts/check-approved-quantity-revisions.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const ids = Array.from({ length: 101 }, (_, i) => `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`);
let calls = [], mode = 'ok';
const db = { from(table) {
  let columns = '', filter = '';
  const chain = {
    select(value) { columns = value; return chain; },
    eq(key, value) { assert.equal(key, 'status'); filter = value; return chain; },
    async in(key, batch) {
      assert.equal(key, 'product_id');
      calls.push({ table, columns, filter, batch });
      if (mode === 'error') return { data: null, error: { message: 'missing migration' } };
      const data = batch.map((id) => table.includes('price')
        ? { product_id: id, status: mode === 'pending' ? 'pending' : 'approved', grade: 'W320', incoterm: 'FOB', tiers: [], confirmed_at: '2026-10-01' }
        : { product_id: id, status: 'approved', english_name: 'Cashew kernels' });
      if (mode === 'duplicate' && table.includes('price')) data.push(data[0]);
      return { data, error: null };
    },
  };
  return chain;
} };
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/products/approved-quantity-revisions.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports, require: (key) => { if (key === 'server-only') return {}; if (key === '@/lib/db/supabase') return { getSupabaseClient: () => db }; throw Error(key); } });
assert.equal((await exports.readApprovedQuantityRevisions([])).size, 0);
const records = await exports.readApprovedQuantityRevisions([...ids, ids[0]]);
assert.equal(records.size, 101);
assert.equal(records.get(ids[0]).name.english_name, 'Cashew kernels');
assert.equal(calls.length, 6);
assert.ok(calls.every((call) => call.filter === 'approved' && call.batch.length <= 50));
assert.ok(calls.every((call) => !call.columns.includes('warnings') && !call.columns.includes('source_name')));
await assert.rejects(exports.readApprovedQuantityRevisions(['bad-id']), /Invalid/);
mode = 'pending'; await assert.rejects(exports.readApprovedQuantityRevisions([ids[0]]), /Unexpected/);
mode = 'duplicate'; await assert.rejects(exports.readApprovedQuantityRevisions([ids[0]]), /Unexpected/);
mode = 'error'; await assert.rejects(exports.readApprovedQuantityRevisions([ids[0]]), /unavailable/);
console.log('Approved revision reader: batching, whitelist, fail-closed and approved-only passed');
