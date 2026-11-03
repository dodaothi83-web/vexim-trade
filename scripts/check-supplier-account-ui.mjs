// Account-first flow UI: one login, account signup in the auth shell, locked dashboard until staff approval.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';
import { loadAuthDictionary } from './lib/auth-dictionary.mjs';
import { loadPortalDictionary } from './lib/portal-dictionary.mjs';
import { loadFormat } from './lib/i18n-format.mjs';

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
// Trang/biểu mẫu nhận chuỗi từ từ điển; check chạy cả bản tiếng Anh (mặc định) và tiếng Việt.
const authMessages = loadAuthDictionary();
const portalCopy = loadPortalDictionary();
let activeLocale = 'en';
const i18nServer = {
  getAuthMessages: async () => ({ locale: activeLocale, m: authMessages[activeLocale] }),
  getPortalMessages: async () => ({
    locale: activeLocale,
    intl: activeLocale === 'vi' ? 'vi-VN' : 'en-GB',
    m: portalCopy[activeLocale],
  }),
};
const link = { default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) };
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const form = load('../app/(auth)/supplier/register/supplier-account-form.tsx', {
  'react/jsx-runtime': jsx, 'react': React, 'next/link': link, 'lucide-react': icons,
  '@/components/form-challenge': { FormChallenge: () => null },
});
const formHtml = renderToStaticMarkup(React.createElement(form.SupplierAccountForm, {
  messages: authMessages.en.supplierRegister.form,
  lang: 'en',
}));
for (const fragment of ['name="email"', 'name="password"', 'name="consent"', 'intent=signup', 'Create account with email'])
  assert.ok(formHtml.includes(fragment), `Account form includes ${fragment}`);
// Chỉ hai ô nhập: nhập lại mật khẩu là bước thừa, mật khẩu hiện được bằng nút con mắt.
assert.doesNotMatch(formHtml, /name="password2"|Repeat password|Nhập lại mật khẩu/, 'Bỏ ô nhập lại mật khẩu');
assert.doesNotMatch(formHtml, /name="tax_number"|name="supplier_type"|Đăng ký doanh nghiệp/, 'Company fields belong in the locked portal, not account creation');
const signupSource = source('../app/api/supplier-signup/route.ts');
assert.doesNotMatch(signupSource, /createSupplier\(|saveInitialEvidence\(/);
assert.match(signupSource, /supplier_id: null/);
// Bước 1 luôn là chọn loại tài khoản: mọi lối vào đăng ký đều qua /register.
assert.match(source('../app/(auth)/login/page.tsx'), /href="\/register"/);
assert.match(source('../app/supplier/apply/page.tsx'), /"\/register"/);
assert.match(source('../app/(auth)/register/account-type-chooser.tsx'), /\/supplier\/register\?type=supplier/);

const register = load('../app/(auth)/supplier/register/page.tsx', {
  'react/jsx-runtime': jsx, 'next/link': link,
  'next/navigation': { redirect: (href) => { throw Object.assign(Error('redirect'), { href }); } },
  '@/lib/auth/session': { getSession: async () => null }, './supplier-account-form': form,
  '@/components/auth-split-shell': { AuthSplitShell: ({ children }) => React.createElement('div', null, children) },
  '@/lib/i18n/server': i18nServer,
});
// Thiếu ?type=supplier thì quay về màn chọn loại tài khoản.
await assert.rejects(() => register.default({ searchParams: Promise.resolve({}) }), (error) => error.href === '/register');
await assert.rejects(() => register.default({ searchParams: Promise.resolve({ oauth: 'failed' }) }), (error) => error.href === '/register');
const registerHtml = renderToStaticMarkup(await register.default({ searchParams: Promise.resolve({ type: 'supplier' }) }));
assert.match(registerHtml, /Step 1 of 2/, 'Bước 1 hiển thị bằng tiếng Anh khi ngôn ngữ là en');
assert.match(registerHtml, /href="\/login"/);
// Cùng trang, ngôn ngữ tiếng Việt: chuỗi phải đổi theo cookie chứ không cứng trong component.
activeLocale = 'vi';
const registerVi = renderToStaticMarkup(await register.default({ searchParams: Promise.resolve({ type: 'supplier' }) }));
activeLocale = 'en';
assert.match(registerVi, /Bước 1\/2/, 'Bản tiếng Việt vẫn giữ nguyên câu chữ cũ');
assert.match(registerVi, /href="\/register"/);

const user = { id: 'unlinked', email: 'new@example.com', role: 'supplier', is_active: true, supplier_id: null };
let portalAccessCalls = 0;
const portal = load('../app/supplier/portal/page.tsx', {
  'react/jsx-runtime': jsx, 'next/link': link, 'next/navigation': { redirect: () => { throw Error('unexpected redirect'); } },
  'lucide-react': icons, '@/lib/i18n/server': i18nServer, '@/lib/i18n/format': loadFormat(),
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
assert.match(html, /Overview/, 'Trang tổng quan đọc tiêu đề từ từ điển theo cookie (mặc định tiếng Anh)');
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
const asideCopy = portalCopy.vi.onboarding.aside;
assert.ok(asideCopy.clickDone.length > 0 && actualForm.includes('{m.aside.clickDone}'), 'Cột phải giữ một tiến trình duy nhất, bấm lại bước đã xong được');
assert.match(asideCopy.clickDone, /Bấm vào bước đã xong/, 'Câu hướng dẫn tiến trình nằm trong từ điển');
assert.match(actualForm, /lg:grid-cols-\[minmax\(0,2fr\)_minmax\(320px,1fr\)\]/, 'Biểu mẫu chia hai cột: nội dung chính khoảng hai phần ba, cột hướng dẫn một phần ba');
assert.match(actualForm, /lg:sticky lg:top-20/, 'Cột hướng dẫn bám theo khi cuộn trên desktop');
assert.equal((actualForm.match(/role="progressbar"/g) ?? []).length, 2, 'Một tiến trình: bản desktop ở cột phải, bản thu gọn cho mobile');
assert.match(asideCopy.prepareTitle, /Cần chuẩn bị gì/, 'Cột phải nói rõ cần chuẩn bị gì');
assert.match(asideCopy.afterTitle, /Sau khi hồ sơ được duyệt/, 'Cột phải cho thấy việc gì mở ra sau khi duyệt');
assert.match(actualForm, /\{m\.aside\.prepareTitle\}/, 'Cột phải đọc tiêu đề từ từ điển');
assert.match(actualForm, /\{m\.aside\.afterTitle\}/, 'Mục sau khi duyệt đọc tiêu đề từ từ điển');
assert.doesNotMatch(actualForm, /gói Miễn phí|nâng cấp gói/i, 'Cột phải không bán gói dịch vụ');
assert.match(actualForm, /placeholder=\{m\.company\.placeholders\.name\}/, 'Trường mẫu lấy ví dụ điền sẵn từ từ điển');
assert.match(portalCopy.vi.onboarding.company.placeholders.name, /vd: Công ty TNHH/, 'Bản tiếng Việt giữ ví dụ cũ');
assert.match(actualForm, /href="\/dieu-khoan-su-dung"/, 'Business form links to the Vietnamese Terms of Service');
assert.match(actualForm, /name="information_accuracy"/, 'Business form requires the truthfulness confirmation');
console.log('✅ Account UI: separate signup, one login, locked dashboard business form, no premature portal navigation.');
