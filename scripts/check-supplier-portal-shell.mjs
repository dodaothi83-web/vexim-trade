// node scripts/check-supplier-portal-shell.mjs
// Khung cổng NCC: một menu trái dùng chung, mỗi chức năng một trang, thông báo chỉ ở chuông.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function load(path, mocks) {
  const exports = {};
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, module: { exports }, process, console, require: (key) => {
    if (!(key in mocks)) throw new Error(`Unexpected import ${key} in ${path}`);
    return mocks[key];
  } });
  return exports;
}

const layout = read('app/supplier/portal/layout.tsx');
const sidebarSource = read('components/supplier-sidebar.tsx');

// 1. Khung trang: menu trái cố định 240px, nội dung lệch phải, cùng nhịp với khu CRM.
assert.match(layout, /<SupplierSidebar/, 'Cổng NCC dùng menu trái dùng chung');
assert.match(layout, /<div className="lg:pl-60">/, 'Nội dung lệch phải đúng 240px như CRM');
assert.match(layout, /<main className="mx-auto min-h-screen w-full max-w-\[1500px\]/, 'Nội dung trong khung main thống nhất');
assert.match(layout, /<SupplierTopbar \/>/, 'Có thanh trên riêng cho chuông thông báo');
assert.doesNotMatch(layout, /listProductsBySupplier|listSupplierRfqInvitations|buildSupplier(RfqBoard|NoticeFeed)/,
  'Khung trang không tải dữ liệu của từng trang: thiếu bảng thì trang tự báo, không trắng cả cổng');
assert.match(layout, /catch \(error\) \{\s*identityFailed = true;/, 'Lỗi đọc tên doanh nghiệp không đá người dùng ra ngoài');
assert.match(layout, /identityFailed && /, 'Chỉ chặn đăng nhập khi thật sự không có phiên hợp lệ');

// 2. Menu: mỗi chức năng là một trang riêng, không còn mục neo vào tổng quan.
const nav = sidebarSource.slice(sidebarSource.indexOf('const NAV:'), sidebarSource.indexOf('const NAV_GROUPS'));
const hrefs = [...nav.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
assert.deepEqual(hrefs, [
  '/supplier/portal', '/supplier/portal/products', '/supplier/portal/categories', '/supplier/portal/traffic',
  '/supplier/portal/rfqs', '/supplier/portal/documents', '/supplier/portal/verification', '/supplier/portal/profile',
], 'Menu xếp theo tính năng: gian hàng, công việc, xác minh, tài khoản');
assert.doesNotMatch(sidebarSource, /href: "[^"]*#/, 'Menu không trỏ vào neo trong trang tổng quan');
assert.doesNotMatch(sidebarSource, /href="\/crm/, 'Cổng NCC không hiện đường dẫn CRM');

// Thông báo chỉ ở chuông thanh trên: không mục menu, không trang riêng, không dải trạng thái.
const topbar = read('components/supplier-topbar.tsx');
assert.ok(!hrefs.includes('/supplier/portal/notifications'), 'Thông báo không nằm trong menu trái');
assert.ok(!existsSync(new URL('../app/supplier/portal/notifications', import.meta.url)), 'Không có trang thông báo riêng');
assert.doesNotMatch(topbar, /next\/link|href="\/supplier\/portal\/notifications"/, 'Chuông không dẫn sang trang khác');
assert.match(topbar, /aria-label=\{loaded && unread \? `Thông báo, \$\{unread\} chưa đọc` : "Thông báo"\}/,
  'Chuông có nhãn đọc được kèm số chưa đọc');
assert.match(topbar, /fetch\("\/api\/supplier-portal\/notifications"/, 'Chuông tự lấy dữ liệu, không chặn tải trang');
assert.match(topbar, /markSupplierNoticeReadAction/, 'Đánh dấu đã đọc ngay trong chuông');
assert.match(topbar, /max-h-\[min\(60vh,420px\)\][^"]*overflow-y-auto/, 'Danh sách cuộn trong chuông');
assert.doesNotMatch(topbar, /border-t border-brand-100 bg-brand-50/, 'Không còn dải tóm tắt thông báo dưới thanh trên');
assert.doesNotMatch(topbar, /listSupplierRfqInvitations|getStore/, 'Chuông không truy vấn CSDL từ trình duyệt');
assert.match(read('app/api/supplier-portal/notifications/route.ts'), /buildSupplierNoticeFeed/,
  'Endpoint thông báo dùng lại đúng lớp dữ liệu của cổng');

// 3. Không trang nào tự dựng <main> hay tiêu đề riêng: một ngôn ngữ thị giác.
for (const page of ['page.tsx', 'rfqs/page.tsx', 'documents/page.tsx', 'profile/page.tsx',
  'traffic/page.tsx', 'verification/page.tsx', 'categories/page.tsx']) {
  const source = read(`app/supplier/portal/${page}`);
  assert.doesNotMatch(source, /<main/, `${page} không tự dựng khung main`);
  assert.doesNotMatch(source, /<h1/, `${page} dùng tiêu đề chung PageHeader`);
  assert.match(source, /PageHeader|SupplierProductStorefront/, `${page} có tiêu đề trang`);
}

// 4. Menu vẽ đúng trạng thái đang chọn và ẩn mục cần quyền khi cổng chưa mở.
const jsx = await import('react/jsx-runtime');
function renderSidebar(pathname, props) {
  const { SupplierSidebar } = load('components/supplier-sidebar.tsx', {
    'react/jsx-runtime': jsx,
    react: React,
    'next/link': { default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children) },
    'next/navigation': { usePathname: () => pathname },
    'lucide-react': icons,
    '@/app/auth-actions': { logoutAction: async () => {} },
    '@/components/ui': { cx: (...parts) => parts.filter(Boolean).join(' ') },
    '@/components/brand-logo': { Logo: () => React.createElement('span', null, 'logo') },
  });
  return renderToStaticMarkup(React.createElement(SupplierSidebar, props));
}

const base = { supplierName: 'Dong Nai Cashew', email: 'ncc@example.com', userName: 'Nguyễn Thị B', approved: true, publicUrl: null };
const html = renderSidebar('/supplier/portal/rfqs', base);
for (const label of ['Tổng quan', 'Sản phẩm', 'Danh mục kinh doanh', 'Lượt xem gian hàng', 'RFQ &amp; báo giá',
  'Giấy tờ &amp; chứng nhận L1', 'Xác thực nhà máy L2 · L3', 'Hồ sơ doanh nghiệp'])
  assert.ok(html.includes(label), `Menu có mục ${label}`);
assert.match(html, /<a href="\/supplier\/portal\/rfqs" aria-current="page"/, 'Mục đang mở được đánh dấu');
assert.match(html, /ncc@example\.com/, 'Menu hiện email đăng nhập');
assert.match(html, /Đăng xuất/, 'Menu có lối đăng xuất như CRM');

const nested = renderSidebar('/supplier/portal/products/new', base);
assert.match(nested, /<a href="\/supplier\/portal\/products" aria-current="page"/, 'Trang con vẫn giữ mục Sản phẩm đang chọn');
assert.doesNotMatch(nested, /<a href="\/supplier\/portal" aria-current="page"/, 'Trang con không đánh dấu sai Tổng quan');

const pending = renderSidebar('/supplier/portal', { ...base, approved: false });
assert.match(pending, /ĐANG CHỜ VEXIM XÁC NHẬN/, 'Cổng chưa mở hiện rõ trạng thái chờ');
assert.ok(!pending.includes('href="/supplier/portal/rfqs"'), 'Chưa mở cổng thì không hiện mục RFQ');
assert.ok(pending.includes('href="/supplier/portal"'), 'Vẫn vào được Tổng quan để nộp hồ sơ');

// 6. Hồ sơ doanh nghiệp phản chiếu trang công khai và tự đổi ảnh được ngay trên thẻ hồ sơ.
const profile = read('app/supplier/portal/profile/page.tsx');
for (const field of ['Tên pháp nhân', 'Tên thương mại', 'Loại hình', 'Mã số thuế (tự khai)', 'Địa chỉ đăng ký',
  'Mặt hàng chính', 'Thị trường', 'Công suất mỗi tháng', 'MOQ', 'Cảng xuất', 'Incoterms', 'Thời gian giao',
  'Giới thiệu trên trang công khai', 'Bước tiếp theo'])
  assert.ok(profile.includes(field), `Hồ sơ hiển thị ${field}`);
assert.match(profile, /kind="cover"/, 'Ảnh bìa có nút thêm ảnh');
assert.match(profile, /kind="profile"/, 'Ảnh đại diện có nút thêm ảnh');
assert.match(profile, /Đang ở đây/, 'Nói rõ nhà cung cấp đang ở bước xác minh nào');
assert.match(profile, /supplier\.status === "published"/, 'Chỉ hiện nút xem trang công khai khi hồ sơ đã công khai');
assert.match(profile, /Liên hệ \(không hiển thị công khai\)/, 'Liên hệ nội bộ được ghi rõ là không công khai');

const upload = read('app/api/supplier-portal/profile-image/route.ts');
assert.match(upload, /supplierPortalAccess\(\)/, 'Lấy NCC của phiên đang đăng nhập, không nhận id từ client');
assert.doesNotMatch(upload, /supplier_id"/, 'Không đọc supplier_id từ form');
assert.match(upload, /portalApproved\(access\.supplier\)/, 'Cổng chưa mở thì không cho đổi ảnh');
assert.match(upload, /validateUpload\("image", bytes, file\.name\)/, 'Server tự kiểm magic bytes');
assert.match(upload, /3 \* 1024 \* 1024/, 'Ảnh tối đa 3 MB sau khi nén');
assert.match(read('components/supplier-photo-button.tsx'), /\/api\/supplier-portal\/profile-image/,
  'Nút + gửi ảnh lên đúng route của cổng NCC');

console.log('✅ Supplier portal shell: one menu, one page per function, notifications live inside the bell.');
