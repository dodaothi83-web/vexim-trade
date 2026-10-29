// node scripts/check-legacy-split-media-copy.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/products/legacy-split-media-copy.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, Uint8Array, Map, Set, Promise, Error, require: (key) => {
  if (key === 'node:crypto') return { createHash }; throw Error(`Unexpected dependency: ${key}`);
} });
const { prepareLegacySplitMedia } = exports;
const original = '11111111-1111-1111-1111-111111111111', target = '22222222-2222-2222-2222-222222222222';
const supplier = '33333333-3333-3333-3333-333333333333', image = '44444444-4444-4444-4444-444444444444', imageNew = '55555555-5555-5555-5555-555555555555';
const sourcePath = `products/${original}/main.webp`, sourceThumb = `products/${original}/main-thumb.webp`;
const newPath = `products/${target}/${imageNew}.webp`, newThumb = `products/${target}/${imageNew}-thumb.webp`;
const plan = { sourceId: original, newProductId: target, supplierId: supplier,
  assetCopies: [{ sourceId: image, newId: imageNew, sourcePath, newPath, sourceThumbPath: sourceThumb, newThumbPath: newThumb }],
  assetSnapshots: [{ id: image, owner_type: 'product', kind: 'image', product_id: original, supplier_id: supplier, storage_path: sourcePath, thumb_path: sourceThumb }],
};
const bytes = (s) => new TextEncoder().encode(s);
function makeIO() {
  const files = new Map([[sourcePath, bytes('original')], [sourceThumb, bytes('thumb')]]), writes = [];
  const io = { read: async (path) => files.get(path) ?? null,
    isUnreferenced: async () => true,
    putIfAbsent: async (path, value, mime) => { if (files.has(path)) throw Error('exists'); writes.push([path, mime]); files.set(path, new Uint8Array(value)); },
  };
  return { files, writes, io };
}
let { files, writes, io } = makeIO();
let receipt = await prepareLegacySplitMedia(plan, io, 'inspect');
assert.equal(writes.length, 0, 'Inspection is read-only'); assert.equal(receipt.files.length, 2);
assert.equal(receipt.files[0].sha256, createHash('sha256').update(bytes('original')).digest('hex'));
receipt = await prepareLegacySplitMedia(plan, io, 'copy');
assert.equal(writes.length, 2); assert.equal(receipt.files[0].alreadyPresent, false); assert.equal(writes[0][1], 'image/webp');
assert.equal(new TextDecoder().decode(files.get(sourcePath)), 'original'); assert.equal(new TextDecoder().decode(files.get(newPath)), 'original');
receipt = await prepareLegacySplitMedia(plan, io, 'copy');
assert.equal(writes.length, 2, 'A retry never overwrites'); assert.equal(receipt.files[0].alreadyPresent, true);
({ files, writes, io } = makeIO()); files.set(newThumb, bytes('unrelated'));
await assert.rejects(prepareLegacySplitMedia(plan, io, 'copy'), /không ghi đè/);
assert.equal(writes.length, 0, 'A collision anywhere prevents any copying');
({ files, writes, io } = makeIO());
let call = 0;
io.putIfAbsent = async (path, value, mime) => { call++; if (call === 2) throw Error('unavailable'); writes.push([path, mime]); files.set(path, new Uint8Array(value)); };
await assert.rejects(prepareLegacySplitMedia(plan, io, 'copy'), /unavailable/);
assert.equal(writes.length, 1); assert.equal(new TextDecoder().decode(files.get(sourcePath)), 'original', 'No cleanup deletes source or partial targets');
io.putIfAbsent = async (path, value, mime) => { if (files.has(path)) throw Error('exists'); writes.push([path, mime]); files.set(path, new Uint8Array(value)); };
await prepareLegacySplitMedia(plan, io, 'copy'); assert.equal(writes.length, 2, 'Partial copy safely resumes');
({ files, writes, io } = makeIO());
io.putIfAbsent = async (path, value, mime) => { writes.push([path, mime]); files.set(path, new Uint8Array(value)); throw Error('response lost'); };
await prepareLegacySplitMedia(plan, io, 'copy'); assert.equal(writes.length, 2, 'A lost response is reconciled from exact bytes');
({ files, writes, io } = makeIO());
io.isUnreferenced = async (path) => path !== newThumb;
await assert.rejects(prepareLegacySplitMedia(plan, io, 'copy'), /sử dụng/); assert.equal(writes.length, 0);
({ files, writes, io } = makeIO());
let checks = 0; io.isUnreferenced = async () => ++checks <= 2;
await assert.rejects(prepareLegacySplitMedia(plan, io, 'copy'), /vừa được sử dụng/); assert.equal(writes.length, 0);
({ files, writes, io } = makeIO());
const originalPut = io.putIfAbsent; io.putIfAbsent = async (...args) => { await originalPut(...args); files.set(sourcePath, bytes('changed')); };
await assert.rejects(prepareLegacySplitMedia(plan, io, 'copy'), /thay đổi/);
({ files, writes, io } = makeIO()); files.delete(sourceThumb);
await assert.rejects(prepareLegacySplitMedia(plan, io, 'copy'), /không đọc được ảnh gốc/i); assert.equal(writes.length, 0);
const bad = structuredClone(plan); bad.assetCopies[0].newPath = sourcePath;
await assert.rejects(prepareLegacySplitMedia(bad, io, 'copy'), /không an toàn/); assert.equal(writes.length, 0);
await assert.rejects(prepareLegacySplitMedia(plan, io, 'invalid'), /Chế độ/);
console.log('Split media copy: preflight, no-overwrite, hashes, retries, race checks and source retention passed');
