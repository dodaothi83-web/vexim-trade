// node --experimental-strip-types --no-warnings scripts/check-quantity-public-projection.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as pricing from '../lib/products/quantity-pricing.ts';
import { offerAliveSignal, dataCompletenessSignal } from '../lib/public/ranking.ts';
const selection = {};
const selectionCode = ts.transpileModule(readFileSync(new URL('../lib/public/product-selection.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(selectionCode, { exports: selection, require: (key) => {
  if (key === '@/lib/public/category-assignment') return { assignProductCategory: () => null };
  throw Error(`Unexpected import ${key}`);
} });
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/products/quantity-public-projection.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports, Intl, Number, Math, Date, require: (key) => {
  if (key === '@/lib/products/quantity-pricing') return pricing;
  if (key === '@/lib/public/product-selection') return selection;
  throw Error(`Unexpected import ${key}`);
} });
const { projectApprovedQuantityOffer } = exports;
const now = Date.parse('2026-10-29T00:00:00Z');
const day = 86400_000;
const base = {
  productId: 'p1', pricePubliclyVisible: true, priceUnit: 'kg', now, staleAfterDays: 90,
  priceRevision: { status: 'approved', product_id: 'p1', grade: 'W320', incoterm: 'FOB',
    tiers: [{ minKg: 1000, priceUsdPerKg: 6.4 }, { minKg: 5000, priceUsdPerKg: 6 }], confirmed_at: new Date(now - 30 * day).toISOString(), warnings: ['PRIVATE'] },
  nameRevision: { status: 'approved', product_id: 'p1', english_name: 'Cashew kernels' },
};
const project = (changes = {}) => projectApprovedQuantityOffer({ ...base, ...changes });
let offer = project();
assert.equal(offer.title, 'Cashew kernels W320');
assert.equal(project({ nameRevision: { ...base.nameRevision, english_name: 'Email sales@example.com' } }).title, 'Email [contact via Vexim] W320');
assert.equal(offer.grade, 'W320');
assert.equal(offer.moq, '1 MT');
assert.equal(offer.price, 'USD 6.00–6.40/kg');
assert.equal(offer.tiers[0].from, '1 MT');
assert.equal(offer.tiers[0].to, '4.999 MT');
assert.equal(offer.tiers[1].to, null);
assert.equal(offer.tiers[0].price, 'USD 6.40/kg');
assert.equal(offer.pricePoint.value, 6);
assert.equal(offer.pricePoint.highValue, 6.4);
assert.equal(offer.priceRankingEligible, true);
assert.ok(!JSON.stringify(offer).includes('PRIVATE'));
const mt = project({ priceUnit: 'mt' });
assert.equal(mt.price, 'USD 6,000–6,400/MT');
assert.equal(mt.pricePoint.value, 6000);
assert.equal(mt.tiers[0].price, 'USD 6,400/MT');
const single = project({ priceRevision: { ...base.priceRevision, tiers: [{ minKg: 999, priceUsdPerKg: 6.4 }] } });
assert.equal(single.price, 'USD 6.40/kg');
assert.equal(single.moq, '999 kg');
for (const bad of [null, { ...base.priceRevision, status: 'pending' }, { ...base.priceRevision, product_id: 'other' },
  { ...base.priceRevision, tiers: [] }, { ...base.priceRevision, tiers: [{ minKg: 1, priceUsdPerKg: 1 }, { minKg: 2, priceUsdPerKg: 2 }] },
  { ...base.priceRevision, tiers: [{ minKg: 1, priceUsdPerKg: 0 }] }]) assert.equal(project({ priceRevision: bad }), null);
assert.equal(project({ nameRevision: { ...base.nameRevision, status: 'pending', english_name: 'PRIVATE NAME' } }).title, null);
assert.equal(project({ nameRevision: { ...base.nameRevision, product_id: 'wrong' } }).title, null);
const hidden = project({ pricePubliclyVisible: false });
assert.equal(hidden.price, null);
assert.equal(hidden.tiers.length, 0);
assert.equal(hidden.pricePoint, null);
assert.equal(hidden.confirmedAt, null);
assert.equal(hidden.priceRankingEligible, false);
const exact90 = project({ priceRevision: { ...base.priceRevision, confirmed_at: new Date(now - 90 * day).toISOString() } });
assert.equal(exact90.stale, false);
const stale = project({ priceRevision: { ...base.priceRevision, confirmed_at: new Date(now - 91 * day).toISOString() } });
assert.equal(stale.price, 'USD 6.00–6.40/kg', 'Stale price remains visible');
assert.equal(stale.daysSinceConfirmed, 91);
assert.equal(stale.pricePoint, null, 'Stale price is excluded from category reference ranges');
assert.equal(stale.priceRankingEligible, false);
const card = { price: stale.price, priceRankingEligible: stale.priceRankingEligible, grade: 'W320', moq: '1 MT', leadTimeDays: 7, incoterm: 'FOB', imagePaths: ['a'] };
assert.equal(offerAliveSignal(card), 0);
assert.equal(dataCompletenessSignal(card), 5 / 6, 'Stale public price earns no completeness price point');
assert.equal(offerAliveSignal({ ...card, priceRankingEligible: true }), 1);
assert.equal(offerAliveSignal({ ...card, priceRankingEligible: undefined }), 1, 'Legacy ranking unchanged');
const future = project({ priceRevision: { ...base.priceRevision, confirmed_at: new Date(now + 1).toISOString() } });
assert.equal(future.priceRankingEligible, false);
assert.equal(future.pricePoint, null);
console.log('Approved quantity projection: privacy, units, 90-day visibility and ranking exclusion passed');
