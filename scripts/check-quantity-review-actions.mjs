// node --experimental-strip-types --no-warnings scripts/check-quantity-review-actions.mjs
import { v2Validation } from './quantity-v2-test-utils.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as pricing from '../lib/products/quantity-pricing.ts';
const productId = '22222222-2222-2222-2222-222222222222';
const revisionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const actorId = '33333333-3333-3333-3333-333333333333';
const stamp = '2026-10-29T00:00:00Z';
let session = { uid: actorId, role: 'reviewer', email: 'reviewer@example.com' };
let actor = { id: actorId, role: 'reviewer', email: 'reviewer@example.com', is_active: true };
let product = { id: productId, name: 'Nhân điều', reviewed_category_slug: 'cashew', updated_at: stamp };
let revision = { id: revisionId, product_id: productId, product_updated_at: stamp, status: 'pending', grade: 'W320', incoterm: 'FOB', tiers: [{ minKg: 1000, priceUsdPerKg: 6.4 }, { minKg: 5000, priceUsdPerKg: 6 }], source_name: 'Nhân điều', english_name: 'Cashew kernels' };
let calls = [], audits = [], rpcStatus = null;
const db = {
  from() { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: revision, error: null }) }; return q; },
  async rpc(name, args) { calls.push({ name, args }); return { data: rpcStatus ?? (args.p_approve ? 'approved' : 'rejected'), error: null }; },
};
const mocks = {
  '@/lib/products/quantity-v2-validation': v2Validation,
  'next/cache': { revalidatePath: () => {} }, '@/lib/auth/session': { getSession: async () => session },
  '@/lib/db/supabase': { getSupabaseClient: () => db, supabaseStore: { getUser: async () => actor, getProduct: async () => product,
    getCategoryBySlug: async () => ({ id: 'c', status: 'published', is_published: true }), addAuditLog: async (row) => { audits.push(row); } } },
  '@/lib/products/grade-pricing': { standardGradesForCategory: () => ['W320', 'W240'] },
  '@/lib/products/quantity-price-config': { readQuantityPricingPolicy: async () => ({ ...pricing.DEFAULT_QUANTITY_PRICING_POLICY, gradeBounds: { W320: { minUsdPerKg: 6.1, maxUsdPerKg: 8 } } }) },
  '@/lib/products/quantity-pricing': pricing,
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../app/crm/products/quantity-review/actions.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports, Date, console, require: (key) => { if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; } });
function form(values = {}) { const fd = new FormData(); Object.entries({ product_id: productId, revision_id: revisionId, product_updated_at: stamp, kind: 'price', decision: 'approve', ...values }).forEach(([k, v]) => fd.set(k, v)); return fd; }
let result = await exports.decideQuantityRevisionAction(form());
assert.equal(result.ok, true, 'Price outlier is a warning, reviewer can deliberately approve');
assert.equal(calls[0].name, 'decide_quantity_price_revision');
assert.equal(calls[0].args.p_expected_product_updated_at, stamp);
assert.equal(audits.length, 1);
result = await exports.decideQuantityRevisionAction(form({ kind: 'name' }));
assert.equal(result.ok, true);
assert.equal(calls[1].name, 'decide_product_english_name_revision');
revision = { ...revision, english_name: 'Cashew W320' };
assert.equal((await exports.decideQuantityRevisionAction(form({ kind: 'name' }))).ok, false);
revision = { ...revision, english_name: 'Cashew kernels', product_updated_at: '2026-10-28T00:00:00Z' };
assert.equal((await exports.decideQuantityRevisionAction(form())).ok, false, 'Cannot approve old product version');
assert.equal((await exports.decideQuantityRevisionAction(form({ decision: 'reject' }))).ok, false, 'Reason is mandatory');
result = await exports.decideQuantityRevisionAction(form({ decision: 'reject', note: 'Cần gửi lại' }));
assert.equal(result.ok, true, 'Stale revisions can be rejected');
assert.equal(audits[2].after.note, 'Cần gửi lại');
revision = { ...revision, product_updated_at: stamp };
rpcStatus = 'product_changed';
assert.match((await exports.decideQuantityRevisionAction(form())).message, /đổi/);
rpcStatus = null;
actor = { ...actor, is_active: false };
assert.equal((await exports.decideQuantityRevisionAction(form())).ok, false);
actor = { ...actor, is_active: true, role: 'sale' };
assert.equal((await exports.decideQuantityRevisionAction(form())).ok, false);
session = { ...session, role: 'supplier' };
assert.equal((await exports.decideQuantityRevisionAction(form())).ok, false);
assert.equal(calls.length, 4, 'Unauthorized and invalid actions cannot reach RPC');
console.log('Quantity review: independent price/name decisions, warnings, stale data, audit and permissions passed');
session = { uid: actorId, role: 'reviewer', email: 'reviewer@example.com' };
actor = { id: actorId, role: 'reviewer', email: 'reviewer@example.com', is_active: true };
revision = { ...revision, grade: 'Special', tiers: [{ version: 2, unit: 'bag', customGrade: true, quantityGrams: 270000, unitWeightGrams: 27000, priceCentsPerUnit: 10000 }] };
assert.equal((await exports.decideQuantityRevisionAction(form())).ok, false, 'V2 approval disabled by default');
process.env.VEXIM_QUANTITY_V2_STAGING = 'true'; process.env.VEXIM_QUANTITY_BUYER_PREVIEW = 'true';
assert.equal((await exports.decideQuantityRevisionAction(form())).ok, true);
revision.tiers[0].quantityGrams++;
assert.equal((await exports.decideQuantityRevisionAction(form())).ok, false, 'Malformed persisted V2 is not approved');
revision.tiers[0].quantityGrams--; product = { ...product, name: 'Nhân điều Special' };
assert.equal((await exports.decideQuantityRevisionAction(form())).ok, false, 'Custom grade is forbidden in Vietnamese title');
delete process.env.VEXIM_QUANTITY_V2_STAGING; delete process.env.VEXIM_QUANTITY_BUYER_PREVIEW;
console.log('Reviewer V2 revision: staging gate, revalidation and custom grade title guard passed');
