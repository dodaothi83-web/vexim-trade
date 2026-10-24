// node scripts/check-supplier-product-wizard.mjs
// Trang sản phẩm của NCC: 3 bước, mỗi lần chỉ mở một bước, nút Trở về / Tiếp tục ở đáy,
// và thông tin thương mại & xuất khẩu hiện ngay ở bước 1 (không giấu sau mũi tên gập).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

function load(file, mocks) {
  const mod = { exports: {} };
  const source = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, {
    module: mod, exports: mod.exports, console, Date, URL, FormData, requestAnimationFrame: (fn) => fn(),
    require: (id) => {
      if (!(id in mocks)) throw new Error(`${file}: unexpected import ${id}`);
      return mocks[id];
    },
  }, { filename: file });
  return mod.exports;
}

const icons = new Proxy({}, { get: (_target, name) => (props) => React.createElement('span', { 'data-icon': String(name), className: props.className }, null) });
const Link = ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children);

const view = {
  PRODUCT_STATUS: {
    draft: { label: 'Bản nháp', tone: 'bg-slate-100' },
    pending: { label: 'Chờ Vexim duyệt', tone: 'bg-amber-100' },
    changes_requested: { label: 'Cần chỉnh sửa', tone: 'bg-rose-100' },
    approved: { label: 'Đã duyệt nội dung', tone: 'bg-emerald-100' },
  },
  productReview: (p) => p.supplier_review_status ?? 'approved',
  privateMediaUrl: (m) => m.storage_path ? `/api/media/file/${m.storage_path}` : null,
  productCanSubmit: (p, media) => ['draft', 'changes_requested'].includes(p.supplier_review_status ?? 'approved') &&
    !!(p.name?.trim() && (p.description?.trim() || p.spec?.trim())) &&
    media.some((m) => (m.kind === 'image' || m.kind === 'catalogue') && !!m.storage_path),
};

const { SupplierProductEditor } = load('../app/supplier/portal/products/product-editor.tsx', {
  react: React,
  'react/jsx-runtime': jsx,
  'next/link': { default: Link },
  'next/navigation': { useRouter: () => ({ push() {}, refresh() {}, replace() {} }) },
  'lucide-react': icons,
  '@/lib/types': {},
  '@/lib/public/product-selection': { productPriceBlockers: () => [], supplierPriceConsentCurrent: () => true },
  '@/lib/supplier-portal/category-proposals': {},
  '@/lib/supplier-portal/product-view': view,
  '../product-actions': {
    saveSupplierProductAction: async () => ({ ok: true, id: 'p1', message: 'Đã lưu bản nháp.' }),
    submitSupplierProductAction: async () => ({ ok: true, message: 'Đã gửi.' }),
  },
  '@/components/product-attribute-inputs': { ProductAttributeInputs: () => React.createElement('div', { 'data-attribute-inputs': '1' }) },
  '@/lib/product-attributes': { fieldsFor: () => [] },
});

const categories = [
  { id: 'c1', slug: 'cashew', label: 'Hạt điều', group: 'Hạt & hạt nhân' },
  { id: 'c2', slug: 'pepper', label: 'Hồ tiêu', group: 'Gia vị' },
];
const supplier = { id: 'sup-1', status: 'published', fob_publicly_visible: true, fob_updated_at: new Date().toISOString() };
const product = {
  id: 'p1', supplier_id: 'sup-1', name: 'Hạt điều nhân W320', category: 'cashew', supplier_category_proposal: 'cashew',
  description: 'Hạt điều trắng', spec: 'W320', supplier_review_status: 'draft', ready_for_buyer: false,
  ref_price: 7.2, currency: 'USD', unit: 'kg', moq: '1 tấn', monthly_capacity: '200 tấn', packaging: 'Carton 22.68kg',
  lead_time_days: 21, export_port: 'Cát Lái', incoterm: 'FOB', incoterm_place: 'Hồ Chí Minh',
  payment_terms: 'T/T 30%', certifications: 'HACCP', updated_at: '2026-10-20T00:00:00Z',
};
const media = [{ id: 'm1', owner_type: 'product', product_id: 'p1', supplier_id: 'sup-1', created_by: 'u1',
  audience: 'internal', kind: 'image', storage_path: 'products/p1/a.jpg', caption: 'Ảnh nhà máy' }];

const render = (props = {}) => renderToStaticMarkup(React.createElement(SupplierProductEditor, {
  product, media, userId: 'u1', categories, supplier, ...props,
}));

const source = read('../app/supplier/portal/products/product-editor.tsx');
const step1 = render();

// 1. Ba bước, mỗi lần chỉ mở MỘT bước; các bước khác vẫn nằm trong DOM (hidden) để
//    không mất dữ liệu khi gửi form.
assert.match(step1, /Bước 1 · Thông tin sản phẩm|data-step-panel="1"/, 'Có panel bước 1');
assert.match(step1, /data-step-panel="2"/, 'Panel bước 2 tồn tại');
assert.match(step1, /data-step-panel="3"/, 'Panel bước 3 tồn tại');
assert.match(step1, /data-step-panel="1"[^>]*class="space-y-4"|class="space-y-4"[^>]*data-step-panel="1"/, 'Bước 1 đang mở');
assert.equal((step1.match(/data-step-panel="(2|3)"/g) ?? []).length, 2, 'Đủ ba panel');
for (const panel of ['2', '3']) {
  assert.match(step1, new RegExp(`data-step-panel="${panel}" class="hidden"`), `Bước ${panel} bị ẩn, không đẩy nội dung dài xuống`);
}
assert.doesNotMatch(source, /<details/, 'Không còn khối gập <details> trong trang sản phẩm');

// 2. Thông tin thương mại & xuất khẩu HIỆN NGAY ở bước 1, không cần bấm mũi tên.
assert.match(step1, /Thông tin thương mại &amp; xuất khẩu/, 'Tiêu đề khối thương mại & xuất khẩu hiện ngay');
for (const field of ['ref_price', 'ref_price_max', 'currency', 'unit', 'price_valid_until', 'lead_time_days',
  'payment_terms', 'export_port', 'incoterm', 'incoterm_place', 'certifications']) {
  assert.ok(step1.includes(`name="${field}"`), `Ô ${field} nằm ngay trong bước 1`);
}
assert.ok(step1.indexOf('Thông tin thương mại &amp; xuất khẩu') > 0, 'Khối thương mại nằm trong bước 1 đang mở');
assert.ok(step1.includes('Nhận gia công/OEM') && step1.includes('Có thể gửi mẫu'), 'Ba lựa chọn thương mại hiện ngay');

// 3. Điều hướng dưới đáy: quay lại / tiếp tục, thanh dính đáy màn hình.
assert.match(step1, /sticky bottom-0[^"]*backdrop-blur/, 'Thanh hành động dính đáy màn hình');
assert.match(step1, /Tiếp tục/, 'Bước 1 có nút đi tiếp');
assert.equal((step1.match(/name="payment_terms"/g) ?? []).length, 1, 'Không lặp ô điều kiện thanh toán');
assert.match(step1, /href="\/supplier\/portal\/products"/, 'Bước 1 có lối hủy về danh sách');
const onStep2 = render({ initialStep: 2 });
assert.match(onStep2, /Trở về bước 1/, 'Bước 2 có nút Trở về bước 1');
assert.match(onStep2, /Sang bước 3/, 'Bước 2 có nút sang bước 3');
const onStep3 = render({ initialStep: 3 });
assert.match(onStep3, /Trở về bước 2/, 'Bước 3 có nút Trở về bước 2');
assert.match(onStep3, /Gửi Vexim kiểm tra/, 'Bước 3 có nút gửi duyệt');
assert.match(onStep2, /data-step-panel="1" class="hidden"/, 'Bước 2 ẩn hẳn form bước 1 (không kéo dài trang) nhưng vẫn giữ dữ liệu để gửi form');
assert.match(onStep2, /data-step-panel="2" class="space-y-3"/, 'Bước 2 đang mở');
assert.equal((onStep2.match(/aria-current="step"/g) ?? []).length, 1, 'Ở bước 2 chỉ đánh dấu bước 2');
assert.equal((onStep3.match(/data-step-panel="1"/g) ?? []).length, 1, 'Panel bước 1 vẫn tồn tại (chỉ ẩn) ở bước 3');

// 4. Thanh bước đánh dấu đúng bước đang mở.
assert.match(step1, /aria-current="step"/, 'Thanh bước đánh dấu bước hiện tại');
assert.equal((step1.match(/aria-current="step"/g) ?? []).length, 1, 'Chỉ một bước được đánh dấu');
assert.match(source, /selectStep/, 'Bấm vào thanh bước để chuyển bước');

// 5. Hành vi cũ còn nguyên: lưu, kiểm tra trường bắt buộc, cảnh báo mất dữ liệu, nộp, tải tệp.
assert.match(source, /saveSupplierProductAction\(form\)/, 'Vẫn lưu qua saveSupplierProductAction');
assert.match(source, /submitSupplierProductAction\(form\)/, 'Vẫn nộp qua submitSupplierProductAction');
assert.match(source, /productCanSubmit\(product, media\) && !dirty/, 'Nút nộp vẫn phụ thuộc điều kiện dữ liệu');
assert.match(source, /window\.confirm\("Lưu thay đổi sẽ rút sản phẩm/, 'Vẫn cảnh báo khi sửa sản phẩm đã duyệt');
assert.match(source, /Bạn có thay đổi chưa lưu/, 'Vẫn cảnh báo rời trang khi chưa lưu');
assert.match(source, /firstInvalidField\(formRef\.current, 1\)/, 'Chặn sang bước khi còn trường bắt buộc');
assert.match(source, /requestSubmit\(\)/, 'Đi tiếp được sau khi lưu thành công');
assert.match(source, /\/api\/supplier-portal\/products\/\$\{product\.id\}\/media/, 'Vẫn tải tệp qua API riêng');
assert.match(source, /method: "DELETE"/, 'Vẫn xoá được tệp nháp');
assert.match(source, /form="product-info"/, 'Nút ở thanh đáy submit đúng form bước 1');
assert.match(source, /if \(!product\)[\s\S]{0,400}\?step=/, 'Sản phẩm mới lưu xong mở thẳng bước tiếp theo');

// 6. Đọc ?step= ở trang chi tiết để mở đúng bước sau khi tạo mới.
const detailPage = read('../app/supplier/portal/products/[id]/page.tsx');
assert.match(detailPage, /searchParams/, 'Trang chi tiết đọc searchParams');
assert.match(detailPage, /initialStep=\{step\}/, 'Truyền bước mở đầu cho editor');
assert.match(detailPage, /value === 2 \? 2 : value === 3 \? 3 : 1/, 'Chỉ nhận bước 1–3');

// 7. Danh sách sản phẩm: nhãn danh mục tiếng Việt + cảnh báo ngoài phạm vi.
const storefront = read('../app/supplier/portal/products/product-storefront.tsx');
assert.match(storefront, /categoryLabels\?: Record<string, string>/, 'Danh sách nhận nhãn danh mục');
assert.match(storefront, /categoryLabels\[slug\] \?\? slug/, 'Hiện nhãn thay vì slug thô');
assert.match(storefront, /Ngoài phạm vi/, 'Sản phẩm ngoài phạm vi được đánh dấu');
assert.match(storefront, /Chỉnh phạm vi danh mục/, 'Có lối sang trang Danh mục kinh doanh');
const listPage = read('../app/supplier/portal/products/page.tsx');
assert.match(listPage, /categoryLabels=/, 'Trang danh sách truyền nhãn danh mục');
assert.match(listPage, /scope=\{\[?scope/, 'Trang danh sách truyền phạm vi danh mục');
assert.match(listPage, /allowedSupplierCategories/, 'Phạm vi lấy từ đúng lớp dữ liệu danh mục');

console.log('✅ Product page: 3 bước một màn hình, nút Trở về/Tiếp tục ở đáy, thương mại & xuất khẩu hiện ngay, giữ nguyên hành vi lưu–tải tệp–nộp duyệt.');
