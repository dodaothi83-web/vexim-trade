// node --experimental-strip-types --no-warnings scripts/check-buyer-product-discovery.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { arrangeSupplierProducts } from '../lib/public/supplier-product-order.ts';
import { assignProductCategory } from '../lib/public/category-assignment.ts';
import { productReadiness } from '../lib/media/readiness.ts';
import { isSyntheticSupplier } from '../lib/public/supplier-seo.ts';
import { approvedPublicReviewSummaries, approvedVerificationSteps, verificationLabels, PRODUCT_VERIFICATION_EXPLANATIONS, VERIFICATION_LABELS } from '../lib/verification-status.ts';

const compile = (path, mocks) => {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (key) => {
    if (!(key in mocks)) throw new Error(`Unexpected import: ${key}`);
    return mocks[key];
  }, process, console, Date });
  return exports;
};
const selection = compile('../lib/public/product-selection.ts', {
  '@/lib/public/category-assignment': { assignProductCategory },
});
const category = { id: 'c-cashew', slug: 'cashew', name_i18n: { en: 'Cashew' }, status: 'published', is_published: true };
const rice = { id: 'c-rice', slug: 'rice', name_i18n: { en: 'Rice' }, status: 'published', is_published: true };
const categories = [category, rice];
const now = new Date().toISOString();
const suppliers = [
  { id: 'A', slug: 'company-a', name: 'Company A', supplier_type: 'trading', status: 'published', verification_level: 2, province: 'Hanoi', fob_publicly_visible: true, fob_updated_at: now, is_demo: false },
  { id: 'B', slug: 'company-b', name: 'Company B', status: 'published', verification_level: 1, province: 'Binh Duong', fob_publicly_visible: false, fob_updated_at: now, is_demo: false },
  { id: 'C', slug: 'company-c', name: 'Company C', status: 'draft', verification_level: 3, province: 'Hue', is_demo: false },
];
const mk = (id, supplier_id, name, extras = {}) => ({ id, supplier_id, name, category: 'cashew', spec: 'W320', description: null,
  ready_for_buyer: true, price_publicly_visible: true, ref_price: 7, currency: 'USD/kg', unit: 'kg', price_valid_until: '2099-01-01',
  moq: '1 MT', lead_time_days: 14, ...extras });
const products = [
  ...Array.from({ length: 8 }, (_, i) => mk(`a${i}`, 'A', `Cashew W320 lot ${i}`)),
  ...Array.from({ length: 5 }, (_, i) => mk(`b${i}`, 'B', `Cashew W320 lot ${i}`)),
  mk('rice', 'A', 'Jasmine Rice', { category: 'cashew' }),
  mk('test', 'A', 'TEST ONLY — Cashew W320'),
  mk('draft', 'A', 'Cashew W320 unready', { ready_for_buyer: false }),
  mk('private-supplier', 'C', 'Cashew W320 private'),
];
const media = products.map((p) => ({ owner_type: 'product', product_id: p.id, kind: 'image', audience: 'buyer',
  status: 'checked', storage_path: `products/${p.id}/image.jpg`, sort_order: 0, created_at: now, expires_on: null }));
media.push({ ...media[0], id: 'cover-a0', storage_path: 'products/a0/cover.jpg', sort_order: 2 });
products[0].featured_media_id = 'cover-a0';
products[0].incoterm = 'FOB';
const reviews = [
  { supplier_id: 'A', target_level: 1, status: 'approved' },
  { supplier_id: 'A', target_level: 2, status: 'submitted' },
  { supplier_id: 'A', target_level: 3, status: 'approved' },
  { supplier_id: 'B', target_level: 2, status: 'approved' },
  { supplier_id: 'C', target_level: 3, status: 'approved' },
];
assert.deepEqual(approvedVerificationSteps(reviews.filter((r) => r.supplier_id === 'A')), [1, 3]);
assert.deepEqual(approvedVerificationSteps(reviews.filter((r) => r.supplier_id === 'B')), [2]);
assert.deepEqual(verificationLabels([1, 3]), ['Documents checked', 'Delivery history reviewed']);
assert.deepEqual(approvedVerificationSteps([{ target_level: 3, status: 'approved' }]), [3]);
assert.deepEqual(approvedVerificationSteps([{ target_level: 1, status: 'approved' }, { target_level: 2, status: 'approved' }, { target_level: 3, status: 'approved' }]), [1, 2, 3]);
const require = createRequire(import.meta.url);
const { ProductVerificationIcons } = compile('../components/product-verification-icons.tsx', {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'lucide-react': require('lucide-react'),
  '@/lib/verification-status': { PRODUCT_VERIFICATION_EXPLANATIONS, VERIFICATION_LABELS },
});
const renderChecks = (levels) => renderToStaticMarkup(React.createElement(ProductVerificationIcons, { levels }));
const mixed = renderChecks([1, 3]);
assert.equal((mixed.match(/<details/g) ?? []).length, 2, 'Only individually approved checks have icons');
assert.match(mixed, /Documents checked/);
assert.match(mixed, /not independently verified/, 'Tooltip must not claim tax or bank numbers were verified');
assert.match(mixed, /not a product certification/, 'Supplier icon must not imply product certification');
assert.match(mixed, /Delivery history reviewed/);
assert.doesNotMatch(mixed, /Factory visited|\bL[123]\b/, 'Do not imply a factory review or show internal level numbers');
assert.match(mixed, /<summary[^>]*aria-label=/, 'Icon explanation is available to screen readers and touch via native details');
assert.match(mixed, /group-hover:block group-focus-within:block peer-open:block/, 'Tooltip opens on hover, keyboard focus and touch');
assert.equal((renderChecks([2]).match(/<details/g) ?? []).length, 1, 'Factory approval alone does not imply documents or delivery');
assert.doesNotMatch(renderChecks([]), /<details|Factory visited|Documents checked|Delivery history reviewed/);
assert.match(renderChecks([]), /No approved checks yet/);
const store = {
  listSuppliers: async () => suppliers,
  listProducts: async () => products,
  listProductsBySupplier: async (id) => products.filter((p) => p.supplier_id === id),
  listCategories: async ({ publishedOnly } = {}) => publishedOnly ? categories : categories,
  listMediaForProducts: async (ids) => media.filter((m) => ids.includes(m.product_id)),
  listMedia: async () => [],
  listVerifications: async (id) => reviews.filter((r) => r.supplier_id === id),
};
const catalogMocks = { 'server-only': {}, '@/lib/db': { getStore: () => store },
  '@/lib/media/readiness': { isExpired: () => false, productReadiness }, '@/lib/public/product-selection': selection, '@/lib/verification-status': { approvedVerificationSteps, approvedPublicReviewSummaries } };
const catalog = compile('../lib/public/catalog.ts', catalogMocks);
const productCatalog = compile('../lib/public/product-catalog.ts', {
  ...catalogMocks, '@/lib/media/readiness': { isExpired: () => false, productReadiness },
  '@/lib/public/catalog': { listPublicSuppliers: catalog.listPublicSuppliers },
  '@/lib/public/supplier-seo': { isSyntheticSupplier },
});
const photoSamples = [
  { ...media[0], id: 'img-first', product_id: 'a0', storage_path: 'products/a0/first.jpg', sort_order: 0 },
  { ...media[0], id: 'img-cover', product_id: 'a0', storage_path: 'products/a0/cover.jpg', sort_order: 1 },
  { ...media[0], id: 'img-private', product_id: 'a0', storage_path: 'products/a0/private.jpg', sort_order: -1, audience: 'internal' },
];
assert.equal(JSON.stringify(productCatalog.shareableProductImages(photoSamples, 'a0', 'img-cover')), JSON.stringify(['products/a0/cover.jpg', 'products/a0/first.jpg']));
assert.equal(JSON.stringify(productCatalog.shareableProductImages(photoSamples, 'a0', 'img-private')), JSON.stringify(['products/a0/first.jpg', 'products/a0/cover.jpg']),
  'An internal cover must never enter the public gallery');
const cards = await productCatalog.listPublicCategoryProducts(category);
assert.equal(cards.length, 13, 'Every ready offer from published suppliers gets its own card, without cross-category or test records');
suppliers.push({ id: 'synthetic', slug: 'vexim-test-supplier-do-not-contact', name: 'Test Supplier', status: 'published', is_demo: false,
  summary_i18n: { en: 'VEXIM TEST SUPPLIER - DO NOT CONTACT' } });
products.push(mk('synthetic-product', 'synthetic', 'Cashew W320 sample', { spec: 'TEST ONLY — not a commercial specification' }));
media.push({ ...media[0], product_id: 'synthetic-product', storage_path: 'products/synthetic-product/image.jpg' });
assert.equal((await catalog.getPublicSupplierBySlug('vexim-test-supplier-do-not-contact')).main_products.length, 1, 'Published test profile can display its existing test listing truthfully');
assert.equal((await productCatalog.listPublicCategoryProducts(category)).length, 13, 'A synthetic supplier never becomes a real marketplace listing');
suppliers.pop(); products.pop(); media.pop();
assert.equal(cards.filter((p) => p.grade === 'W320').length, 13, 'Grade filter can expose 5 separate W320 offers from B');
assert.equal(cards.filter((p) => p.supplierId === 'B').length, 5);
assert.deepEqual(cards.find((p) => p.id === 'a0').verificationSteps, [1, 3], 'Trader passes documents and deliveries without a factory badge');
assert.deepEqual(cards.find((p) => p.id === 'b0').verificationSteps, [2], 'Factory alone does not imply document review');
assert.equal(cards.find((p) => p.id === 'a0').verificationCount, 2, 'Ranking counts actual approved checks, not max level');
assert.equal(cards.find((p) => p.id === 'a0').imagePaths[0], 'products/a0/cover.jpg', 'Staff-selected buyer-shareable cover wins on the product card');
assert.equal(cards.find((p) => p.id === 'a0').leadTimeDays, 14);
assert.equal(cards.find((p) => p.id === 'a0').incoterm, 'FOB', 'Price term on the card is projected from the product, not inferred from supplier consent');
assert.equal(cards.find((p) => p.id === 'a0').supplierSlug, 'company-a');
assert.equal(cards.find((p) => p.id === 'b0').price, null, 'No product price without supplier public-price consent');
const initial = arrangeSupplierProducts(cards, 3);
assert.equal(initial.shown.length, 6);
assert.equal(initial.hidden.get('A'), 5);
assert.equal(initial.hidden.get('B'), 2);
assert.ok(initial.shown.every((p) => ['A', 'B'].includes(p.supplierId)));
assert.ok(initial.shown.every((p, i) => i < 2 || !(p.supplierId === initial.shown[i - 1].supplierId && p.supplierId === initial.shown[i - 2].supplierId)));
const filtered = arrangeSupplierProducts(cards.filter((p) => p.grade === 'W320'), null);
assert.equal(filtered.shown.length, 13, 'Filter does not retain the three-card cap');
assert.equal(filtered.hidden.size, 0);
assert.equal(new Set(filtered.shown.map((p) => p.id)).size, 13);
assert.ok(filtered.shown.every((p, i) => i < 2 || !(p.supplierId === filtered.shown[i - 1].supplierId && p.supplierId === filtered.shown[i - 2].supplierId)), 'Skewed 8:5 filtered results remain interleaved when possible');
const oneSupplier = cards.filter((p) => p.supplierId === 'A');
const singleInitial = arrangeSupplierProducts(oneSupplier, new Set(oneSupplier.map((p) => p.supplierId)).size < 2 ? 2 : 3);
assert.equal(singleInitial.shown.length, 2, 'A single supplier cannot occupy three consecutive initial cards');
const single = arrangeSupplierProducts(oneSupplier, null);
assert.equal(single.shown.length, 8, 'A filter with one matching supplier still shows all eight offers');
const profile = await catalog.getPublicSupplierBySlug('company-a');
assert.equal(profile.main_products.length, 9, 'Profile includes all public products from every category, not the four-card summary');
assert.equal(profile.product_image_paths.a0, 'products/a0/cover.jpg', 'Supplier cards use the featured buyer-approved product image');
assert.equal(profile.product_image_paths.test, undefined, 'Test-only product images never appear');
media.push({ ...media[0], id: 'private-a1', product_id: 'a1', audience: 'internal', storage_path: 'products/a1/private.jpg', sort_order: -5 });
assert.equal((await catalog.getPublicSupplierBySlug('company-a')).product_image_paths.a1, 'products/a1/image.jpg', 'Internal product images must not leak into supplier cards');
media.pop();
assert.ok(profile.main_products.every((p) => p.ready_for_buyer && !p.name.startsWith('TEST ONLY')));
assert.deepEqual(profile.approved_verification_steps, [1, 3]);
assert.equal(profile.public_review_summaries[3], undefined, 'Review approval alone never publishes an inspector draft');
reviews.find((v) => v.supplier_id === 'A' && v.target_level === 3).public_summary_i18n = { en: 'Private shipment reference ABC-123' };
assert.equal((await catalog.getPublicSupplierBySlug('company-a')).public_review_summaries[3], undefined, 'Legacy summary must remain hidden without explicit publication');
reviews.find((v) => v.supplier_id === 'A' && v.target_level === 3).public_summary_published_at = now;
assert.equal((await catalog.getPublicSupplierBySlug('company-a')).public_review_summaries[3], 'Private shipment reference ABC-123', 'Only separately published summary appears');
reviews.find((v) => v.supplier_id === 'A' && v.target_level === 3).public_summary_i18n = { en: 'Call +84912345678' };
assert.equal((await catalog.getPublicSupplierBySlug('company-a')).public_review_summaries[3], undefined, 'Defense in depth blocks obvious contact leaks');
reviews.find((v) => v.supplier_id === 'A' && v.target_level === 3).public_summary_i18n = { en: 'One delivery record reviewed; export not established.' };
reviews.find((v) => v.supplier_id === 'A' && v.target_level === 2).public_summary_published_at = now;
reviews.find((v) => v.supplier_id === 'A' && v.target_level === 2).public_summary_i18n = { en: 'Unapproved visit' };
assert.equal((await catalog.getPublicSupplierBySlug('company-a')).public_review_summaries[2], undefined, 'Submitted factory review cannot publish');
// Even suppliers beyond the old 50-card fetch limit must show their actual badges.
const extras = Array.from({ length: 51 }, (_, i) => ({ id: `extra-${i}`, name: `Extra ${i}`, status: 'published', verification_level: 3, is_demo: false }));
suppliers.push(...extras);
reviews.push({ supplier_id: extras.at(-1).id, target_level: 3, status: 'approved' });
const moreSuppliers = await catalog.listPublicSuppliers();
assert.deepEqual(moreSuppliers.find((s) => s.id === extras.at(-1).id).approved_verification_steps, [3], 'An approved delivery beyond supplier 50 cannot disappear');
assert.deepEqual(moreSuppliers.find((s) => s.id === extras[0].id).approved_verification_steps, [], 'Legacy max level without an approval earns no real badges');
suppliers.splice(-extras.length);
reviews.pop();
suppliers.push({ id: 'demo-no-evidence', name: 'Demo', status: 'published', is_demo: true, verification_level: 3 });
const demoPreview = (await catalog.listPublicSuppliers({ includeDemo: true })).find((s) => s.id === 'demo-no-evidence');
assert.deepEqual(demoPreview.approved_verification_steps, [], 'Demo level without a real approved review cannot create a badge');
suppliers.pop();
media.find((m) => m.product_id === 'a7').status = 'expired';
assert.equal((await productCatalog.listPublicCategoryProducts(category)).length, 12, 'Expired last buyer image hides a stale ready product');
assert.equal((await catalog.getPublicSupplierBySlug('company-a')).main_products.length, 8, 'Supplier profile applies the same readiness gate');
media.find((m) => m.product_id === 'a7').status = 'checked';
assert.equal(await catalog.getPublicSupplierBySlug('company-c'), null, 'Draft supplier has no public profile');
const grid = readFileSync(new URL('../components/category-product-grid.tsx', import.meta.url), 'utf8');
const profilePage = readFileSync(new URL('../app/(public)/suppliers/[slug]/page.tsx', import.meta.url), 'utf8');
const detailPage = readFileSync(new URL('../app/(public)/products/[slug]/[productId]/page.tsx', import.meta.url), 'utf8');
assert.match(grid, /\+\{count\} more from/);
assert.match(grid, /grid-cols-2[^"\n]*md:grid-cols-3 lg:grid-cols-4/, 'Category offers use 2/3/4 columns');
assert.match(grid, /p\.verificationSteps\.includes\(verified/, 'Verification filter matches only the selected approved check');
assert.match(grid, /<PublicProductCard/, 'Category listing uses the common offer card');
const homePage = readFileSync(new URL('../app/(public)/home.tsx', import.meta.url), 'utf8');
assert.match(homePage, /listPublicCategoryProducts\(category\)/, 'Home offers must come from the buyer-ready catalogue, not category tiles');
assert.match(homePage, /p\.isDemo \|\| seen\.has\(p\.id\)/, 'Home excludes demos and duplicate listings');
assert.match(homePage, /grid-cols-2[^"\n]*md:grid-cols-3 lg:grid-cols-4/);
assert.match(homePage, /homeProducts\.map[\s\S]*?<PublicProductCard/, 'Home includes actual product offers');
assert.match(profilePage, /grid-cols-2[^"\n]*md:grid-cols-3 lg:grid-cols-4/, 'Supplier product grid uses 2/3/4 columns');
const { PublicProductCard } = compile('../components/public-product-card.tsx', {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'next/link': { default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) },
  'lucide-react': require('lucide-react'),
  '@/components/product-verification-icons': { ProductVerificationIcons },
});
const cardProps = { href: '/products/cashew/a0', imagePath: 'products/a0/cover.jpg',
  name: 'Cashew W320 lot 0', moq: '1 MT', price: 'USD 7/kg', fob: true, leadTimeDays: 14,
  supplierName: 'Company A', supplierHref: '/suppliers/company-a', verificationSteps: [1, 3] };
const compactCard = renderToStaticMarkup(React.createElement(PublicProductCard, cardProps));
for (const text of ['Cashew W320 lot 0', 'MOQ', '1 MT', 'FOB reference', 'USD 7/kg', 'Lead time', '14 days', 'Supplied by', 'Company A', 'View details']) {
  assert.ok(compactCard.includes(text), `Compact card keeps ${text}`);
}
assert.match(compactCard, /aspect-square/);
assert.match(compactCard, /object-cover/);
assert.match(compactCard, /line-clamp-2/);
assert.match(compactCard, /flex h-full min-w-0 flex-col/);
assert.match(compactCard, /href="\/suppliers\/company-a"/, 'Supplier has an independent profile link');
assert.match(compactCard, /href="\/products\/cashew\/a0"/, 'Buyer can open product details');
assert.equal((compactCard.match(/<details/g) ?? []).length, 2, 'Only individually approved supplier checks are shown');
const privatePrice = renderToStaticMarkup(React.createElement(PublicProductCard, { ...cardProps, price: null, fob: false, verificationSteps: [] }));
assert.match(privatePrice, /Reference price<\/dt><dd[^>]*>On request/);
assert.doesNotMatch(privatePrice, /FOB reference|USD 7\/kg|Factory visited/);
const testCard = renderToStaticMarkup(React.createElement(PublicProductCard, {
  ...cardProps, href: '/suppliers/company-a/products/a0', test: true,
}));
assert.match(testCard, /TEST · Not an offer|Test data · not a price/);
assert.doesNotMatch(testCard, /USD 7\/kg|Documents checked|Delivery history reviewed|\/rfq/);
const { default: HomeContent } = compile('../app/(public)/home.tsx', {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'next/image': { default: ({ src, alt, ...props }) => React.createElement('img', { src, alt, className: props.className }) },
  'next/link': { default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) },
  'lucide-react': require('lucide-react'),
  '@/lib/db': { getStore: () => ({ listCategories: async () => [{ ...category, active_on_homepage: true, public_page_ready: true }], listSuppliers: async () => [] }) },
  '@/lib/blog/queries': { listPublishedNews: async () => [] },
  '@/lib/public/product-catalog': { listPublicCategoryProducts: async () => [cards[0], cards[1], { ...cards[0], id: 'demo', isDemo: true }] },
  '@/lib/public/supplier-product-order': { arrangeSupplierProducts },
  '@/components/public-product-card': { PublicProductCard },
});
const homeHtml = renderToStaticMarkup(await HomeContent());
const offersHtml = homeHtml.match(/<section aria-labelledby="home-products-title"[\s\S]*?<\/section>/)?.[0] ?? '';
assert.match(offersHtml, /grid-cols-2[^"\n]*md:grid-cols-3 lg:grid-cols-4/);
assert.match(offersHtml, /href="\/products\/cashew\/a0"/);
assert.equal((offersHtml.match(/aria-label="View details of/g) ?? []).length, 2, 'Home has two real offers, not category placeholders or demo products');
assert.doesNotMatch(offersHtml, /\/products\/cashew\/demo|Test data/);
assert.match(homeHtml, /id="categories"/, 'Category navigation remains a separate section');
assert.match(detailPage, /<ProductVerificationIcons levels=\{card\.verificationSteps\}/);
assert.match(profilePage, /price=\{synthetic \? null : publicProductPrice\(p, s\)\}/);
assert.match(profilePage, /const href = synthetic[\s\S]*?`\/suppliers\/\$\{encodeURIComponent\(s\.slug \|\| s\.id\)\}\/products\/\$\{encodeURIComponent\(p\.id\)\}`/, 'Test products have a safe dedicated preview instead of a dead card');
assert.match(detailPage, /View supplier profile/);
assert.match(detailPage, /#factory-visit/);
assert.match(detailPage, /#delivery-history/);
assert.match(profilePage, /Supplier-stated markets \(not independently verified\)/);
// Changing the last buyer image to internal must revoke buyer-ready immediately.
const actions = readFileSync(new URL('../app/actions.ts', import.meta.url), 'utf8');
const mediaActionSource = actions.slice(actions.indexOf('export async function updateMediaAction('), actions.indexOf('export async function deleteMediaAction('));
const mediaAction = {};
const product = { id: 'a0', ready_for_buyer: true, featured_media_id: 'image-a0' };
const asset = { id: 'image-a0', product_id: 'a0', owner_type: 'product', kind: 'image', audience: 'buyer', status: 'checked', expires_on: null };
const actionStore = {
  getMedia: async () => asset, updateMedia: async (_id, patch) => Object.assign(asset, patch),
  getProduct: async () => product, listMedia: async () => [asset],
  updateProduct: async (_id, patch) => Object.assign(product, patch),
};
vm.runInNewContext(ts.transpileModule(mediaActionSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { exports: mediaAction, guard: async () => null, getStore: () => actionStore, productReadiness, isExpired: () => false, revalidateAll: () => {} });
assert.equal((await mediaAction.updateMediaAction(asset.id, { audience: 'internal' })).ok, true);
assert.equal(product.ready_for_buyer, false);
assert.equal(product.featured_media_id, null, 'Revoking buyer access also clears the selected cover');
console.log('✅ Independent verification badges, filters and buyer discovery: product images, per-supplier W320, interleaved capped/unlimited views, profile safety, price and navigation.');
