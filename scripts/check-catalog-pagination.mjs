// node --experimental-strip-types --no-warnings scripts/check-catalog-pagination.mjs
// Real Supabase JS query builder against a deterministic mocked PostgREST HTTP endpoint.
// This does not contact a Supabase project, measure network latency or provide a snapshot transaction.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { performance } from 'node:perf_hooks';
import { createClient } from '@supabase/supabase-js';
import { assignProductCategory } from '../lib/public/category-assignment.ts';

const id = (n) => `00000000-0000-0000-0000-${n.toString(16).padStart(12, '0')}`;
const realSelection = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/public/product-selection.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: realSelection, require: (name) => {
  assert.equal(name, '@/lib/public/category-assignment'); return { assignProductCategory };
}, Date });

const suppliers = Array.from({ length: 1237 }, (_, i) => ({ id: id(i + 1), name: `Supplier ${String(1237 - i).padStart(4, '0')}`,
  status: i === 1236 ? 'published' : 'draft', is_demo: false }));
const products = Array.from({ length: 2237 }, (_, i) => ({ id: id(i + 1), supplier_id: suppliers[i < 1500 ? 1236 : i % 1236].id,
  name: `Rice lot ${String(2237 - i).padStart(4, '0')}`, category: 'rice', spec: null, description: null,
  supplier_originated: true, reviewed_category_slug: 'rice', supplier_review_status: 'approved', ready_for_buyer: i === 1499 }));
const categories = [
  { id: id(1), slug: 'pepper', name_i18n: { en: 'Pepper' }, sort_order: 10, is_published: true, status: 'published' },
  { id: id(2), slug: 'rice', name_i18n: { en: 'Rice' }, sort_order: 20, is_published: true, status: 'published' },
];
const media = [];
for (let i = 0; i < 1107; i++) media.push({ id: id(i + 1), product_id: products[0].id, supplier_id: suppliers[1236].id,
  owner_type: 'product', sort_order: i % 7, created_at: `2026-10-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z` });
for (let i = 0; i < 2400; i++) media.push({ id: id(2000 + i), product_id: products[1 + (i % 160)].id, supplier_id: suppliers[i % 150].id,
  owner_type: 'product', sort_order: i % 5, created_at: `2026-09-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z` });
const verifications = Array.from({ length: 1310 }, (_, i) => ({ id: id(i + 1), supplier_id: suppliers[i < 1100 ? 1236 : i % 150].id,
  target_level: 1, status: 'approved', created_at: `2026-10-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z` }));
const certificates = Array.from({ length: 1300 }, (_, i) => ({ id: id(i + 1), supplier_id: suppliers[i < 1100 ? 1236 : i % 150].id,
  created_at: `2026-10-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z` }));
const pushes = Array.from({ length: 1109 }, (_, i) => ({ id: id(i + 1), product_id: products[i].id, supplier_id: suppliers[1236].id,
  surface: 'category', category_slug: 'rice', status: 'approved', starts_at: '2026-10-20T00:00:00Z', ends_at: '2026-10-30T00:00:00Z' }));
const daily = [];
for (const push of pushes.slice(0, 90)) for (let day = 20; day <= 26; day++) for (const event_type of ['click', 'impression']) {
  daily.push({ push_id: push.id, day: `2026-10-${day}`, event_type, events: 1 });
}
const tables = { suppliers, supplier_products: products, categories, media_assets: media, verifications, certificates,
  sponsored_pushes: pushes, sponsored_push_daily: daily };
let serverCap = 137, fail = null, reverse = false, mutate = null;
const calls = [];
const compare = (a, b) => a === b ? 0 : a < b ? -1 : 1;
const fakeFetch = async (input) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const table = url.pathname.split('/').at(-1);
  const params = url.searchParams;
  calls.push({ table, url: url.toString() });
  assert.ok(table in tables, `Unexpected table ${table}`);
  const simulatedError = fail?.(table, params);
  if (simulatedError) {
    const error = typeof simulatedError === 'object' ? simulatedError : { code: 'XX000', message: 'simulated page failure' };
    return new Response(JSON.stringify(error), { status: error.code === '42P01' ? 404 : 500, headers: { 'content-type': 'application/json' } });
  }
  let result = [...tables[table]];
  for (const [key, value] of params) {
    if (['select', 'order', 'limit', 'offset', 'or'].includes(key)) continue;
    if (value.startsWith('in.(')) {
      const values = value.slice(4, -1).split(',').map((v) => v.replace(/^"|"$/g, ''));
      assert.ok(values.length <= 80, `${table}.${key}: IN list is bounded`);
      const set = new Set(values);
      result = result.filter((row) => set.has(String(row[key])));
    } else {
      const dot = value.indexOf('.');
      assert.ok(dot > 0, `Unknown filter: ${key}=${value}`);
      const op = value.slice(0, dot), operand = value.slice(dot + 1);
      result = result.filter((row) => {
        const v = String(row[key]);
        if (op === 'eq') return v === operand;
        if (op === 'gt') return v > operand;
        if (op === 'gte') return v >= operand;
        if (op === 'lte') return v <= operand;
        throw new Error(`Unexpected operator ${op}`);
      });
    }
  }
  const or = params.get('or');
  if (or) {
    const m = /^\(push_id\.gt\.([^,]+),and\(push_id\.eq\.([^,]+),day\.gt\.([^\)]+)\),and\(push_id\.eq\.([^,]+),day\.eq\.([^,]+),event_type\.gt\.([^\)]+)\)\)$/.exec(or);
    assert.ok(m && m[1] === m[2] && m[1] === m[4] && m[3] === m[5], `Bad composite cursor: ${or}`);
    const [, pid, , day, , , event] = m;
    result = result.filter((row) => row.push_id > pid || (row.push_id === pid && (row.day > day || (row.day === day && row.event_type > event))));
  }
  const order = (params.get('order') ?? '').split(',').filter(Boolean).map((term) => term.split('.'));
  assert.ok(order.length > 0, `${table}: stable ordering required`);
  result.sort((a, b) => { for (const [key, dir] of order) { const c = compare(a[key], b[key]); if (c) return dir === 'desc' ? -c : c; } return 0; });
  const requested = Number(params.get('limit') ?? 1000);
  result = result.slice(Number(params.get('offset') ?? 0), Number(params.get('offset') ?? 0) + Math.min(serverCap, requested));
  if (reverse) result.reverse();
  if (mutate) { const f = mutate; mutate = null; f(table, params); }
  const selection = params.get('select');
  if (selection && selection !== '*') {
    const keys = selection.split(',').map((x) => x.trim());
    result = result.map((row) => Object.fromEntries(keys.map((key) => [key, row[key]])));
  }
  return new Response(JSON.stringify(result), { status: 200, headers: { 'content-type': 'application/json' } });
};
const client = createClient('https://mock.supabase.co', 'test-only', { global: { fetch: fakeFetch }, auth: { persistSession: false } });
const storeExports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/db/supabase.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: storeExports, require: (name) => {
  if (name === '@supabase/supabase-js') return { createClient: () => client };
  if (name === '@/lib/public/product-selection') return realSelection;
  throw new Error(`Unexpected import ${name}`);
}, process: { env: { SUPABASE_URL: 'https://mock.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-only' } }, Date, Buffer, console, Set, Map });
const store = storeExports.supabaseStore;
const uniqueIds = (rows) => new Set(rows.map((row) => row.id));
const equalIds = (actual, expected, label) => {
  assert.equal(actual.length, expected.length, `${label}: total`);
  assert.equal(uniqueIds(actual).size, actual.length, `${label}: no duplicates`);
  assert.deepEqual([...uniqueIds(actual)].sort(), [...uniqueIds(expected)].sort(), `${label}: no missing IDs`);
};

const started = performance.now();
const allProducts = await store.listProducts();
equalIds(allProducts, products, 'products beyond 1,000');
assert.deepEqual(Array.from(allProducts, (p) => p.id), [...products].sort((a, b) => a.name.localeCompare(b.name, 'vi') || a.id.localeCompare(b.id)).map((p) => p.id));
assert.ok(calls.filter((c) => c.table === 'supplier_products').length > 3, 'Short server-capped pages continue until empty');
const allSuppliers = await store.listSuppliers();
equalIds(allSuppliers, suppliers, 'suppliers beyond 1,000');
equalIds(await store.listProductsBySupplier(suppliers[1236].id), products.filter((p) => p.supplier_id === suppliers[1236].id), 'supplier products');
const categoryRows = await store.listCategories({ publishedOnly: true });
assert.equal(categoryRows.find((c) => c.slug === 'rice').public_page_ready, true, 'Readiness sees product and supplier beyond first capped pages');
assert.equal(categoryRows.find((c) => c.slug === 'pepper').public_page_ready, false);
const firstMedia = await store.listMedia('product', products[0].id);
equalIds(firstMedia, media.filter((m) => m.product_id === products[0].id), 'per-owner media > 1,000');
const selectedProducts = products.slice(0, 161).map((p) => p.id);
equalIds(await store.listMediaForProducts([...selectedProducts, ...selectedProducts]), media.filter((m) => selectedProducts.includes(m.product_id)), 'batched product media');
const selectedSuppliers = suppliers.slice(0, 150).map((s) => s.id);
equalIds(await store.listMediaForSuppliers(selectedSuppliers), media.filter((m) => selectedSuppliers.includes(m.supplier_id)), 'batched supplier media');
equalIds(await store.listVerifications(suppliers[1236].id), verifications.filter((r) => r.supplier_id === suppliers[1236].id), 'verifications');
equalIds(await store.listCertificates(suppliers[1236].id), certificates.filter((r) => r.supplier_id === suppliers[1236].id), 'certificates');
const allSelected = [...selectedSuppliers, suppliers[1236].id];
equalIds(await store.listVerificationsForSuppliers(allSelected), verifications.filter((r) => allSelected.includes(r.supplier_id)), 'batched verifications');
equalIds(await store.listCertificatesForSuppliers(allSelected), certificates.filter((r) => allSelected.includes(r.supplier_id)), 'batched certificates');
equalIds(await store.listAllSponsoredPushes(), pushes, 'CRM packages');
equalIds(await store.listSponsoredPushes({ surface: 'category', categorySlug: 'rice', now: '2026-10-25T00:00:00Z' }), pushes, 'live packages');
const metrics = await store.listSponsoredPushDaily(pushes.slice(0, 90).map((p) => p.id), '2026-10-20');
assert.equal(metrics.length, daily.length);
assert.equal(new Set(metrics.map((r) => `${r.push_id}/${r.day}/${r.event_type}`)).size, daily.length, 'Composite-key metrics are not truncated or duplicated');
const elapsed = Math.round(performance.now() - started);
const requestCount = calls.length;

// Categories themselves may exceed a server cap too.
const originalCategories = tables.categories;
tables.categories = Array.from({ length: 1101 }, (_, i) => ({ id: id(i + 1), slug: i === 1100 ? 'rice' : `category-${i}`,
  name_i18n: { en: `Category ${i}` }, sort_order: i, is_published: true, status: 'published' }));
const manyCategories = await store.listCategories({ publishedOnly: true });
assert.equal(manyCategories.length, 1101);
assert.equal(manyCategories.at(-1).public_page_ready, true);
tables.categories = originalCategories;

// Even a cap of one is valid, and an early/short page must not mean "finished".
const originalProducts = tables.supplier_products;
tables.supplier_products = products.slice(0, 11);
serverCap = 1;
equalIds(await store.listProducts(), products.slice(0, 11), 'cap of one');
serverCap = 137;
tables.supplier_products = originalProducts;

// Pagination errors cannot produce a success containing only the first page/batch.
for (const [label, predicate, read] of [
  ['products', (table, p) => table === 'supplier_products' && p.has('id'), () => store.listProducts()],
  ['suppliers', (table, p) => table === 'suppliers' && p.has('id'), () => store.listSuppliers()],
  ['readiness products', (table, p) => table === 'supplier_products' && p.get('select') !== '*' && p.has('id'), () => store.listCategories()],
  ['readiness suppliers', (table, p) => table === 'suppliers' && p.get('select') !== '*' && p.has('id'), () => store.listCategories()],
  ['product media', (table, p) => table === 'media_assets' && p.has('id'), () => store.listMediaForProducts(selectedProducts)],
  ['certificates', (table, p) => table === 'certificates' && p.has('id'), () => store.listCertificatesForSuppliers(allSelected)],
  ['verifications', (table, p) => table === 'verifications' && p.has('id'), () => store.listVerificationsForSuppliers(allSelected)],
  ['packages', (table, p) => table === 'sponsored_pushes' && p.has('id'), () => store.listAllSponsoredPushes()],
  ['daily', (table, p) => table === 'sponsored_push_daily' && p.has('or'), () => store.listSponsoredPushDaily(pushes.slice(0, 90).map((p) => p.id), '2026-10-20')],
]) {
  fail = predicate;
  await assert.rejects(read(), /simulated page failure/, `${label}: error propagates`);
  fail = null;
}
fail = (table) => table === 'sponsored_pushes' && { code: '42P01', message: 'missing table' };
assert.equal((await store.listSponsoredPushes({ surface: 'category', categorySlug: 'rice', now: '2026-10-25T00:00:00Z' })).length, 0,
  'A missing optional sponsored table is allowed only on the first page');
fail = (table, params) => table === 'sponsored_pushes' && params.has('id') && { code: '42P01', message: 'missing table mid-read' };
await assert.rejects(store.listSponsoredPushes({ surface: 'category', categorySlug: 'rice', now: '2026-10-25T00:00:00Z' }), /missing table mid-read/);
fail = null;
reverse = true;
await assert.rejects(store.listProducts(), /thứ tự phân trang không hợp lệ/, 'A non-monotonic page fails instead of looping or duplicating');
reverse = false;

// A deletion behind the cursor or insertion ahead does not shift offsets or repeat an ID.
const original = tables.supplier_products;
tables.supplier_products = products.slice(0, 300).map((p) => ({ ...p }));
mutate = (table) => {
  if (table !== 'supplier_products') return;
  tables.supplier_products.shift();
  tables.supplier_products.push({ ...products[0], id: id(9999), name: 'Inserted after cursor' });
};
const changedDuringRead = await store.listProducts();
assert.equal(uniqueIds(changedDuringRead).size, changedDuringRead.length);
assert.ok(changedDuringRead.some((p) => p.id === id(9999)));
tables.supplier_products = original;

// Even where dev fallback is enabled, a failed paged read must not become an
// unrelated local catalogue during that call. Other legacy fallback stays intact.
let useMarkedError = true, localReads = 0;
const networkError = () => Object.assign(new Error('fetch failed'), useMarkedError ? { preventLocalFallback: true } : {});
const proxyExports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/db/index.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: proxyExports, console, Date, process: { env: { NODE_ENV: 'development', VEXIM_LOCAL_FALLBACK: 'on' } },
  require: (name) => {
    if (name === 'server-only') return {};
    if (name === '@/lib/db/local') return { localStore: { listProducts: async () => { localReads++; return ['local']; } } };
    if (name === '@/lib/db/supabase') return { supabaseStore: { listProducts: async () => { throw networkError(); } },
      supabaseConfigured: () => true, supabaseUrl: () => 'https://mock.supabase.co', supabaseProjectRef: () => 'mock', getSupabaseClient: () => null };
    throw new Error(`Unexpected import ${name}`);
  },
});
await assert.rejects(proxyExports.getStore().listProducts(), /fetch failed/);
assert.equal(localReads, 0, 'A paged read failure is never silently replaced with local rows');
useMarkedError = false;
assert.equal((await proxyExports.getStore().listProducts())[0], 'local', 'Unrelated pre-existing development fallback is unchanged');
assert.equal(localReads, 1);

console.log(`✅ Catalog pagination: 2,237 products, 1,237 suppliers, 3,507 media, 1,260 daily rows; cap 137 and cap 1, all IDs, batched evidence, failure propagation. Mock HTTP: ${requestCount} requests / ${elapsed} ms (not production latency).`);
