// node --experimental-strip-types --no-warnings scripts/check-quantity-pricing.mjs
import assert from 'node:assert/strict';
import {
  DEFAULT_QUANTITY_PRICING_POLICY as defaults, validateQuantityPricing, nameContainsGrade,
  quantityTierRanges, formatQuantityBuyer, formatQuantityPriceBuyer, referencePriceAge, formatQuantityInput, normalizePriceInput,
  entryCurrencyIssue, ENTRY_PRICE_CURRENCIES, previewQuantityTiers, draftPublicQuantityOffer,
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
assert.ok(codes(validate({ currency: 'GBP' })).includes('currency'), 'Chỉ nhận 5 tiền tệ đã mở');
const vnd = validate({ currency: 'VND', tiers: [{ minKg: '1000', priceUsdPerKg: '65000' }, { minKg: '5000', priceUsdPerKg: '62000' }] }, bounds);
assert.deepEqual(vnd.warnings, [], 'Ngưỡng tham khảo USD/kg không áp cho bảng VND');
assert.equal(vnd.value.currency, 'VND');
assert.equal(vnd.value.tiers[0].currency, 'VND');
// VND/JPY không dùng phần lẻ khi hiển thị.
assert.equal(formatQuantityPriceBuyer(62000, 'kg', 'VND'), 'VND 62,000/kg');
assert.equal(formatQuantityPriceBuyer(1250, 'kg', 'JPY'), 'JPY 1,250/kg');
assert.equal(formatQuantityPriceBuyer(6.4, 'kg', 'CNY'), 'CNY 6.40/kg');
assert.equal(formatQuantityPriceBuyer(1.5, 'mt', 'EUR'), 'EUR 1,500/MT');
assert.equal(validateQuantityPricing({ ...input, grade: '' }, grades).errors.find((issue) => issue.code === 'grade').message,
  'Chọn grade chuẩn của danh mục để tiếp tục.', 'Lỗi grade nói rõ việc cần làm');
assert.match(validateQuantityPricing({ ...input, grade: '' }, []).errors.find((issue) => issue.code === 'grade').message,
  /Danh mục chưa có grade/, 'Danh mục chưa cấu hình grade được báo riêng');
assert.equal(entryCurrencyIssue('USD'), null, 'USD được nhập');
assert.equal(entryCurrencyIssue('VND'), null, 'VND nhập mới được');
assert.equal(entryCurrencyIssue('EUR'), null, 'EUR nhập mới được');
assert.equal(entryCurrencyIssue('CNY'), null, 'Nhân dân tệ nhập mới được');
assert.equal(entryCurrencyIssue('JPY'), null, 'Yên Nhật nhập mới được');
assert.match(entryCurrencyIssue('GBP'), /Chọn tiền tệ/, 'Tiền tệ ngoài danh sách vẫn bị chặn');
assert.deepEqual([...ENTRY_PRICE_CURRENCIES], ['USD', 'VND', 'EUR', 'CNY', 'JPY'], 'Năm tiền tệ nhập mới, một chỗ duy nhất');
const drafting = previewQuantityTiers({ grade: '', incoterm: 'FOB', currency: 'USD', tiers: [
  { minKg: '100', priceUsdPerKg: '2' }, { minKg: '', priceUsdPerKg: '1.5' }, { minKg: '500', priceUsdPerKg: 'abc' },
] });
assert.equal(drafting.tiers.length, 1, 'Xem trước bỏ qua mức còn thiếu số lượng hoặc giá');
assert.equal(drafting.tiers[0].priceUsdPerKg, 2);
assert.equal(drafting.grade, '', 'Chưa chọn grade không chặn xem trước');
assert.equal(drafting.currency, 'USD');
assert.equal(previewQuantityTiers({ grade: '', incoterm: '', currency: 'VND', tiers: [{ minKg: '1000', priceUsdPerKg: '62000' }] }).currency, 'VND', 'Bảng cũ VND vẫn xem trước được');
/* Bản xem trước của nhà cung cấp phải định dạng y như bản đã duyệt mà người mua thấy. */
const draftOffer = draftPublicQuantityOffer({ grade: 'w320', incoterm: 'fob', currency: 'USD', tiers: [
  { minKg: '1000', priceUsdPerKg: '6.40' }, { minKg: '5000', priceUsdPerKg: '6.00' },
] }, { priceUnit: 'kg', pricePubliclyVisible: true, standardGrades: grades, englishName: 'Cashew kernels W320' });
assert.equal(draftOffer.grade, 'W320', 'Grade gõ tay được chuẩn hoá theo danh mục');
assert.equal(draftOffer.title, 'Cashew kernels W320');
assert.equal(draftOffer.price, 'USD 6.00–6.40/kg', 'Cùng cách ghi khoảng giá với trang người mua');
assert.equal(draftOffer.moq, '1 MT', 'MOQ đổi sang MT như bản đã duyệt');
assert.deepEqual(draftOffer.tiers.map((tier) => `${tier.from}|${tier.to ?? '+'}|${tier.price}`),
  ['1 MT|4.999 MT|USD 6.40/kg', '5 MT|+|USD 6.00/kg'], 'Các mức giá và cột đến giống bản thật');
assert.equal(draftOffer.hasVolumePricing, true);
assert.equal(draftOffer.confirmedAt, null, 'Bản nháp không có ngày xác nhận');
assert.equal(draftOffer.priceRankingEligible, false, 'Bản nháp không đủ tư cách xếp hạng giá');
assert.deepEqual(
  draftPublicQuantityOffer({ grade: 'W320', incoterm: 'FOB', currency: 'USD', tiers: [{ minKg: '1000', priceUsdPerKg: '6.4' }] },
    { priceUnit: 'kg', pricePubliclyVisible: false }).tiers, [], 'Tắt chia sẻ giá thì không có bảng giá');
assert.equal(draftPublicQuantityOffer({ grade: '', incoterm: 'FOB', currency: 'USD', tiers: [{ minKg: '1000', priceUsdPerKg: '6.4' }] },
  { priceUnit: 'kg', pricePubliclyVisible: true }), null, 'Chưa chọn grade thì người mua chưa thấy bảng giá');
assert.equal(draftPublicQuantityOffer({ grade: 'W320', incoterm: 'FOB', currency: 'USD', tiers: [] },
  { priceUnit: 'kg', pricePubliclyVisible: true }), null, 'Chưa có dòng giá thì chưa có bảng giá');
assert.equal(draftPublicQuantityOffer({ grade: 'W320', incoterm: 'FOB', currency: 'VND', tiers: [{ minKg: '1000', priceUsdPerKg: '165000' }] },
  { priceUnit: 'mt', pricePubliclyVisible: true }).price, 'VND 165,000,000/MT', 'Đơn vị MT nhân 1.000 kg và bỏ phần lẻ như trang người mua');

const now = Date.parse('2026-10-29T00:00:00Z');
const day = 86400000;
assert.deepEqual(referencePriceAge(new Date(now - 90 * day).toISOString(), now), { days: 90, stale: false });
assert.deepEqual(referencePriceAge(new Date(now - 90 * day - 1).toISOString(), now), { days: 90, stale: true });
assert.deepEqual(referencePriceAge(null, now), { days: null, stale: true });
assert.deepEqual(referencePriceAge(new Date(now + 1).toISOString(), now), { days: null, stale: true });
console.log('Quantity pricing: validation, grade warnings, conversions and 90-day boundary passed');
