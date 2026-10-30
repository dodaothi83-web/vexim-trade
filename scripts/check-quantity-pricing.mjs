// node --experimental-strip-types --no-warnings scripts/check-quantity-pricing.mjs
import assert from 'node:assert/strict';
import {
  DEFAULT_QUANTITY_PRICING_POLICY as defaults, validateQuantityPricing, nameContainsGrade,
  quantityTierRanges, formatQuantityBuyer, formatQuantityPriceBuyer, referencePriceAge, formatQuantityInput, normalizePriceInput,
  entryCurrencyIssue, ENTRY_PRICE_CURRENCIES,
} from '../lib/products/quantity-pricing.ts';

const grades = ['W180', 'W240', 'W320', 'WS', '550 g/L'];
const input = {
  grade: 'w320', incoterm: 'fob', nameVi: 'Nhân điều Việt Nam', nameEn: 'Cashew kernels',
  tiers: [{ minKg: '1000', priceUsdPerKg: '6.40' }, { minKg: '5000', priceUsdPerKg: '6.00' }],
};
const validate = (changes = {}, policy = defaults) => validateQuantityPricing({ ...input, ...changes }, grades, policy);
const codes = (result) => result.errors.map((issue) => issue.code);
let result = validate();
assert.deepEqual(result.errors, []);
assert.deepEqual(result.warnings, [], 'Vietnamese accents do not trigger a warning');
assert.deepEqual(result.value, { grade: 'W320', incoterm: 'FOB', currency: 'USD', tiers: [{ minKg: 1000, priceUsdPerKg: 6.4, incoterm: 'FOB', currency: 'USD' }, { minKg: 5000, priceUsdPerKg: 6, incoterm: 'FOB', currency: 'USD' }] });
assert.equal(formatQuantityInput('5000'), '5,000');
assert.equal(formatQuantityInput('5,0000', '5,000'), '50,000');
assert.equal(formatQuantityInput('5,00', '5,000'), '500');
assert.equal(formatQuantityInput('1,2500', '1,200'), '12,500');
assert.equal(formatQuantityInput('1,5'), '1,5', 'Do not silently turn malformed input into another quantity');
assert.equal(formatQuantityInput('-5'), '-5');
assert.equal(normalizePriceInput('6,4'), '6.40');
assert.equal(normalizePriceInput('6.40'), '6.40');
assert.deepEqual(validate({ tiers: [{ minKg: '1,000', priceUsdPerKg: '6,40' }] }).value.tiers, [{ minKg: 1000, priceUsdPerKg: 6.4, incoterm: 'FOB', currency: 'USD' }]);
assert.ok(codes(validate({ tiers: [{ minKg: '1,00', priceUsdPerKg: '6' }] })).includes('quantity'));
assert.ok(codes(validate({ tiers: Array.from({ length: 5 }, () => ({ minKg: '1', priceUsdPerKg: '1' })) }, { ...defaults, maxTiers: 8 })).includes('tier_count'));
assert.match(validate({ nameVi: 'Nhân điều W320' }).errors.find((e) => e.code === 'name_vi_grade').message, /Bỏ grade \(W320\)/);
assert.deepEqual(quantityTierRanges(result.value.tiers).map((row) => row.maxKg), [4999, null]);
assert.equal(formatQuantityBuyer(999), '999 kg');
assert.equal(formatQuantityBuyer(1000), '1 MT');
assert.equal(formatQuantityBuyer(1500), '1.5 MT');
assert.equal(formatQuantityPriceBuyer(6.4, 'kg'), 'USD 6.40/kg');
assert.equal(formatQuantityPriceBuyer(6.4, 'mt'), 'USD 6,400/MT');
assert.ok(codes(validate({ grade: 'custom' })).includes('grade'));
assert.ok(codes(validate({ incoterm: '' })).includes('incoterm'));
assert.ok(codes(validate({ nameVi: 'Nhân điều W320' })).includes('name_vi_grade'));
assert.ok(codes(validate({ nameEn: 'Cashew W240' })).includes('name_en_grade'), 'Check all category grades, not only selected grade');
assert.ok(codes(validate({ grade: 'Special A', nameEn: 'Cashew Special A' })).includes('name_en_grade'), 'Also reject the supplied grade even when it is not in category standards');
assert.ok(!nameContainsGrade('New season cashews', ['WS']), 'Short grade does not match inside a word');
assert.ok(nameContainsGrade('Pepper (550 G/l)', grades));
assert.ok(codes(validate({ tiers: [] })).includes('tier_count'));
assert.ok(codes(validate({ tiers: Array.from({ length: 5 }, () => ({ minKg: '1', priceUsdPerKg: '1' })) })).includes('tier_count'));
for (const value of ['', '0', '-1', '1.5', '1e3']) assert.ok(codes(validate({ tiers: [{ minKg: value, priceUsdPerKg: '2' }] })).includes('quantity'), value);
for (const value of ['', '0', '-1', '.50', '1.234', '1e2']) assert.ok(codes(validate({ tiers: [{ minKg: '1', priceUsdPerKg: value }] })).includes('price'), value);
assert.ok(codes(validate({ tiers: [{ minKg: '1', priceUsdPerKg: '6' }, { minKg: '1', priceUsdPerKg: '5' }] })).includes('quantity_order'));
assert.ok(codes(validate({ tiers: [{ minKg: '1', priceUsdPerKg: '5' }, { minKg: '2', priceUsdPerKg: '6' }] })).includes('price_order'));
assert.deepEqual(codes(validate({ tiers: [{ minKg: '1', priceUsdPerKg: '6' }, { minKg: '100', priceUsdPerKg: '4' }] })), [], 'Ratios exactly at limits are allowed');
assert.ok(codes(validate({ tiers: [{ minKg: '1', priceUsdPerKg: '6.01' }, { minKg: '2', priceUsdPerKg: '4' }] })).includes('price_spread'));
assert.ok(codes(validate({ tiers: [{ minKg: '1', priceUsdPerKg: '6' }, { minKg: '101', priceUsdPerKg: '4' }] })).includes('quantity_spread'));
const bounds = { ...defaults, gradeBounds: { W320: { minUsdPerKg: 6.1, maxUsdPerKg: 7 } } };
result = validate({}, bounds);
assert.deepEqual(result.errors, []);
assert.equal(result.warnings[0].code, 'grade_price_outlier');
assert.equal(result.warnings[0].tierIndex, 1);
assert.ok(result.value, 'Warning permits save for review');
assert.ok(codes(validate({}, { ...defaults, maxTiers: 0 })).includes('invalid_policy'));
assert.ok(codes(validate({}, { ...defaults, gradeBounds: { W320: { minUsdPerKg: 7, maxUsdPerKg: 6 } } })).includes('invalid_grade_bounds'));

// ---- Tiền tệ theo bảng và Incoterm theo từng mức giá ----
assert.equal(result.value.currency, 'USD', 'Bảng giá mặc định là USD');
assert.deepEqual(result.value.tiers.map((tier) => tier.incoterm), ['FOB', 'FOB'], 'Mức giá kế thừa Incoterm của bảng');
const perTier = validate({ tiers: [
  { minKg: '1000', priceUsdPerKg: '6.40', incoterm: 'FOB' },
  { minKg: '5000', priceUsdPerKg: '6.00', incoterm: 'CIF' },
] });
assert.deepEqual(perTier.value.tiers.map((tier) => tier.incoterm), ['FOB', 'CIF'], 'Mỗi bậc giá giữ Incoterm riêng');
assert.equal(perTier.value.incoterm, 'FOB', 'Incoterm của bảng lấy theo mức đầu (cột lưu trữ cũ)');
assert.ok(codes(validate({ tiers: [{ minKg: '1000', priceUsdPerKg: '6', incoterm: 'XYZ' }] })).includes('incoterm'));
assert.ok(codes(validate({ currency: 'GBP' })).includes('currency'), 'Chỉ nhận USD, VND hoặc EUR');
const vnd = validate({ currency: 'VND', tiers: [{ minKg: '1000', priceUsdPerKg: '65000' }, { minKg: '5000', priceUsdPerKg: '62000' }] }, bounds);
assert.deepEqual(vnd.warnings, [], 'Ngưỡng tham khảo USD/kg không áp cho bảng VND');
assert.equal(vnd.value.currency, 'VND');
assert.equal(vnd.value.tiers[0].currency, 'VND');
assert.equal(formatQuantityPriceBuyer(62000, 'kg', 'VND'), 'VND 62,000.00/kg');
assert.equal(formatQuantityPriceBuyer(1.5, 'mt', 'EUR'), 'EUR 1,500/MT');
assert.equal(entryCurrencyIssue('USD'), null, 'USD được nhập');
assert.match(entryCurrencyIssue('VND'), /chỉ nhập giá bằng USD/, 'Tạm thời chặn VND khi nhập mới');
assert.match(entryCurrencyIssue('EUR'), /chỉ nhập giá bằng USD/, 'Tạm thời chặn EUR khi nhập mới');
assert.deepEqual([...ENTRY_PRICE_CURRENCIES], ['USD'], 'Một chỗ duy nhất để mở lại VND/EUR sau này');
const now = Date.parse('2026-10-29T00:00:00Z');
const day = 86400000;
assert.deepEqual(referencePriceAge(new Date(now - 90 * day).toISOString(), now), { days: 90, stale: false });
assert.deepEqual(referencePriceAge(new Date(now - 90 * day - 1).toISOString(), now), { days: 90, stale: true });
assert.deepEqual(referencePriceAge(null, now), { days: null, stale: true });
assert.deepEqual(referencePriceAge(new Date(now + 1).toISOString(), now), { days: null, stale: true });
console.log('Quantity pricing: validation, grade warnings, conversions and 90-day boundary passed');
