// node --experimental-strip-types --no-warnings scripts/check-product-form-draft-actions.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const supplier = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const productId = '11111111-1111-1111-1111-111111111111';
const requestId = '22222222-2222-2222-2222-222222222222';
let access = { supplier: { id: supplier }, user: { id: 'supplier-user' } }, approved = true;
let product = { id: productId, supplier_id: supplier }, row = null, failure = null, rpcCalls = [], readCalls = [];
let rpcData = { status: 'saved', product_id: productId, revision: 1 };
const db = {
  rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: rpcData, error: failure }; },
  from: (table) => { const filters = {}; return { select() { return this; }, eq(key, value) { filters[key] = value; return this; },
    async limit() { readCalls.push({ table, filters }); return { data: [], error: failure }; },
    async maybeSingle() { readCalls.push({ table, filters }); return { data: row, error: failure }; } }; },
};
const mocks = {
  'next/cache': { revalidatePath() {} },
  '@/lib/db/supabase': { getSupabaseClient: () => db, supabaseStore: { getProduct: async () => product, listMedia: async () => [] } },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => access },
  '@/lib/supplier-portal/onboarding': { portalApproved: () => approved },
  '@/lib/products/product-form-model': { parseProductFormDraft: (value) => value?.valid ? value : null },
  '@/lib/products/product-description': { sanitizeProductDescriptionForSave: (value) => value ?? '' },
  '@/lib/products/product-form-image-selection': { resolveSupplierDraftImages: ({ selection }) => Array.isArray(selection) ? { selected: [], available: [] } : null },
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../app/supplier/portal/product-form-draft-actions.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, console, Number, require: (key) => {
  if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key];
} });
const { createProductFormDraftAction: create, saveProductFormDraftAction: save, loadProductFormDraftAction: load } = exports;
const input = { valid: true, name: '', tiers: [], descriptionDetail: '' };
assert.equal((await create('bad', input)).ok, false);
assert.equal((await create(requestId, {})).ok, false); assert.equal(rpcCalls.length, 0);
access = null; assert.equal((await create(requestId, input)).ok, false); assert.equal(rpcCalls.length, 0);
access = { supplier: { id: supplier }, user: { id: 'supplier-user' } }; approved = false;
assert.equal((await create(requestId, input)).ok, false); approved = true;
let result = await create(requestId, input); assert.equal(result.ok, true); assert.equal(result.id, productId);
assert.equal(rpcCalls[0].name, 'create_product_form_draft'); assert.equal(rpcCalls[0].args.p_supplier_id, supplier);
assert.equal(rpcCalls[0].args.p_request_id, requestId); assert.equal(JSON.stringify(rpcCalls[0].args.p_payload), JSON.stringify(input));
assert.equal((await save(productId, -1, input)).ok, false);
rpcData = { status: 'changed' }; result = await save(productId, 1, input);
assert.equal(result.ok, false); assert.match(result.message, /thay đổi/); assert.equal(rpcCalls.at(-1).args.p_expected_revision, 1);
rpcData = { status: 'saved', product_id: productId, revision: 2 };
assert.equal((await save(productId, 1, input)).revision, 2);
product = { id: productId, supplier_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' };
assert.equal((await load(productId)).ok, false); assert.equal(readCalls.length, 0, 'Never read another supplier draft');
product = { id: productId, supplier_id: supplier };
result = await load(productId); assert.equal(result.revision, 0); assert.equal(result.draft, null);
assert.equal(readCalls[0].filters.product_id, productId); assert.equal(readCalls[0].filters.supplier_id, supplier);
row = { revision: 2, payload: input, image_selection: [] }; result = await load(productId); assert.equal(result.revision, 2); assert.equal(result.draft, input);
row = { revision: 2, payload: {}, image_selection: [] }; assert.equal((await load(productId)).ok, false, 'Malformed stored payload fails closed');
console.log('Product form draft actions: authorization, idempotent creation, CAS and private reads passed');
