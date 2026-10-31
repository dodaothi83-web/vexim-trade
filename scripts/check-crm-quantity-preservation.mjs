// node scripts/check-crm-quantity-preservation.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { productExtrasFromForm } from '../lib/products/product-extras.ts';
let denied = false, writes = 0;
const category = { id: 'cat', slug: 'cashew', name_i18n: { en: 'Cashew' }, status: 'published', is_published: true };
let product = { id: 'p', supplier_id: 's', name: 'Nhân điều', spec: 'Quy cách', description: null, description_detail: null,
  category: 'cashew', reviewed_category_slug: 'cashew', supplier_originated: true, supplier_review_status: 'approved', ready_for_buyer: true,
  ref_price: 6, ref_price_max: 7, unit: 'MT', currency: 'USD', moq: 'Full container', moq_qty: null, moq_unit: null, incoterm: 'FOB',
  price_valid_until: '2030-01-01', specs: { grade: 'W320', grade_rows: [{ grade: 'W320', price_min: 6 }] } };
const store = { getProduct: async () => product, listCategories: async () => [category], getCategoryBySlug: async () => category,
  getSupplier: async () => ({ id: 's', categories_reviewed_at: '2026-01-01', requested_category_slugs: ['cashew'] }),
  listSupplierCategories: async () => [], listProductsBySupplier: async () => [product],
  updateSupplierProductIfState: async (_id, _sid, _expected, input) => { writes++; product = { ...product, ...input }; return product; } };
const mocks = {
  'next/cache': { revalidatePath() {} }, '@/lib/crm/badges': { refreshCrmBadges() {} },
  '@/lib/db': { getStore: () => store }, '@/lib/auth/session': { guard: async () => denied ? { ok: false, message: 'denied' } : null },
  '@/lib/product-attributes': { saveProductAttributes: (_cat, _raw, previous = {}) => ({ ...previous, grade: 'forged' }) },
  '@/lib/products/product-description': { sanitizeProductDescriptionForSave: (s) => s, sanitizeProductDescriptionHtml: (s) => s },
  '@/lib/products/grade-pricing': { applyLeadTimeToSpecs: (s) => s },
  '@/lib/public/category-assignment': { assignProductCategory: () => category, assignSupplierCategories: () => ({ slugs: ['cashew'], ids: [] }) },
  '@/lib/public/display-name': { isPlaceholderDisplayName: () => false },
  '@/lib/products/product-extras': { productExtrasFromForm },
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../app/actions.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports, console, Date, process, require: (key) => mocks[key] ?? {} });
const raw = { name: 'Nhân điều', spec: 'Quy cách', supplier_id: 'other', category: 'cashew', ready_for_buyer: false,
  ref_price: 99, ref_price_max: 999, unit: 'kg', currency: 'EUR', moq: '500 bags', incoterm: 'CIF', price_valid_until: '2000-01-01',
  grade_rows: [{ grade: 'W240', price_min: 99, price_max: 999 }], product_attributes: { grade: 'W240' } };
assert.equal((await exports.updateProductAction('p', raw)).ok, false, 'Cached legacy forms must reload');
assert.equal(writes, 0);
delete raw.grade_rows;
const result = await exports.updateProductAction('p', raw);
assert.equal(result.ok, true, result.message); assert.equal(writes, 1);
assert.equal(product.supplier_id, 's'); assert.equal(product.ready_for_buyer, true);
assert.equal(product.ref_price, 6); assert.equal(product.ref_price_max, 7); assert.equal(product.unit, 'MT'); assert.equal(product.currency, 'USD');
assert.equal(product.moq, 'Full container'); assert.equal(product.incoterm, 'FOB'); assert.equal(product.price_valid_until, '2030-01-01');
assert.equal(product.specs.grade, 'W320'); assert.equal(product.specs.grade_rows[0].price_min, 6);
const formSource = readFileSync(new URL('../components/product-form.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(formSource, /Bảng giá cũ \(cơ chế hiện tại\)/, 'CRM edit no longer exposes the obsolete legacy panel');
assert.match(formSource, /!product && <GradePricingTable/, 'Legacy editor remains only for the not-yet-migrated CRM creation flow');
assert.match(formSource, /product \? \{\} : \{ grade_rows: gradeValidation.rows \}/, 'Existing-product saves do not submit legacy rows');
denied = true; assert.equal((await exports.updateProductAction('p', raw)).ok, false); assert.equal(writes, 1);
console.log('CRM product edits: staff authorization and legacy buyer prices are preserved; quantity revisions are separate');
