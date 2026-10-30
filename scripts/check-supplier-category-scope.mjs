// node scripts/check-supplier-category-scope.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const load = (path, mocks) => {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { exports, require: (key) => {
    assert.ok(key in mocks, `Unexpected import: ${key}`); return mocks[key];
  }, console, FormData, Date });
  return exports;
};
const scope = load('../lib/supplier-portal/category-proposals.ts', {});
const categories = [
  { id: 'c1', slug: 'cashew', name_i18n: { vi: 'Hạt điều' }, status: 'published', is_published: true, sort_order: 1 },
  { id: 'c2', slug: 'rice', name_i18n: { vi: 'Gạo' }, status: 'published', is_published: true, sort_order: 2 },
  { id: 'c3', slug: 'secret', name_i18n: { vi: 'Ẩn' }, status: 'draft', is_published: false, sort_order: 3 },
];
const options = scope.categoryProposalOptions(categories);
assert.deepEqual(options.map((x) => x.slug), ['cashew', 'rice']);
const supplier = { id: 'supplier-1', requested_category_slugs: ['cashew'], categories_reviewed_at: null };
assert.deepEqual(scope.allowedSupplierCategories(supplier, options).map((x) => x.slug), ['cashew']);
assert.deepEqual(scope.allowedSupplierCategories({ ...supplier, requested_category_slugs: [], categories_reviewed_at: '2026-01-01' }, options, [{ category_id: 'c2' }]).map((x) => x.slug), ['rice'], 'Confirmed legacy suppliers retain their previous scope');
assert.equal(scope.allowedSupplierCategories({ ...supplier, requested_category_slugs: [], categories_reviewed_at: null }, options, [{ category_id: 'c2' }]).length, 0, 'Automatic inference does not grant supplier scope');
const form = (...slugs) => { const data = new FormData(); slugs.forEach((slug) => data.append('requested_category_slugs', slug)); return data; };
for (const data of [form(), form('secret'), form('cashew', 'cashew'), form('cashew', 'rice', 'cashew')]) {
  assert.throws(() => scope.parseSupplierCategoryProposals(data, options));
}
const forgedOther = form(); forgedOther.set('requested_category_other', 'Macca');
assert.throws(() => scope.parseSupplierCategoryProposals(forgedOther, options), 'Free text cannot expand taxonomy');
assert.equal(scope.parseSupplierCategoryProposals(form('cashew'), options).requested_category_other, null);
assert.throws(() => scope.parseProductCategoryProposal(new FormData(), options));
const outside = new FormData(); outside.set('supplier_category_proposal', 'rice');
assert.equal(scope.parseProductCategoryProposal(outside, options), 'rice',
  'Product drafts can use any published category; scope remains a review aid');
assert.throws(() => scope.parseProductCategoryProposal(outside, scope.allowedSupplierCategories(supplier, options)),
  'The scope-limited helper still rejects outside categories when explicitly used');

const audit = [];
let products = [];
let userApproved = true;
const store = {
  listCategories: async () => categories,
  listProductsBySupplier: async () => products,
  updateSupplier: async (_id, patch) => Object.assign(supplier, patch),
  addAuditLog: async (entry) => audit.push(entry),
};
const actions = load('../app/supplier/portal/categories/actions.ts', {
  'next/cache': { revalidatePath() {} },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => ({ store, supplier, user: { id: 'owner', email: 'owner@example.com' } }) },
  '@/lib/supplier-portal/onboarding': { portalApproved: () => userApproved },
  '@/lib/supplier-portal/category-proposals': scope,
});
userApproved = false;
assert.equal((await actions.saveSupplierCategoriesAction(form('rice'))).ok, false, 'Pending account cannot change scope');
userApproved = true;
assert.equal((await actions.saveSupplierCategoriesAction(form('secret'))).ok, false, 'Cannot choose draft category');
products = [{ name: 'Cashew W320', reviewed_category_slug: 'cashew', supplier_category_proposal: 'cashew', category: 'cashew' }];
assert.equal((await actions.saveSupplierCategoriesAction(form('rice'))).ok, false, 'Cannot remove a category with a product still in it');
assert.equal((await actions.saveSupplierCategoriesAction(form('cashew', 'rice'))).ok, true);
assert.deepEqual(supplier.requested_category_slugs, ['cashew', 'rice']);
assert.equal(audit.at(-1).action, 'supplier.categories_selected');
const supplierDetail = readFileSync(new URL('../app/crm/suppliers/[slug]/page.tsx', import.meta.url), 'utf8');
const productEditor = readFileSync(new URL('../app/supplier/portal/products/product-editor.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(supplierDetail, /SupplierCategoryControls|Ngành tự gán/, 'No duplicate staff supplier-category approval panel');
assert.doesNotMatch(productEditor, /Danh mục sản phẩm đề xuất|Danh mục Vexim đã chốt/, 'One product category dropdown');
assert.match(productEditor, /name="supplier_category_proposal" className="input" required/, 'Product selection is required');
console.log('✅ Supplier scope: CMS-only selection, legacy compatibility, product restriction and independent approval.');
