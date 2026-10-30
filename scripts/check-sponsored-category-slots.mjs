// Run with node --experimental-strip-types --no-warnings.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { categorySlotConfig, categorySponsoredSlots } from '../lib/sponsored/category-slots.ts';
import { rankForWindow } from '../lib/sponsored/rotation.ts';

for (const [count, slots] of [[0, 0], [1, 1], [9, 1], [10, 2], [30, 2], [31, 3], [100, 3]]) {
  assert.equal(categorySponsoredSlots(count), slots, `count ${count}`);
}
// At a constant full proposed pool of four packages per slot, each is selected
// in one quarter of complete rotation windows. This is not an impression guarantee.
for (const slots of [1, 2, 3]) {
  const pool = Array.from({ length: slots * 4 }, (_, i) => ({ id: `push-${i}` }));
  const counts = new Map(pool.map((push) => [push.id, 0]));
  for (let window = 0; window < pool.length; window++) {
    for (const push of rankForWindow(pool, window).slice(0, slots)) counts.set(push.id, counts.get(push.id) + 1);
  }
  for (const count of counts.values()) assert.equal(count, slots);
}
const custom = categorySlotConfig({ SPONSORED_CATEGORY_MEDIUM_FROM: '5', SPONSORED_CATEGORY_LARGE_FROM: '11', SPONSORED_CATEGORY_SMALL_SLOTS: '2' });
assert.equal(categorySponsoredSlots(4, custom), 2);
assert.equal(categorySponsoredSlots(11, custom), 3);
for (const env of [
  { SPONSORED_CATEGORY_MEDIUM_FROM: '31' },
  { SPONSORED_CATEGORY_LARGE_SLOTS: '4' },
  { SPONSORED_CATEGORY_SMALL_SLOTS: '3' },
  { SPONSORED_CATEGORY_MEDIUM_FROM: '-1' },
]) assert.throws(() => categorySlotConfig(env));

const page = readFileSync(new URL('../app/(public)/products/[slug]/page.tsx', import.meta.url), 'utf8');
assert.match(page, /categorySponsoredSlots\(products\.filter\(\(product\) => !product\.isDemo && !product\.isDemoSupplier\)\.length, categorySlotConfig\(\)\)/);
const band = readFileSync(new URL('../components/sponsored-product-band.tsx', import.meta.url), 'utf8');
assert.match(band, /<PublicProductCard\s+href=\{href\}\s+sponsored/);

// Render the actual shared card and disclosure, without needing a running Next server.
const req = createRequire(import.meta.url), jsx = req('react/jsx-runtime');
function load(file, mocks) {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require(id) { assert.ok(id in mocks, id); return mocks[id]; } });
  return module.exports;
}
const disclosure = load('../components/sponsored-disclosure.tsx', { 'react/jsx-runtime': jsx });
const icon = () => null;
const card = load('../components/public-product-card.tsx', {
  'react/jsx-runtime': jsx, 'next/link': { default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) },
  'lucide-react': new Proxy({}, { get: () => icon }),
  '@/components/sponsored-disclosure': disclosure,
  '@/components/product-compare-checkbox': { ProductCompareCheckbox: icon },
  '@/components/product-trade-labels': { ProductTradeLabels: icon },
  '@/components/verification-tier': { VerificationPips: icon, ProductVerificationBadge: icon },
});
const props = { href: '/product', name: 'Product', moq: '', price: null, leadTimeDays: null, supplierName: 'Supplier', verificationSteps: [], quoteHref: undefined };
const paid = renderToStaticMarkup(React.createElement(card.PublicProductCard, { ...props, sponsored: true }));
const organic = renderToStaticMarkup(React.createElement(card.PublicProductCard, props));
assert.match(paid, /<article[\s\S]*Sponsored · Tài trợ[\s\S]*Why am I seeing this\?/);
assert.match(paid, /Sponsorship does not change verification results or organic ranking/);
assert.doesNotMatch(organic, /Sponsored · Tài trợ|Why am I seeing this/);
console.log('✅ Dynamic category slots: thresholds, configuration, catalogue counting and per-card disclosure.');
