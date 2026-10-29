// node scripts/check-product-form-snapshot-images.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const supplier = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', product = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const first = 'dddddddd-dddd-dddd-dddd-dddddddddddd', second = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', stagedId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const time = '2026-10-29T00:00:00.000Z';
const assets = [first, second].map((id) => ({ id, owner_type: 'product', product_id: product, supplier_id: supplier, kind: 'image',
  audience: 'buyer', created_by: 'another', status: 'unverified', expires_on: null, caption: 'Photo',
  storage_path: `products/${product}/${id}.webp`, thumb_path: null }));
let productTime = time, selection = assets.map((a) => ({ id: a.id, source: 'media' })), collision = false, stagedCollision = false,
  failAt = -1, throwUpload = false, mutateBytes = false, reads = 0, calls = [];
const store = { async getProduct(id) { return { id, supplier_id: supplier, supplier_review_status: 'approved', updated_at: productTime }; },
  async getMedia(id) { const asset = assets.find((a) => a.id === id); return asset ? { ...asset } : null; } };
const db = { rpc: async () => ({ data: null, error: null }), from(table) { return { select() { return this; }, eq() { return this; },
  async maybeSingle() { return { data: { revision: 1, base_product_updated_at: time, image_selection: selection }, error: null }; },
  async or(filter) { const asset = assets.find((a) => filter.includes(a.storage_path)); return { data: table === 'media_assets' ?
    (collision ? [{ id: asset.id }, { id: 'another' }] : [{ id: asset.id }]) : (stagedCollision ? [{ id: 'staged' }] : []), error: null }; } }; } };
const mocks = { 'server-only': {}, 'node:crypto': { createHash }, '@/lib/media/readiness': { isExpired: (asset) => asset.status === 'expired' },
  '@/lib/media/storage': { getObject: async (path) => { calls.push(['read', path]); reads++; return { data: new Uint8Array(mutateBytes && reads % 2 === 0 ? [3, 2, 1] : [1, 2, 3]) }; } },
  '@/lib/products/product-form-private-upload': { uploadPrivateProductFormImage: async (input) => {
    calls.push(['upload', input.productId, input.expectedRevision, input.replaceMedia]);
    if (throwUpload) throw Error('unknown');
    if (calls.filter((c) => c[0] === 'upload').length - 1 === failAt) return { ok: false, message: 'Lỗi tải' };
    return { ok: true, revision: input.expectedRevision + 1, image: { source: 'staged', id: stagedId, url: '/private' } };
  } } };
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/products/product-form-snapshot-images.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, Number, Array, Set, RegExp, JSON, Uint8Array, File, Promise, console: { error() {} }, require: (key) => {
  if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key];
} });
const snapshot = exports.snapshotSelectedProductImages;
const input = { db, store, supplierId: supplier, productId: product, userId: 'user', expectedRevision: 1, imageIds: [first, second] };
let result = await snapshot(input); assert.equal(result.ok, true); assert.equal(result.replaced, 2); assert.equal(result.revision, 3);
assert.deepEqual(Array.from(result.replacements, (r) => r.mediaId), [first, second]);
const uploads = calls.filter((c) => c[0] === 'upload'); assert.deepEqual(uploads.map((c) => c[2]), [1, 2]);
assert.deepEqual(uploads.map((c) => c[3].id), [first, second]); assert.ok(calls.every((c) => c[0] !== 'delete'));
calls = []; selection = [{ id: first, source: 'media' }]; assert.equal((await snapshot(input)).requiresReload, true); assert.equal(calls.length, 0);
selection = assets.map((a) => ({ id: a.id, source: 'media' }));
collision = true; assert.equal((await snapshot(input)).ok, false); collision = false;
stagedCollision = true; assert.equal((await snapshot(input)).ok, false); stagedCollision = false;
assets[0].audience = 'staff'; assert.equal((await snapshot(input)).ok, false); assets[0].audience = 'buyer';
assets[0].storage_path = 'other/path.jpg'; assert.equal((await snapshot(input)).ok, false); assets[0].storage_path = `products/${product}/${first}.webp`;
productTime = '2026-10-30T00:00:00.000Z'; assert.equal((await snapshot(input)).requiresReload, true); productTime = time;
calls = []; reads = 0; mutateBytes = true; result = await snapshot(input); assert.equal(result.requiresReload, true); assert.equal(calls.filter((c) => c[0] === 'upload').length, 0); mutateBytes = false;
calls = []; failAt = 1; result = await snapshot(input); assert.equal(result.ok, false); assert.equal(result.replaced, 1); assert.equal(result.requiresReload, true);
calls = []; failAt = -1; throwUpload = true; result = await snapshot(input); assert.equal(result.requiresReload, true); assert.equal(result.replaced, 0);
assert.equal((await snapshot({ ...input, imageIds: [first, first] })).ok, false);
console.log('Existing image snapshots: selection, ownership, source stability, private replacements and partial failure passed');
