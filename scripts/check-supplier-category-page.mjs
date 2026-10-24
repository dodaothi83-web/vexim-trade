// node scripts/check-supplier-category-page.mjs
// Trang "Danh mục kinh doanh" của cổng NCC: lưới danh mục dạng sàn TMĐT, cột phạm vi
// dính bên phải, thanh lưu trên mobile — nhưng vẫn đúng hành vi cũ (1–5 danh mục CMS,
// gửi qua saveSupplierCategoriesAction, server là nơi quyết định cuối cùng).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const jsx = await import('react/jsx-runtime');

const Icon = (name) => (props) => React.createElement('svg', { 'data-icon': name, ...props });
const icons = new Proxy({}, { get: (_target, key) => Icon(String(key)) });

const actions = {
  saveSupplierCategoriesAction: async () => ({ ok: true, message: 'Đã lưu danh mục được phép chọn.' }),
};

const status = {
  draft: { label: 'Bản nháp', tone: 'bg-slate-100' },
  pending: { label: 'Chờ duyệt', tone: 'bg-amber-100' },
  changes_requested: { label: 'Cần chỉnh sửa', tone: 'bg-rose-100' },
  approved: { label: 'Đã duyệt nội dung', tone: 'bg-emerald-100' },
};

const source = read('../app/supplier/portal/categories/supplier-category-workspace.tsx');
const exports = {};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, {
  exports,
  React,
  console,
  require: (key) => {
    if (key === 'react') return React;
    if (key === 'react/jsx-runtime') return jsx;
    if (key === 'next/link') return { default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children) };
    if (key === 'next/navigation') return { useRouter: () => ({ refresh() {} }) };
    if (key === 'lucide-react') return icons;
    if (key === './actions') return actions;
    if (key === '@/lib/supplier-portal/product-view') return { PRODUCT_STATUS: status };
    throw new Error(`Unexpected import: ${key}`);
  },
});

const options = [
  { id: 'c1', slug: 'cashew', label: 'Hạt điều', group: 'Hạt & hạt nhân', hero_image: '/images/categories/cashew-hero.jpg' },
  { id: 'c2', slug: 'pepper', label: 'Hồ tiêu', group: 'Gia vị', intro: 'Tiêu đen, tiêu trắng' },
  { id: 'c3', slug: 'rice', label: 'Gạo', group: 'Lương thực' },
  { id: 'c4', slug: 'coffee', label: 'Cà phê', group: 'Lương thực' },
  { id: 'c5', slug: 'cinnamon', label: 'Quế', group: 'Gia vị' },
  { id: 'c6', slug: 'coconut', label: 'Dừa', group: 'Nông sản khác' },
];
const products = [
  { id: 'p1', name: 'Hạt điều W320', categorySlug: 'cashew', review: 'approved' },
  { id: 'p2', name: 'Hồ tiêu đen 550g/l', categorySlug: 'pepper', review: 'pending' },
  { id: 'p3', name: 'Chưa chọn danh mục', categorySlug: null, review: 'draft' },
];
const render = (initial) => renderToStaticMarkup(React.createElement(exports.SupplierCategoryWorkspace, { options, initial, products }));

// 1. Danh sách danh mục + tổng quan + cột phạm vi + danh sách sản phẩm đều có mặt.
const html = render(['cashew']);
assert.match(html, /Danh mục đang mở/, 'Có khối danh mục đang mở');
assert.match(html, /Tìm danh mục…/, 'Có ô tìm danh mục');
for (const group of ['Hạt &amp; hạt nhân', 'Gia vị', 'Lương thực']) assert.ok(html.includes(group), `Nhóm danh mục ${group} hiện tiêu đề nhóm`);
assert.match(html, /<button[^>]*aria-pressed="true"/, 'Danh mục đã chọn có aria-pressed');
assert.match(html, /1 sản phẩm/, 'Dòng danh mục hiện số sản phẩm đang dùng');

// 1b. Danh mục là DANH SÁCH, không phải lưới thẻ có ảnh bìa.
assert.doesNotMatch(html, /<img/, 'Trang danh mục không dùng ảnh bìa');
assert.doesNotMatch(html, /aspect-\[16\/10\]/, 'Không còn thẻ ảnh tỉ lệ 16:10');
assert.doesNotMatch(html, /<svg[^>]*data-icon="(?!Check|FolderTree|Info|Package|Search|X)/, 'Chỉ dùng icon điều hướng, không icon trang trí cho danh mục');
assert.match(html, /<ul class="divide-y divide-ink-100"><li><button type="button" aria-pressed/, 'Danh mục hiện thành dòng trong danh sách');
assert.match(html, /py-2 text-left/, 'Dòng danh mục gọn (padding nhỏ)');
assert.match(html, /rounded-\[5px\]/, 'Dòng danh mục có ô tích thay cho ảnh');
assert.deepEqual((html.match(/<li><button/g) ?? []).length, 6, 'Mỗi danh mục đúng một dòng');
assert.match(html, /Hiển thị 6\/6 danh mục/, 'Có dòng đếm danh mục đang hiện');

// 1c. Danh mục gốc (không có ngành cha) gom vào nhóm "Danh mục chính", đứng đầu danh sách.
const rooted = renderToStaticMarkup(React.createElement(exports.SupplierCategoryWorkspace, {
  options: [{ id: 'r1', slug: 'rice', label: 'Gạo', group: null }, ...options],
  initial: [], products: [],
}));
assert.match(rooted, /Danh mục chính/, 'Danh mục gốc có tiêu đề nhóm rõ ràng');
assert.ok(rooted.indexOf('Danh mục chính') < rooted.indexOf('Hạt &amp; hạt nhân'), 'Nhóm danh mục gốc đứng đầu danh sách');
assert.match(html, /role="progressbar"[^>]*aria-valuenow="1"/, 'Cột phạm vi có thanh tiến độ đúng số đã chọn');
assert.match(html, /Phạm vi đang chọn/, 'Có cột phạm vi đang chọn');
assert.match(html, /lg:sticky lg:top-20/, 'Cột phạm vi dính khi cuộn');
assert.match(html, /lg:hidden/, 'Có thanh lưu riêng cho mobile');
assert.match(html, /Sản phẩm theo danh mục/, 'Có khối sản phẩm theo danh mục');
assert.match(html, /Ngoài phạm vi/, 'Sản phẩm thuộc danh mục chưa chọn được đánh dấu ngoài phạm vi');
assert.match(html, /Đã chọn/, 'Dải tổng quan có ô Đã chọn');
assert.match(html, /Chưa gắn danh mục/, 'Sản phẩm chưa gắn danh mục được nhắc riêng');

// 2. Danh mục đã chọn gửi đúng field cũ, có nút bỏ.
assert.match(html, /name="requested_category_slugs" value="cashew"/, 'Danh mục đã chọn gửi bằng input ẩn như cũ');
assert.match(html, /aria-label="Bỏ Hạt điều"/, 'Bỏ được danh mục ngay trong cột phạm vi');

// 2b. Thẻ bìa ảnh đã bị bỏ khỏi kiểu dữ liệu, không còn trường ảnh chết.
const proposals = read('../lib/supplier-portal/category-proposals.ts');
assert.doesNotMatch(proposals, /hero_image/, 'Kiểu lựa chọn danh mục không còn mang ảnh bìa');

// 3. Chưa chọn gì: không gửi danh mục nào và có lời nhắc.
const empty = render([]);
assert.doesNotMatch(empty, /name="requested_category_slugs"/, 'Chưa chọn thì không gửi danh mục nào');
assert.match(empty, /Chưa chọn danh mục nào/, 'Có lời nhắc khi chưa chọn danh mục');
assert.match(empty, /Cần chuyển trước khi bỏ danh mục/, 'Chưa chọn danh mục thì sản phẩm có danh mục được coi là ngoài phạm vi');

// 4. Đủ 5 danh mục: thẻ còn lại bị khoá, không vượt trần.
const full = render(['cashew', 'pepper', 'rice', 'coffee', 'cinnamon']);
assert.match(full, /Đã chọn 5\/5/, 'Hiện đúng trần 5 danh mục');
assert.match(full, /<button type="button" disabled="" aria-pressed="false"|<button type="button" aria-pressed="false" disabled=""/, 'Dòng danh mục thứ sáu bị khoá khi đã đủ 5');
assert.match(full, /Đã chọn đủ 5 danh mục/, 'Có lời giải thích khi chạm trần');

// 5. Trang server: dùng PageHeader, không tự dựng h1/main, chỉ đọc dữ liệu rồi chuyển cho workspace.
const page = read('../app/supplier/portal/categories/page.tsx');
assert.match(page, /<PageHeader/, 'Trang dùng PageHeader chung');
assert.doesNotMatch(page, /<h1|<main/, 'Trang không tự dựng tiêu đề/khung riêng');
assert.match(page, /<SupplierCategoryWorkspace/, 'Trang chuyển dữ liệu cho workspace');
assert.match(page, /productCategorySlug\(product\)/, 'Danh mục của sản phẩm lấy từ một hàm dùng chung');
assert.match(page, /productReview\(product\)/, 'Trạng thái duyệt lấy từ lớp dữ liệu sản phẩm dùng chung');
assert.match(page, /Chưa có danh mục nào để chọn/, 'Giữ nguyên trạng thái chưa có danh mục');
assert.match(page, /portalApproved\(access\.supplier\)/, 'Giữ kiểm tra quyền cổng');
assert.match(read('../app/supplier/portal/categories/actions.ts'), /productCategorySlug\(p\)/, 'Server action dùng cùng hàm xác định danh mục của sản phẩm');

// 6. Một nguồn duy nhất cho "sản phẩm thuộc danh mục nào": trang và action không lệch nhau.
const scope = await import('node:module').then(({ createRequire }) => {
  const require = createRequire(import.meta.url);
  void require;
  const out = {};
  vm.runInNewContext(ts.transpileModule(read('../lib/supplier-portal/category-proposals.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: out, require: () => { throw new Error('no imports expected'); }, console });
  return out;
});
assert.equal(scope.productCategorySlug({ reviewed_category_slug: 'rice', supplier_category_proposal: 'cashew', category: 'pepper' }), 'rice', 'Danh mục staff chốt được ưu tiên');
assert.equal(scope.productCategorySlug({ reviewed_category_slug: null, supplier_category_proposal: 'cashew', category: 'pepper' }), 'cashew', 'Sau đó tới danh mục NCC đề xuất');
assert.equal(scope.productCategorySlug({ reviewed_category_slug: null, supplier_category_proposal: null, category: 'pepper' }), 'pepper');
assert.equal(scope.productCategorySlug({ reviewed_category_slug: null, supplier_category_proposal: null, category: null }), null, 'Sản phẩm chưa gắn danh mục trả null, không bịa slug');

// 7. Nút lưu vẫn gọi đúng server action cũ với FormData của form (không gọi API mới).
assert.match(source, /saveSupplierCategoriesAction\(new FormData\(event\.currentTarget\)\)/, 'Nút lưu gửi FormData qua server action cũ');
assert.match(source, /type="submit"/, 'Có nút submit thật trong form');
assert.match(source, /role="status"/, 'Kết quả lưu được đọc bởi trình đọc màn hình');
console.log('✅ Supplier category page: danh sách danh mục gọn (không ảnh bìa), cột phạm vi dính, số sản phẩm theo danh mục — cùng hành vi 1–5 danh mục CMS.');
