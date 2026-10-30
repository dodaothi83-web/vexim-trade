// node scripts/check-product-form-review-pages.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
const productId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', supplierId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const submissionId = 'cccccccc-cccc-cccc-cccc-cccccccccccc', imageId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const revisionId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', time = '2026-10-29T10:00:00.000Z';
let session = { uid: 'user', email: 'admin@example.com', role: 'admin' };
let actor = { email: 'admin@example.com', role: 'admin', is_active: true };
const product = { id: productId, supplier_id: supplierId, name: 'Tên cũ', name_i18n: { en: 'Old name' }, updated_at: time };
let pending = { id: submissionId, product_id: productId, supplier_id: supplierId, status: 'pending', payload: { name: '<script>bad</script>' },
  created_at: time, submitted_product_updated_at: time, warnings: [], image_selection: [{ source: 'staged', id: imageId }],
  image_snapshot: [{ source: 'staged', row: { id: imageId, product_id: productId, supplier_id: supplierId } }] };
let approved = { id: 'ffffffff-ffff-ffff-ffff-ffffffffffff', product_id: productId, supplier_id: supplierId, status: 'approved', approved_price_revision_id: revisionId, payload: { name: 'Tên đã duyệt', priceConsent: true } };
let additional = [];
let price = { id: revisionId, product_id: productId, status: 'approved' };
const nameRevision = { product_id: productId, status: 'approved', english_name: 'Approved revision name' };
const db = { from(table) {
  let data = table === 'product_form_submissions' ? [pending, ...additional, approved] : table === 'product_quantity_price_revisions' ? [price] : table === 'product_english_name_revisions' ? [nameRevision] : null;
  assert.ok(data, `unexpected table ${table}`);
  const query = { select() { return this; }, eq(key, value) { data = data.filter((row) => row[key] === value); return this; },
    order() { return this; }, limit(n) { data = data.slice(0, n); return this; }, range(start, end) { data = data.slice(start, end + 1); return this; },
    maybeSingle() { return Promise.resolve({ data: data[0] ?? null, error: null }); },
    then(resolve) { return Promise.resolve({ data, error: null }).then(resolve); },
  }; return query;
} };
function load(path, mocks, tsx = false) {
  const exports = {}, code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  vm.runInNewContext(code, { exports, Date, Number, Array, encodeURIComponent, process, require: (key) => {
    if (key === 'react/jsx-runtime') return jsx; if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key];
  } }); return exports;
}
const redirect = (path) => { throw Error(`redirect ${path}`); };
const access = load('../app/crm/products/form-review/reviewer-access.ts', { 'server-only': {}, 'next/navigation': { redirect },
  '@/lib/auth/session': { requireSession: async () => session },
  '@/lib/db/supabase': { getSupabaseClient: () => db, supabaseStore: { getUser: async () => actor } },
}).requireProductFormReviewer;
assert.equal((await access()).actor, actor);
session = { ...session, role: 'supplier' }; await assert.rejects(() => access(), /redirect/);
session = { ...session, role: 'admin' }; actor = { ...actor, is_active: false }; await assert.rejects(() => access(), /quyền/);
actor = { ...actor, is_active: true };
const Link = ({ href, children }) => React.createElement('a', { href }, children);
const PageHeader = ({ title }) => React.createElement('h1', null, title);
const common = { 'next/link': { default: Link, __esModule: true }, '@/components/page-header': { PageHeader },
  '../reviewer-access': { requireProductFormReviewer: access }, './reviewer-access': { requireProductFormReviewer: access } };
const queue = load('../app/crm/products/form-review/page.tsx', common).default;
let html = renderToStaticMarkup(await queue({ searchParams: Promise.resolve({}) }));
assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>/); assert.match(html, new RegExp(submissionId));
assert.doesNotMatch(html, /Tên đã duyệt/, 'Approved submissions never enter pending queue');
additional = Array.from({ length: 51 }, (_, i) => ({ ...pending, id: `extra-${i}`, payload: { name: `Bản gửi ${i}` } }));
html = renderToStaticMarkup(await queue({ searchParams: Promise.resolve({}) }));
assert.match(html, /Trang sau/); assert.doesNotMatch(html, /Bản gửi 50/, 'First page is bounded');
html = renderToStaticMarkup(await queue({ searchParams: Promise.resolve({ page: '2' }) }));
assert.match(html, /Bản gửi 50/); assert.match(html, /Trang trước/); additional = [];
const detail = load('../app/crm/products/form-review/[submissionId]/page.tsx', { ...common,
  'next/navigation': { notFound: () => { throw Error('not found'); } },
  '@/components/products/product-form-review-diff-table': { ProductFormReviewDiffTable: ({ rows }) => React.createElement('p', null, JSON.stringify(rows)) },
  '@/lib/db/supabase': { supabaseStore: { getProduct: async () => product, listMedia: async () => [] } },
  '@/lib/products/product-form-model': { parseProductFormDraft: (value) => value },
  '@/lib/products/product-form-image-selection': { parseDraftImageSelection: (value) => value },
  '@/lib/products/product-form-review-diff': { productFormReviewDiff: (baseline, draft, options) => [{ baseline: baseline?.name ?? null, draft: draft.name, consentKnown: options.baselineConsentKnown }] },
  '@/lib/public/product-catalog': { shareableProductImages: () => [] },
  '@/lib/products/product-form-staging-access': { isSyntheticProductFormStaging: () => false },
  './review-controls': { ProductFormReviewControls: ({ allowApproval }) => React.createElement('p', null, allowApproval ? 'Duyệt' : 'Kiểm tra') },
}).default;
html = renderToStaticMarkup(await detail({ params: Promise.resolve({ submissionId }) }));
assert.match(html, /Tên đã duyệt/); assert.match(html, /Old name/); assert.match(html, /Approved revision name/);
assert.match(html, /Ảnh chính trong bản gửi/); assert.match(html, new RegExp(imageId));
assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>/);
price = { ...price, id: imageId }; html = renderToStaticMarkup(await detail({ params: Promise.resolve({ submissionId }) }));
assert.doesNotMatch(html, /Tên đã duyệt/, 'Never use a stale unlinked form as the approved baseline');
pending = { ...pending, image_snapshot: [{ source: 'staged', row: { id: imageId, product_id: productId, supplier_id: productId } }] };
html = renderToStaticMarkup(await detail({ params: Promise.resolve({ submissionId }) }));
assert.match(html, /Không xác nhận được danh sách ảnh/); assert.doesNotMatch(html, /Ảnh chính trong bản gửi/);
await assert.rejects(() => detail({ params: Promise.resolve({ submissionId: 'bad' }) }), /not found/);
console.log('CRM form review pages: reviewer authorization, approved baseline linkage, safe image selection and escaped content passed');
