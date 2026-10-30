// node scripts/check-product-category-redirect.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/public/product-category-redirect.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, encodeURIComponent, require(key) {
  if (key === '@/lib/public/product-selection') return { publicProductCategorySlug: (product, categories) => categories.some((x) => x.slug === product.reviewed_category_slug) ? product.reviewed_category_slug : null };
  throw Error(key);
} });
const move = exports.movedProductDestination, id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const product = { id, reviewed_category_slug: 'pepper' }, published = [{ slug: 'pepper', status: 'published', is_published: true }];
let checks = 0; const visible = async (slug) => { checks++; assert.equal(slug, 'pepper'); return true; };
assert.equal(await move(product, published, 'cashew', visible), `/products/pepper/${id}`);
assert.equal(checks, 1);
assert.equal(await move(product, published, 'pepper', visible), null, 'No redirect loop');
assert.equal(await move(product, published, 'cashew', async () => false), null, 'Ineligible product stays hidden');
assert.equal(await move(product, [{ ...published[0], is_published: false }], 'cashew', visible), null);
assert.equal(await move(product, [{ ...published[0], status: 'archived' }], 'cashew', visible), null);
assert.equal(await move({ ...product, reviewed_category_slug: 'missing' }, published, 'cashew', visible), null);
// PDP cũ không gọi getDetailOrRedirect; chỉ còn kiểm logic chuyển hướng ở lớp dữ liệu.
console.log('Product category redirects: canonical path only for publicly eligible product, unpublished and private products remain hidden');
