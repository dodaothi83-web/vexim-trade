// Account-first flow UI: one login, account signup in the auth shell, locked dashboard until staff approval.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';

function load(path, mocks) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, process, console, require: (key) => {
    if (!(key in mocks)) throw new Error(`Unexpected import ${key} in ${path}`);
    return mocks[key];
  } });
  return exports;
}
const jsx = await import('react/jsx-runtime');
const link = { default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) };
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const form = load('../app/(auth)/supplier/register/supplier-account-form.tsx', {
  'react/jsx-runtime': jsx, 'react': React, 'next/link': link, 'lucide-react': icons,
  '@/components/form-challenge': { FormChallenge: () => null },
});
const formHtml = renderToStaticMarkup(React.createElement(form.SupplierAccountForm));
for (const fragment of ['name="email"', 'name="password"', 'name="password2"', 'name="consent"', 'intent=signup', 'Tạo tài khoản bằng email'])
  assert.ok(formHtml.includes(fragment), `Account form includes ${fragment}`);
assert.doesNotMatch(formHtml, /name="tax_number"|name="supplier_type"|Đăng ký doanh nghiệp/, 'Company fields belong in the locked portal, not account creation');
const signupSource = source('../app/api/supplier-signup/route.ts');
assert.doesNotMatch(signupSource, /createSupplier\(|saveInitialEvidence\(/);
assert.match(signupSource, /supplier_id: null/);
assert.match(source('../app/(auth)/login/page.tsx'), /href="\/supplier\/register"/);
assert.match(source('../app/supplier/apply/page.tsx'), /"\/supplier\/register"/);

const register = load('../app/(auth)/supplier/register/page.tsx', {
  'react/jsx-runtime': jsx, 'next/link': link, 'next/navigation': { redirect: () => { throw Error('unexpected redirect'); } },
  '@/lib/auth/session': { getSession: async () => null }, './supplier-account-form': form,
});
const registerHtml = renderToStaticMarkup(await register.default({ searchParams: Promise.resolve({}) }));
assert.match(registerHtml, /Bước 1\/2/);
assert.match(registerHtml, /href="\/login"/);

const user = { id: 'unlinked', email: 'new@example.com', role: 'supplier', is_active: true, supplier_id: null };
let portalAccessCalls = 0;
const portal = load('../app/supplier/portal/page.tsx', {
  'react/jsx-runtime': jsx, 'next/link': link, 'next/navigation': { redirect: () => { throw Error('unexpected redirect'); } },
  'lucide-react': icons,
  '@/components/page-header': { PageHeader: ({ title, sub, eyebrow }) => React.createElement('header', null,
    eyebrow ? React.createElement('p', null, eyebrow) : null, React.createElement('h1', null, title), sub ?? null) }, '@/lib/auth/session': { requireSession: async () => user },
  '@/app/auth-actions': { logoutAction: async () => {} },
  '@/lib/supplier-portal/access': { supplierAccountAccess: async () => ({ user, store: { listCategories: async () => [] } }),
    supplierPortalAccess: async () => { portalAccessCalls++; throw Error('unlinked account reached privileged access'); } },
  '@/lib/supplier-portal/onboarding': { canSubmitProfile: () => true, portalApproved: () => false },
  '@/lib/supplier-portal/dashboard': { buildSupplierRfqBoard: () => { throw Error('RFQ dashboard accessed before approval'); } },
  '@/lib/certificate-service': { daysUntilExpiry: () => null },
  '@/lib/db/migration-hints': { migrationHint: () => null },
  './portal-ui': { Panel: () => null, Kpi: () => null, EmptyRow: () => null, LevelChip: () => null,
    PortalSteps: () => null, VerifyRow: () => null, Info: () => null, date: () => '' },
  './pending-profile-refresh': { PendingProfileRefresh: () => null },
  '@/lib/supplier-portal/policy': { INITIAL_DOCUMENT_KEYS: [] },
  '@/lib/supplier-portal/product-view': { productReview: () => 'draft' },
  '@/lib/supplier-portal/category-proposals': { categoryProposalOptions: () => [] },
  '@/lib/rfq/reply-routing': { supplierReplyAddress: () => '' },
  '@/lib/types': { L1_DOC_ITEMS: [] },
  '@/lib/verification': { isL1BusinessLicense: () => false },
  '@/lib/l2-scope': { l2ScopeForSupplier: (type) => type === 'trading' ? 'partner_contract' : ['manufacturer', 'cooperative'].includes(type) ? 'factory' : null },
  '@/lib/supplier-portal/verification-progress': { buildVerificationProgress: () => ({
    steps: [], approvedCount: 0, currentLevel: null, percent: 0, headline: '',
  }) },
  './verification-progress': { VerificationProgressPanel: () => null },
  './supplier-portal-upload': { SupplierPortalUpload: () => null },
  './supplier-profile-form': { SupplierProfileForm: ({ email }) => React.createElement('form', { 'data-email': email }, 'Company profile form') },
  './notice-actions': { markSupplierNoticeReadAction: async () => {} },
});
const html = renderToStaticMarkup(await portal.default({}));
assert.match(html, /Tổng quan/);
assert.doesNotMatch(html, /Bước 2\/2/, 'Trang không đánh số bước thứ hai chồng lên biểu mẫu');
assert.doesNotMatch(html, /chỉ dùng được trang tổng quan và biểu mẫu hồ sơ/, 'Không lặp lại lời nhắc đã có ở cột phải biểu mẫu');
assert.match(html, /Company profile form/);
assert.match(html, /data-email="new@example.com"/);
assert.doesNotMatch(html, /Quản lý sản phẩm|RFQ của tôi|Báo cáo|supplier\/portal\/products/);
assert.equal(portalAccessCalls, 0);
const actualForm = source('../app/supplier/portal/supplier-profile-form.tsx');
assert.match(actualForm, /fetch\("\/api\/supplier-portal\/profile"/);
assert.match(actualForm, /SupplierProfileFields supplier=\{supplier\} email=\{email\}/);
assert.match(actualForm, /accountName=\{accountName\}/, 'Biểu mẫu nhận tên tài khoản để điền sẵn người liên hệ');
assert.match(actualForm, /Bấm vào bước đã xong để sửa lại\./, 'Cột phải giữ một tiến trình duy nhất, bấm lại bước đã xong được');
assert.match(actualForm, /lg:grid-cols-\[minmax\(0,2fr\)_minmax\(320px,1fr\)\]/, 'Biểu mẫu chia hai cột: nội dung chính khoảng hai phần ba, cột hướng dẫn một phần ba');
assert.match(actualForm, /lg:sticky lg:top-20/, 'Cột hướng dẫn bám theo khi cuộn trên desktop');
assert.equal((actualForm.match(/role="progressbar"/g) ?? []).length, 2, 'Một tiến trình: bản desktop ở cột phải, bản thu gọn cho mobile');
assert.match(actualForm, /Cần chuẩn bị gì/, 'Cột phải nói rõ cần chuẩn bị gì');
assert.match(actualForm, /Sau khi hồ sơ được duyệt/, 'Cột phải cho thấy việc gì mở ra sau khi duyệt');
assert.doesNotMatch(actualForm, /gói Miễn phí|nâng cấp gói/i, 'Cột phải không bán gói dịch vụ');
assert.match(actualForm, /placeholder="vd: Công ty TNHH Gạch Sài Gòn"/, 'Trường mẫu có ví dụ điền sẵn');
assert.match(actualForm, /href="\/dieu-khoan-su-dung"/, 'Business form links to the Vietnamese Terms of Service');
assert.match(actualForm, /name="information_accuracy"/, 'Business form requires the truthfulness confirmation');
console.log('✅ Account UI: separate signup, one login, locked dashboard business form, no premature portal navigation.');
