// Render the real CRM product list with mock data and roles; no production access.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as list from '../lib/crm/product-list.ts';

const jsx = createRequire(import.meta.url)('react/jsx-runtime');
let role = 'admin', inboxState = null, inboxFail = false;
const rows = [
  { id: 'p1', name: 'Hạt điều loại A', supplier: { id: 's1', name: 'Công ty Hạt điều', status: 'published' }, category: 'Hạt điều', supplier_review_status: 'pending', ready_for_buyer: false, ref_price: 4200, unit: 'kg', price_valid_until: '2026-12-01', spec: 'UNNECESSARY-SPEC', description: '', monthly_capacity: 'UNNECESSARY-CAPACITY', certifications: 'UNNECESSARY-CERT', oem: true, samples: true },
  { id: 'p2', name: 'Gạo', supplier: null, category: null, supplier_review_status: 'paused', ready_for_buyer: false, ref_price: null, price_valid_until: null },
  { id: 'p3', name: 'Cà phê', supplier: { id: 's2', name: 'NCC cà phê' }, category: 'Cà phê', supplier_review_status: 'approved', ready_for_buyer: true, ref_price: null, price_valid_until: null },
  { id: 'p4', name: 'Hồ tiêu', supplier: { id: 's3', name: 'NCC hồ tiêu' }, category: 'Hồ tiêu', supplier_review_status: 'changes_requested', ready_for_buyer: false, ref_price: null, price_valid_until: null },
];
const store = { listCategories: async () => [], listMediaForProducts: async () => [{ product_id: 'p1', kind: 'image', audience: 'buyer', ready: true }, { product_id: 'p4', kind: 'catalogue', audience: 'buyer', ready: true }] };
const mocks = {
  'react/jsx-runtime': jsx,
  'next/link': { default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) },
  'lucide-react': new Proxy({}, { get: () => () => null }),
  '@/lib/db': { getStore: () => store },
  '@/lib/auth/session': { requireSession: async () => ({ role }) },
  '@/lib/auth/permissions': { hasPermission: (_role, permission) => permission === 'products.manage' && role === 'admin' },
  '@/lib/auth/scope': { isOwnedBy: () => false, ownerScopeOf: () => null },
  '@/lib/queries': { listProductsWithSupplier: async () => rows },
  '@/components/ui': {
    Badge: ({ children }) => React.createElement('span', null, children),
    Breadcrumbs: () => null,
    Card: ({ children }) => React.createElement('div', null, children),
    EmptyState: ({ title }) => React.createElement('div', null, title),
    formatDate: (value) => value || '—', formatMoney: (value) => `${value} USD`,
  },
  '@/components/page-header': { PageHeader: ({ title, actions }) => React.createElement('header', null, title, actions) },
  '@/components/media-gallery': { MediaThumb: () => React.createElement('span', { 'data-thumb': true }) },
  '@/lib/media/readiness': { productReadiness: (media) => ({ ready: media.some((item) => item.ready) }) },
  '@/lib/products/grade-pricing': { auditProductStructuredUnits: () => ({ needsReview: false }) },
  '@/lib/crm/product-review-inbox': {
    loadCrmReviewInbox: async (session) => { if (session.role !== 'admin') return null; if (inboxFail) throw Error('unavailable'); return inboxState; },
    pendingFormSummary: (form, product) => form && form.product_id === product.id && form.supplier_id === product.supplier_id ?
      { id: form.id, draft: form.payload, imageUrl: form.imageUrl } : null,
  },
  '@/lib/crm/product-list': list,
};
const code = ts.transpileModule(readFileSync(new URL('../app/crm/products/page.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(code, { module, exports: module.exports, URLSearchParams, Set, Map, Number, console,
  require(id) { assert.ok(id in mocks, `Unexpected dependency ${id}`); return mocks[id]; } });
const render = async (params = {}) => renderToStaticMarkup(await module.exports.default({ searchParams: Promise.resolve(params) }));
const cardFor = (html, id) => [...html.matchAll(/<li\b[\s\S]*?<\/li>/g)].map((m) => m[0]).find((card) => card.includes(`href="/crm/products/${id}"`));
const adminHtml = await render();
const pending = cardFor(adminHtml, 'p1');
assert.ok(pending, 'Product name links to the read-only detail');
assert.match(pending, /Công ty Hạt điều.*Hạt điều/);
assert.match(pending, /Chờ Vexim kiểm tra/);
assert.match(pending, /Chưa sẵn sàng gửi buyer/);
assert.match(pending, /Giá tham khảo.*4200 USD.*2026-12-01/);
assert.match(pending, /href="\/crm\/products\/p1\/edit"[^>]*aria-label="Kiểm tra Hạt điều loại A"[^>]*>\s*Kiểm tra/);
assert.doesNotMatch(pending, />\s*(Xem|Sửa)\s*</, 'The card has neither Xem nor Sửa button');
assert.doesNotMatch(pending, /UNNECESSARY-SPEC|UNNECESSARY-CAPACITY|UNNECESSARY-CERT|gửi mẫu|OEM/);
assert.match(cardFor(adminHtml, 'p2'), /NCC đã tạm ẩn/);
assert.match(cardFor(adminHtml, 'p2'), /Chưa có NCC.*Chưa phân loại/);
assert.match(cardFor(adminHtml, 'p2'), /Chưa có giá/);
assert.match(cardFor(adminHtml, 'p3'), /Sẵn sàng gửi buyer/);
assert.match(cardFor(adminHtml, 'p4'), /Cần NCC sửa/);
const filtered = await render({ q: 'Hạt điều' });
assert.match(cardFor(filtered, 'p1'), /Khớp nhu cầu/);
assert.equal(cardFor(filtered, 'p2'), undefined);
role = 'viewer';
const readOnly = cardFor(await render(), 'p1');
assert.ok(readOnly.includes('href="/crm/products/p1"'), 'Read-only staff retain the product detail link');
assert.doesNotMatch(readOnly, /\/edit|Kiểm tra Hạt điều loại A/, 'No review/edit link for staff without products.manage');
role = 'admin';
inboxState = { prices: [{ id: 'price-id', product_id: 'p3' }], names: [] };
const inboxHtml = await render({ view: 'pending' });
assert.match(inboxHtml, /href="\/crm\/products\/quantity-review"[^>]*aria-label="Kiểm tra Cà phê"/);
assert.ok(!inboxHtml.includes('/crm/products/form-review'), 'The removed five-part form queue is never linked');
assert.doesNotMatch(inboxHtml, /Thông tin trong bản gửi|Giá trong bản gửi|Ảnh trong bản gửi/);
role = 'viewer';
const viewerHtml = await render({ view: 'pending' });
assert.doesNotMatch(viewerHtml, /quantity-review/, 'Read-only staff cannot reach the review queue');
role = 'admin'; inboxFail = true;
const failedHtml = await render(); assert.match(failedHtml, /Chưa đối chiếu được đầy đủ các bản chờ duyệt/);
assert.match(failedHtml, /href="\/crm\/products\/quantity-review"/);
console.log('✅ CRM product cards: compact details, statuses, review link, read-only access and filtering (SSR mocks).');
