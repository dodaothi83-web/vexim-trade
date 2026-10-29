// node scripts/check-supplier-products.mjs — owned drafts, private assets, manual review, public gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { loadProductDescription } from './product-description-test-utils.mjs';
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
const supplier = { id: supplierId, status: 'published', fob_publicly_visible: false, fob_updated_at: null, name: 'Factory One', products: 'Cashew W320', onboarding_status: 'pending', requested_category_slugs: ['cashew'] };
let product = null;
const files = [];
const externalFiles = [];
const audit = [];
let storedBytes = 0;
let failThumb = false;
let failCleanup = false;
let draftLinked = false;
let mediaLinked = false;
let interfereWithCas = null;
const deletedPaths = [];
const storage = {
  putObject: async (path) => { if (failThumb && path.endsWith('-thumb.webp')) throw Error('failed thumbnail write'); storedBytes++; },
  deleteObject: async (path) => {
    if (failCleanup) throw Error('storage unavailable');
    deletedPaths.push(path);
    if (storedBytes) storedBytes--;
  },
};
const categoryProposals = load('../lib/supplier-portal/category-proposals.ts', {});
const attributes = load('../lib/product-attributes.ts', {});
const priceOptions = load('../lib/supplier-portal/product-price-options.ts', {});
const mediaReadiness = load('../lib/media/readiness.ts', {});
const { description: productDescription } = loadProductDescription();
const categories = [
  { id: '11111111-1111-1111-1111-111111111111', slug: 'cashew', parent_id: null, name_i18n: { vi: 'Hạt điều', en: 'Cashew' }, status: 'published', is_published: true, sort_order: 1, product_fields: [{ key: 'grade', label: 'Grade', type: 'select', options: ['W240', 'W320'], filterable: true }] },
  { id: '22222222-2222-2222-2222-222222222222', slug: 'rice', parent_id: null, name_i18n: { vi: 'Gạo', en: 'Rice' }, status: 'published', is_published: true, sort_order: 2 },
];
const store = {
  getSupplier: async (id) => id === supplierId ? supplier : null,
  getUserBySupplierId: async (id) => id === supplierId ? user : null,
  getProduct: async (id) => id === productId ? product : null,
  createProduct: async (input) => { product = { ...input, id: productId }; return product; },
  updateProduct: async (id, patch) => { assert.equal(id, productId); product = { ...product, ...patch }; return product; },
  updateSupplierProductIfState: async (id, sid, expected, patch) => {
    if (interfereWithCas) { const interfere = interfereWithCas; interfereWithCas = null; interfere(); }
    if (!product || product.id !== id || product.supplier_id !== sid ||
        (product.supplier_review_status ?? null) !== expected.review || product.ready_for_buyer !== expected.ready) return null;
    product = { ...product, ...patch }; return product;
  },
  deleteSupplierDraftProduct: async (id, sid) => {
    if (!product || product.id !== id || product.supplier_id !== sid || product.supplier_review_status !== 'draft' ||
        !product.supplier_originated || product.ready_for_buyer !== false || product.reviewed_category_slug != null)
      return { status: 'not_deletable' };
    if (draftLinked) return { status: 'has_links' };
    const paths = [...new Set(files.flatMap((file) => [file.storage_path, file.thumb_path]).filter(Boolean))];
    files.length = 0; product = null;
    return { status: 'deleted', paths };
  },
  listProductsBySupplier: async (id) => id === supplierId ? [product].filter(Boolean) : [],
  updateSupplier: async (id, patch) => { assert.equal(id, supplierId); Object.assign(supplier, patch); return supplier; },
  listCategories: async () => categories, listSupplierCategories: async () => [],
  listMedia: async (_owner, id) => id === productId ? files : [],
  createMedia: async (input) => { const row = { ...input, id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }; files.push(row); return row; },
  updateMedia: async (id, patch) => { const row = files.find((m) => m.id === id); assert.ok(row, `Missing media ${id}`); Object.assign(row, patch); return row; },
  getMedia: async (id) => files.find((m) => m.id === id) ?? null,
  getMediaByPath: async (path) => [...files, ...externalFiles].find((m) => m.storage_path === path || m.thumb_path === path) ?? null,
  deleteMedia: async (id) => { files.splice(files.findIndex((m) => m.id === id), 1); },
  deleteSupplierProductMedia: async (pid, sid, uid, mid) => {
    if (!product || product.id !== pid || product.supplier_id !== sid ||
        !(['draft', 'changes_requested'].includes(product.supplier_review_status) ||
          (['approved', 'paused'].includes(product.supplier_review_status) && product.supplier_originated === true)))
      return { status: 'state_changed' };
    const asset = files.find((m) => m.id === mid);
    if (!asset || asset.owner_type !== 'product' || asset.product_id !== pid || asset.supplier_id !== sid || asset.created_by !== uid ||
        (product.supplier_review_status === 'draft' && asset.audience !== 'internal')) return { status: 'forbidden' };
    if (product.supplier_review_status === 'approved' && product.ready_for_buyer && asset.audience === 'buyer' &&
        !files.some((m) => m.id !== mid && m.owner_type === 'product' && m.product_id === pid && m.supplier_id === sid &&
          ['image', 'catalogue'].includes(m.kind) && m.audience === 'buyer' && m.storage_path && !mediaReadiness.isExpired(m)))
      return { status: 'last_file' };
    if (mediaLinked) return { status: 'has_links' };
    files.splice(files.indexOf(asset), 1);
    return { status: 'deleted', kind: asset.kind, paths: [asset.storage_path, asset.thumb_path].filter(Boolean) };
  },
  addAuditLog: async (entry) => audit.push(entry),
};
const access = () => ({ store, supplier: { ...supplier }, user });
const onboarding = load('../lib/supplier-portal/onboarding.ts', {});
const priceUnits = load('../lib/public/price-units.ts', {});
const gradeResolution = load('../lib/public/grade-resolution.ts', {});
const gradePricing = load('../lib/products/grade-pricing.ts', {
  '@/lib/public/price-units': priceUnits,
  '@/lib/public/grade-resolution': gradeResolution,
});
const notices = [];
const actions = load('../app/supplier/portal/product-actions.ts', {
  'next/cache': { revalidatePath() {} },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => access() },
  '@/lib/supplier-portal/onboarding': onboarding,
  '@/lib/supplier-portal/product-price-options': priceOptions,
  '@/lib/supplier-portal/category-proposals': categoryProposals,
  '@/lib/product-attributes': attributes,
  '@/lib/products/grade-pricing': gradePricing,
  '@/lib/public/product-selection': { supplierPriceConsentCurrent: (s) => !!s.fob_publicly_visible && !!s.fob_updated_at && Date.now() - new Date(s.fob_updated_at).getTime() < 180 * 86400_000 },
  '@/lib/public/category-assignment': { assignProductCategory: (p, choices) => choices.find((c) => c.slug === (p.name.includes('Rice') ? 'rice' : 'cashew')) },
  '@/lib/supplier-portal/notify': { notifyStaffProductSubmission: async (_supplier, item) => { notices.push(['submitted', item.id]); return 'sent'; } },
  '@/lib/products/product-description': productDescription,
  '@/lib/media/storage': storage,
  '@/lib/ai/product-translation-service': {
    ensureProductEnglishTranslation: async (storeArg, id) => {
      const current = await storeArg.getProduct(id);
      if (current?.name_i18n?.en) return { status: 'current', product: current };
      const saved = await storeArg.updateProduct(id, { name_i18n: { en: current?.name ?? '' }, translation_meta: { source_hash: 'mock', translated_at: new Date().toISOString(), origin: 'ai', model: 'mock' } });
      return { status: 'translated', product: saved };
    },
  },
});
const form = () => {
  const fd = new FormData();
  for (const [key, value] of Object.entries({ name: 'Cashew W320', spec: '25kg vacuum bag', description: 'White kernels',
    raw_material_region: 'Bình Phước và Đắk Lắk', input_material_origin: 'Việt Nam và Campuchia',
    ref_price: '5000', currency: 'USD', unit: 'kg', supplier_category_proposal: 'cashew', supplier_id: 'foreign', ready_for_buyer: 'true', supplier_review_status: 'approved' })) fd.set(key, value);
  return fd;
};
assert.equal((await actions.saveSupplierProductAction(form())).ok, false, 'Pending account cannot create product');
supplier.onboarding_status = 'approved';
const invertedPrice = form(); invertedPrice.set('ref_price_max', '4999');
assert.match((await actions.saveSupplierProductAction(invertedPrice)).message, /Giá đến/, 'Supplier cannot save an inverted range');
assert.equal(product, null);
const missingFloor = form(); missingFloor.delete('ref_price'); missingFloor.set('ref_price_max', '5500');
assert.equal((await actions.saveSupplierProductAction(missingFloor)).ok, false, 'Upper price requires a positive lower price');
// Fixed supplier choices are validated server-side, not just in the browser.
for (const [field, value] of [['unit', 'kg/unit'], ['currency', 'BTC'], ['unit', ''], ['currency', '']]) {
  const invalid = form(); invalid.set(field, value);
  assert.equal((await actions.saveSupplierProductAction(invalid)).ok, false, `Reject unsupported or missing ${field}`);
}
const draftWithoutPrice = form(); draftWithoutPrice.delete('ref_price'); draftWithoutPrice.set('unit', ''); draftWithoutPrice.set('currency', '');
assert.equal((await actions.saveSupplierProductAction(draftWithoutPrice)).ok, true, 'Price and both choices remain optional for a draft');
assert.equal(product.unit, null); assert.equal(product.currency, null); product = null;
const forgedWithoutPrice = form(); forgedWithoutPrice.delete('ref_price'); forgedWithoutPrice.set('unit', 'pallet');
assert.equal((await actions.saveSupplierProductAction(forgedWithoutPrice)).ok, false, 'Cannot create a new free-text unit without a price');
for (const { value } of priceOptions.SUPPLIER_PRICE_UNITS) {
  const supported = form(); supported.set('unit', value);
  assert.equal((await actions.saveSupplierProductAction(supported)).ok, true, `Unit ${value} is accepted`);
  assert.equal(product.unit, value); product = null;
}
for (const { value } of priceOptions.SUPPLIER_PRICE_CURRENCIES) {
  const supported = form(); supported.set('currency', value);
  assert.equal((await actions.saveSupplierProductAction(supported)).ok, true, `Currency ${value} is accepted`);
  assert.equal(product.currency, value); product = null;
}
const invalidProposal = form(); invalidProposal.set('supplier_category_proposal', 'not-in-catalogue');
assert.equal((await actions.saveSupplierProductAction(invalidProposal)).ok, false, 'Supplier cannot forge a category');
const outsideScope = form(); outsideScope.set('supplier_category_proposal', 'rice');
assert.equal((await actions.saveSupplierProductAction(outsideScope)).ok, true, 'Published category outside supplier scope is a review warning, not a draft blocker');
assert.equal(product.supplier_review_status, 'draft'); product = null;
const wrongCommodity = form(); wrongCommodity.set('name', 'Jasmine Rice');
assert.equal((await actions.saveSupplierProductAction(wrongCommodity)).ok, true, 'Keyword and category mismatch is left for staff review');
assert.equal(product.supplier_review_status, 'draft'); product = null;
const noCategory = form(); noCategory.delete('supplier_category_proposal');
assert.equal((await actions.saveSupplierProductAction(noCategory)).ok, false, 'A product needs one selected category');
assert.equal(product, null);
const created = await actions.saveSupplierProductAction(form());
assert.equal(created.ok, true); assert.equal(created.id, productId);
assert.equal(product.supplier_id, supplierId); assert.equal(product.supplier_review_status, 'draft');
assert.equal(product.ready_for_buyer, false); assert.equal(product.ref_price, 5000);
assert.equal(product.unit, 'kg'); assert.equal(product.currency, 'USD');
// Historical values survive ordinary edits; changing the numeric price requires standard choices.
product = { ...product, unit: 'tấn', currency: 'USD/kg' };
const legacy = form(); legacy.set('product_id', productId); legacy.set('unit', 'tấn'); legacy.set('currency', 'USD/kg');
assert.equal((await actions.saveSupplierProductAction(legacy)).ok, true);
assert.equal(product.unit, 'tấn'); assert.equal(product.currency, 'USD/kg');
const legacyPriceChange = form(); legacyPriceChange.set('product_id', productId); legacyPriceChange.set('unit', 'tấn'); legacyPriceChange.set('currency', 'USD/kg'); legacyPriceChange.set('ref_price', '6000');
assert.equal((await actions.saveSupplierProductAction(legacyPriceChange)).ok, false, 'A new price cannot retain nonstandard legacy values');
const normalized = form(); normalized.set('product_id', productId); normalized.set('unit', 'MT'); normalized.set('currency', 'EUR');
assert.equal((await actions.saveSupplierProductAction(normalized)).ok, true);
assert.equal(product.unit, 'MT'); assert.equal(product.currency, 'EUR');
// Case-variant codes such as "Carton", "mt" or "usd" normalize cleanly to canonical trade codes.
product = { ...product, unit: 'Carton', currency: 'usd' };
const caseVariantSave = form(); caseVariantSave.set('product_id', productId); caseVariantSave.set('unit', 'Carton'); caseVariantSave.set('currency', 'usd'); caseVariantSave.set('ref_price', '6200');
assert.equal((await actions.saveSupplierProductAction(caseVariantSave)).ok, true);
assert.equal(product.unit, 'carton'); assert.equal(product.currency, 'USD');
// Missing historical unit and currency are not silently filled when editing other fields.
product = { ...product, ref_price: 5000, unit: null, currency: null };
const missingLegacy = form(); missingLegacy.set('product_id', productId); missingLegacy.set('unit', ''); missingLegacy.set('currency', '');
assert.equal((await actions.saveSupplierProductAction(missingLegacy)).ok, true);
assert.equal(product.unit, null); assert.equal(product.currency, null);
assert.equal((await actions.saveSupplierProductAction(formWithId())).ok, true);

assert.equal(product.raw_material_region, 'Bình Phước và Đắk Lắk', 'Supplier product save persists its own raw material region');
assert.equal(product.input_material_origin, 'Việt Nam và Campuchia', 'Supplier product save persists its own input origin');
assert.equal(product.price_publicly_visible, false, 'Saving an entered price does not expose it');
const forgedAttribute = form(); forgedAttribute.set('product_id', productId); forgedAttribute.set('attribute:grade', 'W999');
assert.equal((await actions.saveSupplierProductAction(forgedAttribute)).ok, false, 'Supplier cannot forge an option in a Vexim category');
const validAttribute = form(); validAttribute.set('product_id', productId);
validAttribute.set('attribute:grade', 'W320'); validAttribute.set('attribute:private', 'unreviewed');
assert.equal((await actions.saveSupplierProductAction(validAttribute)).ok, true);
assert.equal(product.specs.grade, 'W320');
assert.equal(product.specs.private, undefined, 'Unconfigured attributes never persist');
assert.equal(supplier.fob_updated_at, null, 'Ordinary product saves cannot silently record supplier consent');
const optIn = form(); optIn.set('product_id', productId); optIn.set('price_publicly_visible', 'yes');
optIn.set('ref_price_max', '5500');
optIn.set('description_detail', 'Origin and details of this product.');
assert.equal((await actions.saveSupplierProductAction(optIn)).ok, true);
assert.equal(product.ref_price_max, 5500, 'Supplier can save an optional range without changing the publication flow');
assert.equal(product.price_publicly_visible, true); assert.equal(product.description_detail, '<p>Origin and details of this product.</p>');
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
  '@/lib/supplier-portal/product-price-options': priceOptions,
  '@/lib/media/validate': {
    validateUpload: (kind, bytes) => kind === 'image' && bytes[0] === 0xff ? { ok: true, mime: 'image/jpeg' }
      : kind === 'catalogue' && bytes[0] === 0x25 ? { ok: true, mime: 'application/pdf' } : { ok: false },
    extensionFor: (mime) => mime === 'application/pdf' ? 'pdf' : 'jpg',
  },
  '@/lib/media/prepare-supplier-product-image': { prepareSupplierProductImage: async () => ({ main: new Uint8Array([1, 2]), thumb: new Uint8Array([3]), width: 800, height: 600 }) },
  '@/lib/media/readiness': mediaReadiness,
  '@/lib/media/storage': storage,
});
async function postMedia(id = productId) {
  const fd = new FormData(); fd.set('kind', 'image'); fd.set('file', image);
  const response = await upload.POST(new Request(`https://example.com/api/supplier-portal/products/${id}/media`, { method: 'POST', body: fd }), { params: Promise.resolve({ id }) });
  return response.status;
}
assert.equal(await postMedia('ffffffff-ffff-ffff-ffff-ffffffffffff'), 403);
failThumb = true;
assert.equal(await postMedia(), 503, 'A failed derivative write must not create a media record');
assert.equal(files.length, 0); assert.equal(storedBytes, 0, 'Roll back the main image if the thumbnail fails');
failThumb = false;
assert.equal(await postMedia(), 200);
assert.equal(files[0].audience, 'internal'); assert.equal(files[0].status, 'unverified');
assert.match(files[0].storage_path, /\.webp$/); assert.match(files[0].thumb_path, /-thumb\.webp$/);
assert.equal(files[0].mime, 'image/webp'); assert.equal(files[0].width, 800); assert.equal(files[0].height, 600);
assert.equal(files[0].bytes, 2); assert.equal(files[0].created_by, user.id); assert.equal(storedBytes, 2);
const mediaRead = load('../app/api/media/file/[...path]/route.ts', {
  'next/server': { NextResponse: Response },
  '@/lib/db': { getStore: () => ({ getMediaByPath: async () => files[0], getUser: async () => user,
    getSupplier: async () => supplier, getProduct: async () => product }) },
  '@/lib/auth/session': { getSession: async () => ({ uid: user.id, role: 'supplier', email: user.email }) },
  '@/lib/auth/permissions': { hasPermission: () => false },
  '@/lib/media/storage': { getObject: async () => ({ data: new Uint8Array([0xff,0xd8,0xff,0xe0]) }) },
  '@/lib/supplier-portal/policy': { ownsDocumentReview: () => false },
  '@/lib/supplier-portal/onboarding': onboarding,
  '@/lib/supplier-portal/product-price-options': priceOptions,
});
const assetPath = files[0].storage_path;
const mediaParams = { params: Promise.resolve({ path: assetPath.split('/') }) };
assert.equal((await mediaRead.GET(new Request(`https://example.com/api/media/file/${assetPath}`), mediaParams)).status, 200);
const privateThumbPath = files[0].thumb_path;
assert.equal((await mediaRead.GET(new Request(`https://example.com/api/media/file/${privateThumbPath}`),
  { params: Promise.resolve({ path: privateThumbPath.split('/') }) })).status, 200);
files[0].supplier_id = 'foreign';
assert.equal((await mediaRead.GET(new Request(`https://example.com/api/media/file/${assetPath}`), mediaParams)).status, 403);
files[0].supplier_id = supplierId;
const deleteUrl = `https://example.com/api/supplier-portal/products/${productId}/media?media_id=${files[0].id}`;
files[0].created_by = 'staff';
assert.equal((await upload.DELETE(new Request(deleteUrl, { method: 'DELETE' }), { params: Promise.resolve({ id: productId }) })).status, 403);
files[0].created_by = user.id;
assert.equal((await upload.DELETE(new Request(deleteUrl, { method: 'DELETE' }), { params: Promise.resolve({ id: productId }) })).status, 200);
assert.equal(files.length, 0); assert.equal(storedBytes, 0, 'Deleting a draft removes both the image and its thumbnail');
const pdfData = new FormData();
pdfData.set('kind', 'catalogue'); pdfData.set('file', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'catalogue.pdf'));
assert.equal((await upload.POST(new Request(deleteUrl, { method: 'POST', body: pdfData }),
  { params: Promise.resolve({ id: productId }) })).status, 200);
assert.match(files[0].storage_path, /\.pdf$/); assert.equal(files[0].thumb_path, null);
assert.equal(files[0].mime, 'application/pdf'); assert.equal(storedBytes, 1);
assert.equal((await upload.DELETE(new Request(deleteUrl, { method: 'DELETE' }), { params: Promise.resolve({ id: productId }) })).status, 200);
assert.equal(storedBytes, 0);
assert.equal(await postMedia(), 200);
const submitted = new FormData(); submitted.set('product_id', productId);
files[0].created_by = 'staff';
assert.equal((await actions.submitSupplierProductAction(submitted)).ok, false, 'Hidden staff-internal file does not satisfy supplier submission');
files[0].created_by = user.id;
assert.equal((await actions.submitSupplierProductAction(submitted)).ok, true);
assert.equal(product.supplier_review_status, 'pending'); assert.equal(product.ready_for_buyer, false);
assert.ok(product.name_i18n?.en, 'Submitting a product auto-creates its English translation');
assert.equal(notices.length, 1, 'Only submission, not saves, emails staff');
assert.equal(await postMedia(), 409, 'Cannot upload while pending');
const pendingEdit = form(); pendingEdit.set('product_id', productId);
assert.equal((await actions.saveSupplierProductAction(pendingEdit)).ok, false, 'Cannot edit while pending');
let denied = true;
const review = load('../app/crm/products/[slug]/edit/review-actions.ts', {
  'next/cache': { revalidatePath() {} },
  '@/lib/auth/session': { guard: async () => denied ? { message: 'denied' } : null,
    getSession: async () => ({ uid: 'reviewer', email: 'staff@example.com', role: 'reviewer' }) },
  '@/lib/db': { getStore: () => store },
  '@/lib/supplier-portal/notify': { notifySupplierDecision: async (input) => { notices.push([input.decision, input.entityId]); return 'sent'; } },
  '@/lib/crm/badges': { refreshCrmBadges() {} },
  '@/lib/media/readiness': mediaReadiness,
  '@/lib/products/product-description': productDescription,
  '@/lib/public/product-selection': { isTestOnlyProduct: (name) => /^\s*(?:\[\s*)?test\s+only\b/i.test(name) },
  '@/lib/public/supplier-seo': { isSyntheticSupplier: () => false },
  '@/lib/supplier-portal/category-proposals': categoryProposals,
  '@/lib/product-attributes': attributes,
  '@/lib/public/category-assignment': { assignProductCategory: (p) => p.name.includes('Rice') ? categories[1] : categories[0] },
  '@/lib/ai/product-translation-service': { ensureProductEnglishTranslation: async () => ({ status: 'current', product }) },
  '@/lib/ai/translate-content': { productTranslationPatch: (translation, _source, origin) => ({ name_i18n: { en: translation.name }, description_i18n: { en: translation.description }, spec_i18n: { en: translation.spec }, description_detail_i18n: { en: translation.description_detail }, packaging_i18n: { en: translation.packaging }, certifications_i18n: { en: translation.certifications }, translation_meta: { source_hash: 'mock', translated_at: new Date().toISOString(), origin, model: null } }) },
});
const approve = new FormData(); approve.set('product_id', productId); approve.set('decision', 'approved');
assert.equal((await review.decideSupplierProductAction(approve)).ok, false);
denied = false;
assert.equal((await review.decideSupplierProductAction(approve)).ok, false, 'Staff must explicitly pick a category');
approve.set('reviewed_category_slug', 'not-in-catalogue');
assert.equal((await review.decideSupplierProductAction(approve)).ok, false, 'Staff must choose a published category');
approve.set('reviewed_category_slug', 'cashew');
product.name = 'Jasmine Rice';
const internalMediaDecision = await review.decideSupplierProductAction(approve);
assert.equal(internalMediaDecision.ok, false, 'An internal unverified image cannot be published automatically');
assert.match(internalMediaDecision.message, /Đã kiểm tra và Chia sẻ buyer/);
assert.equal(product.supplier_review_status, 'pending'); assert.equal(product.ready_for_buyer, false);
assert.equal(files[0].audience, 'internal'); assert.equal(files[0].status, 'unverified');
files[0].audience = 'buyer';
assert.equal((await review.decideSupplierProductAction(approve)).ok, false, 'Buyer sharing alone does not verify an image');
assert.equal(product.ready_for_buyer, false);
files[0].status = 'checked';
const uncheckedPublicFile = { ...files[0], id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', audience: 'buyer', status: 'unverified', storage_path: 'products/unchecked.jpg' };
files.push(uncheckedPublicFile);
const mixedMediaDecision = await review.decideSupplierProductAction(approve);
assert.equal(mixedMediaDecision.ok, false, 'Every buyer-shared file must be checked');
assert.match(mixedMediaDecision.message, /Còn 1 tệp chia sẻ buyer chưa được xác minh/);
uncheckedPublicFile.audience = 'internal';
assert.equal((await review.decideSupplierProductAction(approve)).ok, true, 'Keyword mismatch is a warning; staff category is final');
assert.equal(uncheckedPublicFile.audience, 'internal'); assert.equal(uncheckedPublicFile.status, 'unverified',
  'Publication never promotes or verifies another internal file');
files.pop();
product.name = 'Cashew W320';
assert.equal(product.supplier_review_status, 'approved'); assert.equal(product.ready_for_buyer, true);
assert.equal(files[0].audience, 'buyer'); assert.equal(files[0].status, 'checked');
assert.equal(notices.at(-1)[0], 'product_approved');
assert.equal(product.supplier_category_proposal, 'cashew');
assert.equal(product.reviewed_category_slug, 'cashew', 'Staff saves the final published category');
// Approved legacy products still need the same explicit media review before retry.
product.ready_for_buyer = false;
files[0].audience = 'internal'; files[0].status = 'unverified';
const retry = new FormData(); retry.set('product_id', productId); retry.set('decision', 'approved');
assert.equal((await review.decideSupplierProductAction(retry)).ok, false, 'Legacy retry cannot bypass the media gate');
assert.equal(product.ready_for_buyer, false);
files[0].audience = 'buyer'; files[0].status = 'checked';
assert.equal((await review.decideSupplierProductAction(retry)).ok, true, 'An approved legacy product can be published after media review');
assert.equal(product.supplier_review_status, 'approved'); assert.equal(product.ready_for_buyer, true);
assert.equal(product.reviewed_category_slug, 'cashew', 'Retry keeps the saved staff category without a form override');
assert.equal(files[0].audience, 'buyer'); assert.equal(files[0].status, 'checked');
assert.equal(notices.at(-1)[0], 'product_approved');
assert.equal(audit.at(-1).action, 'supplier.product_published');
const publishedNoticeCount = notices.length;
assert.equal((await review.decideSupplierProductAction(retry)).ok, false, 'A live product cannot be published twice');
assert.equal(notices.length, publishedNoticeCount, 'Rejected duplicate retry sends no notification');
assert.equal((await upload.DELETE(new Request(deleteUrl, { method: 'DELETE' }), { params: Promise.resolve({ id: productId }) })).status, 409,
  'The last buyer file cannot be removed from a live product');
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
assert.equal(selection.productBelongsToCategory(product, categories[0], categories), true);
assert.equal(selection.productBelongsToCategory(product, categories[1], categories), false,
  'A reviewed product stays in its supplier-selected category');
product.ready_for_buyer = true; // Keep the product live while staff corrects its reviewed category.
const correction = new FormData(); correction.set('product_id', productId); correction.set('reviewed_category_slug', 'rice');
assert.equal((await review.correctSupplierProductCategoryAction(correction)).ok, true, 'Staff can correct the final category within the published catalog');
assert.equal(product.reviewed_category_slug, 'rice');
correction.set('reviewed_category_slug', 'cashew');
assert.equal((await review.correctSupplierProductCategoryAction(correction)).ok, true);
assert.equal(product.reviewed_category_slug, 'cashew'); assert.equal(product.ready_for_buyer, true, 'Staff category correction preserves the live decision');
const revised = form(); revised.set('product_id', productId); revised.set('name', 'Cashew W240');
assert.equal((await actions.saveSupplierProductAction(revised)).ok, true);
assert.equal(product.supplier_review_status, 'approved'); assert.equal(product.ready_for_buyer, true);
assert.equal(product.reviewed_category_slug, 'cashew', 'Approved owner edits keep the staff category decision');
assert.equal(selection.productReviewApproved(product), true, 'Approved owner edits remain public');
assert.equal(selection.productBelongsToCategory(product, categories[0], categories), true,
  'The reviewed category remains attached after an owner edit');
assert.equal(selection.productReviewApproved({ ...product, reviewed_category_slug: null }), false,
  'A supplier-originated product still cannot publish without its reviewed category');
assert.equal(audit.some((a) => a.action === 'supplier.product_approved'), true);
assert.equal(audit.some((a) => a.action === 'supplier.product_published'), true);

// Pricing guardrails on approved products: max 1.35x spread & re-review when price changes.
const wideSpreadEdit = formWithId();
wideSpreadEdit.set('ref_price', '7.0');
wideSpreadEdit.set('ref_price_max', '9.6');
wideSpreadEdit.set('currency', 'USD');
wideSpreadEdit.set('unit', 'kg');
const wideSpreadRes = await actions.saveSupplierProductAction(wideSpreadEdit);
assert.equal(wideSpreadRes.ok, false, 'Price spread exceeding 1.35x must be rejected');
assert.match(wideSpreadRes.message, /1,35/);
assert.equal(product.supplier_review_status, 'approved');

const priceEditOnApproved = formWithId();
priceEditOnApproved.set('ref_price', '7.0');
priceEditOnApproved.set('ref_price_max', '7.8');
priceEditOnApproved.set('currency', 'USD');
priceEditOnApproved.set('unit', 'kg');
const priceEditRes = await actions.saveSupplierProductAction(priceEditOnApproved);
assert.equal(priceEditRes.ok, true, 'Valid <= 1.35x price edit on approved product succeeds and queues price review');
assert.match(priceEditRes.message, /chờ kiểm tra lại giá/);
assert.equal(product.supplier_review_status, 'pending', 'Approved product with edited price enters pending review');
assert.equal(product.ready_for_buyer, false, 'Edited unreviewed price is temporarily withdrawn from public view');
assert.equal(product.reviewed_category_slug, 'cashew', 'Reviewed category is preserved during price re-check');
assert.ok(product.specs?.price_review_summary, 'Price review summary is recorded for CRM staff');
assert.equal(audit.some((a) => a.action === 'supplier.product_price_review_requested'), true);
assert.equal((await review.decideSupplierProductAction(approve)).ok, true, 'Staff can re-approve updated price');
assert.equal(product.supplier_review_status, 'approved');
assert.equal(product.ready_for_buyer, true);
assert.equal(product.specs?.price_review_summary, undefined, 'Price review summary is cleared once staff re-approves');
// Reset to form()'s baseline price (5000 USD/kg) before pause tests so subsequent non-price formWithId() edits stay non-price edits.
product = { ...product, ref_price: 5000, ref_price_max: null, currency: 'USD', unit: 'kg' };

// Pausing is explicit, retains media/history and blocks every public product gate.
const snapshotBeforePause = { ...product };
const fileCountBeforePause = files.length;
assert.equal((await actions.deleteSupplierDraftProductAction(productId)).ok, false, 'A published product cannot be hard-deleted by its supplier');
assert.equal((await actions.pauseSupplierProductAction(productId)).ok, true);
assert.equal(product.supplier_review_status, 'paused'); assert.equal(product.ready_for_buyer, false);
assert.equal(product.reviewed_category_slug, snapshotBeforePause.reviewed_category_slug);
assert.equal(files.length, fileCountBeforePause, 'Pause retains the uploaded media');
assert.equal(selection.productReviewApproved(product), false);
assert.equal(selection.productReviewApproved({ ...product, ready_for_buyer: true }), false, 'Even demo/readiness bypass cannot publish a paused product');
assert.equal(productView.productReview(product), 'paused');
assert.equal(productView.productCanSubmit(product, files), true, 'Paused products can enter the review queue again');
assert.equal((await actions.pauseSupplierProductAction(productId)).ok, false, 'Pause is not a route to re-publish');
assert.equal((await actions.deleteSupplierDraftProductAction(productId)).ok, false, 'Paused products cannot be hard-deleted');
const pausedSave = formWithId(); pausedSave.set('name', 'Cashew W180 revised');
assert.equal((await actions.saveSupplierProductAction(pausedSave)).ok, true);
assert.equal(product.supplier_review_status, 'paused', 'Saving while paused never re-publishes');
assert.equal(product.ready_for_buyer, false); assert.equal(product.reviewed_category_slug, 'cashew');
assert.equal((await actions.submitSupplierProductAction(submitted)).ok, true);
assert.equal(product.supplier_review_status, 'pending'); assert.equal(product.ready_for_buyer, false);
assert.equal((await actions.pauseSupplierProductAction(productId)).ok, false, 'A pending review cannot be paused or overwritten');
assert.equal((await actions.deleteSupplierDraftProductAction(productId)).ok, false, 'A pending review cannot be deleted');
assert.equal((await review.decideSupplierProductAction(approve)).ok, true, 'Staff must explicitly approve a re-submission');
assert.equal(product.supplier_review_status, 'approved'); assert.equal(product.ready_for_buyer, true);

// Legacy staff-created products also get a safe re-review path, without pretending
// that they were originally created by the supplier or letting save make a draft.
product = { ...product, supplier_originated: false, supplier_category_proposal: null, reviewed_category_slug: null, category: 'cashew' };
assert.equal((await actions.saveSupplierProductAction(formWithId())).ok, false, 'Legacy live edits require an explicit pause/review');
assert.equal(product.supplier_review_status, 'approved');
assert.equal((await actions.pauseSupplierProductAction(productId)).ok, true);
assert.equal((await actions.submitSupplierProductAction(submitted)).ok, true, 'Legacy products can resubmit with their valid old category');
assert.equal(product.supplier_category_proposal, 'cashew'); assert.equal(product.supplier_originated, false);
const requestChanges = new FormData(); requestChanges.set('product_id', productId);
requestChanges.set('decision', 'changes_requested'); requestChanges.set('note', 'Bổ sung quy cách.');
assert.equal((await review.decideSupplierProductAction(requestChanges)).ok, true);
assert.equal(product.supplier_review_status, 'changes_requested');
assert.equal((await actions.saveSupplierProductAction(formWithId())).ok, true);
assert.equal(product.supplier_review_status, 'changes_requested', 'Saving a returned listing does not turn it into a deletable draft');
assert.equal(product.supplier_originated, false); assert.equal(product.supplier_review_note, 'Bổ sung quy cách.');
assert.equal((await actions.deleteSupplierDraftProductAction(productId)).ok, false);
assert.equal((await actions.submitSupplierProductAction(submitted)).ok, true);
assert.equal((await review.decideSupplierProductAction(approve)).ok, true);
assert.equal(product.ready_for_buyer, true); assert.equal(product.supplier_originated, false);
assert.equal((await actions.saveSupplierProductAction(formWithId())).ok, true, 'After re-review, legacy product edits retain the reviewed status');
assert.equal(product.supplier_review_status, 'approved'); assert.equal(product.ready_for_buyer, true);
assert.equal(product.supplier_originated, false);

// If another operation changes the state after reading, stale saves/reviews lose CAS.
interfereWithCas = () => { product = { ...product, supplier_review_status: 'paused', ready_for_buyer: false }; };
const staleSave = await actions.saveSupplierProductAction(formWithId());
assert.equal(staleSave.ok, false); assert.match(staleSave.message, /đã thay đổi/);
assert.equal(product.supplier_review_status, 'paused'); assert.equal(product.ready_for_buyer, false);
product = { ...product, supplier_review_status: 'approved', ready_for_buyer: true };
interfereWithCas = () => { product = { ...product, supplier_review_status: 'pending', ready_for_buyer: false }; };
const stalePause = await actions.pauseSupplierProductAction(productId);
assert.equal(stalePause.ok, false); assert.equal(product.supplier_review_status, 'pending');
interfereWithCas = () => { product = { ...product, supplier_review_status: 'paused', ready_for_buyer: false }; };
const staleReview = await review.decideSupplierProductAction(approve);
assert.equal(staleReview.ok, false); assert.equal(product.supplier_review_status, 'paused');

// Media permissions and last-buyer-file guard remain enforced server-side.
product = { ...product, supplier_originated: true, supplier_review_status: 'approved', ready_for_buyer: true };
files[0].created_by = user.id; files[0].audience = 'buyer'; files[0].status = 'checked';
const remove = (id = files[0]?.id, owner = productId) => upload.DELETE(new Request(
  `https://example.com/api/supplier-portal/products/${owner}/media?media_id=${id}`, { method: 'DELETE' }),
  { params: Promise.resolve({ id: owner }) });
product.supplier_review_status = 'pending'; assert.equal((await remove()).status, 409);
product.supplier_review_status = 'approved'; files[0].created_by = 'another-user';
assert.equal((await remove()).status, 403, 'Cannot remove another user\'s upload');
files[0].created_by = user.id; product.supplier_id = 'foreign';
assert.equal((await remove()).status, 403, 'Cannot remove another supplier\'s file');
product.supplier_id = supplierId; product.supplier_originated = false;
assert.equal((await remove()).status, 409, 'Legacy staff-managed media is not supplier-editable');
product.supplier_originated = true;
const lastFile = await remove(); assert.equal(lastFile.status, 409);
assert.match((await lastFile.json()).message, /cuối cùng/, 'The API returns the actual reason, not just HTTP 409');
files.push({ ...files[0], id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  storage_path: `products/${productId}/replacement.webp`, thumb_path: null });
mediaLinked = true;
const linkedFile = await remove(); assert.equal(linkedFile.status, 409); assert.match((await linkedFile.json()).message, /dữ liệu khác/);
mediaLinked = false;
const concurrentDeletes = await Promise.all(files.map((file) => remove(file.id)));
assert.deepEqual(concurrentDeletes.map((response) => response.status).sort(), [200, 409],
  'Two concurrent deletes cannot remove the final buyer file');
assert.equal(files.length, 1);
product.supplier_review_status = 'paused'; product.ready_for_buyer = false;
assert.equal((await remove()).status, 200, 'Paused product can remove its final own file while hidden');
assert.equal(files.length, 0);
files.push({ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', owner_type: 'product', product_id: productId,
  supplier_id: supplierId, created_by: user.id, kind: 'image', audience: 'buyer', status: 'checked',
  storage_path: `products/${productId}/returned.webp`, thumb_path: null });
product.supplier_review_status = 'changes_requested';
assert.equal((await remove()).status, 200, 'The owner can remove an old buyer image while making requested changes');
assert.equal(files.length, 0);
product.supplier_review_status = 'paused';
assert.equal((await actions.submitSupplierProductAction(submitted)).ok, false, 'A hidden product without media cannot be resubmitted');
product = { ...product, supplier_review_status: 'draft', ready_for_buyer: false, reviewed_category_slug: null };
files.push({ id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', owner_type: 'product', product_id: productId,
  supplier_id: supplierId, created_by: user.id, kind: 'image', audience: 'internal', status: 'unverified',
  storage_path: `products/${productId}/cleanup.webp`, thumb_path: null });
failCleanup = true;
const cleanupMediaResponse = await remove();
const cleanupMediaBody = await cleanupMediaResponse.json();
assert.equal(cleanupMediaResponse.status, 200); assert.equal(cleanupMediaBody.warning, true);
assert.match(cleanupMediaBody.message, /chưa dọn/);
assert.ok(audit.at(-1).after.pending_cleanup_paths.includes(`products/${productId}/cleanup.webp`));
failCleanup = false;

// Draft deletion checks ownership, draft-only state, historical links, and cleanup.
const draft = { ...product, supplier_originated: true, supplier_review_status: 'draft', ready_for_buyer: false,
  reviewed_category_slug: null, supplier_category_proposal: 'cashew' };
product = { ...draft, supplier_id: 'foreign' };
assert.equal((await actions.deleteSupplierDraftProductAction(productId)).ok, false);
assert.equal((await actions.pauseSupplierProductAction(productId)).ok, false);
product = { ...draft }; supplier.onboarding_status = 'pending';
assert.equal((await actions.deleteSupplierDraftProductAction(productId)).ok, false, 'Portal approval is required');
supplier.onboarding_status = 'approved';
for (const patch of [
  { supplier_review_status: 'pending' }, { supplier_review_status: 'changes_requested' },
  { supplier_review_status: 'approved' }, { supplier_review_status: 'paused' },
  { supplier_originated: false }, { ready_for_buyer: true }, { reviewed_category_slug: 'cashew' },
]) {
  product = { ...draft, ...patch };
  assert.equal((await actions.deleteSupplierDraftProductAction(productId)).ok, false, `Cannot delete ${JSON.stringify(patch)}`);
  assert.ok(product, 'Denied deletion keeps the product');
}
product = { ...draft }; draftLinked = true;
assert.match((await actions.deleteSupplierDraftProductAction(productId)).message, /dữ liệu liên quan/);
assert.ok(product, 'Linked draft and its history are retained'); draftLinked = false;
const mainPath = `products/${productId}/main.webp`, thumbPath = `products/${productId}/main-thumb.webp`;
files.push({ id: 'draft-media', storage_path: mainPath, thumb_path: thumbPath });
failCleanup = true;
const cleanupFailure = await actions.deleteSupplierDraftProductAction(productId);
assert.equal(cleanupFailure.ok, true); assert.equal(cleanupFailure.warning, true);
assert.equal(product, null, 'Database deletion remains successful even if Storage cleanup fails');
assert.match(cleanupFailure.message, /chưa dọn/);
assert.ok(audit.at(-1).after.pending_cleanup_paths.includes(mainPath), 'Remaining paths are recorded for staff');
failCleanup = false; product = { ...draft };
files.push({ id: 'draft-media', storage_path: mainPath, thumb_path: thumbPath });
const deleted = await actions.deleteSupplierDraftProductAction(productId);
assert.equal(deleted.ok, true); assert.equal(deleted.warning, false); assert.equal(product, null);
assert.ok(deletedPaths.includes(mainPath) && deletedPaths.includes(thumbPath), 'Both original and thumbnail are removed');
product = { ...draft };
files.push({ id: 'draft-media', storage_path: mainPath, thumb_path: 'shared/other.webp' });
externalFiles.push({ storage_path: mainPath });
const protectedCleanup = await actions.deleteSupplierDraftProductAction(productId);
assert.equal(protectedCleanup.warning, true, 'Shared or out-of-scope paths are kept and reported');
assert.ok(audit.at(-1).after.pending_cleanup_paths.includes(mainPath));
assert.ok(audit.at(-1).after.pending_cleanup_paths.includes('shared/other.webp'));
externalFiles.length = 0;

const migration = fs.readFileSync(new URL('../supabase/migrations/20261017_supplier_product_review.sql', import.meta.url), 'utf8');
assert.match(migration, /supplier_review_status/);
assert.match(fs.readFileSync(new URL('../app/public-media/[...path]/route.ts', import.meta.url), 'utf8'), /productReviewApproved\(product\)/);
console.log('✅ Supplier products: own drafts/uploads, approval-to-marketplace and live owner editing.');
