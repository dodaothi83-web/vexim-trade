// node scripts/check-portal-resilience.mjs — thiếu một bảng không được làm trắng cổng nhà cung cấp.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = read('app/supplier/portal/page.tsx');

// 1. Mọi dữ liệu phụ của cổng đều tải qua lớp optional, không await trần trong Promise.all.
const loader = page.slice(page.indexOf('const [media, requests, invites, reads'), page.indexOf('const sp = await searchParams'));
assert.ok(loader.length > 0, 'Khối tải dữ liệu cổng tồn tại');
assert.equal((loader.match(/optional\(/g) || []).length, 7, 'Bảy nguồn dữ liệu đều đi qua optional');
for (const label of ['giấy tờ của đợt kiểm', 'yêu cầu kiểm định', 'danh sách RFQ được chuyển',
  'trạng thái đã đọc thông báo', 'sản phẩm', 'chứng nhận', 'hồ sơ tự gửi'])
  assert.ok(loader.includes(`"${label}"`), `Có nhãn cảnh báo cho ${label}`);
assert.doesNotMatch(loader, /store\.listSupplierNoticeReads\(supplier\.id\)\s*,/, 'Không còn await trần cho dấu đã đọc');

// 2. Trang phải nói rõ phần nào lỗi, và không hiện nút đánh dấu khi không lưu được.
assert.match(page, /Một phần dữ liệu cổng chưa tải được/);
assert.match(page, /degraded\.map\(\(label\) => <li key=\{label\}>\{label\}<\/li>\)/);
assert.match(page, /const readsKnown = !degraded\.includes\("trạng thái đã đọc thông báo"\)/);
assert.match(page, /\{!n\.read && readsKnown && <form action=\{markSupplierNoticeReadAction\}/, 'Ẩn nút đánh dấu khi chưa đọc được dấu đã đọc');

// 3. Server action không được ném lỗi khi bảng dấu đã đọc chưa có.
const action = read('app/supplier/portal/notice-actions.ts');
assert.match(action, /try \{\s*await store\.markSupplierNoticeRead\(supplier\.id, key\);/, 'Ghi dấu đã đọc có bọc try');
assert.match(action, /không lưu được dấu đã đọc thông báo/);

// 4. Gợi ý migration nói đúng file cho từng lỗi thiếu bảng/cột.
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(read('lib/db/migration-hints.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: mod.exports, module: mod, Error, RegExp });
const { migrationHint } = mod.exports;
const missingTable = new Error('listSupplierNoticeReads: Could not find the table \'public.supplier_portal_notice_reads\' in the schema cache');
assert.match(migrationHint(missingTable), /20261017_supplier_dashboard\.sql/);
assert.match(migrationHint(new Error('listSupplierRfqInvitations: column rfq_matches.response_due_at does not exist')), /20261017_supplier_dashboard\.sql/);
assert.match(migrationHint(new Error('listSubmissions: Could not find the table \'public.supplier_submissions\' in the schema cache')), /20261020_supplier_self_verification_submissions\.sql/);
assert.match(migrationHint(new Error('listThing: Could not find the table \'public.chua_biet\' in the schema cache')), /^Nhiều khả năng/);
assert.equal(migrationHint(new Error('fetch failed')), null, 'Lỗi mạng không bị gắn nhãn thiếu migration');
assert.equal(migrationHint(null), null);

// 4b. Trang xác thực L2/L3 cũng phải báo lỗi cấu hình thay vì trắng trang.
const verifyPage = read('app/supplier/portal/verification/page.tsx');
assert.match(verifyPage, /chưa mở được hồ sơ tự gửi/, 'Log trang xác thực nêu rõ phần lỗi');
assert.match(verifyPage, /Chưa mở được phần tải bằng chứng/, 'Trang xác thực có màn hình báo lỗi cho NCC');
assert.match(verifyPage, /không phải lỗi tài khoản của bạn/, 'Câu báo lỗi nói rõ lỗi phía Vexim');

// 5. Render thật trang cổng với một bảng thiếu: phải ra cảnh báo, không ném lỗi.
const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const icons = await import('lucide-react');
const jsx = await import('react/jsx-runtime');
const pageExports = {};
const thrown = new Error("listSupplierNoticeReads: Could not find the table 'public.supplier_portal_notice_reads' in the schema cache");
const supplier = { id: 'sup-1', name: 'NCC Mẫu', onboarding_status: 'approved', status: 'draft', contact_name: 'A', phone: '0900', products: 'Hồ tiêu' };
const mocks = {
  'react/jsx-runtime': jsx,
  'react': React,
  'next/link': { default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children) },
  'next/navigation': { redirect: (target) => { throw new Error(`unexpected redirect ${target}`); } },
  'lucide-react': icons,
  '@/lib/auth/session': { requireSession: async () => ({ uid: 'u1', email: 'ncc@example.com', role: 'supplier' }) },
  '@/app/auth-actions': { logoutAction: async () => {} },
  '@/lib/supplier-portal/access': {
    supplierAccountAccess: async () => ({ user: { id: 'u1', email: 'ncc@example.com', supplier_id: 'sup-1' }, store: {} }),
    supplierPortalAccess: async () => ({ supplier, review: null, reviews: [], user: { id: 'u1', email: 'ncc@example.com' }, store: {
      listSupplierNoticeReads: async () => { throw thrown; },
      listSupplierRfqInvitations: async () => { throw thrown; },
      listSupplierVerificationRequests: async () => [],
      listProductsBySupplier: async () => [],
      listCertificates: async () => [],
      listSubmissions: async () => [],
    } }),
  },
  '@/lib/supplier-portal/onboarding': { canSubmitProfile: () => false, portalApproved: () => true },
  '@/lib/supplier-portal/dashboard': { buildSupplierDashboard: () => ({
    unreadCount: 2, tasks: [], invites: [], notices: [
      { key: 'approved:1', title: 'Đã duyệt', detail: 'Hồ sơ đã duyệt', at: '2026-10-23T08:00:00Z', read: false },
    ], report: { sent: 0, responded: 0, quoted: 0, selected: 0, byProduct: [] },
  }) },
  '@/lib/supplier-portal/policy': { INITIAL_DOCUMENT_KEYS: [] },
  '@/lib/supplier-portal/product-view': { productReview: () => 'draft' },
  '@/lib/supplier-portal/category-proposals': { categoryProposalOptions: () => [] },
  '@/lib/rfq/reply-routing': { supplierReplyAddress: () => '' },
  '@/lib/types': { L1_DOC_ITEMS: [] },
  '@/lib/verification': { isL1CoreDoc: () => false },
  '@/lib/certificate-service': { daysUntilExpiry: () => 1 },
  '@/lib/db/migration-hints': { migrationHint: () => 'Có thể thiếu migration: chạy supabase/migrations/20261017_supplier_dashboard.sql' },
  './supplier-portal-upload': { SupplierPortalUpload: () => null },
  './certificate-upload': { SupplierCertificateUpload: () => null },
  './supplier-profile-form': { SupplierProfileForm: () => null },
  './notice-actions': { markSupplierNoticeReadAction: async () => {} },
};
vm.runInNewContext(ts.transpileModule(page, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, {
  exports: pageExports, module: { exports: pageExports }, process, console: { error() {} },
  require: (key) => { assert.ok(key in mocks, `Trang cổng cần mock ${key}`); return mocks[key]; },
  Date, Error, Promise, URL,
});
const html = renderToStaticMarkup(await pageExports.default({ searchParams: Promise.resolve({}) }));
assert.match(html, /Một phần dữ liệu cổng chưa tải được/, 'Trang vẫn render và hiện cảnh báo');
assert.match(html, /trạng thái đã đọc thông báo/, 'Cảnh báo nêu đúng phần lỗi');
assert.match(html, /danh sách RFQ được chuyển/);
assert.match(html, /Chưa đọc được dấu đã đọc/, 'Tiêu đề mục thông báo nói rõ vì sao không có số chưa đọc');
assert.doesNotMatch(html, /Đánh dấu đã đọc/, 'Không hiện nút không lưu được');
assert.match(html, /Đã duyệt/, 'Nội dung thông báo vẫn hiện dù thiếu bảng');

console.log('✅ Portal resilience: partial loads, visible warning, no dead buttons, actionable migration hint.');
