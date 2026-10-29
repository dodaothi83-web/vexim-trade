// node scripts/check-product-form-clone-images.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const supplier = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', source = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', dest = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const first = 'dddddddd-dddd-dddd-dddd-dddddddddddd', second = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', stagedId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const sourceTime = '2026-10-29T00:00:00.000Z';
const assets = [first, second].map((id, index) => ({ id, owner_type: 'product', product_id: source, supplier_id: supplier, kind: 'image',
  audience: 'buyer', created_by: 'some-user', status: 'unverified', expires_on: null, caption: `Photo ${index + 1}`,
  storage_path: `products/${source}/${id}.webp`, thumb_path: null, updated_at: sourceTime }));
let productVersion = sourceTime, targetStatus = 'draft', selection = [], collision = false, stagedCollision = false, failUploadAt = -1, throwUpload = false;
let calls = [], reads = 0, mutateSource = false, mutateBytes = false;
const store = { async getProduct(id) { return id === source ? { id, supplier_id: supplier, updated_at: productVersion } :
  { id, supplier_id: supplier, supplier_review_status: targetStatus, supplier_originated: true }; },
  async getMedia(id) { const found = assets.find((asset) => asset.id === id); return found ? { ...found } : null; } };
const db = { rpc: async () => ({ data: null, error: null }), from(table) { return { select() { return this; }, eq() { return this; },
  async maybeSingle() { return { data: { revision: 1, image_selection: selection }, error: null }; },
  async or(filter) { const match = assets.find((a) => filter.includes(a.storage_path));
    return { data: table === 'media_assets' ? collision ? [{ id: match.id }, { id: 'other' }] : [{ id: match.id }] : stagedCollision ? [{ id: 'staged' }] : [], error: null }; } }; } };
const mocks = { 'server-only': {}, 'node:crypto': { createHash }, '@/lib/media/readiness': { isExpired: (asset) => asset.status === 'expired' },
  '@/lib/media/storage': { getObject: async (path) => { calls.push(['read', path]); reads++; if (mutateSource && reads === 1) productVersion = '2026-10-30T00:00:00.000Z';
    return { data: new Uint8Array(mutateBytes && reads > 2 ? [3, 2, 1] : [1, 2, 3]), driver: 'supabase' }; } },
  '@/lib/products/product-form-private-upload': { uploadPrivateProductFormImage: async (input) => {
    calls.push(['upload', input.productId, input.expectedRevision, input.file.name]);
    if (throwUpload) throw Error('unknown');
    if (calls.filter((x) => x[0] === 'upload').length - 1 === failUploadAt) return { ok: false, message: 'Lỗi tải', requiresReload: false };
    return { ok: true, revision: input.expectedRevision + 1, image: { source: 'staged', id: stagedId, url: '/private' } };
  } } };
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/products/product-form-clone-images.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, Number, Array, Set, RegExp, Date, JSON, Uint8Array, File, Promise, console: { error() {} }, require: (key) => {
  if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key];
} });
const copy = exports.copyImagesToNewProductDraft;
const input = { db, store, supplierId: supplier, sourceProductId: source, destinationProductId: dest, sourceUpdatedAt: sourceTime,
  userId: 'user', staff: false, expectedRevision: 1, sourceImageIds: [first, second] };
let result = await copy(input); assert.equal(result.ok, true); assert.equal(result.uploaded, 2); assert.equal(result.revision, 3);
assert.deepEqual(calls.filter((x) => x[0] === 'upload').map((x) => x.slice(1, 3)), [[dest, 1], [dest, 2]]);
assert.ok(calls.every((call) => call[0] !== 'delete'), 'No source deletions');
calls = []; selection = [{ id: stagedId, source: 'staged' }]; result = await copy(input); assert.equal(result.ok, false); assert.equal(result.requiresReload, true); assert.equal(calls.length, 0); selection = [];
collision = true; result = await copy(input); assert.equal(result.ok, false); assert.equal(calls.length, 0); collision = false;
stagedCollision = true; assert.equal((await copy(input)).ok, false); stagedCollision = false;
assets[0].audience = 'internal'; result = await copy(input); assert.equal(result.ok, false); assets[0].audience = 'buyer';
targetStatus = 'approved'; assert.equal((await copy(input)).ok, false); targetStatus = 'draft';
calls = []; reads = 0; mutateSource = true; result = await copy(input); assert.equal(result.ok, false); assert.equal(result.requiresReload, true); assert.equal(calls.filter((x) => x[0] === 'upload').length, 0);
productVersion = sourceTime; mutateSource = false; calls = []; reads = 0; mutateBytes = true;
result = await copy(input); assert.equal(result.ok, false); assert.equal(result.requiresReload, true); assert.equal(calls.filter((x) => x[0] === 'upload').length, 0);
mutateBytes = false; calls = []; failUploadAt = 1;
result = await copy(input); assert.equal(result.ok, false); assert.equal(result.uploaded, 1); assert.equal(result.requiresReload, true);
calls = []; failUploadAt = -1; throwUpload = true; result = await copy(input); assert.equal(result.requiresReload, true); assert.equal(result.uploaded, 0);
throwUpload = false; assert.equal((await copy({ ...input, sourceImageIds: [first, first] })).ok, false);
console.log('Clone photo copy: permissions, path ownership, source stability, private revisions and partial failure passed');
