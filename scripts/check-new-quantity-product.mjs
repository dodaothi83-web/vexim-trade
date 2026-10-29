// node --experimental-strip-types --no-warnings scripts/check-new-quantity-product.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as pricing from '../lib/products/quantity-pricing.ts';
const supplierId = '55555555-5555-5555-5555-555555555555', productId = '22222222-2222-2222-2222-222222222222';
const category = { id: 'cat', slug: 'cashew', product_fields: [], supplier_product_fields: [], status: 'published', is_published: true };
let supplier = { id: supplierId, fob_publicly_visible: true, fob_updated_at: '2026-10-29' }, user = { id: 'owner', email: 'owner@example.com' };
let strict = true, saved = null, calls = [], failRpc = false, throwAudit = false, names = [], requests = [{ request_id: 'r' }], translations = 0;
const store = {
  getProduct: async () => saved, getCategoryBySlug: async () => category, listCategories: async () => [category],
  updateCategory: async () => {}, addAuditLog: async () => { if (throwAudit) throw Error('audit'); },
  listMedia: async () => [{ kind: 'image', storage_path: 'x', supplier_id: supplierId, created_by: user.id }],
  updateSupplierProductIfState: async (_id, _sid, _expected, patch) => (saved = { ...saved, ...patch }),
};
const db = {
  async rpc(name, args) { calls.push({ name, args }); if (failRpc) return { data: null, error: { message: 'offline' } }; if (name === 'submit_supplier_product_with_quantity_guard') { saved = { ...saved, supplier_review_status: 'pending' }; return { data: { status: 'submitted', product: saved }, error: null }; } saved = { ...args.p_product, id: productId, updated_at: '2026-10-29T00:00:00Z' }; return { data: saved, error: null }; },
  from(table) { const q = { select: () => q, eq: () => q, in: () => q, limit: async () => ({ data: table === 'quantity_product_creation_requests' ? requests : names, error: null }) }; return q; },
};
const grade = { hasProductPricingChanged: () => false, standardGradesForCategory: () => ['W320', 'W240'], parseLeadTimeInput: () => ({ ok: true, value: null, unit: 'on_request', daysEquivalent: null }), applyLeadTimeToSpecs: (x) => x };
const mocks = {
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
  '@/lib/ai/product-translation-service': { ensureProductEnglishTranslation: async () => { translations++; } },
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
  { quantity_grade: 'W999' }, { quantity_incoterm: '' }, { name: 'Nhân điều W320' }, { quantity_name_en: 'Cashew W320' },
  { confirm_quantity_price_consent: '' }, { quantity_creation_request_id: 'bad' }, { grade_rows_json: '[]' },
  { quantity_tiers_json: JSON.stringify([{ minKg: '5000', priceUsdPerKg: '6' }, { minKg: '1000', priceUsdPerKg: '7' }]) },
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
assert.equal(calls[0].args.p_tiers[0].minKg, 1000); assert.equal(calls[0].args.p_english_name, 'Cashew kernels');
assert.ok(calls[0].args.p_warnings.length, 'Price outside grade bounds is a warning, not a block');
names = [{ id: 'name-revision' }];
const f = new FormData(); f.set('product_id', productId);
assert.equal((await exports.submitSupplierProductAction(f)).ok, true);
assert.equal(translations, 0, 'Supplier-provided name bypasses AI during submission');
saved = { ...saved, supplier_review_status: 'draft' }; names = [];
const withoutName = await exports.submitSupplierProductAction(f);
assert.equal(withoutName.ok, true); assert.match(withoutName.message, /bản dịch tự động.*chưa hoàn tất/i);
assert.equal(translations, 0, 'New quantity product never writes an unreviewed AI name into the live product');
saved = { ...saved, supplier_review_status: 'approved', ready_for_buyer: true, supplier_originated: true, reviewed_category_slug: 'cashew', name: 'Nhân điều', name_i18n: { en: 'Old approved name' }, ref_price: 7, ref_price_max: 8, unit: 'MT', currency: 'USD', incoterm: 'FOB', moq: 'Container', price_valid_until: '2030-01-01', specs: { grade_rows: [{ grade: 'W320', price_min: 7 }], grade: 'W320' } };
const edit = form({ product_id: productId, name: 'Nhân điều mới', ref_price: '99', grade_rows_json: '[]', unit: 'kg', price_valid_until: '2000-01-01' });
assert.equal((await exports.saveSupplierProductAction(edit)).ok, false, 'Old cached forms are rejected rather than silently losing a legacy price edit');
edit.delete('grade_rows_json');
assert.equal((await exports.saveSupplierProductAction(edit)).ok, true);
assert.equal(saved.ref_price, 7, 'Editing product cannot alter legacy buyer price');
assert.equal(saved.unit, 'MT'); assert.equal(saved.moq, 'Container'); assert.equal(saved.price_valid_until, '2030-01-01');
assert.equal(saved.specs.grade_rows[0].price_min, 7); assert.equal(saved.specs.grade, 'W320');
assert.equal(saved.name_i18n.en, 'Old approved name', 'Approved English name is not overwritten during a normal edit');
assert.equal(translations, 0);
assert.equal((await exports.saveSupplierProductAction(form({ product_id: productId, name: 'Nhân điều W320' }))).ok, false, 'Changing the name cannot add grade');
console.log('New quantity product: server validation, strict ownership, consent, atomic RPC, preserved legacy buyer price and supplied name passed');
