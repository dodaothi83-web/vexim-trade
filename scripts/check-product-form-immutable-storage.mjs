// node scripts/check-product-form-immutable-storage.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
let files = new Map(), removes = [], writes = [];
const fs = { mkdir: async () => {}, writeFile: async (name, bytes, options) => {
  writes.push([name, options]); if (options?.flag === 'wx' && files.has(name)) throw Error('EEXIST'); files.set(name, bytes);
}, readFile: async (name) => { if (!files.has(name)) throw Error('ENOENT'); return files.get(name); }, rm: async (name) => { removes.push(name); files.delete(name); } };
const mocks = { 'server-only': {}, 'node:fs/promises': { default: fs }, 'node:path': { default: path },
  '@/lib/db/supabase': { getSupabaseClient: () => null, supabaseConfigured: () => false }, '@/lib/db': { localFallbackAllowed: () => true } };
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/media/storage.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, process: { cwd: () => '/tmp/local-media-test', env: {} }, globalThis: {}, Uint8Array, Map, Date,
  require: (key) => { if (!(key in mocks)) throw Error(`Unexpected ${key}`); return mocks[key]; } });
const privatePath = 'product-form-images/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.webp';
await assert.rejects(() => exports.putObject(privatePath, new Uint8Array([1]), 'image/webp'), /ghi đè/);
await assert.rejects(() => exports.deleteObject(privatePath), /Không thể xóa/); assert.equal(writes.length, 0); assert.equal(removes.length, 0);
await exports.putNewObject(privatePath, new Uint8Array([1]), 'image/webp');
await assert.rejects(() => exports.putNewObject(privatePath, new Uint8Array([2]), 'image/webp'), /EEXIST/);
assert.equal((await exports.getObject(privatePath)).data[0], 1, 'Exclusive write preserves verified bytes');
const legacy = 'products/old/photo.webp'; await exports.putObject(legacy, new Uint8Array([3]), 'image/webp'); await exports.deleteObject(legacy);
assert.equal(removes.length, 1, 'Legacy media behavior remains available');
console.log('Form image storage: reserved prefix denies generic overwrite/delete, exclusive writes and legacy paths passed');
