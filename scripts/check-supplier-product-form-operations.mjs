// node scripts/check-supplier-product-form-operations.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const create = async () => ({ ok: true, id: 'product', revision: 1 });
const save = async () => ({ ok: true, id: 'product', revision: 2 });
const setImages = async () => ({ ok: true, revision: 3 });
let uploaded = null;
const upload = async (form) => { uploaded = form; return { ok: true, revision: 2, image: { id: 'private', source: 'staged', url: '/private' } }; };
const mocks = {
  '@/app/supplier/portal/product-form-draft-actions': { createProductFormDraftAction: create, saveProductFormDraftAction: save },
  '@/app/supplier/portal/product-form-image-actions': { setProductFormImagesAction: setImages },
  '@/app/supplier/portal/product-form-upload-action': { uploadProductFormImageAction: upload },
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../app/supplier/portal/products/product-form-operations.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, FormData, crypto: { randomUUID: () => 'request-id' },
  fetch: async () => { throw Error('Unsafe legacy media endpoint must never be called'); },
  require: (key) => { if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; },
});
const operations = exports.supplierProductFormOperations();
assert.equal(operations.newRequestId(), 'request-id');
assert.equal(operations.create, create); assert.equal(operations.save, save); assert.equal(operations.setImages, setImages);
assert.equal((await operations.submit('product', 1)).ok, false, 'New submission stays disabled until atomic approval is ready');
const file = new File(['x'], 'photo.png', { type: 'image/png' });
assert.equal((await operations.upload('product', 1, file)).ok, true);
assert.equal(uploaded.get('product_id'), 'product'); assert.equal(uploaded.get('revision'), '1'); assert.equal(uploaded.get('file'), file);
console.log('Supplier form adapter: private upload action and draft actions wired, submission remains blocked');
