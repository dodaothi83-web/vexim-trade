// node scripts/check-public-product-media.mjs — mocked storage/DB, no network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const file = readFileSync(new URL('../app/public-media/[...path]/route.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(file, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let asset = { owner_type: 'product', product_id: 'prod-1', kind: 'image', audience: 'buyer', status: 'checked', expires_on: null, storage_path: 'products/prod-1/photo.jpg', thumb_path: null };
let supplier = { status: 'published', is_demo: false };
let product = { supplier_id: 'sup-1', ready_for_buyer: true, name: 'Cashew W320' };
let downloads = 0;
const store = {
  getMediaByPath: async () => asset,
  getProduct: async () => product,
  getSupplier: async () => supplier,
};
const exports = {};
const mocks = {
  'next/server': { NextResponse: class extends Response {} },
  '@/lib/media/storage': { getObject: async () => { downloads++; return { data: new Uint8Array([255, 216, 255, 1]) }; } },
  '@/lib/db': { getStore: () => store },
  '@/lib/media/readiness': { isExpired: (a) => a.status === 'expired' },
  '@/lib/public/product-selection': { isTestOnlyProduct: (name) => name.startsWith('TEST ONLY') },
};
vm.runInNewContext(code, { exports, require: (key) => mocks[key], Response, Uint8Array, Headers, process: { env: {} } });
const get = (path = ['products', 'prod-1', 'photo.jpg']) => exports.GET(new Request('https://test.local'), { params: Promise.resolve({ path }) });
assert.equal((await get()).status, 200);
assert.equal(downloads, 1);
asset = { ...asset, audience: 'internal' }; assert.equal((await get()).status, 404);
asset = { ...asset, audience: 'buyer', status: 'expired' }; assert.equal((await get()).status, 404);
asset = { ...asset, status: 'checked', kind: 'document' }; assert.equal((await get()).status, 404);
asset = { ...asset, kind: 'image', owner_type: 'supplier' }; assert.equal((await get()).status, 404);
asset = { ...asset, owner_type: 'product' };
product = { ...product, ready_for_buyer: false }; assert.equal((await get()).status, 404);
product = { ...product, ready_for_buyer: true, name: 'TEST ONLY — Jasmine Rice Sample' }; assert.equal((await get()).status, 404);
product = { ...product, name: 'Cashew W320' }; supplier = { ...supplier, status: 'draft' }; assert.equal((await get()).status, 404);
assert.equal((await get(['products', 'prod-1', 'document.pdf'])).status, 404);
assert.equal((await get(['products', 'prod-1', 'photo,or(stuff).jpg'])).status, 404);
assert.equal(downloads, 1, 'Disallowed assets must never be fetched from storage');
console.log('✅ Product images are public only for buyer-shareable media of a ready product and published supplier.');
