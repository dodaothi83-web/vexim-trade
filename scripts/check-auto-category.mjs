// node --experimental-strip-types --no-warnings scripts/check-auto-category.mjs
import assert from 'node:assert/strict';
import { assignProductCategory, assignSupplierCategories } from '../lib/public/category-assignment.ts';

const cats = ['cashew', 'rice', 'noodles', 'coffee', 'pepper', 'shrimp', 'seafood', 'nuts-kernels']
  .map((slug, i) => ({ id: `cat-${i}`, slug, name_i18n: { en: slug } }));
const assign = (name, supplier = [], prev = null, spec = null) => assignProductCategory({ name, spec, description: null, category: prev }, cats, supplier)?.slug ?? null;
assert.equal(assign('TEST ONLY — Jasmine Rice Sample', ['cashew'], 'cashew'), 'rice');
assert.equal(assign('Cashew kernels W320', ['rice']), 'cashew');
assert.equal(assign('Gạo ST25', ['cashew']), 'rice');
assert.equal(assign('Rice noodles', ['rice']), 'noodles', 'specific product outranks broad commodity');
assert.equal(assign('Frozen shrimp', ['seafood']), 'shrimp');
assert.equal(assign('Grade W320', ['cashew']), 'cashew', 'unique supplier industry is fallback');
assert.equal(assign('Cashew rice blend', ['cashew']), null, 'genuinely mixed names stay unclassified');
assert.equal(assign('Unknown product', ['cashew', 'rice']), null, 'do not guess when supplier has multiple industries');
assert.equal(assign('Unknown product', [], 'cashew'), 'cashew', 'existing classification stays stable');
const supplier = assignSupplierCategories('Rice and cashew kernels', [
  { name: 'Jasmine Rice', category: 'rice', spec: null, description: null },
  { name: 'Gạo ST25', category: 'cashew', spec: null, description: null },
  { name: 'Cashew W320', category: 'cashew', spec: null, description: null },
], cats);
assert.deepEqual(supplier.slugs, ['rice', 'cashew']);
assert.equal(supplier.primaryId, cats.find((c) => c.slug === 'rice').id);
console.log('✅ Automatic industry assignment: own product wins; supplier fallback, multi-industry and ambiguous cases are safe.');
