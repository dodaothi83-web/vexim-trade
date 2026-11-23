// node scripts/check-grade-category.mjs
// Grade lệch danh mục (dấu vết sau khi đổi danh mục) phải được cảnh báo trong CRM, còn grade
// hợp lệ hoặc grade tự đặt thì không. Các ca dưới đây lấy từ dữ liệu thật đã chuẩn hoá.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = new Map();

/** Nạp file TS qua vm, tự giải `@/…` và đường dẫn tương đối (import kiểu bị bỏ khi transpile). */
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const source = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const require = (id) => {
    const base = id.startsWith('@/') ? resolve(root, id.slice(2)) : resolve(dirname(file), id);
    const target = [base, `${base}.ts`, `${base}/index.ts`].find((candidate) => existsSync(candidate) && candidate.endsWith('.ts'));
    assert.ok(target, `unexpected import ${id} from ${file}`);
    return load(target);
  };
  vm.runInNewContext(source, { module, exports: module.exports, require, console, Intl, Number, Math, Date });
  return module.exports;
}

const check = load(resolve(root, 'lib/products/grade-category-check.ts'));
const { currentProductGrade, gradeOutsideCategory, gradeOutsideCategoryMessage } = check;
const outside = (grade, category, custom = false) =>
  gradeOutsideCategory({ grade, custom, source: 'price' }, category);

// Đối tượng tạo trong vm có prototype riêng: chép sang đối tượng thường trước khi so.
const plain = (value) => value && { ...value };
const cat = (slug, extra = {}) => ({ slug, product_fields: [], supplier_grade_options: [], ...extra });

// Ca thật: hoa hồi còn grade quế, gạo Calrose còn grade cà phê, tiêu ghi grade hạt điều.
assert.equal(outside('Cassia whole', cat('star-anise')), 'Cassia whole');
assert.equal(outside('Star anise', cat('star-anise')), null);
assert.equal(outside('W320', cat('black-pepper')), 'W320');
assert.equal(outside('550 g/L', cat('black-pepper')), null);
assert.equal(outside('Cassia split', cat('cassia-cinnamon')), null);
assert.equal(outside('Japonica (Calrose)', cat('japonica-rice')), null, 'Calrose là grade gạo chuẩn');

// Danh mục chưa có danh sách grade (mít sấy) vẫn bắt grade chuẩn của ngành hàng khác.
assert.equal(outside('W450', cat('dried-jackfruit')), 'W450', 'W450 của hạt điều không thuộc mít sấy');
assert.equal(outside('SW', cat('mixed-dried-fruits')), 'SW');
assert.equal(outside('Jackfruit Chips', cat('dried-jackfruit')), null, 'Không có căn cứ thì không cảnh báo');

// Cà phê bột/hoà tan dùng giống cà phê; grade NCC tự thêm ở danh mục cũng hợp lệ.
for (const grade of ['Arabica', 'Robusta', 'Arabica & Robusta blend', 'Robusta G1 S18'])
  assert.equal(outside(grade, cat('coffee')), null, grade);
assert.equal(outside('Black Tea', cat('coffee')), 'Black Tea');
assert.equal(outside('Nut Snack', cat('roasted-cashews', { supplier_grade_options: ['Nut Snack'] })), null);
assert.equal(outside('Frozen Avocado', cat('other-frozen-fruits', { supplier_grade_options: ['Frozen Avocado'] })), null);
assert.equal(outside('Green Tea', cat('tea', { product_fields: [{ key: 'product_type', options: ['Green Tea', 'Black Tea'] }] })), null);

// Grade tự đặt trong bảng giá là chủ đích của nhà cung cấp, không cảnh báo.
assert.equal(outside('W450', cat('dried-jackfruit'), true), null);

// Nguồn grade: bảng giá đã duyệt trước, rồi tới thông số.
assert.deepEqual(plain(currentProductGrade({ grade: 'W240' }, { grade: 'W320', tiers: [] })), { grade: 'W320', custom: false, source: 'price' });
assert.deepEqual(plain(currentProductGrade({ grade: ' W240 ' }, null)), { grade: 'W240', custom: false, source: 'specs' });
assert.deepEqual(plain(currentProductGrade({ product_type: 'Cassia whole' }, null)), { grade: 'Cassia whole', custom: false, source: 'specs' });
assert.equal(currentProductGrade({}, null), null);
assert.equal(gradeOutsideCategory(null, cat('coffee')), null);

const message = gradeOutsideCategoryMessage('W450', { grade: 'W450', custom: false, source: 'price' });
assert.match(message, /W450/);
assert.match(message, /bảng giá/);
assert.ok(!message.includes('—'), 'Không dùng gạch dài');

console.log('✅ Grade lệch danh mục: bắt grade của ngành hàng khác, bỏ qua grade hợp lệ và grade tự đặt.');
