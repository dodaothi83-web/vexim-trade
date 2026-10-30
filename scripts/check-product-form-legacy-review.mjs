// node scripts/check-product-form-legacy-review.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../lib/products/product-form-legacy-review.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, require: () => { throw Error('Unexpected runtime import'); } });
const { legacyCategoryForComparison: category, legacyProductReviewEvidence: evidence } = exports;
const options = [{ id: 'cashew', slug: 'cashew-kernels', label: 'Nhân điều' }, { id: 'pepper', slug: 'pepper', label: 'Tiêu' }];
assert.equal(category({ category: 'cashew-kernels', reviewed_category_slug: null }, options).source, 'suggested');
assert.equal(category({ category: 'cashew-kernels', reviewed_category_slug: null }, options).category.id, 'cashew');
assert.equal(category({ category: 'pepper', reviewed_category_slug: 'cashew-kernels' }, options).source, 'reviewed');
assert.equal(category({ category: 'cashew-kernels', reviewed_category_slug: 'unavailable' }, options).source, 'missing');
assert.equal(category({ category: 'hạt điều', reviewed_category_slug: null }, options).source, 'missing');
assert.equal(category({ category: 'cashew-kernels', reviewed_category_slug: null }, [options[0], options[0]]).source, 'missing');
const source = { spec: 'Cảng xuất vận chuyển: Cảng Hồ Chí Minh\nThời gian giao hàng: Khoảng 15 ngày làm việc sau khi đặt cọc\nSố lượng đặt hàng tối thiểu: 1 túi',
  specs: { lead_time: { unit: 'weeks', value: 7 }, grade_rows: [{ grade: 'W180', moq: '0.025 MT (100 x 0.25 kg bags)', moq_qty: 100, moq_unit: 'bag' }] },
  lead_time_days: 49, moq: '0.025 MT (100 x 0.25 kg bags)', moq_qty: 100, moq_unit: 'bag',
  export_port: 'Bình Dương', incoterm_place: 'Hồ Chí Minh', monthly_capacity: '100000 túi' };
const before = JSON.stringify(source), rows = evidence(source, source.specs.grade_rows[0]);
assert.deepEqual(Array.from(rows, (x) => x.label), ['Thời gian giao hàng', 'MOQ', 'Cảng / địa điểm', 'Năng lực cung cấp']);
const asText = JSON.stringify(rows);
for (const text of ['49 ngày', '7 weeks', '15 ngày làm việc', '1 túi', '100 bag', 'Bình Dương', 'Cảng Hồ Chí Minh', '100000 túi']) assert.ok(asText.includes(text), text);
assert.match(asText, /không tự chọn/i); assert.match(asText, /không tự chuyển/i); assert.equal(JSON.stringify(source), before);
const empty = evidence({ spec: '', specs: {}, moq: null, moq_qty: null, moq_unit: null, monthly_capacity: null, export_port: null, incoterm_place: null }, null);
assert.equal(empty.length, 0);
const dissimilar = evidence({ ...source, spec: 'Vùng nguyên liệu: Bình Dương', specs: {}, moq: null, moq_qty: null, moq_unit: null,
  lead_time_days: null, export_port: null, incoterm_place: 'Hồ Chí Minh', monthly_capacity: null }, null);
assert.equal(dissimilar.length, 0, 'A lone Incoterm location is not a port conflict');
console.log('Legacy review: exact category proposal, per-grade evidence and no inferred conversion passed');
