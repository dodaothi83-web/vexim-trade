// Synthetic server-render checks only; no network or production data writes.
// node scripts/check-rfq-category-filter-options.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';

let categories = [], suppliers = [], listFailed = false;
const RfqForm = () => null;
const mocks = {
  'react/jsx-runtime': jsx,
  'next/link': { default: () => null },
  './rfq-form': { RfqForm },
  '@/components/ui': { Breadcrumbs: () => null },
  '@/lib/db': { getStore: () => ({ listCategories: async ({ publishedOnly }) => {
    assert.equal(publishedOnly, true);
    if (listFailed) throw new Error('category read unavailable');
    return categories;
  } }) },
  '@/lib/products/grade-pricing': { standardGradesForCategory: (category) => category.standardGrades ?? [] },
  '@/lib/public/catalog': { listPublicSuppliers: async () => suppliers },
};
const exports = {};
const js = ts.transpileModule(readFileSync(new URL('../app/(public)/rfq/page.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(js, { exports, require: (key) => {
  if (!(key in mocks)) throw Error(`Unexpected import: ${key}`);
  return mocks[key];
} });
function findForm(node) {
  if (!React.isValidElement(node)) return null;
  if (node.type === RfqForm) return node.props;
  for (const child of React.Children.toArray(node.props.children)) {
    const found = findForm(child);
    if (found) return found;
  }
  return null;
}
const render = async (params = {}) => {
  const element = await exports.default({ searchParams: Promise.resolve(params) });
  const props = findForm(element);
  assert.ok(props, 'The RFQ form is rendered');
  return props;
};
const plain = (value) => JSON.parse(JSON.stringify(value));

categories = [
  { slug: 'cashew-kernels', name_i18n: { en: 'Cashew kernels' },
    filters: { grades: ['W180', 'W320'], certifications: ['HACCP', { value: 'Organic' }] }, standardGrades: ['W180', 'W320', 'W450'] },
  { slug: 'legacy-object', filters: { grades: ['Special', { value: 'Other grade' }], certifications: ['ISO', null, { value: 'BRC' }] } },
  { slug: 'current-array', filters: [{ key: 'grade', options: [{ value: '500 g/L', label: '500' }, { value: '550 g/L', label: '550' }] },
    { key: 'certifications', options: [{ value: 'HACCP', label: 'HACCP' }, { value: 'ISO', label: 'ISO' }] }] },
  { slug: 'broken-entry', filters: [null, 42, { key: 'grade', options: null }, { key: 'certifications', options: 'invalid' }] },
  { slug: 'null', filters: null },
  { slug: 'broken-object', filters: { grades: 'W320', certifications: [{ value: 1 }, {}, ''] } },
];
let props = await render({ category: 'cashew-kernels', product: 'Cashew', product_id: 'product-1', grade: 'W320' });
assert.deepEqual(plain(props.categorySpecs['cashew-kernels']), { grades: ['W180', 'W320', 'W450'], certs: ['HACCP', 'Organic'] },
  'Standard grades keep priority; object-shaped certifications remain usable');
assert.deepEqual(plain(props.categorySpecs['legacy-object']), { grades: ['Special', 'Other grade'], certs: ['ISO', 'BRC'] });
assert.deepEqual(plain(props.categorySpecs['current-array']), { grades: ['500 g/L', '550 g/L'], certs: ['HACCP', 'ISO'] });
for (const name of ['broken-entry', 'null', 'broken-object'])
  assert.deepEqual(plain(props.categorySpecs[name]), { grades: [], certs: [] }, `${name} should not crash the page`);
assert.equal(props.initialCategory, 'cashew-kernels');
assert.equal(props.initialProductId, 'product-1');
assert.equal(props.initialGrade, 'W320');
assert.equal(props.mode, 'quote');

suppliers = [{ id: 'supplier-1', name: 'Vendor', display_name: 'Public vendor' }];
props = await render({ intent: 'question', suppliers: 'supplier-1', product_id: 'product-1' });
assert.equal(props.mode, 'question');
assert.deepEqual(plain(props.initialSuppliers), [{ id: 'supplier-1', name: 'Public vendor' }]);
props = await render({ intent: 'question', suppliers: 'unlisted', product_id: 'product-1' });
assert.equal(props.mode, 'quote', 'An unavailable supplier cannot activate targeted question mode');
listFailed = true;
props = await render();
assert.deepEqual(plain(props.categories), [], 'Existing category-read fallback remains intact');
console.log('RFQ page: object and array category filters, malformed data, grade precedence and targeted supplier behavior passed.');
