// node scripts/check-product-form-attributes.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path, mocks) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, JSON, Object, Set, Map, require: (key) => {
    if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key];
  } });
  return exports;
}
const attributes = load('../lib/product-attributes.ts', {});
const grade = { isGradeFieldKey: (key) => ['grade', 'product_type'].includes(key.trim().toLowerCase()),
  nonGradeProductFields: (fields) => fields.filter((f) => !['grade', 'product_type'].includes(f.key.trim().toLowerCase())) };
const { validateProductFormAttributes: validate } = load('../lib/products/product-form-attributes.ts', {
  '@/lib/product-attributes': attributes, '@/lib/products/grade-pricing': grade,
});
const category = { product_fields: [{ key: 'kind', label: 'Loại', type: 'select', options: ['A', 'B'] },
  { key: 'moisture', label: 'Độ ẩm', type: 'text', options: [], showWhen: { key: 'kind', value: 'A' } }], supplier_product_fields: [] };
const draft = { attributePool: '[]', attributes: { kind: 'A', moisture: '12%' } };
assert.equal(validate(draft, category).ok, true);
assert.equal(validate({ ...draft, attributes: { kind: 'B', moisture: '12%' } }, category).ok, false, 'Hidden values may not disappear silently');
assert.equal(validate({ ...draft, attributes: { kind: 'X' } }, category).ok, false);
assert.equal(validate({ ...draft, attributes: { grade: 'W320' } }, category).ok, false);
assert.equal(validate({ ...draft, attributes: { unknown: 'value' } }, category).ok, false);
assert.equal(validate({ ...draft, attributes: { kind: 'A', moisture: 'x'.repeat(201) } }, category).ok, false);
const pool = [{ key: 'kind', label: 'Loại', type: 'select', options: ['CC'], supplier_added: true }];
assert.equal(validate({ attributePool: JSON.stringify(pool), attributes: { kind: 'CC' } }, category).ok, true, 'Supplier-added choices remain usable');
assert.equal(validate({ attributePool: JSON.stringify([{ ...pool[0], key: 'grade' }]), attributes: {} }, category).ok, false);
for (const key of ['grade_rows', 'lead_time', 'moq_unit_weight_kg', '__proto__', 'Constructor']) {
  assert.equal(validate({ attributePool: JSON.stringify([{ key, label: 'Giả', type: 'text', options: [] }]), attributes: {} }, category).ok, false,
    `Supplier attribute cannot overwrite internal ${key}`);
  const badCategory = { ...category, product_fields: [...category.product_fields, { key, label: 'Giả', type: 'text', options: [] }] };
  assert.equal(validate(draft, badCategory).ok, false, `Misconfigured category cannot overwrite internal ${key}`);
}
assert.equal(validate({ attributePool: JSON.stringify([{ ...pool[0], label: '<script>' }]), attributes: {} }, category).ok, false);
assert.equal(validate({ attributePool: JSON.stringify([{ ...pool[0], options: ['CC', 'CC'] }]), attributes: {} }, category).ok, false);
assert.equal(validate({ attributePool: '[', attributes: {} }, category).ok, false);
assert.equal(validate(draft, { ...category, product_fields: [{ key: 'invalid', label: '', type: 'text', options: [] }] }).ok, false);
console.log('Private form attributes: current category, extra choices, hidden values and malformed pools passed');
