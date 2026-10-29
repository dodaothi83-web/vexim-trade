// node scripts/check-legacy-split-supabase-media.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/products/legacy-split-supabase-media.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, Uint8Array, Array, String, Error, require: (key) => {
  if (key === 'server-only') return {}; throw Error(`Unexpected dependency: ${key}`);
} });
const { createSplitSupabaseMediaIO } = exports;
const id = '11111111-1111-1111-1111-111111111111', path = `products/${id}/file.webp`;
let download = { data: new Blob(['photo']), error: null }, uploadError = null, product = null, productError = null, assets = [], assetsError = null;
let uploadArgs, selectedBucket;
const db = { storage: { from: (bucket) => { selectedBucket = bucket; return {
  download: async () => download,
  upload: async (...args) => { uploadArgs = args; return { error: uploadError }; },
}; } }, from: (table) => ({ select: () => table === 'supplier_products' ? {
  eq: (_key, value) => { assert.equal(value, id); return { maybeSingle: async () => ({ data: product, error: productError }) }; },
} : { or: (filter) => { assert.equal(filter, `storage_path.eq.${path},thumb_path.eq.${path}`); return { limit: async () => ({ data: assets, error: assetsError }) }; } } }) };
const io = createSplitSupabaseMediaIO(db, 'private-media', id);
assert.equal(selectedBucket, 'private-media'); assert.equal(new TextDecoder().decode(await io.read(path)), 'photo');
await io.putIfAbsent(path, new Uint8Array([1]), 'image/webp');
assert.equal(uploadArgs[2].upsert, false); assert.equal(uploadArgs[2].contentType, 'image/webp');
assert.equal(await io.isUnreferenced(path), true);
product = { id }; assert.equal(await io.isUnreferenced(path), false); product = null;
assets = [{ id: 'referenced' }]; assert.equal(await io.isUnreferenced(path), false); assets = [];
assetsError = { message: 'network failure' }; await assert.rejects(io.isUnreferenced(path), /liên kết ảnh/); assetsError = null;
productError = { message: 'network failure' }; await assert.rejects(io.isUnreferenced(path), /sản phẩm mới/); productError = null;
download = { data: null, error: { statusCode: '404', message: 'not found' } }; assert.equal(await io.read(path), null);
download = { data: null, error: { status: 403, message: 'forbidden' } }; await assert.rejects(io.read(path), /forbidden/);
download = { data: null, error: null }; await assert.rejects(io.read(path), /không trả dữ liệu/);
uploadError = { message: 'duplicate' }; await assert.rejects(io.putIfAbsent(path, new Uint8Array([1]), 'image/webp'), /duplicate/);
await assert.rejects(io.isUnreferenced('x),id.eq.1'), /không an toàn/);
await assert.rejects(io.putIfAbsent('products/../../old.webp', new Uint8Array([1]), 'image/webp'), /không an toàn/);
assert.throws(() => createSplitSupabaseMediaIO(db, '', id));
console.log('Split Supabase media adapter: private bucket, no upsert/fallback, missing vs failed reads and reference guards passed');
