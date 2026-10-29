// node scripts/check-supplier-product-form-operations.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let fetchArgs, response = { ok: true, json: async () => ({ ok: true, image: { id: 'image-id', url: '/api/media/file/products/id/photo.webp' } }) };
const create = async () => ({ ok: true, id: 'product', revision: 1 });
const save = async () => ({ ok: true, id: 'product', revision: 2 });
const submit = async () => ({ ok: true, message: 'sent', submissionId: 'id', warnings: [] });
const mocks = {
  '@/app/supplier/portal/product-form-draft-actions': { createProductFormDraftAction: create, saveProductFormDraftAction: save },
  '@/app/supplier/portal/product-form-submit-action': { submitProductFormDraftAction: submit },
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../app/supplier/portal/products/product-form-operations.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, FormData, crypto: { randomUUID: () => 'request-id' }, encodeURIComponent,
  fetch: async (...args) => { fetchArgs = args; return response; },
  require: (key) => { if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; },
});
const operations = exports.supplierProductFormOperations();
assert.equal(operations.newRequestId(), 'request-id');
assert.equal(operations.create, create); assert.equal(operations.save, save); assert.equal(operations.submit, submit);
const file = new File(['x'], 'photo.png', { type: 'image/png' });
let result = await operations.upload('abc', file); assert.equal(result.ok, true); assert.equal(result.image.id, 'image-id');
assert.equal(fetchArgs[0], '/api/supplier-portal/products/abc/media'); assert.equal(fetchArgs[1].method, 'POST');
assert.equal(fetchArgs[1].body.get('kind'), 'image'); assert.equal(fetchArgs[1].body.get('file').name, 'photo.png');
response = { ok: false, json: async () => ({ ok: false, message: 'Tối đa 8 ảnh' }) };
result = await operations.upload('abc', file); assert.equal(result.ok, false); assert.equal(result.message, 'Tối đa 8 ảnh');
response = { ok: false, status: 503, json: async () => ({ ok: false, message: 'Server error' }) };
result = await operations.upload('abc', file); assert.equal(result.ok, false); assert.equal(result.requiresReload, true);
response = { ok: true, json: async () => ({ ok: true, image: { id: 'x', url: 'https://example.com/x' } }) };
assert.equal((await operations.upload('abc', file)).ok, false, 'Only relative authenticated media URLs are accepted');
response = { ok: true, json: async () => { throw Error('not JSON'); } };
assert.equal((await operations.upload('abc', file)).ok, false);
console.log('Supplier form adapter: server actions, relative media paths and invalid upload responses passed');
