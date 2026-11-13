// node --experimental-strip-types --no-warnings scripts/check-public-supplier-gallery.mjs
// Ảnh gallery nhà cung cấp trên danh mục công khai: đọc gộp một lượt (không N+1),
// chỉ lấy ảnh hồ sơ nhà cung cấp dành cho người mua, vẫn chạy với kho chỉ có listMedia.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const out = ts.transpileModule(fs.readFileSync(new URL('../lib/public/catalog.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let store;
const mocks = {
  'server-only': {}, '@/lib/db': { getStore: () => store },
  '@/lib/media/readiness': { isExpired: () => false, productReadiness: () => ({ ready: true }) },
  '@/lib/verification-status': { approvedFactoryReviews: () => [], approvedL2Scope: () => null, approvedPartnerReviewSummary: () => undefined,
    approvedPublicReviewSummaries: () => ({}), approvedVerificationSteps: () => [] },
  '@/lib/public/product-selection': { isTestOnlyProduct: () => false, productBelongsToCategory: () => false, productReviewApproved: () => true, publicProductCategorySlug: () => null },
  '@/lib/public/display-name': { publicProductTitle: (p) => p.name },
};
const module = { exports: {} };
vm.runInNewContext(out, { module, exports: module.exports, process, console,
  require: (id) => { if (id in mocks) return mocks[id]; return new Proxy({}, { get: () => () => [] }); } });
const { listPublicSuppliers } = module.exports;

const suppliers = Array.from({ length: 60 }, (_, i) => ({ id: `s${i}`, name: `Supplier ${i}`, slug: `s${i}`, status: 'published', is_demo: false }));
const img = (supplier, extra = {}) => ({ id: `${supplier}-${Math.random()}`, supplier_id: supplier, owner_type: 'supplier', kind: 'image', audience: 'buyer',
  storage_path: `suppliers/${supplier}/a.jpg`, sort_order: 0, created_at: '2026-11-01', ...extra });
const media = [img('s0'), img('s0', { owner_type: 'product', storage_path: 'product.jpg' }), img('s0', { audience: 'internal', storage_path: 'private.jpg' }),
  img('s1'), img('s55')];
const calls = { batch: 0, single: 0 };
const base = { listSuppliers: async () => suppliers, listProducts: async () => [], listCategories: async () => [],
  listVerificationsForSuppliers: async () => [] };

store = { ...base, listMediaForSuppliers: async (ids) => { calls.batch++; assert.equal(ids.length, 50, 'Chỉ 50 nhà cung cấp đầu'); return media.filter((m) => ids.includes(m.supplier_id)); },
  listMedia: async () => { calls.single++; return []; } };
let cards = await listPublicSuppliers();
assert.equal(calls.batch, 1, 'Đọc gộp đúng một lượt');
assert.equal(calls.single, 0, 'Không còn truy vấn ảnh cho từng nhà cung cấp');
const gallery = (id) => [...cards.find((c) => c.id === id).gallery_images];
assert.deepEqual(gallery('s0'), ['suppliers/s0/a.jpg'], 'Bỏ ảnh sản phẩm và ảnh nội bộ');
assert.deepEqual(gallery('s1'), ['suppliers/s1/a.jpg']);
assert.deepEqual(gallery('s55'), [], 'Ngoài 50 nhà cung cấp đầu thì không tải gallery như trước');

store = { ...base, listMedia: async (_type, id) => { calls.single++; return media.filter((m) => m.supplier_id === id && m.owner_type === 'supplier'); } };
calls.single = 0;
cards = await listPublicSuppliers();
assert.equal(calls.single, 50, 'Kho không có bản đọc gộp vẫn dùng listMedia');
assert.deepEqual(gallery('s0'), ['suppliers/s0/a.jpg']);
console.log('✅ Gallery nhà cung cấp: một lượt đọc gộp cho 50 hồ sơ đầu, đúng ảnh hồ sơ cho người mua, có đường dự phòng.');
