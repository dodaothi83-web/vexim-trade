// node scripts/check-product-form-image-transport.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../lib/products/product-form-image-transport.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
let closed = 0, width = 2000, height = 1200, qualityAttempts = [], failDecode = false, mime = 'image/webp';
let nextSize = 1000, drawn = [];
const canvas = { width: 0, height: 0, getContext() { return { drawImage(_bitmap, x, y, w, h) { drawn.push([x, y, w, h]); } }; },
  toBlob(callback, _type, quality) { qualityAttempts.push(quality); callback(new Blob([new Uint8Array(nextSize)], { type: mime })); } };
const exports = {};
const context = { exports, File, Blob, Uint8Array, Math, Error, Promise, document: { createElement: () => canvas },
  createImageBitmap: async () => { if (failDecode) throw Error('bad image'); return { width, height, close() { closed++; } }; } };
vm.runInNewContext(code, context);
const prepare = exports.prepareProductFormImageTransport;
const small = new File(['small'], 'small.jpg', { type: 'image/jpeg' });
assert.equal(await prepare(small), small, 'Small originals pass through unchanged');
const big = new File([new Uint8Array(2_500_001)], 'anh.png', { type: 'image/png', lastModified: 123 });
const converted = await prepare(big);
assert.equal(converted.size, 1000); assert.equal(converted.type, 'image/webp'); assert.equal(converted.name, 'anh.webp');
assert.equal(converted.lastModified, 123); assert.deepEqual(drawn[0], [0, 0, 1600, 960]); assert.equal(closed, 1);
width = 5001; height = 5000; await assert.rejects(() => prepare(big), /quá lớn/); assert.equal(closed, 2);
width = 2000; height = 1200; mime = 'image/png'; await assert.rejects(() => prepare(big), /WebP/); assert.equal(closed, 3); mime = 'image/webp';
failDecode = true; await assert.rejects(() => prepare(big), /Không đọc được/); failDecode = false;
await assert.rejects(() => prepare(new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'too-big.jpg')), /8 MB/);
nextSize = 2_500_001; qualityAttempts = []; await assert.rejects(() => prepare(big), /đủ nhỏ/);
assert.equal(qualityAttempts.length, 12); assert.equal(closed, 4);
console.log('Image transport: source limits, bounded WebP encoding, decode errors and cleanup passed');
