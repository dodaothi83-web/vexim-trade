// node --experimental-strip-types --no-warnings scripts/check-quantity-revision-actions.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as pricing from '../lib/products/quantity-pricing.ts';
const id = '22222222-2222-2222-2222-222222222222';
const supplier = '55555555-5555-5555-5555-555555555555';
const revision = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
let product = { id, supplier_id: supplier, name: 'Nhân điều', supplier_review_status: 'approved', reviewed_category_slug: 'cashew', updated_at: '2026-10-29T00:00:00Z', price_publicly_visible: true };
let active = true, calls = [], audits = [], status = 'pending';
const category = { id: '11111111-1111-1111-1111-111111111111', slug: 'cashew', status: 'published', is_published: true };
const store = { getProduct: async () => product, getCategoryBySlug: async () => category, addAuditLog: async (value) => { audits.push(value); } };
const db = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { status, revision_id: revision }, error: null }; } };
const mocks = {
  'next/cache': { revalidatePath: () => {} },
  '@/lib/db/supabase': { getSupabaseClient: () => db, supabaseStore: store },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async (given) => { assert.equal(given, store, 'Always authenticate against the strict store'); return active ? { supplier: { id: supplier }, user: { id: 'staff-id', email: 'supplier@example.com' }, store } : null; } },
  '@/lib/supplier-portal/onboarding': { portalApproved: () => true },
  '@/lib/products/grade-pricing': { standardGradesForCategory: () => ['W320', 'W240'] },
  '@/lib/products/quantity-price-config': { readQuantityPricingPolicy: async () => ({ ...pricing.DEFAULT_QUANTITY_PRICING_POLICY, gradeBounds: { W320: { minUsdPerKg: 6.1, maxUsdPerKg: 8 } } }) },
  '@/lib/products/quantity-pricing': pricing,
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../app/supplier/portal/quantity-revision-actions.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports, console, require: (key) => { if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; } });
function form(values = {}) {
  const fd = new FormData();
  Object.entries({ product_id: id, expected_product_updated_at: '2026-10-29T00:00:00Z', grade: 'W320', incoterm: 'FOB', name_en: 'Cashew kernels', confirm_quantity_price_consent: 'yes', quantity_tiers_json: JSON.stringify([{ minKg: '1000', priceUsdPerKg: '6.40' }, { minKg: '5000', priceUsdPerKg: '6.00' }]), ...values }).forEach(([key, value]) => fd.set(key, value));
  return fd;
}
let result = await exports.submitQuantityPriceRevisionAction(form());
assert.equal(result.ok, true);
assert.equal(result.revisionId, revision);
assert.equal(result.warnings.length, 1, 'Outlier is saved for review, not rejected');
assert.equal(calls[0].args.p_expected_product_updated_at, product.updated_at);
assert.equal(calls[0].args.p_supplier_id, supplier);
assert.equal(calls[0].args.p_tiers[0].priceUsdPerKg, 6.4);
assert.equal(audits.length, 1);
for (const bad of [
  { confirm_quantity_price_consent: '' }, { grade: 'OTHER' }, { quantity_tiers_json: 'not json' }, { expected_product_updated_at: '2000-01-01T00:00:00Z' },
  { quantity_tiers_json: JSON.stringify([{ minKg: '1', priceUsdPerKg: '5' }, { minKg: '2', priceUsdPerKg: '6' }]) },
  { expected_price_revision_id: 'invalid' }, { name_en: 'Cashew W320' },
]) assert.equal((await exports.submitQuantityPriceRevisionAction(form(bad))).ok, false);
assert.equal(calls.length, 1, 'Invalid input and missing consent never reach RPC');
result = await exports.submitEnglishNameRevisionAction(form());
assert.equal(result.ok, true);
assert.equal(calls[1].args.p_origin, 'supplier');
assert.equal((await exports.submitEnglishNameRevisionAction(form({ name_en: 'Cashew W240' }))).ok, false);
assert.equal(calls.length, 2);
status = 'product_changed';
result = await exports.submitQuantityPriceRevisionAction(form());
assert.equal(result.ok, false);
assert.match(result.message, /tải lại/);
status = 'pending';
active = false;
assert.equal((await exports.submitQuantityPriceRevisionAction(form())).ok, false);
active = true;
product = { ...product, supplier_id: '99999999-9999-9999-9999-999999999999' };
assert.equal((await exports.submitQuantityPriceRevisionAction(form())).ok, false);
assert.equal(calls.length, 3, 'Unauthorized submissions never reach RPC');
console.log('Quantity revision actions: strict ownership, server validation, consent, warnings and stale data passed');
