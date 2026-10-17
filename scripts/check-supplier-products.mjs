// node scripts/check-supplier-products.mjs — owned drafts, private assets, manual review, public gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, mocks) {
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { module: mod, exports: mod.exports, FormData, File, Request, Response, Headers, URL,
    console, Date, process, require: (id) => { if (id === 'server-only') return {}; assert.ok(id in mocks, `${file}: unexpected ${id}`); return mocks[id]; } }, { filename: file });
  return mod.exports;
}
const supplierId = '12345678-1234-1234-1234-123456789abc';
const productId = 'abcdefab-cdef-abcd-efab-cdefabcdefab';
const user = { id: 'owner', email: 'factory@example.com', supplier_id: supplierId, role: 'supplier', is_active: true };
const supplier = { id: supplierId, fob_publicly_visible: false, fob_updated_at: null, name: 'Factory One', products: 'Cashew W320', onboarding_status: 'pending' };
let product = null;
const files = [];
const audit = [];
let storedBytes = 0;
const categoryProposals = load('../lib/supplier-portal/category-proposals.ts', {});
const categories = [
  { id: '11111111-1111-1111-1111-111111111111', slug: 'cashew', parent_id: null, name_i18n: { vi: 'Hạt điều', en: 'Cashew' }, status: 'published', is_published: true, sort_order: 1 },
  { id: '22222222-2222-2222-2222-222222222222', slug: 'rice', parent_id: null, name_i18n: { vi: 'Gạo', en: 'Rice' }, status: 'published', is_published: true, sort_order: 2 },
];
const store = {
  getProduct: async (id) => id === productId ? product : null,
  createProduct: async (input) => { product = { ...input, id: productId }; return product; },
  updateProduct: async (id, patch) => { assert.equal(id, productId); product = { ...product, ...patch }; return product; },
  listProductsBySupplier: async (id) => id === supplierId ? [product].filter(Boolean) : [],
  updateSupplier: async (id, patch) => { assert.equal(id, supplierId); Object.assign(supplier, patch); return supplier; },
  listCategories: async () => categories, listSupplierCategories: async () => [],
  listMedia: async (_owner, id) => id === productId ? files : [],
  createMedia: async (input) => { const row = { ...input, id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }; files.push(row); return row; },
  getMedia: async (id) => files.find((m) => m.id === id) ?? null,
  deleteMedia: async (id) => { files.splice(files.findIndex((m) => m.id === id), 1); },
  addAuditLog: async (entry) => audit.push(entry),
};
const access = () => ({ store, supplier: { ...supplier }, user });
const onboarding = load('../lib/supplier-portal/onboarding.ts', {});
const actions = load('../app/supplier/portal/product-actions.ts', {
  'next/cache': { revalidatePath() {} },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => access() },
  '@/lib/supplier-portal/onboarding': onboarding,
  '@/lib/supplier-portal/category-proposals': categoryProposals,
  '@/lib/public/product-selection': { supplierPriceConsentCurrent: (s) => !!s.fob_publicly_visible && !!s.fob_updated_at && Date.now() - new Date(s.fob_updated_at).getTime() < 180 * 86400_000 },
  '@/lib/public/category-assignment': { assignProductCategory: () => null, assignSupplierCategories: () => ({ slugs: [] }) },
});
const form = () => {
  const fd = new FormData();
  for (const [key, value] of Object.entries({ name: 'Cashew W320', spec: '25kg vacuum bag', description: 'White kernels',
    ref_price: '5000', currency: 'USD', supplier_category_proposal: 'cashew', supplier_id: 'foreign', ready_for_buyer: 'true', supplier_review_status: 'approved' })) fd.set(key, value);
  return fd;
};
assert.equal((await actions.saveSupplierProductAction(form())).ok, false, 'Pending account cannot create product');
supplier.onboarding_status = 'approved';
const invalidProposal = form(); invalidProposal.set('supplier_category_proposal', 'not-in-catalogue');
assert.equal((await actions.saveSupplierProductAction(invalidProposal)).ok, false, 'Supplier cannot forge a category');
assert.equal(product, null);
const created = await actions.saveSupplierProductAction(form());
assert.equal(created.ok, true); assert.equal(created.id, productId);
assert.equal(product.supplier_id, supplierId); assert.equal(product.supplier_review_status, 'draft');
assert.equal(product.ready_for_buyer, false); assert.equal(product.ref_price, 5000);
assert.equal(product.price_publicly_visible, false, 'Saving an entered price does not expose it');
assert.equal(supplier.fob_updated_at, null, 'Ordinary product saves cannot silently record supplier consent');
const optIn = form(); optIn.set('product_id', productId); optIn.set('price_publicly_visible', 'yes');
optIn.set('description_detail', 'Origin and details of this product.');
assert.equal((await actions.saveSupplierProductAction(optIn)).ok, true);
assert.equal(product.price_publicly_visible, true); assert.equal(product.description_detail, 'Origin and details of this product.');
assert.equal(supplier.fob_updated_at, null, 'Product opt-in alone does not create supplier consent');
const consentForm = form(); consentForm.set('product_id', productId); consentForm.set('price_publicly_visible', 'yes');
consentForm.set('confirm_supplier_price_consent', 'yes');
assert.equal((await actions.saveSupplierProductAction(consentForm)).ok, true);
assert.equal(supplier.fob_publicly_visible, true); assert.ok(supplier.fob_updated_at);
assert.ok(audit.some((entry) => entry.action === 'supplier.price_consent_confirmed' && entry.actor_id === user.id));
const consentStamp = supplier.fob_updated_at;
assert.equal((await actions.saveSupplierProductAction(formWithId())).ok, true);
assert.equal(product.price_publicly_visible, false, 'Unticking product opt-in hides its price');
assert.equal(supplier.fob_updated_at, consentStamp, 'Ordinary saves never renew consent');
assert.equal(product.supplier_category_proposal, 'cashew'); assert.equal(product.reviewed_category_slug, null);
assert.equal(product.supplier_originated, true);
function formWithId() { const fd = form(); fd.set('product_id', productId); return fd; }
const foreignEdit = form(); foreignEdit.set('product_id', 'ffffffff-ffff-ffff-ffff-ffffffffffff');
assert.equal((await actions.saveSupplierProductAction(foreignEdit)).ok, false);
const image = new File([new Uint8Array([0xff,0xd8,0xff,0xe0,1,2,3,4,5,6,7,8])], 'cashew.jpg', { type: 'image/jpeg' });
const upload = load('../app/api/supplier-portal/products/[id]/media/route.ts', {
  'next/server': { NextResponse: { json: (data, options) => Response.json(data, options) } },
  'next/cache': { revalidatePath() {} },
  'node:crypto': { randomUUID: () => 'aabbccdd-eeee-ffff-aaaa-bbbbbbbbbbbb' },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => access() },
  '@/lib/supplier-portal/onboarding': onboarding,
  '@/lib/media/validate': { validateUpload: (kind, bytes) => kind === 'image' && bytes[0] === 0xff ? { ok: true, mime: 'image/jpeg' } : { ok: false }, extensionFor: () => 'jpg' },
  '@/lib/media/storage': { putObject: async () => { storedBytes++; }, deleteObject: async () => { storedBytes--; } },
});
async function postMedia(id = productId) {
  const fd = new FormData(); fd.set('kind', 'image'); fd.set('file', image);
  const response = await upload.POST(new Request(`https://example.com/api/supplier-portal/products/${id}/media`, { method: 'POST', body: fd }), { params: Promise.resolve({ id }) });
  return response.status;
}
assert.equal(await postMedia('ffffffff-ffff-ffff-ffff-ffffffffffff'), 403);
assert.equal(await postMedia(), 200);
assert.equal(files[0].audience, 'internal'); assert.equal(files[0].status, 'unverified');
assert.equal(files[0].created_by, user.id); assert.equal(storedBytes, 1);
const mediaRead = load('../app/api/media/file/[...path]/route.ts', {
  'next/server': { NextResponse: Response },
  '@/lib/db': { getStore: () => ({ getMediaByPath: async () => files[0], getUser: async () => user,
    getSupplier: async () => supplier, getProduct: async () => product }) },
  '@/lib/auth/session': { getSession: async () => ({ uid: user.id, role: 'supplier', email: user.email }) },
  '@/lib/auth/permissions': { hasPermission: () => false },
  '@/lib/media/storage': { getObject: async () => ({ data: new Uint8Array([0xff,0xd8,0xff,0xe0]) }) },
  '@/lib/supplier-portal/policy': { ownsDocumentReview: () => false },
  '@/lib/supplier-portal/onboarding': onboarding,
});
const assetPath = files[0].storage_path;
const mediaParams = { params: Promise.resolve({ path: assetPath.split('/') }) };
assert.equal((await mediaRead.GET(new Request(`https://example.com/api/media/file/${assetPath}`), mediaParams)).status, 200);
files[0].supplier_id = 'foreign';
assert.equal((await mediaRead.GET(new Request(`https://example.com/api/media/file/${assetPath}`), mediaParams)).status, 403);
files[0].supplier_id = supplierId;
const deleteUrl = `https://example.com/api/supplier-portal/products/${productId}/media?media_id=${files[0].id}`;
files[0].created_by = 'staff';
assert.equal((await upload.DELETE(new Request(deleteUrl, { method: 'DELETE' }), { params: Promise.resolve({ id: productId }) })).status, 403);
files[0].created_by = user.id;
assert.equal((await upload.DELETE(new Request(deleteUrl, { method: 'DELETE' }), { params: Promise.resolve({ id: productId }) })).status, 200);
assert.equal(files.length, 0); assert.equal(storedBytes, 0);
assert.equal(await postMedia(), 200);
const submitted = new FormData(); submitted.set('product_id', productId);
files[0].created_by = 'staff';
assert.equal((await actions.submitSupplierProductAction(submitted)).ok, false, 'Hidden staff-internal file does not satisfy supplier submission');
files[0].created_by = user.id;
assert.equal((await actions.submitSupplierProductAction(submitted)).ok, true);
assert.equal(product.supplier_review_status, 'pending'); assert.equal(product.ready_for_buyer, false);
assert.equal(await postMedia(), 409, 'Cannot upload while pending');
const pendingEdit = form(); pendingEdit.set('product_id', productId);
assert.equal((await actions.saveSupplierProductAction(pendingEdit)).ok, false, 'Cannot edit while pending');
let denied = true;
const review = load('../app/crm/products/[slug]/edit/review-actions.ts', {
  'next/cache': { revalidatePath() {} },
  '@/lib/auth/session': { guard: async () => denied ? { message: 'denied' } : null,
    getSession: async () => ({ uid: 'reviewer', email: 'staff@example.com', role: 'sourcing' }) },
  '@/lib/db': { getStore: () => store },
  '@/lib/supplier-portal/category-proposals': categoryProposals,
});
const approve = new FormData(); approve.set('product_id', productId); approve.set('decision', 'approved');
assert.equal((await review.decideSupplierProductAction(approve)).ok, false);
denied = false;
assert.equal((await review.decideSupplierProductAction(approve)).ok, false, 'Staff must explicitly pick a category');
approve.set('reviewed_category_slug', 'rice');
assert.equal((await review.decideSupplierProductAction(approve)).ok, true);
assert.equal(product.supplier_review_status, 'approved'); assert.equal(product.ready_for_buyer, false);
assert.equal(product.supplier_category_proposal, 'cashew');
assert.equal(product.reviewed_category_slug, 'rice', 'Staff decision overrides supplier proposal');
const productView = load('../lib/supplier-portal/product-view.ts', {});
const visibleFiles = productView.supplierVisibleProductMedia([
  { ...files[0], owner_type: 'product', supplier_id: supplierId, created_by: user.id, kind: 'image' },
  { ...files[0], owner_type: 'product', supplier_id: supplierId, created_by: 'staff', audience: 'internal' },
  { ...files[0], owner_type: 'product', supplier_id: 'other-supplier', created_by: user.id },
  { ...files[0], owner_type: 'product', supplier_id: supplierId, created_by: 'staff', audience: 'buyer' },
], supplierId, user.id);
assert.equal(visibleFiles.length, 2, 'Storefront never renders foreign or staff-internal media');
assert.equal(productView.productReview(product), 'approved');
assert.equal(productView.privateMediaUrl(visibleFiles[0]), `/api/media/file/${visibleFiles[0].storage_path}`);
assert.equal(productView.privateMediaUrl({ ...visibleFiles[0], storage_path: '../secret' }), null);
const selection = load('../lib/public/product-selection.ts', {
  '@/lib/public/category-assignment': { assignProductCategory: (p, choices) => choices.find((c) => p.name.includes('Cashew') && c.slug === 'cashew') ?? null },
});
assert.equal(selection.productReviewApproved(product), true);
assert.equal(selection.productBelongsToCategory({ ...product, reviewed_category_slug: null, supplier_originated: false }, categories[0], categories), true,
  'Historical products retain name inference');
assert.equal(selection.productBelongsToCategory(product, categories[1], categories), true);
assert.equal(selection.productBelongsToCategory(product, categories[0], categories), false,
  'A staff-reviewed category outranks both the product name and the supplier proposal');
product.ready_for_buyer = true; // Staff-only readiness switch; simulate an already-public approved product.
const correction = new FormData(); correction.set('product_id', productId); correction.set('reviewed_category_slug', 'cashew');
assert.equal((await review.correctSupplierProductCategoryAction(correction)).ok, true);
assert.equal(product.reviewed_category_slug, 'cashew'); assert.equal(product.ready_for_buyer, false, 'Category correction cannot publish');
const revised = form(); revised.set('product_id', productId); revised.set('name', 'Cashew W240');
assert.equal((await actions.saveSupplierProductAction(revised)).ok, true);
assert.equal(product.supplier_review_status, 'draft'); assert.equal(product.ready_for_buyer, false);
assert.equal(product.reviewed_category_slug, null, 'Supplier edits clear the staff category decision');
assert.equal(selection.productReviewApproved(product), false, 'Supplier edits cannot remain public');
assert.equal(selection.productBelongsToCategory(product, categories[0], categories), false,
  'Supplier-originated product without a Vexim category cannot fall back to name inference');
assert.equal(selection.productReviewApproved({ ...product, supplier_review_status: 'approved' }), false,
  'Even an approved supplier product cannot publish without its reviewed category');
assert.equal(audit.some((a) => a.action === 'supplier.product_approved'), true);
const migration = fs.readFileSync(new URL('../supabase/migrations/20261017_supplier_product_review.sql', import.meta.url), 'utf8');
assert.match(migration, /supplier_review_status/);
assert.match(fs.readFileSync(new URL('../app/public-media/[...path]/route.ts', import.meta.url), 'utf8'), /productReviewApproved\(product\)/);
console.log('✅ Supplier products: own drafts/uploads, staff decision and public gate.');
