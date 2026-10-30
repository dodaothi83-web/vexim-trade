// node --experimental-strip-types --no-warnings scripts/check-new-quantity-product.mjs
import { v2Validation } from './quantity-v2-test-utils.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as pricing from '../lib/products/quantity-pricing.ts';
const supplierId = '55555555-5555-5555-5555-555555555555', productId = '22222222-2222-2222-2222-222222222222';
const category = { id: 'cat', slug: 'cashew', product_fields: [], supplier_product_fields: [], status: 'published', is_published: true };
let supplier = { id: supplierId, fob_publicly_visible: true, fob_updated_at: '2026-10-29' }, user = { id: 'owner', email: 'owner@example.com' };
let strict = true, saved = null, calls = [], failRpc = false, throwAudit = false, names = [], requests = [{ request_id: 'r' }], translations = 0, translationStatus = 'translated', race = false;
const store = {
  getProduct: async () => saved, getCategoryBySlug: async () => category, listCategories: async () => [category],
  updateCategory: async () => {}, addAuditLog: async () => { if (throwAudit) throw Error('audit'); },
  listMedia: async () => [{ kind: 'image', storage_path: 'x', supplier_id: supplierId, created_by: user.id }],
  updateSupplierProductIfState: async (_id, _sid, _expected, patch) => (saved = { ...saved, ...patch }),
};
const db = {
  async rpc(name, args) { calls.push({ name, args }); if (failRpc) return { data: null, error: { message: 'offline' } }; if (name === 'submit_supplier_product_with_quantity_guard') { saved = { ...saved, supplier_review_status: 'pending' }; return { data: { status: 'submitted', product: saved }, error: null }; } saved = { ...args.p_product, id: productId, updated_at: '2026-10-29T00:00:00Z' }; return { data: saved, error: null }; },
  from(table) {
    if (table === 'supplier_products') {
      let patch; const filters = {};
      const q = { update: (value) => { patch = value; return q; }, eq: (key, value) => { filters[key] = value; return q; }, select: () => q,
        maybeSingle: async () => {
          if (race) saved = { ...saved, supplier_review_status: 'approved', ready_for_buyer: true, name_i18n: { en: 'Staff reviewed' }, updated_at: 'staff-version' };
          if (Object.entries(filters).some(([key, value]) => saved[key] !== value)) return { data: null, error: null };
          saved = { ...saved, ...patch }; return { data: saved, error: null };
        } };
      return q;
    }
    const q = { select: () => q, eq: () => q, in: () => q, limit: async () => ({ data: table === 'quantity_product_creation_requests' ? requests : names, error: null }) }; return q;
  },
};
const grade = { hasProductPricingChanged: () => false, standardGradesForCategory: () => ['W320', 'W240'], parseLeadTimeInput: () => ({ ok: true, value: null, unit: 'on_request', daysEquivalent: null }), applyLeadTimeToSpecs: (x) => x };
const mocks = {
  '@/lib/products/quantity-v2-validation': v2Validation,
  'next/cache': { revalidatePath() {} },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async (which) => which && !strict ? null : ({ supplier, user, store }) },
  '@/lib/supplier-portal/onboarding': { portalApproved: () => true },
  '@/lib/supplier-portal/product-price-options': { isSupplierPriceCurrency: () => true, isSupplierPriceUnit: () => true, normalizeSupplierPriceCurrency: (s) => s, normalizeSupplierPriceUnit: (s) => s },
  '@/lib/public/product-selection': { supplierPriceConsentCurrent: (s) => !!s.fob_publicly_visible },
  '@/lib/supplier-portal/category-proposals': { categoryProposalOptions: (c) => c, parseProductCategoryProposal: (f) => f.get('supplier_category_proposal') },
  '@/lib/product-attributes': { attributesFromForm: () => ({}), mergeSupplierAttributePool: () => [], sanitizeSupplierAttributePool: () => [], saveProductAttributes: () => ({}), supplierAttributePoolSignature: () => '' },
  '@/lib/supplier-portal/notify': { notifyStaffProductSubmission: async () => 'sent' },
  '@/lib/products/product-description': { sanitizeProductDescriptionForSave: (v) => v },
  '@/lib/products/grade-pricing': grade,
  '@/lib/ai/product-translation-service': { ensureProductEnglishTranslation: async (_store, _id, _actor, _source, options) => {
    translations++; assert.ok(options.forbiddenGrades.includes('W320'));
    if (translationStatus !== 'translated') return { status: translationStatus, product: saved };
    const updated = await options.saveIfUnchanged(saved, { name_i18n: { en: 'Cashew kernels' }, translation_meta: { origin: 'ai' } });
    return { status: updated ? 'translated' : 'failed', product: updated || saved };
  } },
  '@/lib/db/supabase': { getSupabaseClient: () => db, supabaseStore: store },
  '@/lib/products/quantity-price-config': { readQuantityPricingPolicy: async () => ({ ...pricing.DEFAULT_QUANTITY_PRICING_POLICY, gradeBounds: { W320: { minUsdPerKg: 5, maxUsdPerKg: 6 } } }) },
  '@/lib/products/quantity-pricing': pricing,
  '@/lib/media/storage': { deleteObject() {} },
};
const exports = {};
const source = ts.transpileModule(readFileSync(new URL('../app/supplier/portal/product-actions.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(source, { exports, console, Date, FormData, require: (id) => { if (!(id in mocks)) throw Error(`Unexpected ${id}`); return mocks[id]; } });
function form(changes = {}) {
  const f = new FormData();
  for (const [k,v] of Object.entries({ name: 'Nhân điều', spec: 'Quy cách', supplier_category_proposal: 'cashew', price_publicly_visible: 'yes', confirm_quantity_price_consent: 'yes', quantity_creation_request_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', quantity_grade: 'W320', quantity_incoterm: 'FOB', quantity_name_en: 'Cashew kernels', quantity_tiers_json: JSON.stringify([{ minKg: '1000', priceUsdPerKg: '6.40' }, { minKg: '5000', priceUsdPerKg: '6.00' }]), ...changes })) f.set(k, v);
  return f;
}
for (const changes of [
  { quantity_grade: 'W999' }, { quantity_incoterm: '' }, { name: 'Nhân điều W320' },
  { confirm_quantity_price_consent: '' }, { quantity_creation_request_id: 'bad' }, { grade_rows_json: '[]' },
  { quantity_tiers_json: JSON.stringify([{ minKg: '5000', priceUsdPerKg: '6' }, { minKg: '1000', priceUsdPerKg: '7' }]) },
  { quantity_currency: 'VND' }, { quantity_currency: 'EUR' },
]) { assert.equal((await exports.saveSupplierProductAction(form(changes))).ok, false); assert.equal(calls.length, 0); }
strict = false;
assert.equal((await exports.saveSupplierProductAction(form())).ok, false); strict = true;
supplier.fob_publicly_visible = false;
assert.equal((await exports.saveSupplierProductAction(form())).ok, false, 'Supplier consent cannot be bypassed');
supplier.fob_publicly_visible = true;
failRpc = true;
assert.equal((await exports.saveSupplierProductAction(form())).ok, false, 'RPC failure is not reported as success');
failRpc = false; calls = [];
const result = await exports.saveSupplierProductAction(form({ ref_price: '7', ref_price_max: '8', unit: 'kg', currency: 'USD', price_valid_until: '2030-01-01' }));
assert.equal(result.ok, true); assert.equal(result.id, productId); assert.equal(calls.length, 1);
assert.equal(calls[0].name, 'create_supplier_product_with_quantity');
assert.equal(calls[0].args.p_product.ref_price, null); assert.equal(calls[0].args.p_product.price_valid_until, null);
assert.equal(calls[0].args.p_tiers[0].minKg, 1000); assert.equal(calls[0].args.p_english_name, null, 'Old English payload is ignored');
assert.ok(calls[0].args.p_warnings.length, 'Price outside grade bounds is a warning, not a block');
names = [{ id: 'name-revision' }];
const f = new FormData(); f.set('product_id', productId);
assert.equal((await exports.submitSupplierProductAction(f)).ok, true);
assert.equal(translations, 0, 'Supplier-provided name bypasses AI during submission');
saved = { ...saved, supplier_review_status: 'draft' }; names = [];
const withoutName = await exports.submitSupplierProductAction(f);
assert.equal(withoutName.ok, true); assert.equal(translations, 1, 'New quantity product invokes AI on submission');
assert.equal(saved.name_i18n.en, 'Cashew kernels');
for (const failure of ['unconfigured', 'failed']) {
  saved = { ...saved, supplier_review_status: 'draft', name_i18n: null, translation_meta: null }; translationStatus = failure;
  const response = await exports.submitSupplierProductAction(f);
  assert.equal(response.ok, true); assert.match(response.message, /Chưa tự dịch được/); assert.equal(saved.name_i18n, null);
}
translationStatus = 'translated'; race = true;
saved = { ...saved, supplier_review_status: 'draft', name_i18n: null, translation_meta: null };
const racing = await exports.submitSupplierProductAction(f);
assert.equal(racing.ok, true); assert.match(racing.message, /Chưa tự dịch được/);
assert.equal(saved.name_i18n.en, 'Staff reviewed', 'AI cannot overwrite a concurrent review');
race = false;
saved = { ...saved, supplier_review_status: 'draft', ready_for_buyer: false, reviewed_category_slug: null, name_i18n: { en: 'Staff approved' }, translation_meta: { origin: 'staff' } };
const beforeStaff = translations;
assert.equal((await exports.submitSupplierProductAction(f)).ok, true);
assert.equal(translations, beforeStaff, 'Staff translation is protected'); assert.equal(saved.name_i18n.en, 'Staff approved');
saved = { ...saved, supplier_review_status: 'paused', ready_for_buyer: false, reviewed_category_slug: null, name_i18n: null, translation_meta: null };
assert.equal((await exports.submitSupplierProductAction(f)).ok, true);
assert.equal(translations, beforeStaff, 'Potentially published paused products are never automatically overwritten');
const count = translations;
saved = { ...saved, supplier_review_status: 'approved', ready_for_buyer: true, supplier_originated: true, reviewed_category_slug: 'cashew', name: 'Nhân điều', name_i18n: { en: 'Old approved name' }, ref_price: 7, ref_price_max: 8, unit: 'MT', currency: 'USD', incoterm: 'FOB', moq: 'Container', price_valid_until: '2030-01-01', specs: { grade_rows: [{ grade: 'W320', price_min: 7 }], grade: 'W320' } };
const edit = form({ product_id: productId, name: 'Nhân điều mới', ref_price: '99', grade_rows_json: '[]', unit: 'kg', price_valid_until: '2000-01-01' });
assert.equal((await exports.saveSupplierProductAction(edit)).ok, false, 'Old cached forms are rejected rather than silently losing a legacy price edit');
edit.delete('grade_rows_json');
assert.equal((await exports.saveSupplierProductAction(edit)).ok, true);
assert.equal(saved.ref_price, 7, 'Editing product cannot alter legacy buyer price');
assert.equal(saved.unit, 'MT'); assert.equal(saved.moq, 'Container'); assert.equal(saved.price_valid_until, '2030-01-01');
assert.equal(saved.specs.grade_rows[0].price_min, 7); assert.equal(saved.specs.grade, 'W320');
assert.equal(saved.name_i18n.en, 'Old approved name', 'Approved English name is not overwritten during a normal edit');
assert.equal(translations, count);
assert.equal((await exports.saveSupplierProductAction(form({ product_id: productId, name: 'Nhân điều W320' }))).ok, false, 'Changing the name cannot add grade');
console.log('New quantity product: server validation, strict ownership, consent, atomic RPC, AI trigger, guarded writes and preserved legacy buyer price passed');
saved = null; calls = [];
const v2input = { quantity_version: '2', quantity_grade: 'Special', quantity_unit: 'mt', quantity_custom_grade: 'yes', incoterm_place: 'Hồ Chí Minh', quantity_tiers_json: JSON.stringify([{ quantity: '100', price: '75.00' }]) };
assert.equal((await exports.saveSupplierProductAction(form(v2input))).ok, false); assert.equal(calls.length, 0);
process.env.VEXIM_QUANTITY_V2_STAGING = 'true'; process.env.VEXIM_QUANTITY_BUYER_PREVIEW = 'true';
assert.equal((await exports.saveSupplierProductAction(form({ ...v2input, incoterm_place: '' }))).ok, false, 'A v2 offer requires an Incoterm place on the server');
assert.equal(calls.length, 0);
assert.equal((await exports.saveSupplierProductAction(form(v2input))).ok, true);
assert.equal(calls[0].args.p_tiers[0].version, 2); assert.equal(calls[0].args.p_tiers[0].quantityGrams, 100000000);
assert.equal(calls[0].args.p_tiers[0].priceCentsPerUnit, 7500); assert.equal(calls[0].args.p_english_name, null);
delete process.env.VEXIM_QUANTITY_V2_STAGING; delete process.env.VEXIM_QUANTITY_BUYER_PREVIEW;
console.log('New V2 product: staged gate and atomic creation with MT prices passed');
