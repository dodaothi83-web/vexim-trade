// Regression for the public supplier marketplace view, search policy and truthful structured data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';

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
const seo = compile('../lib/public/supplier-seo.ts', {});
const selection = compile('../lib/public/product-selection.ts', { '@/lib/public/category-assignment': { assignProductCategory: () => null } });
const category = { slug: 'cashew', name_i18n: { en: 'Cashew' }, status: 'published', is_published: true };
const product = { id: 'p1', name: 'Cashew kernels W320', supplier_id: 'real', moq: '1 MT', spec: 'Grade W320', category: 'cashew' };
const real = {
  id: 'real', slug: 'green-cashew-export', name: 'Green Export Co', status: 'published', province: 'Hanoi', supplier_type: 'trading',
  summary_i18n: { en: 'We supply roasted and raw cashew kernels in wholesale quantities for international trade.' },
  main_products: [product], product_image_paths: { p1: 'products/p1/approved.jpg' }, gallery_images: [],
  approved_verification_steps: [1, 3], public_review_summaries: { 3: 'One delivery record reviewed for a named shipment.' },
};
const synthetic = { ...real, id: 'test', slug: 'vexim-test-supplier-do-not-contact',
  summary_i18n: { en: 'VEXIM TEST SUPPLIER - DO NOT CONTACT. veximglobal.com' },
  main_products: [{ ...product, id: 'fake', spec: 'TEST ONLY — no verified commercial specification',
    lead_time_days: 14, packaging: 'Sample bag', description: 'Sample description only.',
    description_detail: 'Do not email secret@example.com about this test.', ref_price: 999, certifications: 'unreviewed' }],
  product_image_paths: { fake: 'products/fake/test.jpg' }, approved_verification_steps: [1], public_review_summaries: {} };
const thin = { ...real, id: 'empty', slug: 'empty-supplier', main_products: [] };
assert.equal(seo.supplierProfileIndexable(real), true);
assert.equal(seo.supplierProfileIndexable(synthetic), false);
assert.equal(seo.supplierProfileIndexable(thin), false);
assert.equal(seo.supplierProfileIndexable({ ...real, is_demo: true }), false);
assert.equal(seo.safeJsonLd({ name: '</script><script>alert(1)</script>' }).includes('</script>'), false);
assert.equal(selection.withoutDirectContacts('See veximglobal.com or www.example.vn and hello@example.com'),
  'See [contact via Vexim] or [contact via Vexim] and [contact via Vexim]');
const fixtures = [real, synthetic, thin];
const lookup = async (slug) => fixtures.find((s) => s.slug === slug) ?? null;
const require = createRequire(import.meta.url);
const { PublicProductCard } = compile('../components/public-product-card.tsx', {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'next/link': { default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) },
  'lucide-react': icons,
  '@/components/product-trade-labels': { ProductTradeLabels: () => null },
  '@/components/product-verification-tooltip': { ProductVerificationTooltip: () => React.createElement('span') },
  '@/components/verification-tier': { VerificationPips: () => React.createElement('span'), VerificationTierBadge: () => React.createElement('span') },
  '@/components/product-compare-checkbox': { ProductCompareCheckbox: () => null },
});
const { default: Profile, generateMetadata } = compile('../app/(public)/suppliers/[slug]/page.tsx', {
  'react/jsx-runtime': await import('react/jsx-runtime'),
  'next/link': { default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) },
  'next/navigation': { notFound: () => { throw new Error('not found'); } },
  'lucide-react': icons,
  '@/components/ui': { Breadcrumbs: () => React.createElement('nav') },
  '@/components/verification-tier': { VerificationCoverSeal: () => React.createElement('span'), VerificationPips: () => React.createElement('span'), VerificationTierBadge: () => React.createElement('span'), approvedChecksSummary: () => '', verificationTier: (levels) => levels.length },
  '@/lib/verification-status': { PRODUCT_VERIFICATION_EXPLANATIONS: { 1: 'Documents explanation', 2: '', 3: '' } },
  '@/components/public-product-card': { cardTitleGrades: (p) => [...(p?.cardGrades ?? []), ...(p?.grade ? [p.grade] : [])], PublicProductCard },
  '@/lib/public/catalog': { getPublicSupplierBySlug: lookup, listPublicSuppliers: async () => fixtures,
    supplierTypeLabel: () => 'Trading company', t: (texts) => texts?.en ?? '' },
  '@/lib/db': { getStore: () => ({ listCategories: async () => [category] }) },
  '@/lib/public/certificates': { publicSupplierCertificates: () => [] },
  '@/lib/public/product-selection': { productBelongsToCategory: () => true, publicProductPrice: () => 'USD 2/MT', withoutDirectContacts: selection.withoutDirectContacts },
  '@/lib/public/supplier-seo': seo, '@/lib/site': { SITE_URL: 'https://www.veximtrade.com' },
  '@/lib/auth/session': { getSession: async () => null },
  '@/lib/traffic/server': { createTrafficToken: () => 'test-token' },
  '@/components/supplier-traffic-beacon': { SupplierTrafficBeacon: () => null },
});
const previous = process.env.PUBLIC_SITE_INDEXABLE;
process.env.PUBLIC_SITE_INDEXABLE = 'true';
const params = (slug) => ({ params: Promise.resolve({ slug }) });
const goodMeta = await generateMetadata(params(real.slug));
assert.equal(goodMeta.robots.index, true);
assert.equal(goodMeta.alternates.canonical, 'https://www.veximtrade.com/suppliers/green-cashew-export');
assert.equal(goodMeta.openGraph.url, goodMeta.alternates.canonical);
const badMeta = await generateMetadata(params(synthetic.slug));
assert.equal(badMeta.robots.index, false);
assert.doesNotMatch(badMeta.description, /veximglobal\.com/);
assert.equal((await generateMetadata(params(thin.slug))).robots.index, false);
process.env.PUBLIC_SITE_INDEXABLE = 'false';
assert.equal((await generateMetadata(params(real.slug))).robots.index, false, 'Global launch flag remains authoritative');
if (previous === undefined) delete process.env.PUBLIC_SITE_INDEXABLE;
else process.env.PUBLIC_SITE_INDEXABLE = previous;
const html = renderToStaticMarkup(await Profile(params(real.slug)));
assert.match(html, /id="products"/);
assert.ok(html.indexOf('id="about"') < html.indexOf('id="verification"') &&
  html.indexOf('id="verification"') < html.indexOf('id="delivery-history"') &&
  html.indexOf('id="delivery-history"') < html.indexOf('id="products"'),
  'Products sit below the supplier information and all independent verification sections');
assert.ok(html.indexOf('id="products"') < html.indexOf('id="related-title"'),
  'Related suppliers, when present, remain below the product catalogue');
assert.match(html, /href="#products"/, 'The header still jumps to the moved product section');
assert.match(html, /href="#verification"/, 'Existing verification deep link still works');
assert.ok(html.indexOf('href="#verification"') < html.lastIndexOf('href="#products"'),
  'Section navigation follows the new page order');
assert.match(html, /products\/p1\/approved.jpg/);
assert.match(html, /href="\/products\/cashew\/p1"/);
assert.match(html, /One delivery record reviewed/);
assert.match(html, /USD 2\/MT/);
assert.doesNotMatch(html, /"@type":"Offer"|makesOffer|Factory verification approved/);
const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1] ?? '{}');
assert.equal(ld['@graph'][0]['@type'], 'Organization');
assert.equal(ld['@graph'][2].itemListElement[0].url, 'https://www.veximtrade.com/products/cashew/p1');
const testHtml = renderToStaticMarkup(await Profile(params(synthetic.slug)));
assert.match(testHtml, /Test profile/);
assert.match(testHtml, /id="products"/);
assert.match(testHtml, /Test data · not a price/);
assert.match(testHtml, /href="\/suppliers\/vexim-test-supplier-do-not-contact\/products\/fake"/, 'Test card opens a noncommercial preview, not a missing category detail');
assert.match(testHtml, /aspect-square[^<]*[\s\S]*?object-cover/, 'Supplier product card uses a square crop');
assert.doesNotMatch(testHtml, /application\/ld\+json|Get quote|Request a quote|veximglobal\.com/);
const { default: Preview, generateMetadata: previewMetadata } = compile('../app/(public)/suppliers/[slug]/products/[productId]/page.tsx', {
  'react/jsx-runtime': await import('react/jsx-runtime'),
  'next/link': { default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) },
  'next/navigation': { notFound: () => { throw new Error('not found'); } },
  'lucide-react': icons,
  '@/lib/public/catalog': { getPublicSupplierBySlug: lookup },
  '@/lib/public/supplier-seo': seo,
  '@/lib/public/product-selection': { withoutDirectContacts: selection.withoutDirectContacts },
});
const previewParams = (slug, productId) => ({ params: Promise.resolve({ slug, productId }) });
const previewMeta = await previewMetadata(previewParams(synthetic.slug, 'fake'));
assert.equal(previewMeta.robots.index, false);
assert.equal(previewMeta.robots.follow, false);
const previewHtml = renderToStaticMarkup(await Preview(previewParams(synthetic.slug, 'fake')));
assert.match(previewHtml, /Test product preview only/);
assert.match(previewHtml, /products\/fake\/test.jpg/);
assert.match(previewHtml, /object-contain/, 'Full preview image is not cropped');
assert.ok(previewHtml.indexOf('Test product information') < previewHtml.indexOf('Test product photo'),
  'Product details precede the photo in the mobile reading order');
for (const fact of ['Specification', 'TEST ONLY — no verified commercial specification', 'MOQ', '1 MT',
  'Lead time', '14 days · test data', 'Packaging', 'Sample bag', 'Not shown · test data', 'Sample description only.']) {
  assert.ok(previewHtml.includes(fact), `Test detail includes ${fact}`);
}
assert.match(previewHtml, /Open original photo/, 'Opening the raw file is a separate, clearly labeled action');
assert.doesNotMatch(previewHtml, /<a[^>]*><img/, 'Clicking the photo itself must not navigate away from the product detail');
assert.match(previewHtml, /\[contact via Vexim\]/);
assert.match(previewHtml, /Not a commercial offer/);
assert.doesNotMatch(previewHtml, /secret@example\.com|999|unreviewed|Get quote|Request a quote|\/rfq\?|Documents checked/);
await assert.rejects(Preview(previewParams(real.slug, 'p1')), /not found/, 'Real products cannot bypass their regular detail gate');
await assert.rejects(Preview(previewParams(synthetic.slug, 'missing')), /not found/, 'No arbitrary product is exposed');
const emptyHtml = renderToStaticMarkup(await Profile(params(thin.slug)));
assert.match(emptyHtml, /No buyer-ready products/);
assert.doesNotMatch(emptyHtml, /application\/ld\+json/);

process.env.PUBLIC_SITE_INDEXABLE = 'true';
const { default: sitemap } = compile('../app/sitemap.ts', {
  '@/lib/blog/queries': { listPublishedNews: async () => [] },
  '@/lib/db': { getStore: () => ({ listCategories: async () => [category] }) },
  '@/lib/public/catalog': { listPublicSuppliers: async () => fixtures, getPublicSupplierBySlug: lookup },
  '@/lib/public/supplier-seo': seo, '@/lib/site': { SITE_URL: 'https://www.veximtrade.com' },
});
const urls = (await sitemap()).map((route) => route.url);
assert.ok(!urls.includes('https://www.veximtrade.com/products/cashew'), 'Non-indexable categories stay out of the sitemap');
assert.ok(urls.includes('https://www.veximtrade.com/suppliers/green-cashew-export'));
assert.ok(!urls.some((url) => url.includes(synthetic.slug) || url.includes(thin.slug)));
if (previous === undefined) delete process.env.PUBLIC_SITE_INDEXABLE;
else process.env.PUBLIC_SITE_INDEXABLE = previous;
console.log('✅ Supplier profile: marketplace cards, safe media and price gates, canonical/robots, truthful JSON-LD, test exclusion and sitemap.');
