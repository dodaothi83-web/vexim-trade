#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
function load(file, mocks = {}, globals = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: false } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, console: { error() {} }, Date, Intl, ...globals,
    require(id) { assert.ok(id in mocks, `Unexpected import in ${file}: ${id}`); return mocks[id]; } });
  return mod.exports;
}
const { buyerRecommendations } = load('lib/public/buyer-recommendations.ts');
const item = (id, categorySlug = 'nuts', extra = {}) => ({ id, categorySlug, isDemo: false, isDemoSupplier: false, ...extra });
const products = [item('saved'), item('peer'), item('peer'), item('other', 'coffee'), item('demo', 'nuts', { isDemo: true }), item('demo-supplier', 'nuts', { isDemoSupplier: true })];
assert.equal(buyerRecommendations(products, ['saved'], ['nuts']).map((p) => p.id).join(','), 'peer');
assert.equal(buyerRecommendations(products, [], []).map((p) => p.id).join(','), 'saved,peer,other');
assert.equal(buyerRecommendations(products, [], [], 1).length, 1);
assert.equal(buyerRecommendations([], [], ['nuts']).length, 0);

let session = null;
let verified = true;
let published = true;
const writes = [];
const profileWrites = [];
const store = {
  getBuyerUserByEmail: async (email) => {
    assert.equal(email, 'me@example.com');
    return { id: 'my-account', email, verified_at: verified ? '2026-11-04' : null, saved: { products: [{ id: 'saved' }] } };
  },
  setBuyerSavedProduct: async (...args) => writes.push(args),
  updateBuyerUser: async (...args) => profileWrites.push(args),
};
const record = { card: { id: 'public', name: 'Public product', imagePaths: ['safe.webp'] }, category: { slug: 'nuts' } };
const actions = load('app/(public)/buyer/account/actions.ts', {
  'next/cache': { revalidatePath() {} },
  '@/lib/auth/buyer-session': { getBuyerSession: async () => session },
  '@/lib/db': { getStore: () => store },
  '@/lib/public/product-catalog': { getPublicProductRecordsByIds: async () => published ? [record] : [] },
});
assert.equal((await actions.getSavedProductsState()).authenticated, false);
assert.equal((await actions.setSavedProductAction('public', true)).ok, false);
assert.equal((await actions.updateBuyerCompanyAction('Company')).ok, false);
assert.equal(writes.length, 0);
session = { uid: 'untrusted-old-id', email: 'me@example.com' };
verified = false;
assert.equal((await actions.setSavedProductAction('public', true)).ok, false);
verified = true;
assert.equal((await actions.getSavedProductsState()).ids.join(','), 'saved');
published = false;
assert.equal((await actions.setSavedProductAction('hidden', true)).ok, false);
assert.equal((await actions.setSavedProductAction('hidden', false)).ok, true, 'Hidden products can still be removed');
assert.equal(writes.at(-1)[0], 'my-account', 'Account ID is resolved from verified email');
published = true;
assert.equal((await actions.setSavedProductAction('public', true)).ok, true);
assert.equal(writes.at(-1)[1].href, '/products/nuts/public', 'Saved metadata comes only from public projection');
assert.equal((await actions.setSavedProductAction('x'.repeat(101), true)).ok, false);
assert.equal((await actions.setSavedProductAction('public', 'yes')).ok, false);
assert.equal((await actions.updateBuyerCompanyAction('x'.repeat(161))).ok, false);
assert.equal((await actions.updateBuyerCompanyAction('  My company  ')).ok, true);
assert.equal(profileWrites.at(-1)[0], 'my-account');
assert.equal(profileWrites.at(-1)[1].company_name, 'My company');

// Render the actual async page without a database or browser, in both languages.
const icon = () => null;
let lang = 'en';
let redirectAttempt = false;
let emptyDashboard = false;
const roleIcons = load('components/brand/account-role-icons.tsx', { 'react/jsx-runtime': jsx });
const dashboardIcons = load('components/brand/buyer-dashboard-icons.tsx', { 'react/jsx-runtime': jsx });
const sourcingStatus = load('lib/sourcing/status.ts', {});
const SourcingHistory = load('components/buyer-sourcing-history.tsx', {
  'react/jsx-runtime': jsx,
  'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  '@/lib/sourcing/status': sourcingStatus,
});
const dashboard = load('app/(public)/buyer/account/page.tsx', {
  '@/components/brand/account-role-icons': roleIcons,
  '@/components/brand/buyer-dashboard-icons': dashboardIcons,
  '@/components/buyer-sourcing-history': SourcingHistory,
  '@/lib/sourcing/store': { sourcingStore: () => ({ listSourcingRequests: async (email) => {
    assert.equal(email, session.email);
    return [{ id: 'my-sourcing', content: 'My sourcing requirement', status: 'new', created_at: '2026-11-04T00:00:00Z', internal_note: 'SOURCING SECRET', assigned_to: 'PRIVATE ASSIGNEE' }];
  } }) },
  'react/jsx-runtime': jsx,
  'next/link': { default: ({ children, prefetch, ...props }) => React.createElement('a', props, children) },
  'lucide-react': new Proxy({}, { get: () => icon }),
  '@/lib/auth/buyer-session': { requireBuyerSession: async (next) => { assert.ok(next.startsWith('/buyer/account')); if (redirectAttempt) throw new Error('redirect'); return session; } },
  '@/lib/db': { getStore: () => ({
    getBuyerUserByEmail: async () => ({ email: session.email, company_name: 'My company', verified_at: 'today', saved: { products: emptyDashboard ? [] : [{ id: 'hidden', href: 'javascript:evil()', name: 'PRIVATE SNAPSHOT' }], comparisons: [] } }),
    listBuyerRfqsByEmail: async (email) => { assert.equal(email, session.email); return emptyDashboard ? [] : [{ id: 'mine', code: 'RFQ-1', product_text: 'My product request', status: 'new', created_at: '2026-11-04T00:00:00Z', access_token: 'my-token', internal_notes: 'NEVER RENDER THIS' }, { id: 'my-question', code: 'RFQ-2', product_text: 'My product question', status: 'matching', created_at: '2026-11-04T00:00:00Z', access_token: 'question-token', specs: { inquiry_kind: 'supplier_question' } }]; },
    listCategories: async () => [],
  }) },
  '@/lib/i18n/server': { getLocale: async () => lang },
  '@/lib/public/product-catalog': { getPublicProductRecordsByIds: async () => [], listPublicCategoryProducts: async () => [], loadPublicProductCatalogSnapshot: async () => ({}) },
  '@/lib/public/buyer-recommendations': { buyerRecommendations },
  '@/components/home-product-feed': { HomeProductFeed: icon },
  '@/components/buyer-saved-products': { SaveProductButton: ({ id }) => React.createElement('button', { 'data-remove-id': id }, 'Remove') },
  '@/components/buyer-account-profile': { BuyerAccountProfile: ({ email }) => React.createElement('input', { readOnly: true, value: email }) },
  '@/lib/config': { COMPANY: { contactEmail: 'support@example.com' } },
});
async function resolve(element) {
  if (!element || typeof element !== 'object') return element;
  if (Array.isArray(element)) return Promise.all(element.map(resolve));
  if (typeof element.type === 'function') return resolve(await element.type(element.props));
  const children = await resolve(element.props.children);
  return Array.isArray(children) ? React.cloneElement(element, {}, ...children) : React.cloneElement(element, {}, children);
}
for (const locale of ['en', 'vi']) {
  lang = locale;
  for (const tab of ['overview', 'requests', 'saved', 'profile', 'invalid']) {
    const tree = await dashboard.default({ searchParams: Promise.resolve({ tab }) });
    const html = renderToStaticMarkup(await resolve(tree));
    assert.ok(html.includes(`lang="${locale}"`));
    assert.match(html, /data-vexim-account-icon="buyer-account"/);
    assert.doesNotMatch(html, /data-vexim-buyer-icon="enquiries"|data-vexim-buyer-icon="saved-products"/, 'Populated sections do not render empty-state artwork');
    assert.doesNotMatch(html, /NEVER RENDER THIS|SOURCING SECRET|PRIVATE ASSIGNEE|javascript:|PRIVATE SNAPSHOT|href="\/products"/);
    if (tab === 'requests' || tab === 'overview') {
      assert.match(html, /\/buyer\/account\/sourcing\/my-sourcing/);
      assert.match(html, /\/buyer\/account\/requests\/mine/);
      assert.match(html, /\/buyer\/account\/requests\/my-question/);
      assert.ok(html.includes(locale === 'vi' ? 'Câu hỏi sản phẩm' : 'Product enquiry'));
      assert.ok(html.includes(locale === 'vi' ? 'Yêu cầu báo giá' : 'Quote request'));
    }
    if (tab === 'saved') assert.match(html, /data-remove-id="hidden"/);
    if (tab === 'profile') assert.match(html, /me@example.com/);
  }
}
for (lang of ['en', 'vi']) {
  emptyDashboard = true;
  const html = renderToStaticMarkup(await resolve(await dashboard.default({ searchParams: Promise.resolve({ tab: 'overview' }) })));
  assert.match(html, /data-vexim-buyer-icon="enquiries"/);
  assert.match(html, /data-vexim-buyer-icon="saved-products"/);
  assert.match(html, /data-vexim-account-icon="buyer-account"/);
  assert.match(html, /href="\/#categories"/);
  assert.match(html, /href="\/rfq"/);
  const nav = html.match(/<nav[^>]*aria-label="(?:Account navigation|Điều hướng tài khoản)"[\s\S]*?<\/nav>/)[0];
  assert.doesNotMatch(nav, /data-vexim-account-icon|data-vexim-buyer-icon/, 'Menu keeps the original simple icons');
}
emptyDashboard = false;
const dashboardSource = read('app/(public)/buyer/account/page.tsx');
assert.match(dashboardSource, /const nav = \[\{ id: "overview", icon: LayoutDashboard \}, \{ id: "requests", icon: ClipboardList \}, \{ id: "saved", icon: Heart \}, \{ id: "profile", icon: UserRound \}\]/);
redirectAttempt = true;
await assert.rejects(dashboard.default({ searchParams: Promise.resolve({ tab: 'saved' }) }), /redirect/);

// Saved-list removal is a compact action, not a toggle that could re-save stale state.
let pendingRemoval;
let removeArgs;
let savedContext = { state: { authenticated: true, ids: [] }, isVi: false, update: () => {} };
const removal = load('components/buyer-saved-products.tsx', {
  react: { createContext: () => ({}), useContext: () => savedContext, useState: () => [false, () => {}], useTransition: () => [false, (callback) => { pendingRemoval = callback(); }] },
  'react/jsx-runtime': jsx,
  'next/navigation': { useRouter: () => ({ refresh() {} }) },
  'next/link': { default: icon },
  'lucide-react': { Heart: icon, Trash2: () => React.createElement('svg', { 'data-trash': true }) },
  '@/app/(public)/buyer/account/actions': { setSavedProductAction: async (...args) => { removeArgs = args; return { ok: true }; } },
});
for (const isVi of [false, true]) {
  savedContext = { ...savedContext, isVi };
  const tree = removal.SaveProductButton({ id: 'saved', href: '/buyer/account?tab=saved', removeOnly: true });
  const button = tree.props.children[0];
  assert.equal(button.props.title, isVi ? 'Bỏ lưu sản phẩm' : 'Remove saved product');
  assert.equal(button.props['aria-label'], button.props.title);
  assert.equal(button.props['aria-pressed'], undefined);
  assert.match(button.props.className, /h-9 w-9/);
  const markup = renderToStaticMarkup(tree);
  assert.match(markup, /data-trash="true"/);
  assert.doesNotMatch(markup, />Remove saved product<|>Bỏ lưu sản phẩm</);
  button.props.onClick();
  await pendingRemoval;
  assert.equal(removeArgs[0], 'saved');
  assert.equal(removeArgs[1], false, 'Removal never re-saves even if the provider state is stale');
}
assert.match(read('app/(public)/buyer/account/page.tsx'), /<SaveProductButton id=\{saved.id\} href=\{href\} removeOnly/);

// Database mutations must be atomic, server-only, preserve comparisons, and scoped by account ID.
const sql = read('supabase/migrations/20261107_buyer_saved_products.sql');
assert.match(sql, /for update/i);
assert.match(sql, /jsonb_set\(current_saved, '\{products\}'/);
assert.match(sql, /where id = p_account_id/);
assert.match(sql, /revoke all[\s\S]*from public, anon, authenticated/);
assert.match(sql, /grant execute[\s\S]*to service_role/);
assert.match(read('lib/db/supabase.ts'), /replace\(\/\[\\\\%_\]\/g/);
assert.match(read('app/(public)/layout.tsx'), /sessionKey=\{buyerSession\?\.email/);
assert.match(read('app/(public)/buyer/account/page.tsx'), /index: false/);
console.log('✅ Buyer account: authenticated EN/VI tabs, own requests, safe saves/removal, profile validation and category recommendations.');
