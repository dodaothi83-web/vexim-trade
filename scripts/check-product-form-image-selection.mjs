// node scripts/check-product-form-image-selection.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const supplierId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', productId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const mediaId = '11111111-1111-1111-1111-111111111111', stagedId = '22222222-2222-2222-2222-222222222222';
const mocks = { '@/lib/media/readiness': { isExpired: (x) => x.status === 'expired' },
  '@/lib/supplier-portal/product-view': { privateMediaUrl: (x) => x.storage_path ? `/api/media/file/${x.storage_path}` : null } };
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/products/product-form-image-selection.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, require: (key) => { if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; } });
const { parseDraftImageSelection: parse, resolveSupplierDraftImages: resolve } = exports;
const ref = (source, id) => ({ source, id });
const media = { id: mediaId, owner_type: 'product', product_id: productId, supplier_id: supplierId, kind: 'image',
  audience: 'buyer', created_by: 'other', storage_path: 'old.webp', status: 'unverified' };
const staged = { id: stagedId, product_id: productId, supplier_id: supplierId, created_by: 'user',
  storage_path: `product-form-images/${productId}/${stagedId}.webp`, mime: 'image/webp' };
const input = { productId, supplierId, userId: 'user', media: [media], staged: [staged], selection: [ref('staged', stagedId), ref('media', mediaId)] };
let result = resolve(input); assert.equal(result.selected.length, 2); assert.equal(result.selected[0].id, stagedId);
assert.equal(result.selected[1].url, '/api/media/file/old.webp'); assert.equal(result.available.length, 2);
result = resolve({ ...input, selection: [ref('media', mediaId)] }); assert.equal(result.selected.length, 1); assert.equal(result.available.length, 2, 'Deselected images can be recovered');
assert.equal(resolve({ ...input, staged: [] }), null); assert.equal(resolve({ ...input, staged: [{ ...staged, created_by: 'other' }] }), null);
assert.equal(resolve({ ...input, staged: [{ ...staged, storage_path: 'other.webp' }] }), null);
assert.equal(resolve({ ...input, media: [{ ...media, audience: 'internal' }] }), null);
assert.equal(resolve({ ...input, media: [{ ...media, status: 'expired' }] }), null);
assert.equal(resolve({ ...input, media: [{ ...media, product_id: supplierId }] }), null);
assert.equal(resolve({ ...input, staged: Array(101).fill(staged) }), null);
for (const bad of [null, {}, [null], [{ source: 'unknown', id: mediaId }], [{ source: 'media', id: 'bad' }],
  [{ source: 'media', id: mediaId, extra: true }], [ref('media', mediaId), ref('staged', mediaId)]]) assert.equal(parse(bad), null);
console.log('Private image selection: strict references, authorized restoration, order and expired/missing images passed');
