// node --experimental-strip-types --no-warnings scripts/check-product-form-draft-actions.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const supplier = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const productId = '11111111-1111-1111-1111-111111111111';
const requestId = '22222222-2222-2222-2222-222222222222';
let access = { supplier: { id: supplier }, user: { id: 'supplier-user' } }, approved = true;
const time = '2026-10-29T00:00:00.000Z';
let product = { id: productId, supplier_id: supplier, updated_at: time }, row = null, pendingRows = [], failure = null, rpcCalls = [], readCalls = [];
let rpcData = { status: 'saved', product_id: productId, revision: 1 };
const db = {
  rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: rpcData, error: failure }; },
  from: (table) => { const filters = {}; return { select() { return this; }, eq(key, value) { filters[key] = value; return this; },
    async limit() { readCalls.push({ table, filters }); return { data: table === 'product_form_submissions' ? pendingRows : [], error: failure }; },
    async maybeSingle() { readCalls.push({ table, filters }); return { data: row, error: failure }; } }; },
};
let stagingAllowed = true;
const mocks = { '@/lib/products/product-form-staging-access': { isProductFormEnabled: () => stagingAllowed },
  'next/cache': { revalidatePath() {} },
  '@/lib/db/supabase': { getSupabaseClient: () => db, supabaseStore: { getProduct: async () => product, listMedia: async () => [] } },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => access },
  '@/lib/supplier-portal/onboarding': { portalApproved: () => approved },
  '@/lib/products/product-form-model': { parseProductFormDraft: (value) => value?.valid ? value : null,
    productFormDraftStructureError: (value) => value?.valid ? null : 'Dữ liệu bản nháp không hợp lệ.' },
  '@/lib/products/product-description': { sanitizeProductDescriptionForSave: (value) => value?.includes('<script') ? '' : (value ?? '') },
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
rpcData = { status: 'product_changed' }; result = await save(productId, 1, input);
assert.equal(result.ok, false); assert.match(result.message, /Sản phẩm gốc đã thay đổi/);
rpcData = { status: 'save_unavailable' }; result = await save(productId, 1, input);
assert.equal(result.ok, false); assert.match(result.message, /cấu hình lưu an toàn/);
rpcData = { status: 'saved', product_id: productId, revision: 2 };
assert.equal((await save(productId, 1, input)).revision, 2);
assert.equal(rpcCalls.at(-1).name, 'save_product_form_draft_checked');
product = { id: productId, supplier_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' };
assert.equal((await load(productId)).ok, false); assert.equal(readCalls.length, 0, 'Never read another supplier draft');
product = { id: productId, supplier_id: supplier, updated_at: time };
result = await load(productId); assert.equal(result.revision, 0); assert.equal(result.draft, null); assert.equal(result.pending, false);
assert.equal(readCalls[0].filters.product_id, productId); assert.equal(readCalls[0].filters.supplier_id, supplier);
const pendingQuery = readCalls.find((call) => call.table === 'product_form_submissions');
assert.equal(pendingQuery.filters.product_id, productId); assert.equal(pendingQuery.filters.supplier_id, supplier); assert.equal(pendingQuery.filters.status, 'pending');
pendingRows = [{ id: 'pending' }]; assert.equal((await load(productId)).pending, true);
pendingRows = [{ id: 'one' }, { id: 'two' }]; assert.equal((await load(productId)).ok, false, 'Duplicate pending submissions fail closed'); pendingRows = [];
row = { revision: 2, payload: input, image_selection: [], base_product_updated_at: time }; result = await load(productId);
assert.equal(result.revision, 2); assert.equal(result.draft, input); assert.equal(result.stale, false);
product = { ...product, updated_at: '2026-10-29T00:00:01.000Z' };
assert.equal((await load(productId)).stale, true, 'Changed product leaves a newer private draft visible but blocked');
product = { ...product, supplier_review_status: 'pending' };
pendingRows = [{ id:'pending',draft_revision:2,base_product_updated_at:time,submitted_product_updated_at:product.updated_at }];
assert.equal((await load(productId)).stale, false, 'The expected first-submission transition is not a stale baseline');
pendingRows = []; product = { ...product, updated_at: time };
row = { revision: 2, payload: {}, image_selection: [], base_product_updated_at:time }; assert.equal((await load(productId)).ok, false, 'Malformed stored payload fails closed');
row = { revision: 2, payload: { ...input, descriptionDetail: '<script>alert(1)</script>' }, image_selection: [], base_product_updated_at:time };
assert.equal((await load(productId)).ok, false, 'Unsafe persisted HTML is rejected on load as well as save');
stagingAllowed = false; const priorCalls = rpcCalls.length; assert.equal((await create(requestId, input)).ok, false);
assert.equal(rpcCalls.length, priorCalls, 'Production never reaches private draft RPC');
console.log('Product form draft actions: authorization, idempotent creation, CAS and private reads passed');
