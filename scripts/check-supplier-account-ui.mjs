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
  '@/lib/supplier-portal/policy': { INITIAL_DOCUMENT_KEYS: [] },
  '@/lib/supplier-portal/product-view': { productReview: () => 'draft' },
  '@/lib/supplier-portal/category-proposals': { categoryProposalOptions: () => [] },
  '@/lib/rfq/reply-routing': { supplierReplyAddress: () => '' },
  '@/lib/types': { L1_DOC_ITEMS: [] },
  '@/lib/verification': { isL1CoreDoc: () => false },
  './supplier-portal-upload': { SupplierPortalUpload: () => null },
  './supplier-profile-form': { SupplierProfileForm: ({ email }) => React.createElement('form', { 'data-email': email }, 'Company profile form') },
  './notice-actions': { markSupplierNoticeReadAction: async () => {} },
});
const html = renderToStaticMarkup(await portal.default({}));
assert.match(html, /Tổng quan/);
assert.match(html, /Bước 2\/2 · Xác minh doanh nghiệp/);
assert.match(html, /Company profile form/);
assert.match(html, /data-email="new@example.com"/);
assert.doesNotMatch(html, /Quản lý sản phẩm|RFQ của tôi|Báo cáo|supplier\/portal\/products/);
assert.equal(portalAccessCalls, 0);
const actualForm = source('../app/supplier/portal/supplier-profile-form.tsx');
assert.match(actualForm, /fetch\("\/api\/supplier-portal\/profile"/);
assert.match(actualForm, /SupplierProfileFields supplier=\{supplier\} email=\{email\}/);
assert.match(actualForm, /href="\/dieu-khoan-su-dung"/, 'Business form links to the Vietnamese Terms of Service');
assert.match(actualForm, /name="information_accuracy"/, 'Business form requires the truthfulness confirmation');
console.log('✅ Account UI: separate signup, one login, locked dashboard business form, no premature portal navigation.');
