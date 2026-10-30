// node scripts/check-product-form-image-actions.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const supplier = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const productId = '11111111-1111-1111-1111-111111111111';
const imageId = '22222222-2222-2222-2222-222222222222';
let access = { supplier: { id: supplier }, user: { id: 'user-1' } }, product = { supplier_id: supplier }, calls = [],
  response = { data: { status: 'saved', revision: 2 }, error: null };
const db = { rpc: async (name, args) => { calls.push({ name, args }); return response; } };
let stagingAllowed = true;
const mocks = { '@/lib/products/product-form-staging-access': { isProductFormEnabled: () => stagingAllowed },
  '@/lib/db/supabase': { getSupabaseClient: () => db, supabaseStore: { getProduct: async () => product } },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => access },
  '@/lib/supplier-portal/onboarding': { portalApproved: () => true },
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../app/supplier/portal/product-form-image-actions.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, Number, console: { error() {} }, require: (key) => {
  if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key];
} });
const set = exports.setProductFormImagesAction;
const image = { source: 'media', id: imageId };
assert.equal((await set('bad', 1, [image])).ok, false);
assert.equal((await set(productId, 1, [image, image])).ok, false);
assert.equal((await set(productId, 1, [{ ...image, hidden: true }])).ok, false);
assert.equal((await set(productId, 1, Array(9).fill(image))).ok, false);
assert.equal(calls.length, 0);
access = null; assert.equal((await set(productId, 1, [image])).ok, false);
access = { supplier: { id: supplier }, user: { id: 'user-1' } }; product = { supplier_id: 'other' };
assert.equal((await set(productId, 1, [image])).ok, false); assert.equal(calls.length, 0);
product = { supplier_id: supplier }; let result = await set(productId, 1, [image]);
assert.equal(result.ok, true); assert.equal(result.revision, 2); assert.equal(calls[0].name, 'set_product_form_images');
assert.equal(calls[0].args.p_staff, false); assert.equal(calls[0].args.p_user_id, 'user-1');
response = { data: { status: 'changed' }, error: null }; result = await set(productId, 1, [image]);
assert.equal(result.ok, false); assert.equal(result.requiresReload, true);
response = { data: null, error: Error('timeout') }; result = await set(productId, 1, [image]);
assert.equal(result.ok, false); assert.equal(result.requiresReload, true);
stagingAllowed = false; const oldCalls = calls.length; assert.equal((await set(productId, 1, [image])).ok, false);
assert.equal(calls.length, oldCalls, 'Production never reaches private image RPC');
console.log('Private image selection action: supplier authorization, strict input, CAS and uncertain outcomes passed');
