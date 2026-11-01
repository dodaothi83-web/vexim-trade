// Render the actual supplier dashboard with scope-specific history; no database or credentials.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const jsx = require('react/jsx-runtime');
const icons = require('lucide-react');
const Link = ({ children, ...props }) => React.createElement('a', props, children);
function load(path, mocks = {}) {
  const mod = { exports: {} };
  const js = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(js, { module: mod, exports: mod.exports, require: (id) => {
    if (id === 'server-only') return {};
    assert.ok(id in mocks, `Unexpected ${id} in ${path}`);
    return mocks[id];
  }, process, console, Date, Map, Set, Object }, { filename: path });
  return mod.exports;
}
const types = load('lib/types.ts');
const scope = load('lib/l2-scope.ts');
const policy = { INITIAL_DOCUMENT_KEYS: ['business_license', 'food_safety', 'haccp_or_brc', 'product_certs', 'export_license'] };
const progress = load('lib/supplier-portal/verification-progress.ts', {
  '@/lib/types': types, '@/lib/l2-scope': scope, './policy': policy,
});
const ui = load('app/supplier/portal/portal-ui.tsx', {
  'react/jsx-runtime': jsx, 'next/link': { default: Link },
});
const progressUi = load('app/supplier/portal/verification-progress.tsx', {
  'react/jsx-runtime': jsx, 'next/link': { default: Link }, 'lucide-react': icons, './portal-ui': ui,
});
let subject;
const user = { id: 'u1', email: 'owner@example.com', role: 'supplier', is_active: true, supplier_id: 's1' };
const store = {
  listProductsBySupplier: async () => [], listSupplierRfqInvitations: async () => [],
  listCertificates: async () => [], listSubmissions: async () => subject.submissions,
  listSupplierVerificationRequests: async () => [], listMedia: async () => [], listSubmissionItems: async () => [],
};
const dashboard = load('app/supplier/portal/page.tsx', {
  'react/jsx-runtime': jsx, 'next/link': { default: Link }, 'next/navigation': { redirect: () => { throw Error('Unexpected redirect'); } },
  'lucide-react': icons,
  '@/components/page-header': { PageHeader: ({ title, sub, actions }) => React.createElement('header', null, title, sub, actions) },
  '@/lib/auth/session': { requireSession: async () => user },
  '@/lib/supplier-portal/access': {
    supplierAccountAccess: async () => ({ user, store }),
    supplierPortalAccess: async () => ({ supplier: subject.supplier, review: null, reviews: subject.reviews, user, store }),
  },
  '@/lib/supplier-portal/onboarding': { portalApproved: (supplier) => supplier.onboarding_status === 'approved', canSubmitProfile: (supplier) => supplier.onboarding_status === 'changes_requested' },
  '@/lib/supplier-portal/dashboard': { buildSupplierRfqBoard: () => ({ tasks: [], report: { sent: 0, responded: 0 } }) },
  '@/lib/supplier-portal/product-view': { productReview: () => 'draft' },
  '@/lib/supplier-portal/category-proposals': { categoryProposalOptions: () => [] },
  '@/lib/verification': { isL1BusinessLicense: () => false },
  '@/lib/certificate-service': { daysUntilExpiry: () => null },
  '@/lib/db/migration-hints': { migrationHint: () => null },
  '@/lib/supplier-portal/verification-progress': progress, '@/lib/l2-scope': scope,
  './supplier-profile-form': { SupplierProfileForm: () => React.createElement('div', { 'data-editable': 'true' }) }, './portal-ui': ui, './verification-progress': progressUi,
  './pending-profile-refresh': { PendingProfileRefresh: () => React.createElement('div', { 'data-refresh-waiting': 'true' }) },
});
const review = (l2_scope, status = 'approved') => ({ id: `v-${l2_scope ?? 'legacy'}`, supplier_id: 's1', target_level: 2, l2_scope, status });
const submission = (l2_scope, status = 'pending_review') => ({ id: `s-${l2_scope ?? 'legacy'}`, supplier_id: 's1', target_level: 2, l2_scope, status });
async function render(type, reviews = [], submissions = []) {
  subject = { supplier: { id: 's1', name: 'Example company', supplier_type: type, onboarding_status: 'approved', status: 'published' }, reviews, submissions };
  return renderToStaticMarkup(await dashboard.default());
}
function assertChip(markup, label, status, message) {
  const text = `${label}<span class="sr-only">: ${status}</span>`;
  const position = markup.indexOf(text);
  assert.ok(position >= 0, message ?? `${label} should read ${status}`);
  const outer = markup.lastIndexOf('<span title=', position);
  assert.ok(outer >= 0 && markup.slice(outer, position).startsWith(`<span title="${status}"`),
    'The visual tooltip and screen-reader status agree');
}
const legacyTrader = await render('trading', [review(null)]);
assertChip(legacyTrader, 'L2 · Nhà máy đối tác', 'Chưa duyệt', 'A factory review cannot light up the partner chip');
const oldPending = await render('trading', [], [submission(null)]);
assertChip(oldPending, 'L2 · Nhà máy đối tác', 'Chưa duyệt', 'Old factory queue cannot make the partner chip pending');
const partnerPending = await render('trading', [review(null)], [submission('partner_contract')]);
assertChip(partnerPending, 'L2 · Nhà máy đối tác', 'Đang chờ xét');
// On phones, the header badges use the full second row and actions sit below
// the text instead of squeezing it into a narrow column. Desktop keeps its grid.
const headerMarkup = partnerPending.match(/<section aria-label="Trạng thái gian hàng"[\s\S]*?<\/section>/)?.[0] ?? '';
assert.match(headerMarkup, /grid-cols-\[auto_minmax\(0,1fr\)\]/);
assert.match(headerMarkup, /col-span-2 flex flex-wrap items-center/);
assert.match(headerMarkup, /btn btn-ghost btn-sm w-full sm:w-auto/);
const progressMarkup = partnerPending.match(/<section id="xac-minh"[\s\S]*?<\/section>/)?.[0] ?? '';
assert.match(progressMarkup, /grid-cols-\[auto_minmax\(0,1fr\)\] items-start/);
assert.match(progressMarkup, /col-start-2 justify-self-start sm:shrink-0/);
const partnerApproved = await render('trading', [review(null), review('partner_contract')]);
assertChip(partnerApproved, 'L2 · Nhà máy đối tác', 'Đã duyệt');
for (const type of ['manufacturer', 'cooperative']) {
  const factory = await render(type, [review(null)]);
  assertChip(factory, 'L2 · Nhà máy', 'Đã duyệt', `${type} retains legacy factory review`);
  const oldPartner = await render(type, [review('partner_contract')]);
  assertChip(oldPartner, 'L2 · Nhà máy', 'Chưa duyệt', `${type} cannot inherit partner contract`);
}
const unknown = await render(null, [review(null)]);
assertChip(unknown, 'L2 · Chưa rõ loại hình', 'Chưa duyệt');
assert.doesNotMatch(unknown, /Chín ảnh nhà máy theo danh mục/, 'Unknown type is not guided into factory flow');
// Only the read-only waiting screen polls; the correction form must never be remounted by this poll.
subject = { supplier: { id: 's1', name: 'Example', supplier_type: 'trading', onboarding_status: 'pending' }, reviews: [], submissions: [] };
let waiting = renderToStaticMarkup(await dashboard.default());
assert.match(waiting, /data-refresh-waiting="true"/);
assert.doesNotMatch(waiting, /data-editable="true"/);
subject.supplier.onboarding_status = 'changes_requested';
store.listCategories = async () => [];
waiting = renderToStaticMarkup(await dashboard.default());
assert.doesNotMatch(waiting, /data-refresh-waiting="true"/);
assert.match(waiting, /data-editable="true"/);
console.log('✅ Dashboard header: label and status match the current L2 scope, including legacy and pending cases.');
