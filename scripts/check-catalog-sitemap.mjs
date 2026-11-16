// Exercise sitemap launch flag, canonical supplier routes, and catalog filtering.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../app/sitemap.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const origin = 'https://www.veximtrade.com';
const categories = [
  { slug: 'cashew', seo_indexable: true, name_i18n: { en: 'Cashew kernels', vi: 'Hạt điều' } },
  { slug: 'pepper', seo_indexable: true, name_i18n: { en: 'Pepper' } },
  { slug: 'private', seo_indexable: false },
];
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
    listCachedPublicSuppliers: async () => suppliers,
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
  '@/lib/public/i18n': { hasTranslation: (m, lang) => typeof m?.[lang] === 'string' && m[lang].trim().length > 0 },
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
// hreflang `vi` chỉ được khai khi danh mục có bản dịch thật: `pepper` chưa dịch
// nên không được tự nhận ?lang=vi là bản tiếng Việt.
const entries = await compile('true')();
const viAlternate = (path) => entries.find((entry) => entry.url === origin + path)?.alternates?.languages?.vi ?? null;
assert.equal(viAlternate('/products/cashew'), `${origin}/products/cashew?lang=vi`, 'danh mục có bản dịch khai alternate vi');
assert.equal(viAlternate('/products/pepper'), null, 'danh mục chưa dịch không khai alternate vi');
// Trang chủ + danh mục + sản phẩm dùng CHUNG một snapshot cho mỗi lần dựng; lần
// dựng thứ hai (đọc phần alternates) là một lần gọi sitemap() riêng nên cộng thêm đúng một.
assert.equal(snapshotLoads, 2, 'Catalogs share one snapshot per build');
assert.deepEqual([...new Set(categoryCalls)], ['cashew', 'pepper'], 'Only indexable, multilingual-eligible categories are read');
assert.deepEqual(categoryCalls, ['cashew', 'pepper', 'cashew', 'pepper'], 'Category lists are read once per build');
const staging = (await compile('false')()).map((entry) => entry.url);
assert.ok(!staging.some((url) => url.includes('/products/') || url.includes('/suppliers/')));
assert.equal(snapshotLoads, 2, 'Staging does not query the product catalog');
console.log('Catalog sitemap: supplier fallback, public product gate, category policy and launch flag passed');
