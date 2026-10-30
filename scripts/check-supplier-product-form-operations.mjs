// node scripts/check-supplier-product-form-operations.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const create = async () => ({ ok: true, id: 'product', revision: 1 });
const save = async () => ({ ok: true, id: 'product', revision: 2 });
const setImages = async () => ({ ok: true, revision: 3 });
const snapshotImages = async () => ({ ok: true, revision: 2, replaced: 0, replacements: [] });
const availability = async () => ({ ok: true });
const submit = async () => ({ ok: true, message: 'Synthetic submitted' });
let uploaded = null;
const upload = async (form) => { uploaded = form; return { ok: true, revision: 2, image: { id: 'private', source: 'staged', url: '/private' } }; };
const mocks = {
  '@/app/supplier/portal/product-form-name-translation-action': { translateSupplierProductNameAction: async () => ({ ok: false }) },
  '@/app/supplier/portal/product-form-draft-actions': { createProductFormDraftAction: create, saveProductFormDraftAction: save },
  '@/app/supplier/portal/product-form-image-actions': { setProductFormImagesAction: setImages },
  '@/app/supplier/portal/product-form-upload-action': { uploadProductFormImageAction: upload },
  '@/app/supplier/portal/product-form-snapshot-action': { snapshotProductFormImagesAction: snapshotImages },
  '@/app/supplier/portal/product-form-submit-action': { productFormSubmitAvailabilityAction: availability, submitProductFormDraftAction: submit },
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
assert.equal(operations.snapshotImages, snapshotImages);
assert.equal(operations.prepareSubmit, availability); assert.equal(operations.submit, submit);
assert.equal((await operations.prepareSubmit()).ok, true); assert.equal((await operations.submit('product', 1)).ok, true);
const file = new File(['x'], 'photo.png', { type: 'image/png' });
assert.equal((await operations.upload('product', 1, file)).ok, true);
assert.equal(uploaded.get('product_id'), 'product'); assert.equal(uploaded.get('revision'), '1'); assert.equal(uploaded.get('file'), file);
console.log('Supplier form adapter: private upload, draft and guarded submission actions wired');
