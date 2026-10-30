// node scripts/check-product-form-review-images.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path, mocks) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Number, Array, Object, Set, console, require: (key) => {
    if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key];
  } });
  return exports;
}
const { parseDraftImageSelection } = load('../lib/products/product-form-image-selection.ts', {
  '@/lib/media/readiness': {}, '@/lib/supplier-portal/product-view': {},
});
const product = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', supplier = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const main = new Uint8Array([1, 2]), thumb = new Uint8Array([3]);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const path = `product-form-images/${product}/${id}.webp`, thumbPath = `product-form-images/${product}/${id}-thumb.webp`;
let objects = new Map([[path, main], [thumbPath, thumb]]), calls = [];
const { verifyStagedReviewImages: verify } = load('../lib/products/product-form-review-images.ts', {
  'server-only': {}, 'node:crypto': { createHash },
  '@/lib/products/product-form-image-selection': { parseDraftImageSelection },
  '@/lib/media/storage': { getObject: async (key) => { calls.push(key); const data = objects.get(key); return data ? { data, driver: 'supabase' } : null; } },
});
const selection = [{ source: 'staged', id }];
const row = { id, product_id: product, supplier_id: supplier, mime: 'image/webp', storage_path: path, thumb_path: thumbPath,
  bytes: 2, sha256: sha(main), thumb_bytes: 1, thumb_sha256: sha(thumb) };
const input = { productId: product, supplierId: supplier, selection, snapshot: [{ source: 'staged', row }] };
assert.equal((await verify(input)).ok, true); assert.deepEqual(calls, [path, thumbPath]);
calls = []; assert.equal((await verify({ ...input, selection: [...selection, ...selection] })).reason, 'invalid_snapshot'); assert.equal(calls.length, 0);
assert.equal((await verify({ ...input, snapshot: [{ source: 'staged', row: { ...row, product_id: supplier } }] })).reason, 'invalid_snapshot');
assert.equal((await verify({ ...input, snapshot: [{ source: 'staged', row: { ...row, storage_path: '../other' } }] })).reason, 'invalid_snapshot');
assert.equal((await verify({ ...input, selection: [{ source: 'media', id }], snapshot: [{ source: 'media', row }] })).reason, 'existing_media_unverified');
objects.set(path, new Uint8Array([2, 1])); assert.equal((await verify(input)).reason, 'image_changed');
objects.set(path, main); objects.delete(thumbPath); assert.equal((await verify(input)).reason, 'image_unavailable');
objects.set(thumbPath, new Uint8Array([3, 4])); assert.equal((await verify(input)).reason, 'image_changed');
console.log('Review image checks: bound snapshots, SHA-256, sizes, missing files and unverified existing media passed');
