// node scripts/check-supplier-product-local.mjs
// Exercise the real local-store methods in memory without writing to data/local-db.json.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const l2Scope = {};
new Function('exports', ts.transpileModule(fs.readFileSync(new URL('../lib/l2-scope.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(l2Scope);

const source = ts.transpileModule(fs.readFileSync(new URL('../lib/db/local.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const state = { buyers: [], suppliers: [], products: [], media: [], rfqs: [], sponsored_pushes: [],
  certificates: [], supplier_submission_items: [], audit_log: [], categories: [{ slug: 'nuts-kernels', status: 'published', is_published: true }] };
const config = { intro: '', seo_desc: '', spec_columns: [], spec_rows: [], buying_facts: [], faqs: [], filters: [], product_fields: [] };
const mocks = {
  'node:crypto': crypto,
  'node:fs': { existsSync: () => false, mkdirSync() {}, writeFileSync() {}, renameSync() {}, unlinkSync() {} },
  'node:path': path,
  '@/lib/db/seed': { SEED_BUYERS: [], SEED_PRODUCTS: [], SEED_SUPPLIERS: [] },
  '@/lib/db/preview-seed': { PREVIEW_PEPPER_HARVEST: null, previewCategories: () => [], previewSeedRows: () => ({ suppliers: [], products: [] }) },
  '@/lib/db/demo-suppliers': { DEMO_SUPPLIERS: [] },
  '@/lib/l2-scope': l2Scope,
  '@/lib/types': { L2_FACTORY_PHOTO_ITEMS: [], L3_EXPORT_ITEMS: ['bill_of_lading', 'customs_declaration', 'commercial_invoice', 'packing_list', 'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence'].map((key) => ({ key })) },
  '@/lib/verification-submission': { MAX_ITEMS_PER_KEY: 3 },
  '@/lib/public/product-selection': { isTestOnlyProduct: () => false, productBelongsToCategory: () => false, productReviewApproved: () => false },
  '@/lib/media/readiness': { isExpired: (m) => m.status === 'expired' || !!(m.expires_on && m.expires_on < new Date().toISOString().slice(0, 10)) },
  '@/lib/rfq/buyer-contact': { rfqBuyerContact: () => ({ email: 'buyer@example.com' }) },
  '@/lib/rfq/channel': { rfqChannel: () => 'sourcing' },
  './category-seed': { CASHEW_CATEGORY_CONFIG: config, DEFAULT_CATEGORY_CONFIG: config, PEPPER_CATEGORY_CONFIG: config },
};
const mod = { exports: {} };
vm.runInNewContext(source, { module: mod, exports: mod.exports, __veximLocal: state, console, Date, structuredClone,
  process: { cwd: () => '/virtual', env: {} },
  require: (id) => { assert.ok(id in mocks, `Unexpected local store import: ${id}`); return mocks[id]; },
}, { filename: 'lib/db/local.ts' });
const store = mod.exports.localStore;

const account = await store.createBuyerUser({ email: 'ME@example.com', verified_at: '2026-11-04', saved: { products: [], comparisons: [{ id: 'comparison', productIds: ['a', 'b'], label: 'Compare', created_at: '2026-11-04' }] } });
const other = await store.createBuyerUser({ email: 'other@example.com', verified_at: '2026-11-04' });
const saved = (id) => ({ id, name: 'Product ' + id, href: '/products/nuts/' + id, imagePath: null, categorySlug: 'nuts' });
await Promise.all([store.setBuyerSavedProduct(account.id, saved('a'), true), store.setBuyerSavedProduct(account.id, saved('b'), true)]);
assert.equal((await store.getBuyerUser(account.id)).saved.products.length, 2, 'Concurrent saves preserve both products');
await store.setBuyerSavedProduct(account.id, saved('a'), true);
assert.equal((await store.getBuyerUser(account.id)).saved.products.length, 2, 'Repeated save is idempotent');
await store.setBuyerSavedProduct(account.id, saved('a'), false);
assert.equal((await store.getBuyerUser(account.id)).saved.products.map((p) => p.id).join(','), 'b');
assert.equal((await store.getBuyerUser(account.id)).saved.comparisons.length, 1);
assert.equal((await store.getBuyerUser(other.id)).saved.products.length, 0);
await assert.rejects(store.setBuyerSavedProduct('missing', saved('a'), true));
for (let i = 0; i < 99; i++) await store.setBuyerSavedProduct(account.id, saved('product-' + i), true);
assert.equal((await store.getBuyerUser(account.id)).saved.products.length, 100);
await assert.rejects(store.setBuyerSavedProduct(account.id, saved('overflow'), true), /limit/);
await store.setBuyerSavedProduct(account.id, saved('b'), false);
assert.equal((await store.getBuyerUser(account.id)).saved.products.length, 99);
state.buyers = [{ id: 'mine-1', email: 'me@example.com' }, { id: 'mine-2', email: 'ME@example.com' }, { id: 'other', email: 'other@example.com' }, { id: 'wildcard', email: 'm_@example.com' }];
state.rfqs = [{ id: 'one', buyer_id: 'mine-1', created_at: '2026-11-01' }, { id: 'two', buyer_id: 'mine-2', created_at: '2026-11-04' }, { id: 'private', buyer_id: 'other', created_at: '2026-11-04' }, { id: 'literal', buyer_id: 'wildcard', created_at: '2026-11-04' }];
assert.equal((await store.listBuyerRfqsByEmail('me@example.com')).map((r) => r.id).join(','), 'two,one', 'Include all matching CRM records, never other accounts');
assert.equal((await store.listBuyerRfqsByEmail('m_@example.com')).map((r) => r.id).join(','), 'literal');
assert.equal((await store.listBuyerRfqsByEmail('%@example.com')).length, 0);
console.log('✅ Buyer local store: exact email ownership, duplicate CRM profiles, atomic and bounded saves.');


// Separate sourcing persistence, exact ownership, durable rollback and optimistic CRM updates.
const sourcing = { id: crypto.randomUUID(), buyer_email: account.email, submission_key: crypto.randomUUID(), content: 'Rice', attachments: [], status: 'new', assigned_to: null, internal_note: null, buyer_reply: null, version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
await store.createSourcingRequest(sourcing);
assert.equal((await store.createSourcingRequest({ ...sourcing, id: crypto.randomUUID() })).id, sourcing.id, 'Unique buyer/submission key');
assert.equal((await store.listSourcingRequests(other.email)).length, 0, 'Other buyer has no sourcing history');
assert.equal((await store.listSourcingRequests(account.email.toUpperCase())).length, 1);
assert.equal(await store.countNewSourcingRequests(), 1);
const patch = { status: 'in_progress', assigned_to: null, internal_note: 'Private', buyer_reply: 'We are checking suppliers.' };
const updates = await Promise.all([store.updateSourcingRequest(sourcing.id, 1, patch), store.updateSourcingRequest(sourcing.id, 1, { ...patch, status: 'closed' })]);
assert.equal(updates.filter(Boolean).length, 1, 'Stale CRM save cannot overwrite newer version');
assert.equal((await store.getSourcingRequest(sourcing.id)).version, 2);
assert.equal(await store.countNewSourcingRequests(), 0);
const writer = mocks['node:fs'].writeFileSync;
mocks['node:fs'].writeFileSync = () => { throw new Error('Disk full'); };
await assert.rejects(store.createSourcingRequest({ ...sourcing, id: crypto.randomUUID(), submission_key: crypto.randomUUID() }), /Disk full/);
mocks['node:fs'].writeFileSync = writer;
assert.equal((await store.listSourcingRequests(account.email)).length, 1, 'Failed disk write rolls back request instead of acknowledging it');
console.log('Sourcing local persistence, exact ownership, deduplication, CAS and disk-error rollback passed.');
