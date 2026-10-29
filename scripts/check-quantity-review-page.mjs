// node scripts/check-quantity-review-page.mjs
import { revision } from './quantity-v2-test-utils.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let role = 'reviewer', fail = false;
const product = { id: 'p1', name: 'Nhân điều', supplier_id: 's1', updated_at: '2026-10-29T00:00:00Z' };
const revisions = {
  product_quantity_price_revisions: [{ id: 'r1', product_id: 'p1', product_updated_at: product.updated_at, created_at: product.updated_at, grade: 'W320', incoterm: 'FOB', tiers: [{ minKg: 1000, priceUsdPerKg: 6.4 }], warnings: [{ code: 'grade_price_outlier' }] }],
  product_english_name_revisions: [{ id: 'r2', product_id: 'p1', product_updated_at: product.updated_at, created_at: product.updated_at, source_name: 'Nhân điều', english_name: 'Cashew kernels', origin: 'supplier' }],
};
const db = { from(table) { const q = { select: () => q, eq: () => q, order: () => q, range: async () => fail ? { error: { message: 'offline' }, data: null } : { error: null, data: revisions[table] } }; return q; } };
const mocks = {
  '@/lib/products/quantity-revision-v2': revision,
  'react/jsx-runtime': require('react/jsx-runtime'), 'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  'next/navigation': { redirect: (path) => { throw Error(`redirect:${path}`); } },
  '@/lib/auth/session': { requireSession: async () => ({ role, uid: 'user', email: 'reviewer@example.com' }) },
  '@/lib/db/supabase': { getSupabaseClient: () => db, supabaseStore: { getUser: async () => ({ role, is_active: true, email: 'reviewer@example.com' }), listProducts: async () => [product], listSuppliers: async () => [{ id: 's1', name: 'Supplier A' }] } },
  '@/components/page-header': { PageHeader: ({ title }) => React.createElement('h1', null, title) },
  './review-controls': { QuantityReviewControls: ({ kind }) => React.createElement('button', null, `review-${kind}`) },
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../app/crm/products/quantity-review/page.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
vm.runInNewContext(code, { exports, Date, console, require: (key) => { if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; } });
const render = async () => renderToStaticMarkup(await exports.default());
const html = await render();
for (const text of ['Giá chờ rà soát', 'Tên tiếng Anh chờ duyệt', 'Supplier A', 'W320', '6.40', 'Cashew kernels', 'review-price', 'review-name', 'chưa được bật']) assert.ok(html.includes(text), text);
assert.match(html, /ngoài ngưỡng/);
role = 'supplier';
await assert.rejects(render(), /redirect:\/crm\/products/);
role = 'reviewer'; fail = true;
const oldError = console.error; console.error = () => {};
try {
  const failedHtml = await render();
  assert.match(failedHtml, /role="alert"/);
  assert.doesNotMatch(failedHtml, /Không có bản chờ duyệt/, 'Failure is not presented as an empty queue');
} finally { console.error = oldError; }
console.log('Quantity review page: independent queues, staff-only access and fail-closed load passed');
fail = false;
revisions.product_quantity_price_revisions[0].grade = 'Special';
revisions.product_quantity_price_revisions[0].tiers = [{ version: 2, unit: 'bag', customGrade: true, quantityGrams: 270000, unitWeightGrams: 27000, priceCentsPerUnit: 10000 }];
const v2html = await render();
for (const text of ['Special', '10 bags (27 kg each)', 'USD 100.00/bag', 'không thuộc bộ lọc grade chuẩn']) assert.ok(v2html.includes(text), text);
revisions.product_quantity_price_revisions[0].tiers[0].unitWeightGrams = 0;
assert.match(await render(), /Dữ liệu bảng giá không hợp lệ/);
console.log('Quantity review page: original V2 units, custom grade and invalid records passed');
