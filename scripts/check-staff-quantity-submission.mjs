// node --experimental-strip-types --no-warnings scripts/check-staff-quantity-submission.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as pricing from '../lib/products/quantity-pricing.ts';
const id = '22222222-2222-2222-2222-222222222222';
const supplier = '55555555-5555-5555-5555-555555555555';
const revision = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
let product = { id, supplier_id: supplier, name: 'Nhân điều', supplier_review_status: 'approved', reviewed_category_slug: 'cashew', updated_at: '2026-10-29T00:00:00Z', price_publicly_visible: true };
let actor = { id: '11111111-1111-1111-1111-111111111111', role: 'admin', is_active: true, email: 'staff@example.com' };
let session = { uid: actor.id, role: 'admin', email: actor.email };
let calls = [], audits = [], status = 'pending';
const category = { id: '33333333-3333-3333-3333-333333333333', slug: 'cashew', status: 'published', is_published: true };
const store = { getUser: async () => actor, getProduct: async () => product, getCategoryBySlug: async () => category, addAuditLog: async (value) => { audits.push(value); } };
const db = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { status, revision_id: revision }, error: null }; } };
const mocks = {
  'next/cache': { revalidatePath: () => {} },
  '@/lib/auth/session': { getSession: async () => session },
  '@/lib/auth/permissions': { hasPermission: (role, permission) => role === 'admin' && permission === 'products.manage' },
  '@/lib/db/supabase': { getSupabaseClient: () => db, supabaseStore: store },
  '@/lib/products/grade-pricing': { standardGradesForCategory: () => ['W320', 'W240'] },
  '@/lib/products/quantity-price-config': { readQuantityPricingPolicy: async () => ({ ...pricing.DEFAULT_QUANTITY_PRICING_POLICY, gradeBounds: { W320: { minUsdPerKg: 6.1, maxUsdPerKg: 8 } } }) },
  '@/lib/products/quantity-pricing': pricing,
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../app/crm/products/quantity-review/submit-actions.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports, console, require: (key) => { if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; } });
function form(values = {}) {
  const fd = new FormData();
  Object.entries({ product_id: id, expected_product_updated_at: product.updated_at, grade: 'W320', incoterm: 'FOB', confirm_quantity_price_consent: 'yes', quantity_tiers_json: JSON.stringify([{ minKg: '1000', priceUsdPerKg: '6.40' }, { minKg: '5000', priceUsdPerKg: '6.00' }]), ...values }).forEach(([key, value]) => fd.set(key, value));
  return fd;
}
let result = await exports.submitStaffQuantityPriceAction(form());
assert.equal(result.ok, true);
assert.equal(calls.length, 1);
assert.equal(calls[0].args.p_supplier_id, supplier, 'Supplier ID comes from the product, not the client');
assert.equal(calls[0].args.p_tiers[0].priceUsdPerKg, 6.4);
assert.equal(calls[0].args.p_warnings.length, 1, 'Outliers go to review');
assert.equal(audits[0].action, 'staff.quantity_price_revision_submitted');
assert.equal(audits[0].after.supplier_confirmation_attested, true);
for (const bad of [{ confirm_quantity_price_consent: '' }, { grade: 'OTHER' }, { expected_price_revision_id: 'bad' },
  { quantity_tiers_json: 'bad' }, { expected_product_updated_at: '2000-01-01T00:00:00Z' },
  { quantity_tiers_json: JSON.stringify([{ minKg: '1', priceUsdPerKg: '5' }, { minKg: '2', priceUsdPerKg: '6' }]) }]) {
  assert.equal((await exports.submitStaffQuantityPriceAction(form(bad))).ok, false);
}
assert.equal(calls.length, 1);
session = { ...session, role: 'supplier' };
assert.equal((await exports.submitStaffQuantityPriceAction(form())).ok, false);
session = { uid: actor.id, role: 'admin', email: actor.email };
actor = { ...actor, is_active: false };
assert.equal((await exports.submitStaffQuantityPriceAction(form())).ok, false);
actor = { ...actor, is_active: true };
product = { ...product, supplier_review_status: 'pending' };
assert.equal((await exports.submitStaffQuantityPriceAction(form())).ok, false);
product = { ...product, supplier_review_status: 'approved' };
status = 'product_changed';
assert.equal((await exports.submitStaffQuantityPriceAction(form())).ok, false);
assert.equal(calls.length, 2);
console.log('Staff quantity submission: RBAC, active actor, consent attestation, validation, pending version and audit passed');
