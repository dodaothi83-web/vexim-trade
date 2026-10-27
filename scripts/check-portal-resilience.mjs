// node scripts/check-portal-resilience.mjs — thiếu một bảng không được làm trắng cổng NCC,
// và mỗi chức năng nằm đúng trang của nó.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dashboardPage = read('app/supplier/portal/page.tsx');
const noticeRoute = read('app/api/supplier-portal/notifications/route.ts');

// 1. Tổng quan chỉ tải dữ liệu của tổng quan, qua lớp optional.
const loaderOf = (source) => {
  const start = source.indexOf('const degraded: string[] = [];');
  const end = source.indexOf('const board =', start);
  return source.slice(start, end);
};
const dashLoader = loaderOf(dashboardPage);
assert.ok(dashLoader.length > 0, 'Trang tổng quan có khối tải dữ liệu');
assert.equal((dashLoader.match(/optional\(/g) || []).length, 7, 'Mỗi nguồn dữ liệu của tổng quan đều đi qua optional');
for (const label of ['sản phẩm', 'danh sách RFQ được chuyển', 'chứng nhận', 'hồ sơ tự gửi',
  'yêu cầu kiểm định', 'giấy tờ đợt kiểm', 'bằng chứng đã nộp'])
  assert.ok(dashLoader.includes(`optional("${label}"`), `Có nhãn cảnh báo cho ${label}`);

// 2. Tách biệt chức năng: tổng quan không mang thông báo, không mang ô tải giấy tờ.
assert.doesNotMatch(dashboardPage, /markSupplierNoticeReadAction|buildSupplierNoticeFeed/, 'Tổng quan không hiển thị thông báo');
assert.doesNotMatch(dashboardPage, /SupplierCertificateUpload|SupplierPortalUpload/, 'Tổng quan không có ô tải giấy tờ');
assert.doesNotMatch(dashboardPage, /supplierReplyAddress/, 'Tổng quan không mở danh sách RFQ, chỉ dẫn sang trang RFQ');
assert.match(dashboardPage, /Một phần dữ liệu cổng chưa tải được/);
assert.match(dashboardPage, /degraded\.map\(\(label\) => <li key=\{label\}>\{label\}<\/li>\)/);

// 3. Thông báo nằm gọn trong chuông: endpoint nhẹ trả cả nội dung, không có trang riêng.
assert.match(noticeRoute, /readsKnown/, 'Endpoint nói rõ khi không đọc được dấu đã đọc');
assert.match(noticeRoute, /slice\(0, 40\)/, 'Chuông nhận danh sách gọn, không tải cả bảng');
assert.doesNotMatch(noticeRoute, /revalidate|revalidatePath/, 'Endpoint chỉ đọc, không ghi');
assert.doesNotMatch(read('components/supplier-topbar.tsx'), /href="\/supplier\/portal\/notifications"/,
  'Không còn trang thông báo riêng để dẫn tới');

// 4. Server action không được ném lỗi khi bảng dấu đã đọc chưa có.
const action = read('app/supplier/portal/notice-actions.ts');
assert.match(action, /try \{\s*await store\.markSupplierNoticeRead\(supplier\.id, key\);/, 'Ghi dấu đã đọc có bọc try');
assert.match(action, /không lưu được dấu đã đọc thông báo/);

// 5. Gợi ý migration nói đúng file cho từng lỗi thiếu bảng/cột.
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(read('lib/db/migration-hints.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: mod.exports, module: mod, Error, RegExp });
const { migrationHint } = mod.exports;
assert.match(migrationHint(new Error("listSupplierNoticeReads: Could not find the table 'public.supplier_portal_notice_reads' in the schema cache")), /20261017_supplier_dashboard\.sql/);
assert.match(migrationHint(new Error('listSupplierRfqInvitations: column rfq_matches.response_due_at does not exist')), /20261017_supplier_dashboard\.sql/);
assert.match(migrationHint(new Error("listSubmissions: Could not find the table 'public.supplier_submissions' in the schema cache")), /20261020_supplier_self_verification_submissions\.sql/);
assert.match(migrationHint(new Error("listThing: Could not find the table 'public.chua_biet' in the schema cache")), /^Nhiều khả năng/);
assert.equal(migrationHint(new Error('fetch failed')), null, 'Lỗi mạng không bị gắn nhãn thiếu migration');
assert.equal(migrationHint(null), null);

// 6. Trang xác thực L2/L3 cũng phải báo lỗi cấu hình thay vì trắng trang.
const verifyPage = read('app/supplier/portal/verification/level-page.tsx');
assert.match(verifyPage, /chưa mở được hồ sơ tự gửi/, 'Log trang xác thực nêu rõ phần lỗi');
assert.match(verifyPage, /Chưa mở được phần tải bằng chứng/, 'Trang xác thực có màn hình báo lỗi cho NCC');
assert.match(verifyPage, /Chưa mở được hồ sơ xác minh này/, 'Hồ sơ rỗng cũng có câu báo thay vì khung trống');
assert.match(verifyPage, /không phải lỗi tài khoản của bạn/, 'Câu báo lỗi nói rõ lỗi phía Vexim');

/* ------------------------- render thật với bảng bị thiếu ------------------------- */

const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const icons = await import('lucide-react');
const jsx = await import('react/jsx-runtime');
const Link = ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children);
const Panel = ({ title, sub, count, children }) => React.createElement('section', null, title, sub ?? null, typeof count === 'number' ? String(count) : null, children);
const PageHeaderMock = ({ title, eyebrow, sub, actions }) => React.createElement('header', null,
  eyebrow ? React.createElement('p', null, eyebrow) : null,
  React.createElement('h1', null, title), sub ? React.createElement('p', null, sub) : null, actions ?? null);
const ui = {
  Panel, EmptyRow: ({ children }) => React.createElement('p', null, children),
  Kpi: ({ label, value, note }) => React.createElement('div', null, label, String(value), note),
  LevelChip: ({ label }) => React.createElement('span', null, label),
  PortalSteps: () => React.createElement('ol'), VerifyRow: () => React.createElement('div'), Info: () => React.createElement('div'),
  date: () => '23/10/2026',
};
const supplier = { id: 'sup-1', name: 'NCC Mẫu', onboarding_status: 'approved', status: 'draft', contact_name: 'A', phone: '0900', products: 'Hồ tiêu', updated_at: '2026-10-20T00:00:00Z' };
const thrown = new Error("listSupplierNoticeReads: Could not find the table 'public.supplier_portal_notice_reads' in the schema cache");

function loadModule(source, mocks) {
  const pageExports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports: pageExports, module: { exports: pageExports }, process, console: { error() {} },
    require: (key) => { assert.ok(key in mocks, `Trang cần mock ${key}`); return mocks[key]; },
    Date, Error, Promise, URL,
  });
  return pageExports;
}

const sharedMocks = {
  'react/jsx-runtime': jsx,
  react: React,
  'next/link': { default: Link },
  '@/components/page-header': { PageHeader: PageHeaderMock },
  'next/navigation': { redirect: (target) => { throw new Error(`unexpected redirect ${target}`); } },
  'lucide-react': icons,
  '@/lib/auth/session': { requireSession: async () => ({ uid: 'u1', email: 'ncc@example.com', role: 'supplier' }) },
  '@/lib/supplier-portal/onboarding': { canSubmitProfile: () => false, portalApproved: () => true },
  '@/lib/supplier-portal/policy': { INITIAL_DOCUMENT_KEYS: [] },
  '@/lib/supplier-portal/product-view': { productReview: () => 'draft' },
  '@/lib/supplier-portal/category-proposals': { categoryProposalOptions: () => [] },
  '@/lib/db/migration-hints': { migrationHint: () => 'Có thể thiếu migration: chạy supabase/migrations/20261017_supplier_dashboard.sql' },
  '@/lib/certificate-service': { daysUntilExpiry: () => null },
  '@/lib/verification': { isL1CoreDoc: () => false },
  '@/lib/rfq/reply-routing': { supplierReplyAddress: () => '' },
  '@/lib/types': { L1_DOC_ITEMS: [] },
  '@/lib/l2-scope': { l2ScopeForSupplier: (type) => type === 'trading' ? 'partner_contract' : ['manufacturer', 'cooperative'].includes(type) ? 'factory' : null },
  '@/lib/supplier-portal/verification-progress': { buildVerificationProgress: () => ({
    steps: [], approvedCount: 0, currentLevel: null, percent: 0, headline: 'Chưa có dữ liệu xác minh',
  }) },
  './verification-progress': { VerificationProgressPanel: ({ progress }) => React.createElement('section', { 'data-progress': String(progress.approvedCount) }) },
  './portal-ui': ui,
  '../portal-ui': ui,
  './supplier-profile-form': { SupplierProfileForm: () => null },
  './notice-actions': { markSupplierNoticeReadAction: async () => {} },
  '../notice-actions': { markSupplierNoticeReadAction: async () => {} },
};

// 6a. Tổng quan: bảng chứng nhận và RFQ lỗi, trang vẫn render với cảnh báo.
const dashHtml = renderToStaticMarkup(await loadModule(dashboardPage, {
  ...sharedMocks,
  '@/lib/supplier-portal/access': {
    supplierAccountAccess: async () => ({ user: { id: 'u1', email: 'ncc@example.com', supplier_id: 'sup-1' }, store: {} }),
    supplierPortalAccess: async () => ({ supplier, review: null, reviews: [], user: { id: 'u1', email: 'ncc@example.com' }, store: {
      listProductsBySupplier: async () => [],
      listSupplierRfqInvitations: async () => { throw thrown; },
      listCertificates: async () => { throw thrown; },
      listSubmissions: async () => [],
      listSupplierVerificationRequests: async () => [],
      listMedia: async () => [],
      listSubmissionItems: async () => [],
    } }),
  },
  '@/lib/supplier-portal/dashboard': { buildSupplierRfqBoard: () => ({
    invites: [], tasks: [], report: { sent: 0, responded: 0, quoted: 0, selected: 0, byProduct: [] },
  }) },
}).default({}));
assert.match(dashHtml, /Một phần dữ liệu cổng chưa tải được/, 'Tổng quan vẫn render và hiện cảnh báo');
assert.match(dashHtml, /danh sách RFQ được chuyển/, 'Cảnh báo nêu đúng phần lỗi');
assert.match(dashHtml, /chứng nhận/);
assert.doesNotMatch(dashHtml, /Đánh dấu đã đọc/, 'Tổng quan không còn khối thông báo');
assert.match(dashHtml, /data-progress="0"/, 'Dải tiến độ xác minh vẫn dựng được khi dữ liệu phụ lỗi');

// 6b. Chuông: thiếu bảng dấu đã đọc thì vẫn trả nội dung, chỉ báo readsKnown=false.
const bellRoute = loadModule(noticeRoute, {
  'next/server': { NextResponse: { json: (body) => ({ body }) } },
  '@/lib/supplier-portal/access': {
    supplierPortalAccess: async () => ({ supplier, reviews: [], user: { id: 'u1' }, store: {
      listSupplierNoticeReads: async () => { throw thrown; },
      listSupplierRfqInvitations: async () => [],
      listSupplierVerificationRequests: async () => [],
      listProductsBySupplier: async () => [],
      listCertificates: async () => [],
      listSubmissions: async () => [],
    } }),
  },
  '@/lib/supplier-portal/onboarding': { portalApproved: () => true },
  '@/lib/supplier-portal/dashboard': { buildSupplierNoticeFeed: () => ({
    unreadCount: 1,
    notices: [{ key: 'approved:1', title: 'Đã duyệt', detail: 'Hồ sơ đã duyệt', at: '2026-10-23T08:00:00Z', read: false, kind: 'verification' }],
  }) },
});
const degradedBell = await bellRoute.GET();
assert.equal(degradedBell.body.readsKnown, false, 'Chuông biết là chưa đọc được dấu đã đọc');
assert.equal(degradedBell.body.items.length, 1, 'Nội dung thông báo vẫn về chuông');
assert.equal(degradedBell.body.unread, 0, 'Không báo số chưa đọc khi không đọc được dấu');

const lostAccess = loadModule(noticeRoute, {
  'next/server': { NextResponse: { json: (body) => ({ body }) } },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => null },
  '@/lib/supplier-portal/onboarding': { portalApproved: () => false },
  '@/lib/supplier-portal/dashboard': { buildSupplierNoticeFeed: () => ({ unreadCount: 0, notices: [] }) },
});
assert.deepEqual(JSON.parse(JSON.stringify((await lostAccess.GET()).body)), { unread: 0, readsKnown: true, items: [] },
  'Mất phiên thì chuông trả rỗng, không lỗi 500');

console.log('✅ Portal resilience: mỗi chức năng một trang, chuông tự chịu lỗi, partial loads, không nút chết.');
