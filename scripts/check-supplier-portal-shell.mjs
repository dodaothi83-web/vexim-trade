// node scripts/check-supplier-portal-shell.mjs — cổng NCC phải dùng đúng khung menu của CRM.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const layout = read('app/supplier/portal/layout.tsx');
const sidebarSource = read('components/supplier-sidebar.tsx');

// 1. Khung trang: menu trái cố định, nội dung lệch phải, cùng nhịp với app/crm/layout.tsx.
assert.match(layout, /<SupplierSidebar/, 'Cổng NCC dùng menu trái dùng chung');
assert.match(layout, /<div className="lg:pl-60">/, 'Nội dung lệch phải đúng 240px như CRM');
assert.match(layout, /<main className="mx-auto min-h-screen w-full max-w-\[1200px\]/, 'Nội dung trong khung main thống nhất');
assert.doesNotMatch(layout, /listProductsBySupplier|listSupplierRfqInvitations|buildSupplierDashboard/,
  'Khung trang không tải dữ liệu của từng trang: thiếu bảng thì trang tự báo, không trắng cả cổng');
assert.match(layout, /catch \(error\) \{[\s\S]*identityFailed = true/, 'Lỗi đọc tên doanh nghiệp không đá người dùng ra ngoài');

// 2. Menu: đủ 5 mục chính, không lộ đường dẫn nội bộ của CRM.
for (const href of ['/supplier/portal"', '/supplier/portal/products', '/supplier/portal/categories',
  '/supplier/portal/traffic', '/supplier/portal/verification'])
  assert.ok(sidebarSource.includes(`href: "${href}`), `Menu có mục ${href.replace('"', '')}`);
assert.doesNotMatch(sidebarSource, /\/crm\//, 'Cổng NCC không hiện đường dẫn CRM');
assert.match(sidebarSource, /needsApproval: true/, 'Mục cần quyền được ẩn khi cổng chưa mở');
assert.match(layout, /portalApproved\(supplier\)/, 'Trạng thái mở cổng đọc từ CSDL, không từ cookie');

// 3. Cùng ngôn ngữ thị giác với CRM: nền gradient tối, mục đang chọn, nhãn nhóm, thẻ người dùng.
assert.match(sidebarSource, /bg-gradient-to-b from-ink-900 via-ink-900 to-brand-900/, 'Menu dùng đúng gradient của CRM');
assert.match(sidebarSource, /bg-white\/12 text-white/, 'Mục đang chọn dùng đúng nền sáng như CRM');
assert.match(sidebarSource, /text-\[10px\] font-bold tracking-\[0\.15em\] text-brand-200\/50/, 'Nhãn nhóm cùng cỡ chữ với CRM');
assert.match(sidebarSource, /logoutAction/, 'Thẻ người dùng có nút đăng xuất');
assert.match(sidebarSource, /fixed top-3 left-3 z-40[\s\S]*lg:hidden/, 'Có nút mở menu trên điện thoại');
assert.match(sidebarSource, /fixed inset-0 z-50 lg:hidden/, 'Menu điện thoại mở dạng ngăn kéo');

// 4. Render thật: tên doanh nghiệp, email, mục đang chọn và việc ẩn mục chưa mở quyền.
const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const jsx = await import('react/jsx-runtime');
const icons = await import('lucide-react');
const exportsObj = {};
const mocks = {
  react: React,
  'react/jsx-runtime': jsx,
  'next/link': { default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children) },
  'next/navigation': { usePathname: () => '/supplier/portal/products/p1' },
  'lucide-react': icons,
  '@/app/auth-actions': { logoutAction: async () => {} },
  '@/components/ui': { cx: (...parts) => parts.filter(Boolean).join(' ') },
  '@/components/brand-logo': { Logo: () => React.createElement('span', null, 'LOGO') },
};
vm.runInNewContext(ts.transpileModule(sidebarSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, {
  exports: exportsObj, module: { exports: exportsObj }, process,
  require: (key) => { assert.ok(key in mocks, `Menu cần mock ${key}`); return mocks[key]; },
  Error, Promise, useState: React.useState,
});
const openHtml = renderToStaticMarkup(React.createElement(exportsObj.SupplierSidebar, {
  supplierName: 'NCC Mẫu', email: 'ncc@example.com', userName: 'Nguyễn A', approved: true, publicUrl: '/suppliers/ncc-mau',
}));
for (const phrase of ['VEXIM TRADE', 'NCC Mẫu', 'ncc@example.com', 'Sản phẩm', 'Danh mục kinh doanh',
  'Lượt xem gian hàng', 'Xác thực nhà máy L2 · L3', 'Thông báo', 'Xem trang công khai'])
  assert.ok(openHtml.includes(phrase), `Menu hiện ${phrase}`);
assert.match(openHtml, /aria-current="page"[^>]*>[\s\S]*Sản phẩm/, 'Trang sản phẩm giữ mục Sản phẩm đang chọn');
assert.doesNotMatch(openHtml, /href="\/crm/, 'Menu không có đường dẫn CRM');

const pendingHtml = renderToStaticMarkup(React.createElement(exportsObj.SupplierSidebar, {
  supplierName: 'NCC Mới', email: 'moi@example.com', approved: false, publicUrl: null,
}));
assert.ok(pendingHtml.includes('ĐANG CHỜ VEXIM XÁC NHẬN'), 'Cổng chưa mở hiện rõ trạng thái chờ');
assert.ok(!pendingHtml.includes('href="/supplier/portal/products"'), 'Chưa mở cổng thì không hiện mục sản phẩm');
assert.ok(pendingHtml.includes('href="/supplier/portal"'), 'Vẫn vào được Tổng quan để nộp hồ sơ');

console.log('✅ Supplier portal shell: CRM sidebar, same tokens, supplier-only destinations, approval-aware menu.');
