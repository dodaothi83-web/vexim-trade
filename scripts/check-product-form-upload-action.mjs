// node scripts/check-product-form-upload-action.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const supplier = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', productId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', imageId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const time = '2026-10-29T00:00:00.000Z';
let access = { user: { id: 'user' }, supplier: { id: supplier } }, product = { id: productId, supplier_id: supplier, updated_at: time, supplier_review_status: 'approved' },
  draft = { revision: 2, base_product_updated_at: time, image_selection: [] }, uploads = 0, error = null;
const db = { from() { return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: draft, error }; } }; } };
let stagingAllowed = true;
const mocks = { '@/lib/products/product-form-staging-access': { isProductFormEnabled: () => stagingAllowed }, '@/lib/db/supabase': { getSupabaseClient: () => db, supabaseStore: { getProduct: async () => product } },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => access }, '@/lib/supplier-portal/onboarding': { portalApproved: () => true },
  '@/lib/products/product-form-private-upload': { uploadPrivateProductFormImage: async (input) => { uploads++; return { ok: true, revision: input.expectedRevision + 1,
    image: { id: imageId, source: 'staged', url: '/private' } }; } } };
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../app/supplier/portal/product-form-upload-action.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, Number, Array, File, console: { error() {} }, require: (key) => {
  if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key];
} });
const action = exports.uploadProductFormImageAction;
const form = () => { const f = new FormData(); f.set('product_id', productId); f.set('revision', '2');
  f.set('file', new File([new Uint8Array([1, 2])], 'photo.webp', { type: 'image/webp' })); return f; };
let result = await action(form()); assert.equal(result.ok, true); assert.equal(result.revision, 3); assert.equal(uploads, 1);
access = null; assert.equal((await action(form())).ok, false); assert.equal(uploads, 1); access = { user: { id: 'user' }, supplier: { id: supplier } };
product = { ...product, supplier_id: productId }; assert.equal((await action(form())).ok, false); product.supplier_id = supplier;
draft = { ...draft, revision: 3 }; result = await action(form()); assert.equal(result.requiresReload, true); assert.equal(uploads, 1); draft.revision = 2;
product = { ...product, supplier_review_status: 'pending' }; assert.equal((await action(form())).requiresReload, true); product.supplier_review_status = 'approved';
draft = { ...draft, image_selection: Array.from({ length: 8 }, (_, i) => ({ id: String(i) })) };
assert.match((await action(form())).message, /8 ảnh/); assert.equal(uploads, 1); draft.image_selection = [];
error = new Error('database missing'); assert.equal((await action(form())).requiresReload, true); error = null;
let invalid = form(); invalid.set('revision', '2.0'); assert.equal((await action(invalid)).ok, false);
invalid = form(); invalid.set('file', 'not a file'); assert.equal((await action(invalid)).ok, false);
stagingAllowed = false; assert.equal((await action(form())).ok, false); assert.equal(uploads, 1, 'Production cannot write staging images');
console.log('Private upload action: supplier ownership, state and revision preflight without legacy media endpoint passed');
