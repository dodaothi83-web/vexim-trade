// node --experimental-strip-types --no-warnings scripts/check-product-form-demo.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import * as pricing from '../lib/products/quantity-pricing.ts';
import { entry } from './quantity-v2-test-utils.mjs';
const load = (path, mocks) => {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, Number, JSON, TextEncoder, require: (key) => { if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key]; } });
  return exports;
};
const model = load('../lib/products/product-form-model.ts', { zod: { z }, '@/lib/products/quantity-entry': entry });
const { PRODUCT_FORM_DEMOS } = load('../lib/products/product-form-demo.ts', {});
const grades = { 'cashew-kernels': ['W320'], pepper: ['500 g/L'], 'cinnamon-star-anise': ['Cassia whole'] };
assert.equal(PRODUCT_FORM_DEMOS.length, 3);
for (const demo of PRODUCT_FORM_DEMOS) {
  assert.ok(existsSync(new URL(`../public${demo.imagePath}`, import.meta.url)), `${demo.label} image exists`);
  const draft = model.parseProductFormDraft(demo.draft); assert.ok(draft);
  const result = model.validateProductFormSubmission(draft, { categoryValid: true, imageCount: 1,
    standardGrades: grades[draft.category], policy: pricing.DEFAULT_QUANTITY_PRICING_POLICY });
  assert.equal(result.errors.length, 0, `${demo.label}: ${JSON.stringify(result.errors)}`);
  assert.ok(result.quantity.tiers.length >= 1); assert.ok(['kg', 'mt'].includes(result.quantity.unit));
  assert.ok(demo.englishName && !pricing.nameContainsGrade(demo.englishName, [draft.grade]));
}
console.log('Demo fixtures: three valid single-grade products, image paths, kg/MT tiers and grade-free names passed');
