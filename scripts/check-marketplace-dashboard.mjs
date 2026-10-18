#!/usr/bin/env node
// node --experimental-strip-types --no-warnings scripts/check-marketplace-dashboard.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { assignProductCategory } from '../lib/public/category-assignment.ts';
import { productReadiness } from '../lib/media/readiness.ts';
import { isSyntheticSupplier } from '../lib/public/supplier-seo.ts';
import { hasPermission, permissionsFor } from '../lib/auth/permissions.ts';

function load(file, mocks) {
  const exports = {};
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: (name) => {
    assert.ok(name in mocks, `Unexpected import: ${name}`);
    return mocks[name];
  }, Date });
  return exports;
}
const selection = load('../lib/public/product-selection.ts', {
  '@/lib/public/category-assignment': { assignProductCategory },
});
const { buildMarketplaceSnapshot } = load('../lib/dashboard/marketplace.ts', {
  '@/lib/media/readiness': { productReadiness },
  '@/lib/public/supplier-seo': { isSyntheticSupplier },
  '@/lib/public/product-selection': selection,
});

const categories = [
  { id: 'rice', slug: 'rice', name_i18n: { en: 'Rice' }, status: 'published', is_published: true },
  { id: 'old', slug: 'old', name_i18n: { en: 'Old' }, status: 'draft', is_published: false },
];
const suppliers = [
  { id: 'real', name: 'Rice factory', slug: 'rice-factory', status: 'published', updated_at: '2026-10-17', onboarding_status: 'approved' },
  { id: 'waiting', name: 'New factory', slug: 'new-factory', status: 'draft', updated_at: '2026-10-18', onboarding_status: 'pending' },
  { id: 'demo', name: 'TEST ONLY supplier', slug: 'test-supplier', status: 'published', updated_at: '2026-10-18', onboarding_status: 'pending', is_demo: true },
];
const base = { supplier_id: 'real', category: 'rice', name: 'Jasmine Rice', ready_for_buyer: true, supplier_review_status: 'approved', updated_at: '2026-10-17' };
const products = [
  { ...base, id: 'live', supplier_originated: true, reviewed_category_slug: 'rice' },
  { ...base, id: 'without-review', supplier_review_status: 'pending', supplier_originated: true, reviewed_category_slug: 'rice' },
  { ...base, id: 'without-decision', supplier_originated: true },
  { ...base, id: 'unlisted-category', reviewed_category_slug: 'old' },
  { ...base, id: 'unready', ready_for_buyer: false },
  { ...base, id: 'expired-media' },
  { ...base, id: 'private-media' },
  { ...base, id: 'waiting-supplier', supplier_id: 'waiting' },
  { ...base, id: 'synthetic', supplier_id: 'demo' },
  { ...base, id: 'test-name', name: 'TEST ONLY Rice' },
];
const media = products.map(({ id }) => ({ product_id: id, kind: 'image', audience: 'buyer', status: 'active' }));
media.find((m) => m.product_id === 'expired-media').expires_on = '2020-01-01';
media.find((m) => m.product_id === 'private-media').audience = 'internal';
const verifications = [
  { id: 'factory', supplier_id: 'real', target_level: 2, status: 'submitted', updated_at: '2026-10-18' },
  { id: 'delivery', supplier_id: 'real', target_level: 3, status: 'approved', updated_at: '2026-10-17' },
  { id: 'demo-review', supplier_id: 'demo', target_level: 2, status: 'submitted', updated_at: '2026-10-18' },
];
const requests = [
  { supplier_id: 'real', target_level: 2, status: 'requested', requested_at: '2026-10-18' },
  { supplier_id: 'real', target_level: 3, status: 'requested', requested_at: '2026-10-17' },
  { supplier_id: 'demo', target_level: 2, status: 'requested', requested_at: '2026-10-17' },
];
const rfqs = [
  { id: 'new', status: 'new', created_at: '2026-10-18' },
  { id: 'review', status: 'needs_review', created_at: '2026-10-17' },
  { id: 'done', status: 'closed', created_at: '2026-10-16' },
];
const snap = buildMarketplaceSnapshot({ suppliers, products, categories, media, verifications, requests, rfqs });
assert.deepEqual(snap.publishedSuppliers.map((s) => s.id), ['real']);
assert.deepEqual(snap.liveProducts.map((p) => p.id), ['live']);
assert.equal(snap.publishedCategories.length, 1);
assert.equal(snap.categoriesWithOffers, 1);
assert.deepEqual(snap.pendingSuppliers.map((s) => s.id), ['waiting']);
assert.deepEqual(snap.pendingProducts.map((p) => p.id), ['without-review']);
assert.deepEqual(snap.submittedReviews.map((v) => v.id), ['factory']);
assert.deepEqual(snap.contactRequests.map((r) => r.target_level), [2], 'An approved delivery review does not resolve a separate factory request');
assert.deepEqual(snap.newRfqs.map((r) => r.id), ['new', 'review']);

for (const role of ['admin', 'sale', 'sourcing', 'reviewer', 'viewer']) {
  assert.equal(hasPermission(role, 'suppliers.view'), true);
  assert.equal(hasPermission(role, 'products.view'), true);
  assert.equal(hasPermission(role, 'rfq.view'), role !== 'reviewer', 'Reviewer does not enter buyer RFQ operations');
}
assert.equal(hasPermission('viewer', 'verifications.inspect'), false);
assert.equal(hasPermission('sale', 'verifications.inspect'), false);
assert.equal(hasPermission('sourcing', 'verifications.inspect'), true);
assert.equal(hasPermission('reviewer', 'verifications.inspect'), false);
assert.equal(hasPermission('reviewer', 'verifications.view'), true);
assert.equal(hasPermission('viewer', 'categories.manage'), false);
assert.equal(permissionsFor('supplier').length, 0);
const page = readFileSync(new URL('../app/crm/dashboard/page.tsx', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../components/sidebar.tsx', import.meta.url), 'utf8');
assert.match(page, /canViewReviews \? store\.listVerifications\(\)/, 'Verification data is never queried for sale/viewer');
assert.match(page, /canViewReviews \? store\.listSupplierVerificationRequests\(\)/);
assert.match(page, /canRfqs \? store\.listRfqs\(\)/);
assert.match(sidebar, /perm: "rfq\.view"/);
assert.match(sidebar, /hasPermission\(session\.role, item\.perm\)/);
console.log('✅ Marketplace snapshot public gates, independent queues and staff role visibility.');
