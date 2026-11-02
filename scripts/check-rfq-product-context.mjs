// node --experimental-strip-types scripts/check-rfq-product-context.mjs
//
// Thẻ "You are asking about" ở đầu form RFQ chỉ được xuất hiện khi sản phẩm đã qua cổng
// công bố. Kiểm này chạy loader thật với dữ liệu giả để chặn ba lỗi: hiện sản phẩm chưa
// duyệt, lấy nhầm sản phẩm của nhà cung cấp khác, và ghi "x/3 approved" thay vì tên bước.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('..', import.meta.url);

function load(relativePath, mocks) {
  const output = ts.transpileModule(readFileSync(new URL(relativePath, root), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(output, {
    module: mod, exports: mod.exports, process, console, Date, Map, Set, Number, String, RegExp, JSON,
    require: (key) => {
      assert.ok(key in mocks, `Unexpected import ${key} in ${relativePath}`);
      return mocks[key];
    },
  }, { filename: relativePath });
  return mod.exports;
}

// Module thuần: dùng bản thật để nhãn xác minh và tên ngắn không bị lệch với nơi khác.
const verification = load('lib/verification-status.ts', {});
const supplierName = load('lib/public/supplier-name.ts', {});

let category = { id: 'cat-1', slug: 'cashew', status: 'published', is_published: true, parent_id: null };
let cards = [];
let products = [];
let certificates = [];

const store = {
  getCategoryBySlug: async () => category,
  getCategory: async () => null,
  listProducts: async () => products,
  listCertificates: async () => certificates,
  listCertificateScopes: async () => [],
  listCertificateOptouts: async () => [],
  listMedia: async () => [],
};

const context = load('lib/public/rfq-product-context.ts', {
  '@/lib/db': { getStore: () => store },
  '@/lib/verification-status': verification,
  './supplier-name': supplierName,
  './product-catalog': { listPublicCategoryProducts: async () => cards },
  './product-extras-display': { packagingSummaryEnglish: (product) => product.structured_packaging || '' },
  './product-export-port': { publicProductExportPortDisplay: (product) => product.export_port || '' },
  './product-certificates': { productCertificatesFor: async () => certificates },
});

const card = {
  id: 'p-1', name: 'Cashew Kernels W320', supplierId: 's-1', supplierSlug: 'binh-phuoc-kernel',
  supplierName: 'BÌNH PHƯỚC KERNEL CO., LTD', cardImagePath: '/media/cashew.jpg', imagePaths: [],
  grade: 'W320', moq: '1 MT', incoterm: 'FOB', price: '$6.90–7.10/kg',
  pricePoint: { updatedAt: '2026-11-02T10:00:00Z' }, leadTimeText: '21 days', leadTimeDays: 21,
  verificationSteps: [1], gradeRows: [],
};
products = [{ id: 'p-1', export_port: 'Cat Lai, HCMC', structured_packaging: '50 kg bag' }];
certificates = [{ name: 'HACCP' }, { name: 'BRCGS' }, { name: 'ISO 22000' }, { name: 'Halal' }, { name: 'Kosher' }];

/* 1. Không có đủ tham số → không có thẻ */
assert.equal(await context.loadRfqProductContext({ categorySlug: null, supplierId: 's-1', productId: 'p-1' }), null);
assert.equal(await context.loadRfqProductContext({ categorySlug: 'cashew', supplierId: null, productId: 'p-1' }), null);
assert.equal(await context.loadRfqProductContext({ categorySlug: 'cashew', supplierId: 's-1', productId: null }), null);

/* 2. Sản phẩm chưa qua cổng công bố → không có thẻ (form về trạng thái vào từ menu) */
cards = [];
assert.equal(await context.loadRfqProductContext({ categorySlug: 'cashew', supplierId: 's-1', productId: 'p-1' }), null);

/* 3. Sản phẩm của nhà cung cấp khác → không có thẻ */
cards = [{ ...card, supplierId: 's-other' }];
assert.equal(await context.loadRfqProductContext({ categorySlug: 'cashew', supplierId: 's-1', productId: 'p-1' }), null);

/* 4. Danh mục chưa công bố → không có thẻ */
cards = [card];
category = { ...category, is_published: false };
assert.equal(await context.loadRfqProductContext({ categorySlug: 'cashew', supplierId: 's-1', productId: 'p-1' }), null);
category = { ...category, is_published: true };

/* 5. Đủ điều kiện → thẻ đúng dữ liệu, chỉ hiện tên bước xác minh */
const found = await context.loadRfqProductContext({ categorySlug: 'cashew', supplierId: 's-1', productId: 'p-1' });
assert.ok(found);
assert.equal(found.name, 'Cashew Kernels W320');
assert.equal(found.supplierName, 'Bình Phước Kernel Co., Ltd', 'Tên pháp nhân được hạ kiểu chữ');
assert.equal(found.supplierHref, '/suppliers/binh-phuoc-kernel');
assert.equal(found.imageUrl, '/public-media/media/cashew.jpg');
assert.deepEqual([...found.checks], ['Documents checked'], 'Hiện tên bước đã duyệt, không hiện "1/3 approved"');
assert.equal(found.grade, 'W320');
assert.equal(found.moq, '1 MT');
assert.equal(found.incoterm, 'FOB');
assert.equal(found.referencePrice, '$6.90–7.10/kg');
assert.equal(found.priceUpdatedAt, '2 Nov 2026', 'Ngày cập nhật định dạng cố định, không phụ thuộc locale');
assert.equal(found.packaging, '50 kg bag');
assert.equal(found.leadTime, '21 days');
assert.equal(found.exportPort, 'Cat Lai, HCMC');
assert.equal(found.certificates.length, 4, 'Chỉ hiện tối đa 4 chip chứng nhận');
assert.doesNotMatch(JSON.stringify(found), /1\/3|approved/i, 'Không lộ cách đếm "x/3 approved"');

/* 6. Nhãn xác minh nhiều bước ghép đúng thứ tự */
cards = [{ ...card, verificationSteps: [1, 2] }];
const twoSteps = await context.loadRfqProductContext({ categorySlug: 'cashew', supplierId: 's-1', productId: 'p-1' });
assert.deepEqual([...twoSteps.checks], ['Documents checked', 'Factory verification']);

/* 7. Trang RFQ và form phải nối thẻ này vào, không tự dựng lại ở client */
const page = readFileSync(new URL('app/(public)/rfq/page.tsx', root), 'utf8');
const form = readFileSync(new URL('app/(public)/rfq/rfq-form.tsx', root), 'utf8');
assert.match(page, /loadRfqProductContext\(/);
assert.match(page, /contextProduct=\{contextProduct\}/);
assert.match(form, /label=\{contextProduct \? "Your requirements" : "What do you need\?"\}/);
assert.match(form, /required=\{!contextProduct\}/);
assert.match(form, /\{ key: "product", label: "Product", done: true \}/);
assert.doesNotMatch(form, /preview=1|Opened from a product page/, 'Không có thanh chuyển trạng thái trong production');

console.log('✅ RFQ product context: chỉ hiện khi sản phẩm đã qua cổng công bố, đúng nhà cung cấp, tên ngắn và tên bước xác minh.');
