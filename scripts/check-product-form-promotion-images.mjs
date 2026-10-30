// node scripts/check-product-form-promotion-images.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const productId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', supplierId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ids = ['cccccccc-cccc-cccc-cccc-cccccccccccc', 'dddddddd-dddd-dddd-dddd-dddddddddddd'];
const copyIds = ['eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'ffffffff-ffff-ffff-ffff-ffffffffffff'];
const hash = (data) => createHash('sha256').update(data).digest('hex');
const bytes = [new Uint8Array([1,2,3]), new Uint8Array([4,5])];
let objects, writes, nextId, ready, failWrite, changedRead;
function reset() {
  objects = new Map(); writes = []; nextId = 0; ready = true; failWrite = -1; changedRead = null;
  ids.forEach((id) => { objects.set(`product-form-images/${productId}/${id}.webp`, bytes[0]); objects.set(`product-form-images/${productId}/${id}-thumb.webp`, bytes[1]); });
}
reset();
const storage = {
  async getObject(path) { if (changedRead?.(path)) return { data: new Uint8Array([99]) }; const data = objects.get(path); return data ? { data } : null; },
  async putNewObject(path, data, mime) { writes.push(path); assert.equal(mime, 'image/webp'); if (writes.length === failWrite) throw Error('unknown outcome');
    if (objects.has(path)) throw Error('collision'); objects.set(path, new Uint8Array(data)); },
};
const db = { rpc: async (name) => { assert.equal(name, 'product_form_image_namespace_ready'); return { data: ready, error: null }; } };
function load(path, mocks) {
  const exports = {}, code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Uint8Array, Number, Array, Set, structuredClone, console: { error() {} }, require: (key) => {
    if (!(key in mocks)) throw Error(key); return mocks[key];
  } }); return exports;
}
const selection = load('../lib/products/product-form-image-selection.ts', { '@/lib/media/readiness': {}, '@/lib/supplier-portal/product-view': {} });
const verify = load('../lib/products/product-form-review-images.ts', { 'server-only': {}, 'node:crypto': { createHash },
  '@/lib/media/storage': storage, '@/lib/products/product-form-image-selection': selection });
const promote = load('../lib/products/product-form-promotion-images.ts', { 'server-only': {}, 'node:crypto': { createHash, randomUUID: () => copyIds[nextId++] },
  '@/lib/media/storage': storage, '@/lib/products/product-form-image-selection': selection, '@/lib/products/product-form-review-images': verify }).preparePublicationImages;
const verifyCopies = load('../lib/products/product-form-publication-image-verification.ts', { 'server-only': {}, 'node:crypto': { createHash },
  '@/lib/media/storage': storage, '@/lib/products/product-form-image-selection': selection }).verifyPublicationImageCopies;
const refs = ids.map((id) => ({ source: 'staged', id }));
const snapshot = ids.map((id) => ({ source: 'staged', row: { id, product_id: productId, supplier_id: supplierId, mime: 'image/webp',
  storage_path: `product-form-images/${productId}/${id}.webp`, thumb_path: `product-form-images/${productId}/${id}-thumb.webp`,
  bytes: bytes[0].length, thumb_bytes: bytes[1].length, sha256: hash(bytes[0]), thumb_sha256: hash(bytes[1]), caption: 'Ảnh', width: 500, height: 300 } }));
const input = { db, productId, supplierId, selection: refs, snapshot };
let result = await promote(input); assert.equal(result.ok, true);
assert.deepEqual(Array.from(result.images, (x) => x.stagedId), ids); assert.deepEqual(Array.from(result.images, (x) => x.mediaId), copyIds);
assert.equal(writes.length, 4); assert.equal(objects.size, 8, 'Source and copies both exist; nothing deleted');
assert.equal(result.images[0].sha256, hash(bytes[0])); assert.equal(result.images[0].thumbSha256, hash(bytes[1]));
const copyInput = { ...input, images: result.images };
assert.equal(await verifyCopies(copyInput), true);
assert.equal(await verifyCopies({ ...copyInput, supplierId: productId }), false);
assert.equal(await verifyCopies({ ...copyInput, selection: [...refs].reverse() }), false);
assert.equal(await verifyCopies({ ...copyInput, images: result.images.map((x, i) => i ? x : { ...x, storagePath: snapshot[0].row.storage_path }) }), false);
assert.equal(await verifyCopies({ ...copyInput, images: [result.images[0], { ...result.images[1], mediaId: result.images[0].mediaId }] }), false);
objects.set(result.images[0].thumbPath, new Uint8Array([99]));
assert.equal(await verifyCopies(copyInput), false, 'Mutation of a prepared copy must be detected before approval');
reset(); ready = false; result = await promote(input); assert.equal(result.ok, false); assert.equal(writes.length, 0);
reset(); result = await promote({ ...input, selection: [{ source: 'media', id: ids[0] }] }); assert.equal(result.ok, false); assert.equal(writes.length, 0);
reset(); const wrong = structuredClone(snapshot); wrong[0].row.sha256 = '0'.repeat(64);
result = await promote({ ...input, snapshot: wrong }); assert.equal(result.ok, false); assert.equal(writes.length, 0);
reset(); let reads = 0; changedRead = (path) => path === snapshot[0].row.storage_path && ++reads === 2;
result = await promote(input); assert.equal(result.ok, false); assert.equal(writes.length, 0, 'Changed source is not copied');
reset(); failWrite = 2; result = await promote(input); assert.equal(result.ok, false); assert.equal(result.requiresReload, true);
assert.equal(objects.get(snapshot[0].row.storage_path), bytes[0], 'Uncertain copy never deletes or rewrites the source');
reset(); const malformed = structuredClone(snapshot); malformed[1].row.width = 999999;
result = await promote({ ...input, snapshot: malformed }); assert.equal(result.ok, false); assert.equal(result.requiresReload, false); assert.equal(writes.length, 0, 'Validate all metadata before creating any copies');
console.log('Publication image preparation: separate exclusive copies, source and destination hashes, no deletes, uncertain writes fail closed');
