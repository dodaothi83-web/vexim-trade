// node --experimental-strip-types --no-warnings scripts/check-auto-category-actions.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { assignProductCategory, assignSupplierCategories } from '../lib/public/category-assignment.ts';
import { saveProductAttributes } from '../lib/product-attributes.ts';
import { loadProductDescription } from './product-description-test-utils.mjs';

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
  getCategoryBySlug: async (slug) => categories.find((c) => c.slug === slug) ?? null,
  getSupplier: async (id) => id === supplier.id ? supplier : null,
  listSupplierCategories: async () => linked.map((slug) => ({ category_id: categories.find((c) => c.slug === slug).id })),
  setSupplierCategories: async (_id, ids) => { linked = ids.map((id) => categories.find((c) => c.id === id).slug); },
  listProductsBySupplier: async () => [...rows.values()],
  createProduct: async (row) => { const created = { ...row, id: `p-${rows.size + 1}` }; rows.set(created.id, created); return created; },
  getProduct: async (id) => rows.get(id) ?? null,
  updateProduct: async (id, patch) => { rows.set(id, { ...rows.get(id), ...patch }); },
  updateSupplierProductIfState: async (id, supplierId, expected, patch) => {
    const current = rows.get(id);
    if (!current || current.supplier_id !== supplierId || (current.supplier_review_status ?? null) !== expected.review || current.ready_for_buyer !== expected.ready) return null;
    const updated = { ...current, ...patch }; rows.set(id, updated); return updated;
  },
  deleteProduct: async (id) => { rows.delete(id); },
  listMedia: async () => [{ kind: 'image', audience: 'buyer', expires_on: null, status: 'checked' }],
};
const exports = {};
vm.runInNewContext(js, {
  exports, str: (v) => typeof v === 'string' ? v.trim() || null : null,
  num: (v) => v == null || v === '' ? null : Number(v),
  bool: (v, fallback = false) => typeof v === 'boolean' ? v : fallback,
  guard: async () => null, getStore: () => store, revalidateAll: () => {},
  assignProductCategory, assignSupplierCategories, saveProductAttributes, productReadiness: () => ({ ready: true }), console,
  sanitizeProductDescriptionForSave: loadProductDescription().description.sanitizeProductDescriptionForSave,
  sanitizeProductDescriptionHtml: loadProductDescription().description.sanitizeProductDescriptionHtml,
  displayNameInput: (value) => typeof value === 'string' ? value.trim().slice(0, 120) || null : null,
  productTranslationState: () => ({ current: true }),
}, { filename: 'auto-category-actions.ts' });
let result = await exports.createProductAction({ name: 'Cashew W320', supplier_id: supplier.id, ref_price: 10, ref_price_max: 9 });
assert.equal(result.ok, false, 'Staff cannot save an inverted reference price range');
result = await exports.createProductAction({ name: 'TEST ONLY — Jasmine Rice Sample', supplier_id: supplier.id, category: 'cashew' });
assert.equal(result.ok, true, result.message);
assert.equal(rows.get(result.id).category, 'rice', 'Server overrides a spoofed category');
assert.deepEqual(linked, ['rice', 'cashew'], 'Supplier gets both industries, primary rice from product');
result = await exports.updateProductAction('p-1', { name: 'Cashew W320', supplier_id: supplier.id, ready_for_buyer: true, category: 'rice' });
assert.equal(result.ok, true, result.message);
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
linked = ['cashew', 'rice'];
result = await exports.createProductAction({ name: 'Unnamed regional specialty', supplier_id: supplier.id, category: 'rice' });
assert.equal(result.ok, true);
assert.equal(rows.get(result.id).category, 'rice', 'Staff can select an allowed industry when text inference has no match');
result = await exports.createProductAction({ name: 'Unnamed regional specialty', supplier_id: supplier.id, category: 'foreign' });
assert.equal(rows.get(result.id).category, null, 'Form cannot claim an industry outside supplier scope');
rows.set('p-crm-reviewed', { id: 'p-crm-reviewed', supplier_id: supplier.id, name: 'Cashew W320',
  category: 'rice', reviewed_category_slug: 'rice', supplier_originated: false,
  description: null, spec: null, description_detail: 'Long details\nApplication', ready_for_buyer: false });
result = await exports.updateProductAction('p-crm-reviewed', { name: 'Cashew W320', supplier_id: supplier.id,
  category: 'rice', description_detail: 'Long details\nApplication' });
assert.equal(result.ok, true, result.message);
assert.equal(rows.get('p-crm-reviewed').description_detail, '<p>Long details<br />Application</p>', 'Saving lazily canonicalizes legacy detail');
assert.equal(rows.get('p-crm-reviewed').reviewed_category_slug, 'rice',
  'Canonicalizing legacy detail is not an identity change and cannot clear staff review');
rows.set('p-reviewed', { id: 'p-reviewed', supplier_id: supplier.id, name: 'Cashew W320',
  category: 'rice', reviewed_category_slug: 'rice', supplier_originated: true,
  description: null, spec: null, description_detail: null, ready_for_buyer: false });
result = await exports.updateProductAction('p-reviewed', { name: 'Cashew W320', supplier_id: supplier.id, category: 'cashew' });
assert.equal(rows.get('p-reviewed').category, 'rice', 'Staff-reviewed category outranks automatic keyword assignment');
assert.match(result.message, /Danh mục Vexim đã chốt được giữ nguyên/, 'Save feedback must not claim an auto-guess replaced staff review');
result = await exports.updateProductAction('p-reviewed', { name: 'Cashew W240', supplier_id: supplier.id });
assert.equal(rows.get('p-reviewed').reviewed_category_slug, 'rice', 'Supplier products retain the staff-reviewed category during ordinary edits');
assert.match(result.message, /Danh mục Vexim đã chốt được giữ nguyên/, 'Save feedback confirms the reviewed category is preserved');
console.log('✅ Product create/update/delete auto-assign own category and resync supplier industries.');
