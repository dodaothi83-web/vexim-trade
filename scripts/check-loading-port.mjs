// node --experimental-strip-types --no-warnings scripts/check-loading-port.mjs
// Exercise the real source hash, buyer resolver, product detail and comparison with mock records.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as display from '../lib/public/product-detail-display.ts';
import { loadProductDescription } from './product-description-test-utils.mjs';

const require = createRequire(import.meta.url);
function compile(path, mocks) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    exports, process, console, Date,
    require: (key) => {
      if (!(key in mocks)) throw new Error(`${path}: unexpected import ${key}`);
      return mocks[key];
    },
  }, { filename: path });
  return exports;
}

const { description, format } = loadProductDescription();
const translation = compile('../lib/ai/translate-content.ts', {
  'server-only': {},
  'node:crypto': require('node:crypto'),
  '@/lib/ai/company-introduction': { readOutputText: () => '' },
  '@/lib/products/product-description': description,
  '@/lib/products/product-description-format': format,
});
const portDisplay = compile('../lib/public/product-export-port.ts', {
  'server-only': {},
  '@/lib/ai/translate-content': translation,
  '@/lib/public/product-detail-display': display,
});
const { publicProductExportPortDisplay } = portDisplay;
const selection = compile('../lib/public/product-selection.ts', {
  '@/lib/public/category-assignment': { assignProductCategory: () => null },
});

const base = {
  id: 'product-1', supplier_id: 'supplier-1', name: 'Product', category: 'cashew',
  description: null, spec: null, description_detail: null, packaging: null, certifications: null,
  moq: '5000 kg', monthly_capacity: null, payment_terms: null,
  raw_material_region: null, input_material_origin: null, incoterm_place: null,
  export_port: 'Nam Đình Vũ', specs: {}, oem: false, odm: false, samples: false,
};
function withTranslation(product, english, origin = 'staff') {
  return {
    ...product,
    translation_meta: {
      source_hash: translation.productSourceHash(product), translated_at: '2026-10-27T00:00:00Z', origin,
      fields: { export_port: english },
    },
  };
}

const fresh = withTranslation(base, 'Nam Dinh Vu Port, Hai Phong');
assert.equal(publicProductExportPortDisplay(fresh), 'Nam Dinh Vu Port, Hai Phong', 'A current saved English translation is used');
assert.equal(publicProductExportPortDisplay(withTranslation(base, 'Nam Đình Vũ', 'ai')), 'Nam Dinh Vu',
  'A saved AI response that retained the Vietnamese name still uses the known English spelling');
assert.equal(publicProductExportPortDisplay(base), 'Nam Dinh Vu', 'The reported port works without a saved translation');
assert.equal(publicProductExportPortDisplay(withTranslation(base, '  ')), 'Nam Dinh Vu', 'Whitespace is not a translation');

const previouslyCatLai = withTranslation({ ...base, export_port: 'Cát Lái' }, 'Cat Lai Port');
const stale = { ...previouslyCatLai, export_port: 'Nam Đình Vũ' };
assert.equal(publicProductExportPortDisplay(stale), 'Nam Dinh Vu', 'Never show a previous port after the source changes');
assert.equal(publicProductExportPortDisplay({ ...previouslyCatLai, export_port: null }), '', 'Clearing the port does not resurrect an old translation');
assert.equal(publicProductExportPortDisplay({ ...base, translation_meta: { fields: { export_port: 'Cat Lai' } } }), 'Nam Dinh Vu',
  'Unverifiable legacy translations do not override the current source');
const unknown = { ...base, export_port: 'Cảng Chưa Biết' };
assert.equal(publicProductExportPortDisplay(unknown), 'Cảng Chưa Biết', 'Unknown untranslated names are preserved');
assert.equal(publicProductExportPortDisplay(withTranslation(unknown, 'Example Port')), 'Example Port',
  'A current reviewed English translation works for any port, not only hard-coded aliases');
assert.equal(publicProductExportPortDisplay({ ...withTranslation(unknown, 'Example Port'), description: 'Nội dung thay đổi' }), 'Cảng Chưa Biết',
  'A stale translation falls back conservatively when its source cannot be verified');
const longSource = { ...base, export_port: `${'a'.repeat(180)} additional port information` };
assert.equal(publicProductExportPortDisplay(withTranslation(longSource, 'Partial translation')), longSource.export_port,
  'A legacy port longer than the translation input limit is never truncated to a partial translation');
const original = JSON.stringify(fresh);
publicProductExportPortDisplay(fresh);
assert.equal(JSON.stringify(fresh), original, 'Buyer display never rewrites stored supplier information');

// Supplier profile uses the same known-port aliases, including without a translation cache.
const supplierEnglish = compile('../lib/public/supplier-english.ts', { '@/lib/public/product-detail-display': display });
assert.deepEqual([...supplierEnglish.supplierPortsDisplay({
  ports: ['Nam Đình Vũ', 'Cảng Nam Đình Vũ', 'Nam Hải Đình Vũ'], profile_translation_meta: null,
})], ['Nam Dinh Vu', 'Nam Dinh Vu Port', 'Nam Hai Dinh Vu']);

// Render the real product detail component and project the real comparison data.
const category = { id: 'category-1', slug: 'cashew', name_i18n: { en: 'Cashew' }, status: 'published', is_published: true, seo_indexable: false };
const card = {
  id: base.id, name: 'Product', supplierId: base.supplier_id, supplierName: 'Supplier', supplierSlug: 'supplier',
  supplierProfileImage: null, supplierFoundedYear: null, province: 'Vietnam', verificationSteps: [], isDemo: false,
  grade: null, attributes: {}, moq: '5000 kg', price: null, pricePoint: null, leadTimeDays: 20, incoterm: 'FOB',
  rawMaterialRegion: '', inputMaterialOrigin: '', imagePaths: [], cardImagePath: null,
};
let currentProduct = base;
const store = {
  getCategoryBySlug: async () => category,
  getProduct: async () => currentProduct,
  listCategories: async () => [category],
  listMedia: async () => [],
  listCertificates: async () => [],
};
const Null = () => null;
const Wrapper = ({ children }) => React.createElement('div', null, children);
const Link = ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children);
const common = {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'server-only': {},
  '@/lib/db': { getStore: () => store },
  '@/lib/public/product-detail-display': display,
  '@/lib/public/product-export-port': portDisplay,
};
const detailPage = compile('../app/(public)/products/[slug]/[productId]/page.tsx', {
  ...common,
  'next/link': { default: Link },
  'next/navigation': { notFound: () => { throw new Error('unexpected notFound'); } },
  'lucide-react': require('lucide-react'),
  '@/components/ui': { Breadcrumbs: Null },
  '@/components/product-verification-icons': { ProductVerificationIcons: Null },
  '@/components/verification-tier': { VerificationTierBadge: Null },
  '@/lib/auth/session': { getSession: async () => null },
  '@/lib/auth/permissions': { hasPermission: () => false },
  '@/lib/public/product-catalog': { listPublicCategoryProducts: async () => [card], shareableProductImages: () => [] },
  '@/lib/product-attributes': { fieldsFor: () => [], publicProductAttributes: () => ({}), supplierFieldsFor: () => [] },
  '@/lib/public/product-video': { shareableProductVideo: () => null },
  '@/components/product-media-gallery': { ProductMediaGallery: Null },
  '@/components/sticky-product-column': { StickyProductColumn: Wrapper },
  '@/components/product-trade-labels': { ProductTradeLabels: Null },
  '@/components/public-product-card': { PublicProductCard: Null },
  '@/components/public/product-description': { ProductDescription: Null },
  '@/components/public/quantity-price-table': { QuantityPriceTable: Null },
  '@/lib/public/product-selection': { productBelongsToCategory: () => true, withoutDirectContacts: selection.withoutDirectContacts },
  '@/lib/traffic/server': { createTrafficToken: () => 'token' },
  '@/components/supplier-traffic-beacon': { SupplierTrafficBeacon: Null },
  '@/lib/site': { SITE_URL: 'https://example.com' },
  '@/lib/public/supplier-seo': { safeJsonLd: JSON.stringify },
  '@/lib/public/product-comparison': { hasProductComparisonPeer: () => false },
});
const comparison = compile('../lib/public/product-comparison-data.ts', {
  ...common,
  '@/lib/product-attributes': { fieldsFor: () => [] },
  '@/lib/public/certificates': { publicSupplierCertificates: () => [] },
  '@/lib/public/product-catalog': { getPublicProductRecordsByIds: async () => [{ card, product: currentProduct, supplier: { id: base.supplier_id }, category }] },
  '@/lib/public/product-comparison': { productDetailHref: () => '/products/cashew/product-1' },
  '@/lib/public/product-selection': { withoutDirectContacts: selection.withoutDirectContacts },
});

async function checkSurfaces(product, expected) {
  currentProduct = product;
  const html = renderToStaticMarkup(await detailPage.default({ params: Promise.resolve({ slug: 'cashew', productId: base.id }) }));
  const value = html.match(/<dt[^>]*>Loading port<\/dt><dd[^>]*>(.*?)<\/dd>/)?.[1] ?? null;
  assert.equal(value, expected, 'Product detail renders the expected loading port');
  const [projected] = await comparison.getPublicProductsForComparison([base.id]);
  assert.equal(projected.exportPort, expected, 'Comparison uses the same loading-port value');
}
await checkSurfaces(base, 'Nam Dinh Vu');
await checkSurfaces(fresh, 'Nam Dinh Vu Port, Hai Phong');
await checkSurfaces(stale, 'Nam Dinh Vu');
await checkSurfaces({ ...previouslyCatLai, export_port: null }, null);
await checkSurfaces(unknown, 'Cảng Chưa Biết');
await checkSurfaces({ ...base, export_port: 'Nam Đình Vũ, supplier@example.com' }, 'Nam Dinh Vu, [contact via Vexim]');
await checkSurfaces(withTranslation(base, 'Nam Dinh Vu, supplier@example.com'), 'Nam Dinh Vu, [contact via Vexim]');

console.log('✅ Loading port: current translations, stale/blank fallback, supplier profile, detail SSR and comparison projection.');
