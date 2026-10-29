// node scripts/check-supplier-product-form-operations.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const create = async () => ({ ok: true, id: 'product', revision: 1 });
const save = async () => ({ ok: true, id: 'product', revision: 2 });
const setImages = async () => ({ ok: true, revision: 3 });
const mocks = {
  '@/app/supplier/portal/product-form-draft-actions': { createProductFormDraftAction: create, saveProductFormDraftAction: save },
  '@/app/supplier/portal/product-form-image-actions': { setProductFormImagesAction: setImages },
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../app/supplier/portal/products/product-form-operations.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, crypto: { randomUUID: () => 'request-id' },
  fetch: async () => { throw Error('Unsafe legacy media endpoint must never be called'); },
  require: (key) => { if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; },
});
const operations = exports.supplierProductFormOperations();
assert.equal(operations.newRequestId(), 'request-id');
assert.equal(operations.create, create); assert.equal(operations.save, save); assert.equal(operations.setImages, setImages);
assert.equal((await operations.submit('product', 1)).ok, false, 'New submission stays disabled until atomic approval is ready');
const file = new File(['x'], 'photo.png', { type: 'image/png' });
assert.equal((await operations.upload('product', 1, file)).ok, false, 'Never publish images through the old approved-product endpoint');
console.log('Supplier form adapter: draft actions and fail-closed unfinished upload/submission passed');
