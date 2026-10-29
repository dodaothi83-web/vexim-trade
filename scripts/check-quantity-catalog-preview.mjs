// node --experimental-strip-types --no-warnings scripts/check-quantity-catalog-preview.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as pricing from '../lib/products/quantity-pricing.ts';
import * as revisionV2 from '../lib/products/quantity-revision-v2.ts';
import * as priceUnits from '../lib/public/price-units.ts';

function compile(path, mocks) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, process, Date, Intl, console, require: (key) => {
    if (!(key in mocks)) throw Error(`Unexpected import ${key}`);
    return mocks[key];
  } });
  return exports;
}
const selection = compile('../lib/public/product-selection.ts', { '@/lib/public/category-assignment': {} });
const projection = compile('../lib/products/quantity-public-projection.ts', {
  '@/lib/products/quantity-pricing': pricing, '@/lib/public/product-selection': selection, '@/lib/products/quantity-revision-v2': revisionV2,
});
let batchIds = [], readError = false;
const byId = new Map();
const adapter = compile('../lib/public/quantity-catalog-preview.ts', {
  'server-only': {},
  '@/lib/products/approved-quantity-revisions': { readApprovedQuantityRevisions: async (ids) => { batchIds = ids; if (readError) throw Error('database unavailable'); return new Map(ids.map((id) => [id, byId.get(id) ?? { price: null, name: null }])); } },
  '@/lib/products/quantity-price-config': { readQuantityPriceSettings: async () => ({ stale_days: 90 }) },
  '@/lib/products/quantity-public-projection': projection,
  '@/lib/public/price-units': priceUnits,
  '@/lib/products/quantity-pricing': pricing,
  '@/lib/public/product-selection': selection,
});
const now = Date.now();
const supplier = { id: 's', fob_publicly_visible: true, fob_updated_at: new Date(now).toISOString(), is_demo: false };
const record = (id) => ({ product: { id, price_publicly_visible: true, price_valid_until: '2020-01-01' }, supplier, category: { slug: 'cashew', price_unit: 'kg' }, card: {
  name: 'Legacy product', grade: 'W240', grades: ['W240', 'W450'], cardGrades: ['W240'], gradeRows: [{ grade: 'W240', priceText: 'USD 9/kg' }], hasGradeRows: true,
  attributes: { grade: 'W450', product_type: 'W240', colour: 'white' }, price: 'USD 9/kg', pricePoint: { value: 9 }, gradePricePoints: [{ grade: 'W240', value: 9 }], moq: '10 bags', incoterm: 'CIF',
} });
const basePrice = { status: 'approved', product_id: 'p1', grade: 'W320', incoterm: 'FOB', tiers: [{ minKg: 1000, priceUsdPerKg: 6.4 }, { minKg: 5000, priceUsdPerKg: 6 }], confirmed_at: new Date(now - 30 * 86400000).toISOString(), warnings: ['private warning'] };
byId.set('p1', { price: basePrice, name: { product_id: 'p1', status: 'approved', english_name: 'Cashew kernels' } });
const inputs = [record('p1'), record('p2'), { ...record('demo'), supplier: { ...supplier, is_demo: true } }];
const output = await adapter.projectQuantityCatalogPreview(inputs);
assert.deepEqual(Array.from(batchIds), ['p1', 'p2'], 'Do not read demo prices');
const card = output[0].card;
assert.equal(card.name, 'Cashew kernels W320');
assert.equal(card.price, 'USD 6.00–6.40/kg', 'Do not use old expiration or legacy price');
assert.deepEqual(Array.from(card.grades), ['W320']);
assert.equal(card.attributes.grade, 'W320');
assert.equal(card.attributes.product_type, 'W320');
assert.equal(card.attributes.colour, 'white');
assert.equal(card.gradeRows.length, 0);
assert.equal(card.moqMtEquivalent, 1);
assert.equal(card.incoterm, 'FOB');
assert.equal(card.quantityOffer.tiers.length, 2);
assert.equal(card.gradePricePoints[0].value, 6);
assert.ok(!JSON.stringify(card).includes('private warning'));
assert.equal(output[1].card, inputs[1].card, 'No approved revision means unmodified legacy projection');
assert.equal(output[2].card, inputs[2].card, 'Demo projection unchanged');
const hiddenInput = { ...record('p1'), product: { id: 'p1', price_publicly_visible: false } };
const hidden = (await adapter.projectQuantityCatalogPreview([hiddenInput]))[0].card;
assert.equal(hidden.price, null); assert.equal(hidden.quantityOffer.tiers.length, 0); assert.equal(hidden.pricePoint, null);
const staleInput = record('p1');
byId.set('p1', { price: { ...basePrice, confirmed_at: new Date(now - 91 * 86400000).toISOString() }, name: null });
const stale = (await adapter.projectQuantityCatalogPreview([staleInput]))[0].card;
assert.equal(stale.name, 'Legacy product W320', 'Keep existing name and append the approved grade');
const existingGrade = { ...record('p1'), card: { ...record('p1').card, name: 'Legacy product W320' } };
assert.equal((await adapter.projectQuantityCatalogPreview([existingGrade]))[0].card.name, 'Legacy product W320', 'Do not duplicate an existing grade');
assert.equal(stale.price, 'USD 6.00–6.40/kg');
assert.equal(stale.quantityOffer.stale, true);
assert.equal(stale.pricePoint, null); assert.equal(stale.gradePricePoints.length, 0); assert.equal(stale.priceRankingEligible, false);
const mtInput = { ...record('p1'), category: { slug: 'rice', price_unit: 'mt' } };
const mt = (await adapter.projectQuantityCatalogPreview([mtInput]))[0].card;
assert.equal(mt.price, 'USD 6,000–6,400/MT');
byId.set('p1', { price: { ...basePrice, tiers: [] }, name: null });
await assert.rejects(adapter.projectQuantityCatalogPreview([record('p1')]), /Invalid approved/, 'A corrupt approved revision never leaks the legacy price');
readError = true;
await assert.rejects(adapter.projectQuantityCatalogPreview([record('p1')]), /database unavailable/, 'A read failure never falls back to the legacy price');
const catalog = readFileSync(new URL('../lib/public/product-catalog.ts', import.meta.url), 'utf8');
assert.equal((catalog.match(/VEXIM_QUANTITY_BUYER_PREVIEW === "true"/g) ?? []).length, 2, 'Category and ID-based reads both require opt-in');
const pdp = readFileSync(new URL('../app/(public)/products/[slug]/[productId]/page.tsx', import.meta.url), 'utf8');
assert.match(pdp, /card\.quantityOffer \? <QuantityPriceTable/);
assert.match(pdp, /!card\.quantityOffer && gradeRows\.length === 0/);
console.log('Quantity catalog preview: approved-only, public consent, legacy fallback, stale exclusion and fail-closed reads passed');
readError = false;
const customTier = { version: 2, unit: 'kg', customGrade: true, unitWeightGrams: 1000, quantityGrams: 270000, priceCentsPerUnit: 10000 };
byId.set('p1', { price: { ...basePrice, grade: 'W320', tiers: [customTier] }, name: null });
const customCard = (await adapter.projectQuantityCatalogPreview([record('p1')]))[0].card;
assert.equal(customCard.grade, 'W320', 'Custom grade remains visible even when it matches a filter name');
assert.deepEqual(Array.from(customCard.grades), []);
assert.deepEqual(Array.from(customCard.cardGrades), ['W320']);
assert.equal(customCard.attributes.grade, undefined); assert.equal(customCard.attributes.product_type, undefined);
assert.equal(customCard.gradePricePoints.length, 0); assert.equal(customCard.moqUnit, 'kg');
assert.equal(customCard.moqMtEquivalent, .27); assert.equal(customCard.price, 'USD 100.00/kg');
const grid = readFileSync(new URL('../components/category-product-grid.tsx', import.meta.url), 'utf8');
assert.match(grid, /product\.quantityOffer\?\.customGrade\) return \[\]/, 'No grade fallback for a custom grade');
console.log('Custom quantity grade stays visible but is excluded from structured filters');
