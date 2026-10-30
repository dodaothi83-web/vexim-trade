// node scripts/check-product-price-schema-compat.mjs
// Mock the PostgREST write boundary: no live project/credentials required.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/db/supabase.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const missing = { code: 'PGRST204', message: "Could not find the 'ref_price_max' column of 'supplier_products' in the schema cache" };
const otherColumn = { code: 'PGRST204', message: "Could not find the 'odm' column of 'supplier_products' in the schema cache" };
const denied = { code: '42501', message: 'permission denied for table supplier_products' };

function storeFor(response) {
  const writes = [];
  function chain(kind, payload) {
    const write = { kind, payload };
    writes.push(write);
    return {
      eq(column, value) { write.where = [column, value]; return this; },
      select() { return this; },
      async single() {
        const error = response(write, writes.length);
        return error ? { data: null, error } : { data: { id: 'product-1', ...payload }, error: null };
      },
    };
  }
  const client = {
    from(table) {
      assert.equal(table, 'supplier_products');
      return { insert: (payload) => chain('insert', payload), update: (payload) => chain('update', payload) };
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (id) => {
      if (id === '@supabase/supabase-js') return { createClient: () => client };
      if (id === '@/lib/public/product-selection') return {};
      throw Error(`Unexpected dependency ${id}`);
    },
    process: { env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-only' } },
    Date, Buffer,
  });
  return { store: exports.supabaseStore, writes };
}

for (const kind of ['create', 'update']) {
  const save = (store, patch) => kind === 'create'
    ? store.createProduct({ supplier_id: 'supplier-1', name: 'Rice', ...patch })
    : store.updateProduct('product-1', patch);

  const legacy = storeFor((write) => 'ref_price_max' in write.payload ? missing : null);
  const saved = await save(legacy.store, { ref_price: 2, ref_price_max: null, price_publicly_visible: false });
  assert.equal(saved.ref_price, 2);
  assert.equal(legacy.writes.length, 2, `${kind}: retry exactly once for a null upper bound`);
  assert.ok(!('ref_price_max' in legacy.writes[1].payload));
  assert.equal(legacy.writes[1].payload.ref_price, 2);
  assert.equal(legacy.writes[1].payload.price_publicly_visible, false, 'Other publication gates are preserved');
  if (kind === 'update') {
    assert.deepEqual(legacy.writes.map((write) => write.where?.join(':')), ['id:product-1', 'id:product-1']);
    assert.equal(legacy.writes[0].payload.updated_at, legacy.writes[1].payload.updated_at);
  }

  const range = storeFor(() => missing);
  await assert.rejects(save(range.store, { ref_price: 2, ref_price_max: 3 }), /Chưa lưu được giá đến\. Báo người phụ trách kỹ thuật/);
  assert.equal(range.writes.length, 1, `${kind}: never discard an entered upper bound`);

  const noCode = storeFor((write) => 'ref_price_max' in write.payload ? { message: missing.message } : null);
  await save(noCode.store, { ref_price_max: null });
  assert.equal(noCode.writes.length, 2, `${kind}: handle the exact reported message without an error code`);

  const migrated = storeFor(() => null);
  await save(migrated.store, { ref_price: 2, ref_price_max: 3 });
  assert.equal(migrated.writes.length, 1);
  assert.equal(migrated.writes[0].payload.ref_price_max, 3, `${kind}: real range stored when supported`);

  for (const error of [otherColumn, denied]) {
    const broken = storeFor(() => error);
    await assert.rejects(save(broken.store, { ref_price_max: null }), new RegExp(error.message));
    assert.equal(broken.writes.length, 1, `${kind}: unrelated errors never get a fallback`);
  }
  const retryFailure = storeFor((write) => 'ref_price_max' in write.payload ? missing : denied);
  await assert.rejects(save(retryFailure.store, { ref_price_max: null }), /permission denied/);
  assert.equal(retryFailure.writes.length, 2, `${kind}: failed retry is surfaced, not suppressed`);

  const noUpperField = storeFor(() => null);
  await save(noUpperField.store, { ref_price: 2 });
  assert.equal(noUpperField.writes.length, 1, `${kind}: unchanged writes don't retry`);
}
console.log('✅ Product price schema compatibility: null-only retry, lossless ranges, unrelated errors surfaced.');
