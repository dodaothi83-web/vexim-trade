// node scripts/check-product-form-snapshot-action.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const supplier = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', productId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', imageId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
let access = { user: { id: 'user' }, supplier: { id: supplier } }, product = { id: productId, supplier_id: supplier }, approved = true, copies = 0, throwing = false;
const store = { getProduct: async () => product };
let stagingAllowed = true;
const mocks = { '@/lib/products/product-form-staging-access': { isProductFormEnabled: () => stagingAllowed }, '@/lib/db/supabase': { getSupabaseClient: () => ({}), supabaseStore: store },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => access }, '@/lib/supplier-portal/onboarding': { portalApproved: () => approved },
  '@/lib/products/product-form-snapshot-images': { snapshotSelectedProductImages: async (input) => { copies++; if (throwing) throw Error('unknown');
    assert.equal(input.supplierId, supplier); assert.equal(input.userId, 'user'); return { ok: true, revision: input.expectedRevision + 1, replaced: 1, replacements: [] }; } } };
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../app/supplier/portal/product-form-snapshot-action.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, Number, Array, console: { error() {} }, require: (key) => { if (!(key in mocks)) throw Error(key); return mocks[key]; } });
const action = exports.snapshotProductFormImagesAction;
assert.equal((await action(productId, 1, [imageId])).ok, true); assert.equal(copies, 1);
access = null; assert.equal((await action(productId, 1, [imageId])).ok, false); access = { user: { id: 'user' }, supplier: { id: supplier } };
approved = false; assert.equal((await action(productId, 1, [imageId])).ok, false); approved = true;
product = { ...product, supplier_id: productId }; assert.equal((await action(productId, 1, [imageId])).ok, false); product.supplier_id = supplier;
assert.equal((await action('bad', 1, [imageId])).ok, false); assert.equal((await action(productId, 0, [imageId])).ok, false);
assert.equal((await action(productId, 1, ['bad'])).ok, false); assert.equal(copies, 1);
throwing = true; const result = await action(productId, 1, [imageId]); assert.equal(result.requiresReload, true);
stagingAllowed = false; const beforeCopies = copies; assert.equal((await action(productId, 1, [imageId])).ok, false);
assert.equal(copies, beforeCopies, 'Production cannot snapshot private images');
console.log('Snapshot action: supplier authentication, ownership, input checks and ambiguous failures passed');
