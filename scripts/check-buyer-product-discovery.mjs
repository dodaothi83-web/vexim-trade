// node --experimental-strip-types --no-warnings scripts/check-buyer-product-discovery.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { arrangeSupplierProducts, feedPerPage, HOME_FEED_PER_PAGE, HOME_FEED_WIDE_QUERY } from '../lib/public/supplier-product-order.ts';
import { assignProductCategory } from '../lib/public/category-assignment.ts';
import { productReadiness } from '../lib/media/readiness.ts';
import { isSyntheticSupplier } from '../lib/public/supplier-seo.ts';
import * as gradeResolution from '../lib/public/grade-resolution.ts';
import * as displayName from '../lib/public/display-name.ts';
import * as productAttributes from '../lib/product-attributes.ts';
import * as productDetailDisplay from '../lib/public/product-detail-display.ts';
import { HOME_HERO_LINE } from '../lib/public/meta-copy.ts';
import { buildPopularSearches } from '../lib/public/popular-searches.ts';
import { getCategoryTitle } from '../lib/public/category-names.ts';
import { hasProductComparisonPeer } from '../lib/public/product-comparison.ts';
import { approvedVerificationSteps, verificationLabels, PRODUCT_VERIFICATION_EXPLANATIONS, VERIFICATION_LABELS, VERIFICATION_LEVEL_EXPLANATIONS } from '../lib/verification-status.ts';
import * as verificationStatus from '../lib/verification-status.ts';

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
  { id: 'A', slug: 'company-a', name: 'Company A', supplier_type: 'trading', status: 'published', verification_level: 2, province: 'Hanoi', profile_image: 'suppliers/a/logo.webp', founded_year: 2014, fob_publicly_visible: true, fob_updated_at: now, is_demo: false },
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
media.push({ ...media[0], id: 'cover-a0', storage_path: 'products/a0/cover.jpg', thumb_path: 'products/a0/cover-thumb.webp', sort_order: 2 });
products[0].featured_media_id = 'cover-a0';
products[0].incoterm = 'FOB';
products[1].moq = '1 tấn';
Object.assign(products[0], {
  raw_material_region: 'Bình Phước và Đắk Lắk', input_material_origin: 'Việt Nam và Campuchia',
  translation_meta: { fields: { raw_material_region: 'Binh Phuoc and Dak Lak', input_material_origin: 'Vietnam and Cambodia' } },
});
Object.assign(products[1], {
  raw_material_region: 'Lâm Đồng', input_material_origin: 'Việt Nam',
  translation_meta: { fields: { raw_material_region: 'Lam Dong', input_material_origin: 'Vietnam' } },
});
Object.assign(products[8], { raw_material_region: 'Bình Dương', input_material_origin: 'Việt Nam' });
// Tên soạn sẵn cho buyer chỉ thay chữ hiển thị; tên gốc vẫn là chứng từ.
products[0].display_name = 'Cashew kernels W320, Hanoi';
const reviews = [
  { supplier_id: 'A', target_level: 1, status: 'approved' },
  { supplier_id: 'A', target_level: 2, status: 'submitted' },
  { supplier_id: 'A', target_level: 3, status: 'approved' },
  { supplier_id: 'B', target_level: 2, status: 'approved' },
  { supplier_id: 'C', target_level: 3, status: 'approved' },
];
// GĐ2 evidence: A đã duyệt L1 nên chứng nhận được đối chiếu hiệu lực; B chỉ có L2
// (xác minh theo sự kiện) nên không cần đọc chứng nhận.
const certificates = [
  { supplier_id: 'A', review_status: 'approved', staff_hidden: false, publicly_visible: true, valid_until: '2099-01-01' },
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
  '@/lib/verification-status': verificationStatus,
});
const renderChecks = (levels) => renderToStaticMarkup(React.createElement(ProductVerificationIcons, { levels }));
const mixed = renderChecks([1, 3]);
assert.equal((mixed.match(/<details/g) ?? []).length, 2, 'Only individually approved checks have icons');
assert.match(mixed, /Documents checked/);
assert.match(mixed, /not independently verified/, 'Tooltip must not claim tax or bank numbers were verified');
assert.match(mixed, /not a product certification/, 'Supplier icon must not imply product certification');
assert.match(mixed, /Delivery history reviewed/);
assert.doesNotMatch(mixed, /Factory verification|\bL[123]\b/, 'Do not imply a factory review or show internal level numbers');
assert.match(mixed, /<summary[^>]*aria-label=/, 'Icon explanation is available to screen readers and touch via native details');
assert.match(mixed, /group-hover:block group-focus-within:block peer-open:block/, 'Tooltip opens on hover, keyboard focus and touch');
assert.equal((renderChecks([2]).match(/<details/g) ?? []).length, 1, 'Factory approval alone does not imply documents or delivery');
assert.doesNotMatch(renderChecks([]), /<details|Factory verification|Documents checked|Delivery history reviewed/);
assert.match(renderChecks([]), /No approved checks yet/);
const store = {
  listSuppliers: async () => suppliers,
  listProducts: async () => products,
  getProduct: async (id) => products.find((p) => p.id === id) ?? null,
  listProductsBySupplier: async (id) => products.filter((p) => p.supplier_id === id),
  listCategories: async ({ publishedOnly } = {}) => publishedOnly ? categories : categories,
  listMediaForProducts: async (ids) => media.filter((m) => ids.includes(m.product_id)),
  listMedia: async () => [],
  listVerifications: async (id) => reviews.filter((r) => r.supplier_id === id),
  listCertificates: async (id) => certificates.filter((c) => c.supplier_id === id),
};
const catalogMocks = { 'server-only': {}, '@/lib/db': { getStore: () => store },
  '@/lib/public/grade-resolution': gradeResolution, '@/lib/public/display-name': displayName,
  '@/lib/product-attributes': productAttributes,
  '@/lib/media/readiness': { isExpired: () => false, productReadiness }, '@/lib/public/product-selection': selection, '@/lib/verification-status': verificationStatus };
const catalog = compile('../lib/public/catalog.ts', catalogMocks);
// GĐ1 xếp hạng: module thuần không import gì nên compile không cần mock; bơm bản thật
// vào product-catalog để đường xếp hạng mới chạy đúng trong kiểm này.
const ranking = compile('../lib/public/ranking.ts', {});
const productCatalog = compile('../lib/public/product-catalog.ts', {
  ...catalogMocks, '@/lib/media/readiness': { isExpired: () => false, productReadiness },
  '@/lib/public/catalog': { listPublicSuppliers: catalog.listPublicSuppliers },
  '@/lib/public/ranking': ranking,
  '@/lib/public/supplier-seo': { isSyntheticSupplier },
  '@/lib/public/supplier-english': { supplierProvinceDisplay: (s) => s.province || '' },
  '@/lib/public/product-detail-display': productDetailDisplay,
});
const photoSamples = [
  { ...media[0], id: 'img-first', product_id: 'a0', storage_path: 'products/a0/first.jpg', sort_order: 0 },
  { ...media[0], id: 'img-cover', product_id: 'a0', storage_path: 'products/a0/cover.jpg', thumb_path: 'products/a0/cover-thumb.webp', sort_order: 1 },
  { ...media[0], id: 'img-private', product_id: 'a0', storage_path: 'products/a0/private.jpg', sort_order: -1, audience: 'internal' },
];
assert.equal(JSON.stringify(productCatalog.shareableProductImages(photoSamples, 'a0', 'img-cover')), JSON.stringify(['products/a0/cover.jpg', 'products/a0/first.jpg']));
assert.equal(JSON.stringify(productCatalog.shareableProductImages(photoSamples, 'a0', 'img-cover', 2, true)),
  JSON.stringify(['products/a0/cover-thumb.webp', 'products/a0/first.jpg']), 'Cards use thumbnails while details retain full images');
assert.equal(JSON.stringify(productCatalog.shareableProductImages(photoSamples, 'a0', 'img-private')), JSON.stringify(['products/a0/first.jpg', 'products/a0/cover.jpg']),
  'An internal cover must never enter the public gallery');
const cards = await productCatalog.listPublicCategoryProducts(category);
assert.equal(cards.length, 13, 'Every ready offer from published suppliers gets its own card, without cross-category or test records');
assert.equal(cards.find((p) => p.id === 'a0').name, 'Cashew kernels W320, Hanoi', 'The composed display name is what the buyer reads');
assert.equal(cards.find((p) => p.id === 'a0').supplierProfileImage, 'suppliers/a/logo.webp', 'PDP can use the public supplier profile image');
assert.equal(cards.find((p) => p.id === 'a0').supplierFoundedYear, 2014, 'PDP can show a real founded year when present');
assert.equal(cards.find((p) => p.id === 'a0').rawMaterialRegion, 'Binh Phuoc and Dak Lak');
assert.equal(cards.find((p) => p.id === 'a0').inputMaterialOrigin, 'Vietnam and Cambodia');
assert.equal(cards.find((p) => p.id === 'a1').rawMaterialRegion, 'Lam Dong', 'Each product owns its sourcing region, even for the same supplier');
assert.equal(cards.find((p) => p.id === 'a1').inputMaterialOrigin, 'Vietnam');
assert.equal(cards.find((p) => p.id === 'b0').rawMaterialRegion, '', 'Product details never fall back to Vietnamese source text');
assert.equal(cards.find((p) => p.id === 'b0').inputMaterialOrigin, '');
assert.doesNotMatch(JSON.stringify(cards.find((p) => p.id === 'b0')), /Bình Dương|Việt Nam/);
assert.equal(cards.find((p) => p.id === 'a1').name, 'Cashew W320 lot 1', 'A product without a display name keeps the supplier name');
assert.equal(cards.find((p) => p.id === 'a1').moq, '1 metric ton', 'Public MOQ uses English without changing the source record');
assert.equal(products[0].name, 'Cashew W320 lot 0', 'The supplier name is never rewritten');
suppliers.push({ id: 'synthetic', slug: 'vexim-test-supplier-do-not-contact', name: 'Test Supplier', status: 'published', is_demo: false,
  summary_i18n: { en: 'VEXIM TEST SUPPLIER - DO NOT CONTACT' } });
products.push(mk('synthetic-product', 'synthetic', 'Cashew W320 sample', { spec: 'TEST ONLY — not a commercial specification' }));
media.push({ ...media[0], product_id: 'synthetic-product', storage_path: 'products/synthetic-product/image.jpg' });
assert.equal((await catalog.getPublicSupplierBySlug('vexim-test-supplier-do-not-contact')).main_products.length, 1, 'Published test profile can display its existing test listing truthfully');
assert.equal((await productCatalog.listPublicCategoryProducts(category)).length, 13, 'A synthetic supplier never becomes a real marketplace listing');
suppliers.pop(); products.pop(); media.pop();
// GĐ2: chứng nhận L1 hết hạn chỉ TRỪ ĐIỂM trong tầng — listing vẫn hiện đủ 13 thẻ.
certificates[0].valid_until = '2020-01-01';
const staleCards = await productCatalog.listPublicCategoryProducts(category);
assert.equal(staleCards.length, 13, 'Expired L1 evidence deducts points, never hides the listing');
assert.equal(staleCards.find((p) => p.id === 'a0').evidenceValidSteps, 1, 'An expired L1 certificate deducts exactly one trust step');
assert.equal(staleCards.find((p) => p.id === 'b0').evidenceValidSteps, 1, 'The deduction never touches event-based L2 steps');
certificates[0].valid_until = '2099-01-01';
assert.equal(cards.filter((p) => p.grade === 'W320').length, 13, 'Grade filter can expose 5 separate W320 offers from B');
assert.equal(cards.filter((p) => p.supplierId === 'B').length, 5);
assert.deepEqual(cards.find((p) => p.id === 'a0').verificationSteps, [1, 3], 'Trader passes documents and deliveries without a factory badge');
assert.deepEqual(cards.find((p) => p.id === 'b0').verificationSteps, [2], 'Factory alone does not imply document review');
assert.equal(cards.find((p) => p.id === 'a0').verificationCount, 2, 'Ranking counts actual approved checks, not max level');
assert.equal(cards.find((p) => p.id === 'a0').evidenceValidSteps, 2, 'A valid L1 certificate keeps both approved steps alive for ranking');
assert.equal(cards.find((p) => p.id === 'b0').evidenceValidSteps, 1, 'L2 verification is event-based and never expires');
assert.equal(cards.find((p) => p.id === 'a0').imagePaths[0], 'products/a0/cover.jpg', 'Full image remains available on product detail');
assert.equal(cards.find((p) => p.id === 'a0').cardImagePath, 'products/a0/cover-thumb.webp', 'Cards use only the approved featured thumbnail');
assert.equal(cards.find((p) => p.id === 'b0').cardImagePath, 'products/b0/image.jpg', 'Legacy files without thumbnails still work');
assert.equal(cards.find((p) => p.id === 'a0').leadTimeDays, 14);
assert.equal(cards.find((p) => p.id === 'a0').incoterm, 'FOB', 'Price term on the card is projected from the product, not inferred from supplier consent');
assert.equal(cards.find((p) => p.id === 'a0').supplierSlug, 'company-a');
assert.equal(cards.find((p) => p.id === 'b0').price, null, 'No product price without supplier public-price consent');
const comparisonRecords = await productCatalog.getPublicProductRecordsByIds(['a0', 'a0', 'b0', 'draft', 'private-supplier']);
assert.deepEqual([...comparisonRecords.map((record) => record.card.id)], ['a0', 'b0'],
  'Comparison IDs preserve order, remove duplicates and exclude unready or unpublished offers');
assert.equal(comparisonRecords[1].card.price, null, 'The direct comparison query uses the same public-price consent gate');
assert.equal(comparisonRecords[0].card.rawMaterialRegion, 'Binh Phuoc and Dak Lak', 'Product comparison reads this product translation');
assert.equal(comparisonRecords[1].card.rawMaterialRegion, '', 'Missing product English stays empty in comparison');
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
assert.equal(profile.product_image_paths.a0, 'products/a0/cover.jpg', 'Full image stays on the detail/structured data');
assert.equal(profile.product_card_image_paths.a0, 'products/a0/cover-thumb.webp', 'Supplier cards use the approved thumbnail');
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
// Phần thân hồ sơ nằm trong component dùng chung với cổng NCC (Trang của tôi),
// trang công khai chỉ còn SEO, JSON-LD và đếm lượt xem.
const profilePage = readFileSync(new URL('../app/(public)/suppliers/[slug]/page.tsx', import.meta.url), 'utf8') +
  readFileSync(new URL('../components/public/supplier-storefront.tsx', import.meta.url), 'utf8');
const detailPage = readFileSync(new URL('../app/(public)/products/[slug]/[productId]/page.tsx', import.meta.url), 'utf8');
assert.match(grid, /\+\{count\} more from/);
assert.match(grid, /grid-cols-1[^"\n]*sm:grid-cols-2[^"\n]*md:grid-cols-3 lg:grid-cols-4/, 'Category offers use one column on phones, then 2/3/4 columns');
assert.match(grid, /matchesVerificationFilter\(p\.verificationSteps, p\.l2Scope, verified\)/, 'Verification filter matches the selected approved check and its scope');
assert.match(grid, /<PublicProductCard/, 'Category listing uses the common offer card');
const homePage = readFileSync(new URL('../app/(public)/home.tsx', import.meta.url), 'utf8');
// Lưới thẻ trang chủ nằm trong components/home-product-feed.tsx từ đợt tách
// lưới theo bề rộng màn hình; trang chỉ còn truyền danh sách đã sắp xếp vào đó.
const homeFeed = readFileSync(new URL('../components/home-product-feed.tsx', import.meta.url), 'utf8');
assert.match(homePage, /listPublicCategoryProducts\(category,\s*\{\s*snapshot/, 'Home offers must come from the buyer-ready catalogue, not category tiles');
assert.match(homePage, /p\.isDemo \|\| seen\.has\(p\.id\)/, 'Home excludes demos and duplicate listings');
assert.match(homePage, /<HomeProductFeed items=\{arrangedOffers\}/, 'Home renders the offer feed from the arranged list');
assert.match(homeFeed, /grid-cols-1[^"\n]*sm:grid-cols-2[^"\n]*md:grid-cols-3/, 'Home offers use one column on phones, then two or three columns');
assert.match(homeFeed, /wide \? " lg:grid-cols-5" : ""/, 'The fifth column only appears when the browser confirms a wide screen');
assert.match(homeFeed, /<PublicProductCard/, 'Home includes actual product offers');
const supplierProductRail = readFileSync(new URL('../components/public/supplier-product-rail.tsx', import.meta.url), 'utf8');
assert.match(supplierProductRail, /grid-cols-1[^"\n]*sm:grid-cols-2[^"\n]*md:grid-cols-3/,
  'Supplier products keep one phone column, then two or three columns');
assert.match(supplierProductRail, /lg:flex[^"\n]*lg:overflow-x-auto/, 'Desktop supplier products scroll horizontally');
assert.match(profilePage, /lg:w-\[calc\(\(100%_-_4rem\)\/5\)\]/, 'Five supplier product cards fit the desktop viewport');
const verificationTierModule = compile('../components/verification-tier.tsx', {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'lucide-react': require('lucide-react'),
  '@/lib/verification-status': verificationStatus,
});
const productTradeLabelsModule = compile('../components/product-trade-labels.tsx', {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'lucide-react': require('lucide-react'),
});
const { PublicProductCard } = compile('../components/public-product-card.tsx', {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'next/link': { default: ({ href, children, prefetch, ...props }) => React.createElement('a', { href, ...props }, children) },
  'lucide-react': require('lucide-react'),
  '@/components/sponsored-disclosure': { SponsoredDisclosure: () => null },
  '@/components/product-trade-labels': productTradeLabelsModule,
  '@/components/verification-tier': verificationTierModule,
  '@/components/product-compare-checkbox': { ProductCompareCheckbox: ({ product }) => React.createElement('input', {
    type: 'checkbox', 'aria-label': `Add ${product.name} to comparison`, className: 'absolute right-2 top-2',
  }) },
});
const fullTradeLabels = renderToStaticMarkup(React.createElement(productTradeLabelsModule.ProductTradeLabels, { oem: true, odm: true, samples: true }));
assert.match(fullTradeLabels, />OEM</, 'PDP keeps the full OEM label');
assert.match(fullTradeLabels, />ODM</, 'PDP keeps the full ODM label');
assert.match(fullTradeLabels, />Samples available</, 'PDP keeps the explicit sample-availability label');
const compactTradeLabels = renderToStaticMarkup(React.createElement(productTradeLabelsModule.ProductTradeLabels, { oem: true, odm: true, samples: true, compact: true }));
assert.match(compactTradeLabels, />OEM\/ODM</, 'Compact cards combine OEM and ODM into one factual badge');
assert.match(compactTradeLabels, />Samples</, 'Compact cards shorten the sample badge');
assert.doesNotMatch(compactTradeLabels, />OEM<|>ODM<|Samples available/, 'Compact badges do not repeat the full three-badge treatment');
const cardProps = { href: '/products/cashew/a0', imagePath: 'products/a0/cover.jpg',
  name: 'Cashew W320 lot 0', moq: '1 MT', price: 'USD 7/kg', fob: true, leadTimeDays: 14,
  supplierName: 'Company A', supplierHref: '/suppliers/company-a', verificationSteps: [1, 3], l2Scope: 'factory',
  quoteHref: '/rfq?category=cashew&suppliers=A&product=Cashew%20W320%20lot%200&product_id=a0', oem: true, odm: true, samples: true };
const compactCard = renderToStaticMarkup(React.createElement(PublicProductCard, cardProps));
for (const text of ['Cashew W320 lot 0', 'MOQ', '1 MT', 'USD 7/kg', 'Lead time', '14 days', 'Supplied by', 'Company A', 'OEM/ODM', 'Samples', 'Request a quote']) {
  assert.ok(compactCard.includes(text), `Compact card keeps ${text}`);
}
assert.match(compactCard, /relative aspect-square w-full/, 'The product image stays square at every breakpoint');
assert.doesNotMatch(compactCard, /min-h-40/, 'The image no longer receives a forced tall mobile height');
assert.match(compactCard, /object-cover/);
assert.match(compactCard, /line-clamp-2/);
assert.match(compactCard, /flex h-full min-w-0 flex-row[^"]*sm:flex-col/, 'Cards are horizontal on phones and vertical from sm');
assert.match(compactCard, /w-\[38%\] shrink-0[^"]*sm:w-full/, 'The phone image takes 38 percent and the content takes the remaining width');
assert.match(compactCard, /flex min-w-0 flex-1 flex-col/, 'The product information occupies the flexible content side');
assert.match(compactCard, /href="\/suppliers\/company-a"/, 'Supplier has an independent profile link');
assert.match(compactCard, /href="\/products\/cashew\/a0"/, 'Buyer can open product details through the title or image');
const comparableCard = renderToStaticMarkup(React.createElement(PublicProductCard, {
  ...cardProps, comparison: { id: 'a0', categorySlug: 'cashew' },
}));
assert.match(comparableCard, /aria-label="Add Cashew W320 lot 0 to comparison"/, 'A public offer has an image comparison checkbox');
assert.match(comparableCard, /<\/a><input[^>]*class="absolute right-2 top-2"/, 'The image-corner checkbox is a sibling of the product link, not a nested interactive control');
assert.match(compactCard, /href="\/rfq\?category=cashew&amp;suppliers=A&amp;product=Cashew%20W320%20lot%200&amp;product_id=a0"/,
  'The primary card CTA opens an RFQ prefilled for this product and supplier');
assert.match(compactCard, /aria-label="Request a quote for Cashew W320 lot 0"/, 'Repeated quote CTAs have product-specific accessible names');
assert.match(compactCard, /border-brand-400 bg-white[^\"]*text-brand-800[^\"]*\">Quote<\/a>/, 'The compact outlined quote CTA appears next to the supplier checks');
assert.match(compactCard, /text-sm font-bold leading-\[18px\] text-brand-800 sm:text-base sm:leading-5/, 'Price is compact on phones and retains its desktop size');
assert.match(compactCard, />FOB</, 'FOB remains visible as a compact suffix');
const priceParagraph = compactCard.match(/<p class="[^\"]*text-brand-800[^\"]*">USD 7\/kg[\s\S]*?<\/p>/)?.[0] ?? '';
assert.ok(priceParagraph && !/FOB reference|Reference price|bg-/.test(priceParagraph), 'Price uses plain text without a heading or tinted background');
assert.match(compactCard, /mb-1 line-clamp-2 min-h-0[^"]*sm:mb-3 sm:min-h-10/, 'The title releases its extra mobile minimum height and restores desktop alignment');
assert.match(compactCard, /mb-1 hidden h-5 items-center sm:mb-2 sm:flex sm:h-6/, 'Trade badges do not consume mobile height but keep their desktop slot');
assert.match(compactCard, /mt-1 flex flex-wrap[^"]*sm:mt-2.5 sm:grid sm:grid-cols-2/, 'MOQ and lead time are inline on phones and become a two-column row on desktop');
assert.match(compactCard, /flex min-w-0 items-baseline gap-1 sm:block/, 'Mobile commercial terms stay on the same line');
assert.match(compactCard, /mt-auto w-full px-2 pb-2/, 'The supplier footer spans the full phone card below its square image');
assert.doesNotMatch(compactCard, /mt-auto hidden pt-3 sm:block/, 'Buyers can request a quote on phones too');
assert.match(compactCard, /aria-label="Verification checks approved: [^"]+"/, 'Only individually approved supplier checks are counted');
assert.doesNotMatch(compactCard, /data-verification-tier|lucide-star|\bLevel [123]\b|>\d+ supplier checks?</,
  'The product card has no star badge, supplier-check count or Level label');
for (const { levels, tier, tone } of [
  { levels: [], tier: 0, tone: null },
  { levels: [99], tier: 0, tone: null },
  { levels: [3], tier: 1, tone: 'bg-emerald-100' },
  { levels: [3, 3], tier: 1, tone: 'bg-emerald-100' },
  { levels: [3, 99], tier: 1, tone: 'bg-emerald-100' },
  { levels: [1, 3], tier: 2, tone: 'bg-sky-100' },
  { levels: [1, 2, 3], tier: 3, tone: 'bg-brand-900' },
]) {
  const pips = renderToStaticMarkup(React.createElement(verificationTierModule.VerificationPips, {
    levels, l2Scope: 'factory', compact: true, shortTooltips: true, cardTooltips: true,
  }));
  assert.equal(verificationTierModule.verificationTier(levels), tier, 'Only distinct recognized checks determine the color');
  assert.equal((pips.match(/lucide-shield(?:-check)? /g) ?? []).length, 3, 'The card always keeps three shields');
  assert.equal((pips.match(/lucide-shield-check /g) ?? []).length, tier, 'Only approved shields show a check mark');
  assert.equal((pips.match(/h-7 w-7/g) ?? []).length, 3, 'Each card shield remains prominent and touch-friendly');
  assert.equal((pips.match(/<summary aria-label="[^"]*: Approved\./g) ?? []).length, tier, 'Only approved checks light up');
  assert.equal((pips.match(/bg-ink-50 text-ink-500 ring-ink-300/g) ?? []).length, 3 - tier, 'Unapproved checks remain legible and neutral');
  if (tone) assert.equal((pips.match(new RegExp(`ring-2 ${tone}`, 'g')) ?? []).length, tier, 'Approved shields use the matching prominent color');
  assert.doesNotMatch(pips, /\bLevel [123]\b|lucide-star|data-verification-tier/);
}
const deliveryOnly = renderToStaticMarkup(React.createElement(PublicProductCard, { ...cardProps, verificationSteps: [3] }));
assert.match(deliveryOnly, /Verification checks approved: Delivery history reviewed/);
assert.match(deliveryOnly, /Documents checked: Not approved/);
assert.match(deliveryOnly, /Factory verification: Not approved/);
assert.match(deliveryOnly, /Delivery history reviewed: Approved/);
assert.doesNotMatch(deliveryOnly, /Business registration evidence has been reviewed|A specific factory associated with the supplier has been reviewed/,
  'An unapproved check never gets an explanation claiming that it was reviewed');
const unknownScope = renderToStaticMarkup(React.createElement(PublicProductCard, { ...cardProps, verificationSteps: [2], l2Scope: null }));
assert.match(unknownScope, /Factory or partner contract review: Approved/);
assert.doesNotMatch(unknownScope, /\bL2\b|\bLevel [123]\b|Factory verification/,
  'An unspecified scope does not claim a factory inspection or expose level numbers');
const partnerScope = renderToStaticMarkup(React.createElement(PublicProductCard, { ...cardProps, verificationSteps: [2], l2Scope: 'partner_contract' }));
assert.match(partnerScope, /Partner factory contract reviewed: Approved/);
assert.match(partnerScope, /contract review alone does not establish ownership or a factory inspection/);
assert.doesNotMatch(partnerScope, /Factory verification: Approved|A specific factory associated with the supplier has been reviewed/,
  'A partner contract review never becomes a factory inspection');
const bothScopes = renderToStaticMarkup(React.createElement(PublicProductCard, { ...cardProps, verificationSteps: [2], l2Scope: 'both' }));
assert.match(bothScopes, /Factory and partner contract reviewed: Approved/);
assert.match(bothScopes, /A separate factory review was also approved/);
for (const [level, suffix] of [[1, 'Basic'], [2, 'Advanced'], [3, 'Complete']]) {
  const levels = Array.from({ length: level }, (_, index) => index + 1);
  const badge = renderToStaticMarkup(React.createElement(verificationTierModule.VerificationTierBadge, { levels, compactOnMobile: true }));
  assert.match(badge, new RegExp(`sm:hidden">Level ${level}<`), `The optional compact badge outside product cards shortens Level ${level}`);
  assert.ok(badge.includes(`hidden sm:inline">Level ${level} · ${suffix}<`), `The full Level ${level} label returns from the sm breakpoint`);
}
const standardBadge = renderToStaticMarkup(React.createElement(verificationTierModule.VerificationTierBadge, { levels: [1] }));
assert.ok(standardBadge.includes('Level 1 · Basic') && !standardBadge.includes('sm:hidden'),
  'Badges outside product cards keep the full label at every size');
assert.doesNotMatch(compactCard, /Free Sample|ISO Certified|Ready to Ship/, 'Unsupported product claims never become badges');
assert.equal((compactCard.match(/<details name="product-verification-checks"/g) ?? []).length, 3, 'Each check has a native disclosure for touch and keyboard');
assert.equal((compactCard.match(/role="tooltip"/g) ?? []).length, 3, 'Each shield has its own compact tooltip');
assert.equal((compactCard.match(/group-hover\/pip:block group-focus-within\/pip:block peer-open:block/g) ?? []).length, 3,
  'Each tooltip opens on hover, keyboard focus and touch');
assert.equal((compactCard.match(/left-0 w-full max-w-64/g) ?? []).length, 3,
  'Card tooltips are bounded by the footer instead of overflowing the viewport');
assert.equal((compactCard.match(/>Supplier check, not product certification\.</g) ?? []).length, 3,
  'Every card tooltip clarifies that the check does not certify the product');
for (const [level, label, status] of [
  [1, 'Documents checked', 'Approved'],
  [2, 'Factory verification', 'Not approved'],
  [3, 'Delivery history reviewed', 'Approved'],
]) {
  const explanation = status === 'Approved' ? VERIFICATION_LEVEL_EXPLANATIONS[level] : 'This supplier check has not been approved.';
  const accessibleName = `${label}: ${status}. ${explanation} Supplier check, not product certification.`;
  assert.ok(compactCard.includes(`aria-label="${accessibleName}"`), `Shield ${level} has its own accessible explanation and actual status`);
  assert.match(compactCard, new RegExp(`${label}<\\/strong><span[^>]*>${status}<\\/span>`),
    `Shield ${level} shows its own label and status without a level number`);
  assert.ok(compactCard.includes(`>${explanation}</span>`), `Shield ${level} shows its distinct short explanation`);
}
assert.equal(new Set(Object.values(VERIFICATION_LEVEL_EXPLANATIONS)).size, 3, 'The three levels never share one generic explanation');
for (const explanation of Object.values(PRODUCT_VERIFICATION_EXPLANATIONS)) {
  if (!Object.values(VERIFICATION_LEVEL_EXPLANATIONS).includes(explanation)) {
    assert.ok(!compactCard.includes(explanation), 'Product-specific long explanations do not replace compact card tooltips');
  }
}
const standardPips = renderToStaticMarkup(React.createElement(verificationTierModule.VerificationPips, { levels: [1], l2Scope: 'factory' }));
assert.ok(!standardPips.includes('role="tooltip"'), 'Verification pips outside product cards use native per-level tooltips without overlay clipping');
assert.equal((standardPips.match(/role="img"/g) ?? []).length, 3, 'Each standard shield keeps an independent accessible tooltip');
for (const level of [1, 2, 3]) {
  const accessibleName = `Level ${level} · ${VERIFICATION_LABELS[level]}: ${level === 1 ? 'Approved' : 'Not approved'}. ${VERIFICATION_LEVEL_EXPLANATIONS[level]}`;
  assert.ok(standardPips.includes(`title="${accessibleName}"`), `Standard shield ${level} has its own native tooltip`);
}
assert.match(compactCard, /overflow-visible rounded-xl/, 'The card does not clip its verification tooltip');
assert.match(compactCard, /rounded-tl-xl bg-ink-50[^"]*sm:rounded-t-xl/, 'The square image follows the horizontal phone card and rounded desktop card corners');
const longSupplierCard = renderToStaticMarkup(React.createElement(PublicProductCard, {
  ...cardProps, supplierName: 'VIET THIEN PHU INDUSTRIAL PRODUCTION COMPANY LIMITED',
}));
assert.match(longSupplierCard, /title="VIET THIEN PHU INDUSTRIAL PRODUCTION COMPANY LIMITED"/, 'The full supplier name remains available as a tooltip');
assert.match(longSupplierCard, /truncate font-semibold text-brand-700/, 'Long supplier names stay on one line instead of stretching the card');
const privatePrice = renderToStaticMarkup(React.createElement(PublicProductCard, { ...cardProps, price: null, fob: false, verificationSteps: [] }));
assert.match(privatePrice, /On request/);
assert.doesNotMatch(privatePrice, /FOB reference|>FOB<|USD 7\/kg/, 'No price or FOB claim without consent');
assert.match(privatePrice, /No verification checks approved yet/, 'A supplier with no approved checks is described accurately');
assert.equal((privatePrice.match(/lucide-shield /g) ?? []).length, 3, 'All three neutral shields remain visible without check marks');
assert.doesNotMatch(privatePrice, /ring-2 bg-(?:emerald-100|sky-100|brand-900)|lucide-shield-check|lucide-star|data-verification-tier/, 'Unapproved checks are never highlighted');
assert.equal((privatePrice.match(/>Not approved</g) ?? []).length, 3, 'The tooltip never marks a check approved without an actual approved level');
const noQuote = renderToStaticMarkup(React.createElement(PublicProductCard, { ...cardProps, quoteHref: undefined }));
assert.match(noQuote, /aria-label="View details of Cashew W320 lot 0"[^>]*>Details<\/a>/, 'When no quote is available, the fallback opens product details');
const noLink = renderToStaticMarkup(React.createElement(PublicProductCard, { ...cardProps, linkable: false }));
assert.doesNotMatch(noLink, /href="\/rfq\?|href="\/products\/cashew\/a0"/, 'A non-public preview does not expose quote or product links');
const testCard = renderToStaticMarkup(React.createElement(PublicProductCard, {
  ...cardProps, href: '/suppliers/company-a/products/a0', test: true, comparison: { id: 'a0', categorySlug: 'cashew' },
}));
assert.match(testCard, /TEST · Not an offer|Test data · not a price/);
assert.doesNotMatch(testCard, /to comparison/, 'Demo and preview cards never offer a public comparison selection');
assert.doesNotMatch(testCard, /USD 7\/kg|\/rfq|Supplier-stated product options/, 'A test card carries no price, quote path or commercial capability badges');
assert.match(testCard, /aria-label="No verification checks approved yet"/, 'A test card never claims a verification check');
assert.doesNotMatch(testCard, /ring-2 bg-(?:emerald-100|sky-100|brand-900)|lucide-star|data-verification-tier/,
  'Test cards cannot inherit highlighted checks from supplier data');
// Lưới thẻ trang chủ là một client component riêng; dựng nó ở đây để bản HTML
// máy chủ vẫn được kiểm bằng thẻ thật, không phải bằng chuỗi giả.
const { HomeProductFeed } = compile('../components/home-product-feed.tsx', {
  react: require('react'),
  'react/jsx-runtime': require('react/jsx-runtime'),
  'lucide-react': require('lucide-react'),
  '@/components/public-product-card': { PublicProductCard },
  '@/lib/public/supplier-product-order': { feedPerPage, HOME_FEED_PER_PAGE, HOME_FEED_WIDE_QUERY },
  '@/lib/public/product-comparison': { hasProductComparisonPeer },
});
const feedOffer = (id, categorySlug = 'cashew') => ({ ...cards.find((product) => product.id === id), categorySlug });
const renderOfferFeed = (items) => renderToStaticMarkup(React.createElement(HomeProductFeed, { items, perPage: 15 }));
assert.doesNotMatch(renderOfferFeed([feedOffer('a0')]), /to comparison/, 'A one-product feed has no comparison checkbox');
assert.doesNotMatch(renderOfferFeed([feedOffer('a0'), feedOffer('a1')]), /to comparison/,
  'A feed with only one supplier has no comparison checkbox');
assert.doesNotMatch(renderOfferFeed([feedOffer('a0'), feedOffer('b0', 'rice')]), /to comparison/,
  'Products from different categories are not presented as direct alternatives');
const mixedSupplierFeed = renderOfferFeed([feedOffer('a0'), feedOffer('b0')]);
assert.equal((mixedSupplierFeed.match(/to comparison/g) ?? []).length, 2,
  'Two same-category suppliers make both comparison checkboxes available');
const { default: HomeContent } = compile('../app/(public)/home.tsx', {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'next/image': { default: ({ src, alt, ...props }) => React.createElement('img', { src, alt, className: props.className }) },
  'next/link': { default: ({ href, children, prefetch, ...props }) => React.createElement('a', { href, ...props }, children) },
  'lucide-react': require('lucide-react'),
  '@/lib/db': { getStore: () => ({ listCategories: async () => [{ ...category, active_on_homepage: true, public_page_ready: true }], listSuppliers: async () => [] }) },
  '@/lib/blog/queries': { listPublishedNews: async () => [] },
  '@/lib/public/product-catalog': { loadPublicProductCatalogSnapshot: async () => ({}), listPublicCategoryProducts: async () => [cards[0], cards[1], { ...cards[0], id: 'demo', isDemo: true }] },
  '@/lib/public/supplier-product-order': {
    arrangeSupplierProducts,
    HOME_FEED_PER_SUPPLIER: 2,
  },
  '@/components/public-product-card': { PublicProductCard },
  '@/components/home-product-feed': { HomeProductFeed },
  // Các khối quanh danh sách sản phẩm không thuộc phạm vi bộ kiểm này.
  '@/components/service-registration-section': { ServiceRegistrationSection: () => null },
  '@/components/cookie-consent': { CookieSettingsButton: () => null },
  '@/components/brand-logo': { Logo: () => null },
  '@/components/platform-legal-strip': { PlatformLegalStrip: () => null },
  '@/components/social-links': { SocialLinks: () => null },
  '@/lib/public/popular-searches': { buildPopularSearches },
  '@/lib/public/category-names': { getCategoryTitle },
  '@/lib/public/meta-copy': { HOME_HERO_LINE },
});
const homeHtml = renderToStaticMarkup(await HomeContent());
const offersHtml = homeHtml.match(/<section aria-labelledby="home-products-title"[\s\S]*?<\/section>/)?.[0] ?? '';
assert.match(offersHtml, /grid-cols-1[^"\n]*sm:grid-cols-2[^"\n]*md:grid-cols-3/, 'Server HTML keeps one phone column before the wider layouts');
assert.doesNotMatch(offersHtml, /lg:grid-cols-5/, 'Server HTML never leaks the wide five-column layout before hydration');
assert.match(offersHtml, /href="\/products\/cashew\/a0"/);
assert.match(offersHtml, /\/public-media\/products\/a0\/cover-thumb\.webp/, 'Home product cards send the smaller photo');
assert.match(grid, /p\.cardImagePath \?\? p\.imagePaths\[0\]/, 'Category cards prefer approved thumbnails');
assert.match(profilePage, /s\.product_card_image_paths\?\.\[p\.id\]/, 'Supplier profile cards prefer approved thumbnails');
for (const [surface, source] of [['Category', grid], ['Home', homeFeed], ['Supplier profile', profilePage], ['Related products', detailPage]]) {
  assert.match(source, /quoteHref=/, `${surface} cards provide the product-specific RFQ action`);
  assert.match(source, /oem=\{/, `${surface} cards use actual OEM data`);
  assert.match(source, /odm=\{/, `${surface} cards use actual ODM data`);
  assert.match(source, /samples=\{/, `${surface} cards use actual sample-availability data`);
}
assert.match(offersHtml, /href="\/rfq\?category=cashew&amp;suppliers=A&amp;product=Cashew%20kernels%20W320%2C%20Hanoi&amp;product_id=a0"/,
  'Home cards prefill the current product and supplier in the RFQ');
assert.equal((offersHtml.match(/aria-label="View details of/g) ?? []).length, 2, 'Home has two real offers, not category placeholders or demo products');
assert.doesNotMatch(offersHtml, /\/products\/cashew\/demo|Test data/);
assert.match(homeHtml, /id="categories"/, 'Category navigation remains a separate section');
assert.match(detailPage, /<ProductVerificationIcons levels=\{card\.verificationSteps\}/);
assert.match(profilePage, /price=\{synthetic \? null : publicProductPrice\(p, s\)\}/);
assert.match(profilePage, /const href = synthetic[\s\S]*?`\/suppliers\/\$\{encodeURIComponent\(s\.slug \|\| s\.id\)\}\/products\/\$\{encodeURIComponent\(p\.id\)\}`/, 'Test products have a safe dedicated preview instead of a dead card');
assert.match(detailPage, /View supplier profile/);
assert.match(detailPage, /#factory-visit/);
assert.match(detailPage, /#delivery-history/);
assert.match(detailPage, /parseProductSpecification\(enSpec\)/, 'PDP separates supplier specification lines into key-value rows');
assert.match(detailPage, />Key terms</, 'The gallery-side card keeps only commercial terms');
assert.match(detailPage, /<h1 className="mt-2 break-words text-2xl font-bold leading-snug tracking-tight text-ink-900 sm:text-3xl">/, 'The product title uses compact typography and wraps long names safely');
assert.match(detailPage, /id="full-specifications-heading"/, 'Technical details have their own specification card');
const galleryStart = detailPage.indexOf('<ProductMediaGallery');
const supplierCardStart = detailPage.indexOf('id="supplier-card-title"');
const fullSpecsStart = detailPage.indexOf('id="full-specifications-heading"');
assert.ok(supplierCardStart > galleryStart && supplierCardStart < detailPage.indexOf('>Key terms</h2>'),
  'The supplier card sits inside the left column directly below the gallery');
assert.ok(fullSpecsStart > detailPage.indexOf('>Key terms</h2>') && fullSpecsStart < detailPage.indexOf('id="product-description-heading"'),
  'Full specifications return to a full-width row between the two-column hero and description');
const fullSpecsSource = detailPage.slice(fullSpecsStart, detailPage.indexOf('</section>', fullSpecsStart));
assert.match(fullSpecsSource, /md:grid-cols-2/, 'The full-width specification table uses two columns on larger screens');
const keyTermsStart = detailPage.indexOf('>Key terms</h2>');
const keyTermsEnd = detailPage.indexOf('</dl>', keyTermsStart);
const keyTermsSource = detailPage.slice(keyTermsStart, keyTermsEnd);
assert.ok(!keyTermsSource.includes('detailRows') && !keyTermsSource.includes('additionalSpecs'),
  'Long technical rows stay out of the commercial column');
assert.match(keyTermsSource, /label="Raw material region" value=\{card\.rawMaterialRegion\}/);
assert.match(keyTermsSource, /label="Input material origin" value=\{card\.inputMaterialOrigin\}/);
assert.doesNotMatch(keyTermsSource, /raw_material_region|input_material_origin/, 'PDP uses only the safe English card projection');
const referencePriceStart = detailPage.indexOf('id="reference-price"');
const tradeLabelsStart = detailPage.indexOf('<ProductTradeLabels');
assert.ok(referencePriceStart > detailPage.indexOf('{enDescription &&') && referencePriceStart < tradeLabelsStart,
  'The prominent reference price follows the short description and precedes OEM, ODM and sample labels');
const referencePriceSource = detailPage.slice(referencePriceStart, tradeLabelsStart);
assert.match(referencePriceSource, /text-3xl font-black/, 'The standalone reference price uses prominent display typography');
assert.match(referencePriceSource, /card\.price \|\| "On request"/, 'The standalone price preserves the public-price fallback');
assert.ok(!keyTermsSource.includes('Reference price'), 'Reference price is not duplicated in Key terms');
assert.equal((detailPage.match(/>Reference price</g) ?? []).length, 1, 'PDP has one standalone reference-price label');
assert.match(detailPage, /Product details and reference prices are supplier-provided and reviewed for listing/);
assert.doesNotMatch(detailPage, /Product specifications are supplier-stated|These are supplier reviews, not certifications/, 'PDP avoids repeated defensive disclaimers');
assert.match(detailPage, /supplierImageUrl/, 'Supplier card supports the real public profile image');
assert.match(detailPage, /Founded \{card\.supplierFoundedYear\}/, 'Supplier card only shows a founded year when data exists');
assert.match(detailPage, /categoryProducts\.filter\(\(item\) => item\.id !== card\.id && !item\.isDemo\)\.slice\(0, 4\)/,
  'Related products exclude the current listing and demo data, with a four-card limit');
const relatedProductsStart = detailPage.indexOf('id="related-products-heading"');
assert.ok(relatedProductsStart > detailPage.indexOf('id="product-description-heading"'),
  'Related products fill the area after the product description');
const relatedProductsSource = detailPage.slice(relatedProductsStart, detailPage.indexOf('</section>', relatedProductsStart));
assert.match(relatedProductsSource, /grid-cols-1[^"\n]*sm:grid-cols-2[^"\n]*md:grid-cols-3 lg:grid-cols-4/, 'Related products use one phone column, then the responsive 2/3/4-column grid');
assert.match(relatedProductsSource, /<PublicProductCard/, 'Related products reuse the common public offer card');
assert.match(relatedProductsSource, /related\.cardImagePath \?\? related\.imagePaths\[0\]/, 'Related product cards prefer approved thumbnails');
assert.match(relatedProductsSource, /related\.verificationSteps/, 'Related product cards retain approved supplier checks');
assert.match(relatedProductsSource, /View all products/, 'Buyers can continue to the full category');
assert.match(profilePage, /Markets shared by the supplier\./);
assert.match(profilePage, /Supplier-declared - Not verified/, 'Target markets are not represented as verified shipment destinations');
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
