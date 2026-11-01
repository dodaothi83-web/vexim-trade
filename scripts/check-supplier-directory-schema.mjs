// Exercise the actual JSON-LD expression without database/network or UI dependencies.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../app/(public)/suppliers/[slug]/page.tsx', import.meta.url), 'utf8');
const expression = source.slice(source.indexOf('  const jsonLd = ') + '  const jsonLd = '.length, source.indexOf('\n\n  const countView'));
const context = {
  SITE_URL: 'https://www.veximtrade.com', profileUrl: 'https://www.veximtrade.com/suppliers/example',
  name: 'Example supplier', summary: 'Supplier directory', avatarUrl: null, steps: [],
  safe: (value) => value ?? '', supplierAddressDisplay: () => '', supplierProvinceDisplay: () => '',
  publicProductTitle: (p) => p.name, mediaUrl: (path) => `/public-media/${path}`,
  productCategory: (p) => p.id === 'hidden' ? null : { slug: 'cashew' },
  s: { main_products: [{ id: 'hidden' }, { id: 'p1', name: 'Cashew kernels' }, { id: 'p2', name: 'Cashew W320' }],
    form_product_cards: { p1: { name: 'Approved card title' } }, product_image_paths: { p1: 'products/p1.webp' } },
};
const ld = JSON.parse(JSON.stringify(vm.runInNewContext(`(${expression.replace(/;\s*$/, '')})`, context)));
assert.equal(ld['@graph'][0]['@type'], 'Organization');
assert.equal(ld['@graph'][1]['@type'], 'BreadcrumbList');
const list = ld['@graph'][2];
assert.equal(list['@type'], 'ItemList');
assert.equal(list.itemListElement.length, 2, 'Excluded products stay excluded');
assert.equal(list.itemListElement[0].name, 'Approved card title');
assert.equal(list.itemListElement[0].url, 'https://www.veximtrade.com/products/cashew/p1');
assert.equal(list.itemListElement[0].image, 'https://www.veximtrade.com/public-media/products/p1.webp');
list.itemListElement.forEach((item, i) => {
  assert.equal(item['@type'], 'ListItem');
  assert.equal(item.position, i + 1, 'Positions remain contiguous after filtering');
  assert.equal(item.item, undefined);
});
assert.doesNotMatch(JSON.stringify(ld), /"@type":"(?:Product|Offer|Review|AggregateRating)"/);
context.s.main_products = [];
const empty = vm.runInNewContext(`(${expression.replace(/;\s*$/, '')})`, context);
assert.equal(empty['@graph'][2].itemListElement.length, 0);
console.log('OK: supplier directory schema, public gates, links, titles, images and filtered positions');
