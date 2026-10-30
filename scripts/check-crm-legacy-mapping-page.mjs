// node scripts/check-crm-legacy-mapping-page.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', supplierId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
let actor = { id: 'actor', role: 'admin', is_active: true, email: 'staff@example.com' }, session = { uid: 'actor', role: 'admin', email: 'staff@example.com' };
let product = { id, supplier_id: supplierId, name: 'Nhân điều', category: 'Free text', reviewed_category_slug: 'cashew', specs: { custom: '<img onerror=alert(1)>' },
  ref_price: 1, ref_price_max: 2, ready_for_buyer: true, updated_at: '2026-01-01T00:00:00Z' };
const calls = []; let received;
const store = { async getUser() { calls.push('getUser'); return actor; }, async getProduct() { calls.push('getProduct'); return product; },
  async getSupplier() { calls.push('getSupplier'); return { id: supplierId, name: 'NCC' }; },
  async listCategories() { calls.push('listCategories'); return [{ id: 'cat', slug: 'cashew' }]; }, async listMedia() { calls.push('listMedia'); return [{ id: 'photo' }]; } };
const preview = (input) => { received = input; return { ok: true, candidates: [
  { grade: 'W320', draft: { grade: 'W320' }, originalRow: { price: 1 } },
  { grade: 'W240', draft: { grade: 'W240' }, originalRow: { price: 2 } },
], unrepresentedSpecKeys: [], unrepresentedMonthlyCapacity: null, requiresStaffCertificationReview: false }; };
const mocks = {
  react: React, 'react/jsx-runtime': await import('react/jsx-runtime'),
  'next/navigation': { notFound: () => { throw Error('NOT_FOUND'); } },
  'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  '@/lib/auth/session': { requirePagePermission: async (permission) => { assert.equal(permission, 'products.manage'); return session; } },
  '@/lib/db/supabase': { getSupabaseClient: () => ({}), supabaseStore: store },
  '@/lib/supplier-portal/category-proposals': { categoryProposalOptions: () => [{ id: 'cat', slug: 'cashew' }] },
  '@/lib/product-attributes': { effectiveFieldsFor: (cat) => cat ? [{ key: 'moisture' }] : [] },
  '@/lib/products/grade-pricing': { standardGradesForCategory: (cat) => cat ? ['W320'] : [] },
  '@/lib/products/product-form-legacy-preview': { previewLegacyProductForms: preview },
  '@/components/products/legacy-product-form-preview': { LegacyProductFormPreview: ({ draft }) => React.createElement('p', null, `Form: ${draft.grade}`) },
  '@/components/page-header': { PageHeader: ({ title }) => React.createElement('h1', null, title) },
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../app/crm/products/[slug]/mapping-preview/page.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, JSON, require: (key) => { if (!(key in mocks)) throw Error(key); return mocks[key]; } });
const run = async (grade = '1', slug = id) => renderToStaticMarkup(await exports.default({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({ grade }) }));
let html = await run(); assert.match(html, /Form: W240/); assert.match(html, /chưa tạo bản nháp, tách sản phẩm/);
assert.match(html, /Giá demo/); assert.match(html, /không được chép sang bảng giá mới/);
assert.match(html, /&lt;img onerror=alert\(1\)&gt;/); assert.doesNotMatch(html, /<img onerror/);
assert.equal(received.categorySlug, 'cashew'); assert.equal(received.product, product);
assert.ok(calls.every((name) => ['getUser', 'getProduct', 'getSupplier', 'listCategories', 'listMedia'].includes(name)));
html = await run('999'); assert.match(html, /Form: W320/, 'Invalid grade index falls back to first preview');
product = { ...product, reviewed_category_slug: null, category: 'cashew' };
html = await run(); assert.equal(received.categorySlug, '', 'A legacy category string is never guessed'); assert.match(html, /không tự suy đoán/);
actor = { ...actor, is_active: false }; calls.length = 0; await assert.rejects(run(), /NOT_FOUND/); assert.deepEqual(calls, ['getUser']);
actor = { ...actor, is_active: true, role: 'sale' }; await assert.rejects(run(), /NOT_FOUND/);
actor = { ...actor, role: 'admin', email: 'different@example.com' }; await assert.rejects(run(), /NOT_FOUND/);
actor = { ...actor, email: session.email }; await assert.rejects(run('1', 'not-a-uuid'), /NOT_FOUND/);
console.log('CRM mapping page: active authorized actor, no writes, exact category and escaped read-only comparison passed');
