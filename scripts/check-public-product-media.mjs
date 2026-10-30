// node scripts/check-public-product-media.mjs — mocked storage/DB, no network.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const file = readFileSync(new URL('../app/public-media/[...path]/route.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(file, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let asset = { owner_type: 'product', product_id: 'prod-1', kind: 'image', audience: 'buyer', status: 'checked', expires_on: null, storage_path: 'products/prod-1/photo.jpg', thumb_path: null };
let supplier = { status: 'published', is_demo: false };
let product = { supplier_id: 'sup-1', ready_for_buyer: true, name: 'Cashew W320' };
let downloads = 0, staging = true;
const store = {
  getMediaByPath: async () => asset,
  getProduct: async () => product,
  getSupplier: async () => supplier,
};
const exports = {};
const mocks = {
  'next/server': { NextResponse: class extends Response {} },
  'node:crypto': { createHash },
  '@/lib/products/product-form-staging-access': { isSyntheticProductFormStaging: () => staging },
  '@/lib/media/storage': { getObject: async () => { downloads++; return { data: new Uint8Array([255, 216, 255, 1]) }; } },
  '@/lib/db': { getStore: () => store },
  '@/lib/media/readiness': { isExpired: (a) => a.status === 'expired' },
  '@/lib/public/product-selection': {
    isTestOnlyProduct: (name) => name.startsWith('TEST ONLY'),
    productReviewApproved: (p) => (!p.supplier_originated || !!p.reviewed_category_slug) &&
      (p.supplier_review_status === 'approved' || p.supplier_review_status == null),
  },
};
const runtimeEnv = {};
vm.runInNewContext(code, { exports, require: (key) => mocks[key], Response, Uint8Array, Headers, process: { env: runtimeEnv } });
const get = (path = ['products', 'prod-1', 'photo.jpg'], headers = {}) =>
  exports.GET(new Request('https://test.local', { headers }), { params: Promise.resolve({ path }) });
assert.equal((await get()).status, 200);
assert.equal(downloads, 1);
asset = { ...asset, thumb_path: 'products/prod-1/photo-thumb.webp' };
assert.equal((await get(['products', 'prod-1', 'photo-thumb.webp'])).status, 200,
  'An approved buyer image may serve its thumbnail through the same gate');
asset = { ...asset, audience: 'internal' };
assert.equal((await get(['products', 'prod-1', 'photo-thumb.webp'])).status, 404,
  'An unapproved thumbnail must remain private');
assert.equal((await get()).status, 404);
asset = { ...asset, audience: 'buyer', status: 'expired' }; assert.equal((await get()).status, 404);
asset = { ...asset, status: 'checked', kind: 'document' }; assert.equal((await get()).status, 404);
asset = { ...asset, kind: 'image', owner_type: 'supplier' }; assert.equal((await get()).status, 404);
asset = { ...asset, owner_type: 'product' };
product = { ...product, ready_for_buyer: false }; assert.equal((await get()).status, 404);
assert.equal((await get(['products', 'prod-1', 'photo-thumb.webp'])).status, 404,
  'Revoking buyer readiness also revokes the cached-card source at the gated route');
product = { ...product, ready_for_buyer: true, supplier_originated: true, supplier_review_status: 'submitted' }; assert.equal((await get()).status, 404);
product = { ...product, supplier_review_status: 'approved', reviewed_category_slug: null }; assert.equal((await get()).status, 404);
product = { ...product, supplier_originated: false, supplier_review_status: null, name: 'TEST ONLY — Jasmine Rice Sample' }; assert.equal((await get()).status, 404);
product = { ...product, name: 'Cashew W320' }; supplier = { ...supplier, status: 'draft' }; assert.equal((await get()).status, 404);
assert.equal((await get(['products', 'prod-1', 'document.pdf'])).status, 404);
assert.equal((await get(['products', 'prod-1', 'photo,or(stuff).jpg'])).status, 404);
assert.equal(downloads, 2, 'Disallowed assets must never be fetched from storage');

// ---- Hiệu năng gallery: ETag/304 + đệm byte trong-process ----
asset = { ...asset, audience: 'buyer', status: 'checked', kind: 'image', owner_type: 'product' };
product = { supplier_id: 'sup-1', ready_for_buyer: true, name: 'Cashew W320', supplier_originated: false, supplier_review_status: null };
supplier = { status: 'published', is_demo: false };
const cached = await get();
assert.equal(cached.status, 200);
assert.equal(downloads, 2, 'Xem lại ảnh đã phục vụ: đệm trong-process thay vì gọi Storage lại');
const etag = cached.headers.get('etag');
assert.ok(etag, 'ETag phải có để trình duyệt xác nhận lại bằng 304');
assert.equal(cached.headers.get('cache-control'), 'private, max-age=60, must-revalidate',
  'Ảnh qua ACL: browser cache 60 giây rồi bắt buộc xác nhận lại — thu hồi vẫn áp dụng');
assert.equal((await get(['products', 'prod-1', 'photo.jpg'], { 'if-none-match': etag })).status, 304,
  'ETag khớp → 304, không chảy byte nào khi đổi qua lại giữa các ảnh');
assert.equal((await get(['products', 'prod-1', 'photo.jpg'], { 'if-none-match': '"khac-nhau"' })).status, 200);
assert.equal(downloads, 2, 'Cả 304 lẫn 200-từ-đệm đều không chạm Storage');
asset = { ...asset, audience: 'internal' };
assert.equal((await get()).status, 404, 'Thu hồi quyền vẫn thắng bộ đệm: ACL chạy trước khi tra ETag/byte');
asset = { ...asset, audience: 'buyer' };
supplier = { status: 'published', is_demo: true }; runtimeEnv.VEXIM_SHOW_DEMO = 'true';
product = { ...product, supplier_review_status: 'paused', ready_for_buyer: false };
assert.equal((await get(['products', 'prod-1', 'photo.jpg'], { 'if-none-match': etag })).status, 404,
  'A paused demo product stays private even when demo bypasses readiness and bytes were cached');
product = { ...product, supplier_review_status: 'approved' };
assert.equal((await get()).status, 200, 'An approved demo product can still bypass readiness as before');
// Form images are publicly readable only after the future approval creates an
// authorized buyer media row. A product path cannot borrow another product's row.
const formProduct = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', formImage = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const formPath = ['product-form-images', formProduct, `${formImage}.webp`];
asset = null; supplier = { status: 'published', is_demo: false };
product = { supplier_id: 'sup-1', ready_for_buyer: true, name: 'Product', supplier_review_status: 'approved' };
assert.equal((await get(formPath)).status, 404, 'A private staged object has no public media row');
asset = { owner_type: 'product', product_id: formProduct, kind: 'image', audience: 'buyer', status: 'checked', expires_on: null,
  storage_path: formPath.join('/'), thumb_path: null };
staging = false;
assert.equal((await get(formPath)).status, 404, 'The new image namespace stays closed outside synthetic staging');
staging = true;
assert.equal((await get(formPath)).status, 200, 'Approved buyer media follows the existing ACL');
asset = { ...asset, product_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc' };
assert.equal((await get(formPath)).status, 404, 'Form image path must belong to its product');
asset = { ...asset, product_id: formProduct, audience: 'internal' };
assert.equal((await get(formPath)).status, 404, 'Internal media remains private');
console.log('✅ Product images are public only for buyer-shareable media of a ready product and published supplier.');
