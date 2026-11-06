// node --experimental-strip-types --no-warnings scripts/check-similar-offers.mjs
// "Similar offers from other suppliers": cùng mặt hàng, nhà cung cấp khác, ưu tiên cùng grade,
// mỗi nhà cung cấp một sản phẩm, theo đúng thứ tự xếp hạng danh mục; không dùng ảnh.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, mocks) {
  const out = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(out, { module, exports: module.exports, console, Date, Math, require: (id) => { assert.ok(id in mocks, `Unexpected ${id}`); return mocks[id]; } });
  return module.exports;
}
// Xếp hạng giả: chỉ dựa trên cấp xác minh rồi id, đủ để kiểm tra thứ tự được giữ.
const ranking = { SPEC_RANKING_WEIGHTS: {}, compareRankedProducts: (a, b) => (b.verificationCount - a.verificationCount) || a.id.localeCompare(b.id) };
const lib = load('../lib/public/similar-offers.ts', { './ranking': ranking });

const card = (id, supplierId, grades, verificationCount = 1, extra = {}) => ({ id, supplierId, grade: grades[0] ?? null, grades, verificationCount, ...extra });
const current = card('p0', 's0', ['W320']);
const all = [
  current,
  card('p1', 's0', ['W320'], 3),                 // cùng nhà cung cấp: loại
  card('p2', 's1', ['W240'], 3),                 // khác grade, xác minh cao
  card('p3', 's2', ['w320 '], 1),                // cùng grade (khác hoa thường, khoảng trắng)
  card('p4', 's3', ['W320', 'W240'], 2),         // cùng grade, xác minh cao hơn p3
  card('p5', 's3', ['W320'], 1),                 // cùng nhà cung cấp với p4: chỉ lấy một
  card('p6', 's4', ['W450'], 0, { isDemo: true }), // sản phẩm mẫu: loại
  card('p7', 's5', [], 0),
];
const picked = lib.similarOffers(current, all, { limit: 4, window: 1 });
assert.equal(JSON.stringify(picked.map((p) => p.offer.id)), JSON.stringify(['p4', 'p3', 'p2', 'p7']), 'Cùng grade trước, rồi theo xếp hạng; một sản phẩm mỗi nhà cung cấp');
assert.equal(picked[0].sameGrade, 'W320');
assert.equal(picked[1].sameGrade, 'w320', 'Khớp grade không phân biệt hoa thường');
assert.equal(picked[2].sameGrade, null);
assert.ok(!picked.some((p) => p.offer.supplierId === 's0'), 'Không gợi ý sản phẩm của chính nhà cung cấp đang xem');
assert.ok(!picked.some((p) => p.offer.id === 'p6'), 'Không gợi ý sản phẩm mẫu');
assert.equal(lib.similarOffers(current, all, { limit: 2, window: 1 }).length, 2);
assert.equal(lib.similarOffers(current, [current, card('x', 's0', ['W320'])], { window: 1 }).length, 0, 'Chỉ có hàng của chính nhà cung cấp thì không có gợi ý');

const page = fs.readFileSync(new URL('../app/(public)/products/[slug]/[productId]/page.tsx', import.meta.url), 'utf8');
assert.match(page, /Similar offers from other suppliers/);
assert.ok(page.indexOf('id="similar-offers"') < page.indexOf('full-specifications-heading'), 'Mục so sánh đứng trên Full specifications');
assert.match(page, /similar\.length \? \[\] : categoryProducts/, 'Không có nhà cung cấp khác thì quay về gợi ý cùng danh mục');
assert.match(page, /Same grade · \$\{sameGrade\}/);
console.log('✅ Similar offers: nhà cung cấp khác, ưu tiên cùng grade, một sản phẩm mỗi nhà cung cấp, giữ thứ tự xếp hạng, đứng trên thông số.');
