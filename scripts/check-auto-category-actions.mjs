// node --experimental-strip-types --no-warnings scripts/check-auto-category-actions.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { assignProductCategory, assignSupplierCategories } from '../lib/public/category-assignment.ts';

const source = readFileSync(new URL('../app/actions.ts', import.meta.url), 'utf8');
const sync = source.slice(source.indexOf('async function syncSupplierIndustries('), source.indexOf('export async function createSupplierAction('));
const section = sync + source.slice(source.indexOf('function parseProductInput('), source.indexOf('/* ------------------------------ EMAIL'));
const js = ts.transpileModule(section, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const categories = [
  { id: 'cat-cashew', slug: 'cashew', name_i18n: { en: 'Cashew' } },
  { id: 'cat-rice', slug: 'rice', name_i18n: { en: 'Rice' } },
];
const supplier = { id: 'sup-1', products: 'Cashew W320' };
const rows = new Map();
let linked = [];
const store = {
  listCategories: async () => categories,
  getSupplier: async (id) => id === supplier.id ? supplier : null,
  listSupplierCategories: async () => linked.map((slug) => ({ category_id: categories.find((c) => c.slug === slug).id })),
  setSupplierCategories: async (_id, ids) => { linked = ids.map((id) => categories.find((c) => c.id === id).slug); },
  listProductsBySupplier: async () => [...rows.values()],
  createProduct: async (row) => { const created = { ...row, id: `p-${rows.size + 1}` }; rows.set(created.id, created); return created; },
  getProduct: async (id) => rows.get(id) ?? null,
  updateProduct: async (id, patch) => { rows.set(id, { ...rows.get(id), ...patch }); },
  deleteProduct: async (id) => { rows.delete(id); },
  listMedia: async () => [{ kind: 'image', audience: 'buyer', expires_on: null, status: 'checked' }],
};
const exports = {};
vm.runInNewContext(js, {
  exports, str: (v) => typeof v === 'string' ? v.trim() || null : null,
  num: (v) => v == null || v === '' ? null : Number(v),
  bool: (v, fallback = false) => typeof v === 'boolean' ? v : fallback,
  guard: async () => null, getStore: () => store, revalidateAll: () => {},
  assignProductCategory, assignSupplierCategories, productReadiness: () => ({ ready: true }), console,
}, { filename: 'auto-category-actions.ts' });
let result = await exports.createProductAction({ name: 'TEST ONLY — Jasmine Rice Sample', supplier_id: supplier.id, category: 'cashew' });
assert.equal(result.ok, true);
assert.equal(rows.get(result.id).category, 'rice', 'Server overrides a spoofed category');
assert.deepEqual(linked, ['rice', 'cashew'], 'Supplier gets both industries, primary rice from product');
result = await exports.updateProductAction('p-1', { name: 'Cashew W320', supplier_id: supplier.id, ready_for_buyer: true, category: 'rice' });
assert.equal(result.ok, true);
assert.equal(rows.get('p-1').category, 'cashew');
assert.deepEqual(linked, ['cashew']);
result = await exports.updateProductAction('p-1', { name: 'Jasmine Rice', supplier_id: supplier.id, ready_for_buyer: true, category: 'cashew' });
assert.equal(result.ok, true);
assert.equal(rows.get('p-1').category, 'rice');
result = await exports.deleteProductAction('p-1');
assert.equal(result.ok, true);
assert.deepEqual(linked, ['cashew'], 'Deleting a product recomputes the supplier industries');
linked = ['cashew', 'rice'];
result = await exports.createProductAction({ name: 'Mixed cashew rice blend', supplier_id: supplier.id, category: 'cashew' });
assert.equal(result.ok, true);
assert.equal(rows.get(result.id).category, null, 'Mixed product is not assigned arbitrarily');
result = await exports.updateProductAction(result.id, { name: 'Mixed cashew rice blend', ready_for_buyer: true, supplier_id: supplier.id });
assert.equal(result.ok, true);
assert.equal(rows.get('p-1').ready_for_buyer, false, 'Unclassified product cannot become buyer-ready');
console.log('✅ Product create/update/delete auto-assign own category and resync supplier industries.');
