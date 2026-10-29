// node --experimental-strip-types --no-warnings scripts/check-quantity-v2-validation.mjs
import assert from 'node:assert/strict';
import * as pricing from '../lib/products/quantity-pricing.ts';
import { v2Validation as v2 } from './quantity-v2-test-utils.mjs';
const policy = { ...pricing.DEFAULT_QUANTITY_PRICING_POLICY, gradeBounds: { W320: { minUsdPerKg: 6, maxUsdPerKg: 7 } } };
function form(changes = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({ grade: 'W320', incoterm: 'FOB', quantity_unit: 'mt', quantity_custom_grade: 'no', quantity_weight_kg: '', quantity_tiers_json: JSON.stringify([{ quantity: '1.234567', price: '6401.00' }]), ...changes })) result.set(key, value);
  return result;
}
const check = (changes = {}) => v2.validateV2Form(form(changes), 'Nhân điều', ['W320'], policy);
const result = check();
assert.equal(result.value.tiers[0].quantityGrams, 1234567);
assert.equal(result.value.tiers[0].priceCentsPerUnit, 640100);
assert.equal(result.warnings.length, 0);
let checked = v2.validateStoredV2(result.value.grade, result.value.incoterm, result.value.tiers, 'Nhân điều', ['W320'], policy);
assert.ok(checked.value, 'Precision is preserved on revalidation');
const bag = check({ grade: 'Special', quantity_custom_grade: 'yes', quantity_unit: 'bag', quantity_weight_kg: '27', quantity_tiers_json: JSON.stringify([{ quantity: '10', price: '100' }, { quantity: '20', price: '90' }]) });
assert.ok(bag.value); assert.equal(bag.value.tiers[0].unitWeightGrams, 27000);
assert.ok(v2.validateStoredV2(bag.value.grade, bag.value.incoterm, bag.value.tiers, 'Nhân điều', ['W320'], policy).value);
assert.equal(v2.validateStoredV2(bag.value.grade, bag.value.incoterm, bag.value.tiers, 'Nhân điều Special', ['W320'], policy).value, null);
assert.equal(v2.validateStoredV2(bag.value.grade, bag.value.incoterm, bag.value.tiers, 'Nhân điều', ['W320', 'Special'], policy).value, null, 'No custom grade can masquerade as a now-standard grade');
for (const bad of [
  { quantity_custom_grade: 'maybe' }, { quantity_unit: 'container' }, { quantity_unit: 'bag', quantity_weight_kg: '' },
  { quantity_tiers_json: '{' }, { quantity_tiers_json: JSON.stringify([{ quantity: 1, price: '5' }]) },
  { quantity_tiers_json: JSON.stringify([{ quantity: '1', price: '6' }, { quantity: '1', price: '7' }]) },
  { quantity_custom_grade: 'yes' },
]) assert.equal(check(bad).value, null);
for (const raw of [[], [{ ...bag.value.tiers[0], quantityGrams: 270001 }], [{ ...bag.value.tiers[0], version: 3 }], [bag.value.tiers[0], { minKg: 5, priceUsdPerKg: 3 }]])
  assert.equal(v2.validateStoredV2('Special', 'FOB', raw, 'Nhân điều', ['W320'], policy).value, null);
process.env.VEXIM_QUANTITY_V2_STAGING = 'true'; delete process.env.VEXIM_QUANTITY_BUYER_PREVIEW;
assert.equal(v2.v2StagingEnabled(), false); process.env.VEXIM_QUANTITY_BUYER_PREVIEW = 'true'; assert.equal(v2.v2StagingEnabled(), true);
delete process.env.VEXIM_QUANTITY_V2_STAGING; delete process.env.VEXIM_QUANTITY_BUYER_PREVIEW;
console.log('Quantity V2 validation: exact round-trip, custom grade, malformed input and staging gate passed');
