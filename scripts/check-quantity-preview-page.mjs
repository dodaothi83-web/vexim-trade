// node scripts/check-quantity-preview-page.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const id = '22222222-2222-2222-2222-222222222222';
const supplierId = '55555555-5555-5555-5555-555555555555';
const product = { id, supplier_id: supplierId, name: 'Nhân điều', updated_at: '2026-10-29T00:00:00Z', supplier_review_status: 'approved', reviewed_category_slug: 'cashew', price_publicly_visible: true };
const category = { id: 'cat', slug: 'cashew', status: 'published', is_published: true, price_unit: 'kg' };
let current = product, access = true, fail = false, enabled = true, captured = null, unsupported = false;
const store = { getProduct: async () => current, getCategoryBySlug: async () => category };
const db = { from(table) { const q = { select: () => q, eq: () => q, in: async () => fail ? { data: null, error: { message: 'unavailable' } } : { error: null, data: table.includes('price') ? (unsupported ? [{ id: 'v2', status: 'pending', grade: 'W320', incoterm: 'FOB', tiers: [{ version: 2, unit: 'mt', customGrade: false, quantityGrams: 1000000, unitWeightGrams: 1000000, priceCentsPerUnit: 640100 }] }] : [
  { id: 'approved-price', status: 'approved', grade: 'W320', incoterm: 'FOB', tiers: [{ minKg: 1000, priceUsdPerKg: 6.4 }] },
  { id: 'pending-price', status: 'pending', grade: 'W320', incoterm: 'FOB', tiers: [{ minKg: 2000, priceUsdPerKg: 6.2 }] },
]) : [{ id: 'pending-name', status: 'pending', english_name: 'Cashew kernels' }] } }; return q; } };
const mocks = {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  'next/navigation': { notFound: () => { throw Error('not-found'); }, redirect: (url) => { throw Error(`redirect:${url}`); } },
  '@/lib/db/supabase': { getSupabaseClient: () => db, supabaseStore: store },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async (s) => { assert.equal(s, store); return access ? { supplier: { id: supplierId } } : null; } },
  '@/lib/supplier-portal/onboarding': { portalApproved: () => true },
  '@/lib/products/grade-pricing': { standardGradesForCategory: () => ['W320'] },
  '@/lib/public/price-units': { displayUnitsForCategory: () => ({ primary: 'kg' }) },
  '@/lib/products/quantity-price-config': { readQuantityPricingPolicy: async () => ({ maxTiers: 4, maxPriceRatio: 1.5, maxLastMoqRatio: 100 }) },
  '@/components/page-header': { PageHeader: ({ title }) => React.createElement('h1', null, title) },
  './preview-form': { QuantityPricingPreviewForm: (props) => { captured = props; return React.createElement('div', null, 'preview form'); } },
};
const exports = {};
const env = {};
const code = ts.transpileModule(readFileSync(new URL('../app/supplier/portal/products/[id]/quantity-pricing/page.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
vm.runInNewContext(code, { exports, console, process: { env }, require: (key) => { if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; } });
async function render() { env.VEXIM_QUANTITY_PRICING_PREVIEW = enabled ? 'true' : ''; return renderToStaticMarkup(await exports.default({ params: Promise.resolve({ id }) })); }
enabled = false; await assert.rejects(render(), /not-found/, 'Disabled by default');
enabled = true; access = false; await assert.rejects(render(), /redirect:\/login/);
access = true; current = { ...product, supplier_id: 'other' }; await assert.rejects(render(), /not-found/, 'Cannot read another supplier product');
current = product;
const html = await render();
assert.match(html, /chưa thay đổi sản phẩm hoặc giá buyer/);
assert.equal(captured.pendingPriceId, 'pending-price');
assert.equal(captured.pendingNameId, 'pending-name');
assert.equal(captured.grade, 'W320');
assert.equal(captured.tiers[0].minKg, '2000', 'Pending version is editable, not the approved version');
assert.equal(captured.nameEn, 'Cashew kernels');
current = { ...product, supplier_review_status: 'pending' };
assert.match(await render(), /chưa thể sửa/);
current = product; unsupported = true;
const previousError = console.error; console.error = () => {};
try { const html = await render(); assert.match(html, /Chưa tải được cấu hình/); assert.doesNotMatch(html, /preview form/, 'Old editor cannot submit over a V2 revision'); } finally { console.error = previousError; }
unsupported = false; fail = true;
const oldError = console.error; console.error = () => {};
try { assert.match(await render(), /Chưa tải được cấu hình/); } finally { console.error = oldError; }
console.log('Quantity pricing preview: opt-in, supplier ownership, separate pending revisions and fail-closed read passed');
