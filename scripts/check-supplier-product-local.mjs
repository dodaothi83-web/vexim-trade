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
  'node:fs': { existsSync: () => false, mkdirSync() {}, writeFileSync() {} },
  'node:path': path,
  '@/lib/db/seed': { SEED_BUYERS: [], SEED_PRODUCTS: [], SEED_SUPPLIERS: [] },
  '@/lib/db/preview-seed': { PREVIEW_PEPPER_HARVEST: null, previewCategories: () => [], previewSeedRows: () => ({ suppliers: [], products: [] }) },
  '@/lib/db/demo-suppliers': { DEMO_SUPPLIERS: [] },
  '@/lib/l2-scope': l2Scope,
  '@/lib/types': { L2_FACTORY_PHOTO_ITEMS: [], L3_EXPORT_ITEMS: ['bill_of_lading', 'customs_declaration', 'commercial_invoice', 'packing_list', 'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence'].map((key) => ({ key })) },
  '@/lib/verification-submission': { MAX_ITEMS_PER_KEY: 3 },
  '@/lib/public/product-selection': { isTestOnlyProduct: () => false, productBelongsToCategory: () => false, productReviewApproved: () => false },
  '@/lib/media/readiness': { isExpired: (m) => m.status === 'expired' || !!(m.expires_on && m.expires_on < new Date().toISOString().slice(0, 10)) },
  './category-seed': { CASHEW_CATEGORY_CONFIG: config, DEFAULT_CATEGORY_CONFIG: config, PEPPER_CATEGORY_CONFIG: config },
};
const mod = { exports: {} };
vm.runInNewContext(source, { module: mod, exports: mod.exports, __veximLocal: state, console, Date,
  process: { cwd: () => '/virtual', env: {} },
  require: (id) => { assert.ok(id in mocks, `Unexpected local store import: ${id}`); return mocks[id]; },
}, { filename: 'lib/db/local.ts' });
const store = mod.exports.localStore;
const productId = 'product';
const supplierId = 'supplier';
const product = (status = 'draft', ready = false) => ({ id: productId, supplier_id: supplierId, name: 'Product',
  supplier_review_status: status, supplier_originated: true, ready_for_buyer: ready, reviewed_category_slug: null,
  featured_media_id: 'one', images: [] });
const media = (id = 'one', audience = 'internal') => ({ id, owner_type: 'product', product_id: productId,
  supplier_id: supplierId, created_by: 'owner', kind: 'image', audience, status: 'checked',
  storage_path: `products/${productId}/${id}.webp`, thumb_path: null });
function reset(review = 'draft', ready = false) {
  Object.assign(state, { products: [product(review, ready)], media: [media('one', review === 'draft' ? 'internal' : 'buyer')],
    rfqs: [], sponsored_pushes: [], certificates: [], supplier_submission_items: [], audit_log: [] });
}

reset();
assert.equal(await store.updateSupplierProductIfState(productId, 'other', { review: 'draft', ready: false }, { name: 'forged' }), null);
assert.equal(await store.updateSupplierProductIfState(productId, supplierId, { review: 'pending', ready: false }, { name: 'stale' }), null);
assert.equal((await store.updateSupplierProductIfState(productId, supplierId, { review: 'draft', ready: false }, { name: 'saved' })).name, 'saved');
assert.equal((await store.deleteSupplierDraftProduct(productId, 'other')).status, 'not_deletable');
state.rfqs.push({ source_product_id: productId });
assert.equal((await store.deleteSupplierDraftProduct(productId, supplierId)).status, 'has_links');
reset(); state.certificates.push({ approved_product_ids: [productId] });
assert.equal((await store.deleteSupplierDraftProduct(productId, supplierId)).status, 'has_links');
reset(); state.supplier_submission_items.push({ thumb_path: state.media[0].storage_path });
assert.equal((await store.deleteSupplierDraftProduct(productId, supplierId)).status, 'has_links');
reset(); state.products.push({ ...product(), id: 'other', featured_media_id: null, images: ['one'] });
assert.equal((await store.deleteSupplierDraftProduct(productId, supplierId)).status, 'has_links');
reset();
const deleted = await store.deleteSupplierDraftProduct(productId, supplierId);
assert.equal(deleted.status, 'deleted'); assert.equal(deleted.paths[0], `products/${productId}/one.webp`);
assert.equal(state.products.length, 0); assert.equal(state.media.length, 0);

reset(); assert.equal((await store.deleteSupplierProductMedia(productId, supplierId, 'other', 'one')).status, 'forbidden');
assert.equal((await store.deleteSupplierProductMedia(productId, supplierId, 'owner', 'one')).status, 'deleted');
assert.equal(state.products[0].featured_media_id, null, 'Removing cover clears its featured pointer');
reset('pending'); assert.equal((await store.deleteSupplierProductMedia(productId, supplierId, 'owner', 'one')).status, 'state_changed');
reset('approved', true);
assert.equal((await store.deleteSupplierProductMedia(productId, supplierId, 'owner', 'one')).status, 'last_file');
state.media.push(media('two', 'buyer'));
const outcomes = await Promise.all([
  store.deleteSupplierProductMedia(productId, supplierId, 'owner', 'one'),
  store.deleteSupplierProductMedia(productId, supplierId, 'owner', 'two'),
]);
assert.deepEqual(outcomes.map((r) => r.status).sort(), ['deleted', 'last_file']);
assert.equal(state.media.length, 1);
reset('paused');
assert.equal((await store.deleteSupplierProductMedia(productId, supplierId, 'owner', 'one')).status, 'deleted');
reset('changes_requested');
assert.equal((await store.deleteSupplierProductMedia(productId, supplierId, 'owner', 'one')).status, 'deleted');
reset(); state.certificates.push({ file_media_id: 'one' });
assert.equal((await store.deleteSupplierProductMedia(productId, supplierId, 'owner', 'one')).status, 'has_links');
console.log('✅ Local store: state CAS, linked drafts and atomic media guards.');
