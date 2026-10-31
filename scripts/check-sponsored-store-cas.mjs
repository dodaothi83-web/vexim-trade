// node scripts/check-sponsored-store-cas.mjs
// Exercise the actual local and Supabase store adapters; Supabase is mocked in memory.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import * as productExtras from '../lib/products/product-extras.ts';

function load(file, mocks, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, console, Date, ...globals,
    require: (id) => { assert.ok(id in mocks, `Unexpected import ${id}`); return mocks[id]; },
  }, { filename: file });
  return module.exports;
}
const localState = { buyers: [], suppliers: [], products: [], media: [], rfqs: [], sponsored_pushes: [], certificates: [],
  supplier_submissions: [], supplier_submission_items: [], audit_log: [], categories: [{ slug: 'nuts-kernels', status: 'published', is_published: true }] };
const config = { intro: '', seo_desc: '', spec_columns: [], spec_rows: [], buying_facts: [], faqs: [], filters: [], product_fields: [] };
const local = load('lib/db/local.ts', {
  'node:crypto': crypto, 'node:fs': { existsSync: () => false, mkdirSync() {}, writeFileSync() {} }, 'node:path': path,
  '@/lib/db/seed': { SEED_BUYERS: [], SEED_PRODUCTS: [], SEED_SUPPLIERS: [] },
  '@/lib/db/preview-seed': { PREVIEW_PEPPER_HARVEST: null, previewCategories: () => [], previewSeedRows: () => ({ suppliers: [], products: [] }) },
  '@/lib/db/demo-suppliers': { DEMO_SUPPLIERS: [] }, '@/lib/l2-scope': {},
  '@/lib/types': { L2_FACTORY_PHOTO_ITEMS: [], L3_EXPORT_ITEMS: [] }, '@/lib/verification-submission': {},
  '@/lib/public/product-selection': {}, '@/lib/media/readiness': {},
  './category-seed': { CASHEW_CATEGORY_CONFIG: config, DEFAULT_CATEGORY_CONFIG: config, PEPPER_CATEGORY_CONFIG: config },
}, { __veximLocal: localState, process: { cwd: () => '/virtual', env: {} } }).localStore;

let remoteRow = null;
let failWrites = false;
const predicates = [];
const client = { from(table) {
  assert.equal(table, 'sponsored_pushes');
  const eq = [], query = { kind: '', patch: null };
  return {
    update(value) { query.kind = 'update'; query.patch = value; return this; },
    delete() { query.kind = 'delete'; return this; },
    eq(key, value) { eq.push([key, value]); return this; },
    select() { return this; },
    async maybeSingle() {
      predicates.push(eq);
      if (failWrites) return { data: null, error: { message: 'simulated write failure' } };
      if (!remoteRow || !eq.every(([key, value]) => remoteRow[key] === value)) return { data: null, error: null };
      if (query.kind === 'delete') { const result = { id: remoteRow.id }; remoteRow = null; return { data: result, error: null }; }
      Object.assign(remoteRow, query.patch);
      return { data: { ...remoteRow }, error: null };
    },
  };
} };
const remote = load('lib/db/supabase.ts', {
  '@supabase/supabase-js': { createClient: () => client }, '@/lib/public/product-selection': {},
  '@/lib/products/product-extras': productExtras,
}, { process: { env: { SUPABASE_URL: 'https://mock.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake' } } }).supabaseStore;

for (const [name, store, reset, read] of [
  ['local', local, (row) => { localState.sponsored_pushes = row ? [row] : []; }, () => localState.sponsored_pushes[0] ?? null],
  ['Supabase mock', remote, (row) => { remoteRow = row; }, () => remoteRow],
]) {
  reset({ id: 'sale', status: 'draft', starts_at: 'old', note: 'keep' });
  const winners = await Promise.all([
    store.updateSponsoredPushIfStatus('sale', 'draft', { status: 'approved', starts_at: 'new', note: undefined }),
    store.updateSponsoredPushIfStatus('sale', 'draft', { status: 'approved', starts_at: 'second' }),
  ]);
  assert.equal(winners.filter(Boolean).length, 1, `${name}: one approval wins`);
  assert.equal(read().starts_at, 'new');
  assert.equal(read().note, 'keep', 'undefined does not erase notes');
  assert.equal(await store.deleteSponsoredDraft('sale'), false, `${name}: cannot delete approved sale`);
  assert.equal(read().status, 'approved');
  assert.equal(await store.updateSponsoredPushIfStatus('sale', 'draft', { starts_at: 'stale' }), null);
  assert.equal(await store.updateSponsoredPushIfStatus('sale', 'approved', { status: 'paused' }) !== null, true);
  assert.equal(await store.updateSponsoredPushIfStatus('sale', 'approved', { status: 'paused' }), null);
  reset({ id: 'sale', status: 'draft' });
  assert.equal(await store.deleteSponsoredDraft('other'), false);
  assert.equal(await store.deleteSponsoredDraft('sale'), true);
  assert.equal(await store.deleteSponsoredDraft('sale'), false);
}
assert.ok(predicates.every((p) => p.some(([key]) => key === 'id') && p.some(([key]) => key === 'status')),
  'Every Supabase update/delete checks both id and expected status');
failWrites = true;
await assert.rejects(remote.updateSponsoredPushIfStatus('sale', 'draft', { status: 'approved' }), /simulated write failure/);
await assert.rejects(remote.deleteSponsoredDraft('sale'), /simulated write failure/);
console.log('✅ Sponsored stores: local and Supabase CAS; one approval wins and stale deletion cannot remove a paid package (remote mocked).');
