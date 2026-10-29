// node scripts/check-product-form-private-upload.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const supplier = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const product = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const imageId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
let calls = [], failPut = -1, invalid = false, rpcResponse = { status: 'created', image_id: imageId, revision: 2 }, rpcError = null;
const db = { rpc: async (name, params) => { calls.push(['rpc', name, params]); if (rpcError) throw rpcError; return { data: rpcResponse, error: null }; } };
const mocks = {
  'server-only': {}, 'node:crypto': { createHash, randomUUID: () => imageId },
  '@/lib/media/validate': { validateUpload: () => invalid ? { ok: false, message: 'Ảnh sai định dạng.' } : { ok: true } },
  '@/lib/media/prepare-supplier-product-image': { prepareSupplierProductImage: async () => ({ main: new Uint8Array([1, 2]), thumb: new Uint8Array([3]), width: 500, height: 400 }) },
  '@/lib/media/storage': { putNewObject: async (...args) => { const n = calls.filter((x) => x[0] === 'put').length; calls.push(['put', ...args]); if (n === failPut) throw Error('unknown result'); } },
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/products/product-form-private-upload.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, Number, Uint8Array, File, console: { error() {} }, require: (key) => {
  if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key];
} });
const upload = exports.uploadPrivateProductFormImage;
const file = new File([new Uint8Array([1, 2, 3])], 'ảnh.png', { type: 'image/png' });
const input = { db, supplierId: supplier, productId: product.toUpperCase(), userId: 'user-1', expectedRevision: 1, file };
assert.equal((await upload({ ...input, productId: 'bad' })).ok, false); assert.equal(calls.length, 0);
invalid = true; assert.equal((await upload(input)).message, 'Ảnh sai định dạng.'); assert.equal(calls.length, 0); invalid = false;
let result = await upload(input); assert.equal(result.ok, true); assert.equal(result.revision, 2); assert.equal(result.image.source, 'staged');
assert.equal(calls[0][1], `product-form-images/${product}/${imageId}.webp`); assert.equal(calls[1][1], `product-form-images/${product}/${imageId}-thumb.webp`);
assert.equal(calls[2][1], 'stage_product_form_image'); assert.equal(calls[2][2].p_product_id, product);
assert.equal(calls[2][2].p_sha256, createHash('sha256').update(new Uint8Array([1, 2])).digest('hex'));
assert.equal(calls[2][2].p_thumb_sha256, createHash('sha256').update(new Uint8Array([3])).digest('hex')); assert.equal(calls[2][2].p_thumb_bytes, 1);
assert.equal(result.image.url, `/api/product-form/images/${product}/${imageId}`);
const original = { id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', product_id: product, supplier_id: supplier, caption: 'Original' };
calls = []; result = await upload({ ...input, replaceMedia: original }); assert.equal(result.ok, true);
assert.equal(calls[2][2].p_replaces_media_id, original.id); assert.equal(calls[2][2].p_expected_media, original);
calls = []; result = await upload({ ...input, replaceMedia: { ...original, supplier_id: product } });
assert.equal(result.ok, false); assert.equal(calls.length, 0, 'Never write on wrong source ownership');
calls = []; failPut = 1; result = await upload(input);
assert.equal(result.ok, false); assert.equal(result.requiresReload, true); assert.equal(calls.some((x) => x[0] === 'rpc'), false);
assert.deepEqual(calls.map((x) => x[0]), ['put', 'put'], 'No delete on uncertain storage results');
failPut = -1; calls = []; rpcError = Error('timeout'); result = await upload(input);
assert.equal(result.requiresReload, true); assert.deepEqual(calls.map((x) => x[0]), ['put', 'put', 'rpc'], 'No delete after ambiguous database result');
rpcError = null; calls = []; rpcResponse = { status: 'changed' }; result = await upload(input); assert.equal(result.requiresReload, true);
rpcResponse = { status: 'image_limit' }; result = await upload(input); assert.equal(result.ok, false); assert.match(result.message, /8/);
rpcResponse = { status: 'created', image_id: imageId, revision: 99 }; result = await upload(input); assert.equal(result.requiresReload, true);
console.log('Private image upload: exclusive paths, validation, exact revision and fail-safe uncertainty passed');
