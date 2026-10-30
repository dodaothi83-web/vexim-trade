// node scripts/check-reviewer-publication.mjs — role-separated, status-only publication regression.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const supplierId = '12345678-1234-1234-1234-123456789abc';
const categoryId = 'abcdefab-cdef-abcd-efab-cdefabcdefab';
let user = { uid: 'reviewer-1', email: 'reviewer@example.com', role: 'reviewer' };
let supplier = { id: supplierId, status: 'in_verification', name: 'Example' };
let category = { id: categoryId, slug: 'cashew', name_i18n: { en: 'Cashew' }, status: 'draft', is_published: false, updated_by: 'preparer-1' };
const supplierPatches = [], categoryPatches = [], logs = [];
const store = {
  getSupplier: async () => supplier,
  updateSupplier: async (_id, patch) => { supplierPatches.push(patch); supplier = { ...supplier, ...patch }; },
  getCategory: async () => category,
  updateCategory: async (_id, patch) => { categoryPatches.push(patch); category = { ...category, ...patch }; },
  addAuditLog: async (entry) => { logs.push(entry); },
};
function load(relative) {
  const src = fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const mocks = {
    'next/cache': { revalidatePath() {} },
    '@/lib/auth/session': {
      guard: async (perm) => {
        if (perm === 'suppliers.manage') return ['admin', 'sourcing'].includes(user.role) ? null : { message: 'denied' };
        return ['reviewer', 'admin'].includes(user.role) && ['categories.publish', 'suppliers.publish'].includes(perm) ? null : { message: 'denied' };
      },
      getSession: async () => user,
    },
    '@/lib/db': { getStore: () => store },
    '@/lib/supplier': {
      nextStatusOptions: (status) => ({
        draft: ['submitted'], submitted: ['in_verification', 'draft'], in_verification: ['published', 'submitted'],
        published: ['suspended', 'archived'], suspended: ['published', 'archived'], archived: ['draft'],
      })[status] ?? ['submitted'],
      statusMeta: (s) => ({ label: s }),
    },
  };
  vm.runInNewContext(js, { exports, require: (id) => { assert.ok(id in mocks, `Unexpected import ${id}`); return mocks[id]; }, console }, { filename: relative });
  return exports;
}
const suppliers = load('../app/crm/suppliers/[slug]/publication-actions.ts');
const categories = load('../app/crm/categories/publication-actions.ts');

user = { uid: 'sourcing-1', email: 'sourcing@example.com', role: 'sourcing' };
supplier = { id: supplierId, status: 'draft', name: 'Example' };
assert.equal((await suppliers.decideSupplierPreparationAction(supplierId, 'submitted')).ok, true);
assert.deepEqual({ ...supplierPatches.at(-1) }, { status: 'submitted' }, 'Preparation must not write profile fields');
assert.equal(logs.at(-1).action, 'supplier.preparation_decided');
assert.equal((await suppliers.decideSupplierPreparationAction(supplierId, 'published')).ok, false, 'Preparation action cannot publish');
assert.equal((await suppliers.decideSupplierPublicationAction(supplierId, 'published')).ok, false, 'Sourcing cannot publish');
user = { uid: 'reviewer-1', email: 'reviewer@example.com', role: 'reviewer' };
assert.equal((await suppliers.decideSupplierPreparationAction(supplierId, 'in_verification')).ok, false, 'Reviewer cannot move private preparation stages');
supplier = { id: supplierId, status: 'in_verification', name: 'Example' };
assert.equal((await suppliers.decideSupplierPublicationAction(supplierId, 'published')).ok, true);
assert.deepEqual({ ...supplierPatches.at(-1) }, { status: 'published' }, 'Publication must not write profile fields');
assert.equal(logs.at(-1).actor_id, user.uid);
assert.equal((await suppliers.decideSupplierPublicationAction(supplierId, 'draft')).ok, false, 'Reviewer cannot transition out of publication workflow');
assert.equal((await suppliers.decideSupplierPublicationAction(supplierId, 'suspended')).ok, true);
assert.equal((await categories.decideCategoryPublicationAction(categoryId, true)).ok, true);
assert.deepEqual({ ...categoryPatches.at(-1) }, { status: 'published', is_published: true }, 'Publication must not rewrite category content');
assert.equal(logs.at(-1).action, 'publish');
assert.equal((await categories.decideCategoryPublicationAction(categoryId, false)).ok, true);
category.updated_by = user.uid;
assert.equal((await categories.decideCategoryPublicationAction(categoryId, true)).ok, false, 'Last editor cannot publish own category');
// Ngoại lệ Admin: toàn quyền nên được tự công khai cả bản mình sửa cuối, vẫn qua audit log.
user = { uid: 'admin-1', email: 'admin@example.com', role: 'admin' };
category.updated_by = user.uid;
assert.equal((await categories.decideCategoryPublicationAction(categoryId, true)).ok, true, 'Admin may publish a category they last edited');
assert.equal(logs.at(-1).actor_id, 'admin-1');
assert.equal(logs.at(-1).action, 'publish');
user = { ...user, role: 'sale' };
assert.equal((await suppliers.decideSupplierPublicationAction(supplierId, 'published')).ok, false);
assert.equal((await categories.decideCategoryPublicationAction(categoryId, true)).ok, false);
console.log('✅ Supplier workflow: preparation and publication are status-only, audited and role-gated; category editor cannot self-publish.');
