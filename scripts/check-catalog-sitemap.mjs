// Exercise sitemap launch flag, canonical supplier routes, and catalog filtering.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../app/sitemap.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const origin = 'https://www.veximtrade.com';
const categories = [{ slug: 'cashew', seo_indexable: true }, { slug: 'pepper', seo_indexable: true }, { slug: 'private', seo_indexable: false }];
const suppliers = [
  { id: 'a', slug: 'supplier-a', indexable: true },
  { id: 'no-slug', slug: null, indexable: true },
  { id: 'demo', slug: 'test', indexable: false },
  { id: 'thin', slug: 'thin', indexable: true },
];
let snapshotLoads = 0;
const categoryCalls = [];
const snapshot = { marker: true };
const mocks = {
  '@/lib/blog/queries': { listPublishedNews: async () => [] },
  '@/lib/db': { getStore: () => ({ listCategories: async () => categories }) },
  '@/lib/public/catalog': {
    listPublicSuppliers: async () => suppliers,
    getPublicSupplierBySlug: async (key) => key === 'thin' ? null : suppliers.find((s) => (s.slug || s.id) === key) ?? null,
  },
  '@/lib/public/product-catalog': {
    loadPublicProductCatalogSnapshot: async () => { snapshotLoads++; return snapshot; },
    listPublicCategoryProducts: async (category, options) => {
      categoryCalls.push(category.slug);
      assert.equal(options.snapshot, snapshot);
      // Public catalog already excludes unpublished, unapproved and unready products.
      if (category.slug === 'pepper') return [{ id: 'original-product', isDemo: false }, { id: 'second-grade', isDemo: false }];
      return [{ id: 'approved', isDemo: false }, { id: 'demo', isDemo: true }];
    },
  },
  '@/lib/public/supplier-seo': { supplierProfileIndexable: (s) => s.indexable },
  '@/lib/site': { SITE_URL: origin },
};
function compile(indexable) {
  const exports = {};
  vm.runInNewContext(code, {
    exports, Date, process: { env: { PUBLIC_SITE_INDEXABLE: indexable } },
    require: (key) => { if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; },
  });
  return exports.default;
}
const urls = (await compile('true')()).map((entry) => entry.url);
for (const path of ['/suppliers/supplier-a', '/suppliers/no-slug', '/products/cashew', '/products/cashew/approved',
  '/products/pepper/original-product', '/products/pepper/second-grade']) {
  assert.ok(urls.includes(origin + path), `${path} appears`);
}
for (const path of ['/suppliers/null', '/suppliers/thin', '/suppliers/test', '/products/cashew/demo', '/products/private', '/products/private/approved']) {
  assert.ok(!urls.includes(origin + path), `${path} excluded`);
}
assert.equal(snapshotLoads, 1);
assert.deepEqual(categoryCalls, ['cashew', 'pepper']);
const staging = (await compile('false')()).map((entry) => entry.url);
assert.ok(!staging.some((url) => url.includes('/products/') || url.includes('/suppliers/')));
assert.equal(snapshotLoads, 1, 'Staging does not query the product catalog');
console.log('Catalog sitemap: supplier fallback, public product gate, category policy and launch flag passed');
