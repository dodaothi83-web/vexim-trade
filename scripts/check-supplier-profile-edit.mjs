// node scripts/check-supplier-profile-edit.mjs — owner edit is linked-account only and refreshes English text.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../app/supplier/portal/profile/profile-actions.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const supplier = {
  id: 'supplier-1', slug: 'supplier-one', name: 'Legal name', tax_id: '0123456789', address: 'Registered address',
  status: 'published', onboarding_status: 'approved', supplier_type: 'manufacturer', products: 'Cashew',
  contact_name: 'Old contact', phone: '0900000000', intro_source: 'Old story',
};
let access;
let patch;
let audit;
let translationCalls = 0;
const revalidated = [];
const store = {
  updateSupplier: async (id, value) => { assert.equal(id, supplier.id); patch = value; return { ...supplier, ...value }; },
  addAuditLog: async (entry) => { audit = entry; return entry; },
};
const module = { exports: {} };
vm.runInNewContext(js, {
  module, exports: module.exports, console, Date, FormData, Object, String, Number, Boolean, RegExp, Error, Promise,
  require: (id) => {
    if (id === 'next/cache') return { revalidatePath: (path) => revalidated.push(path) };
    if (id === '@/lib/supplier-portal/access') return { supplierPortalAccess: async () => access };
    if (id === '@/lib/supplier-portal/onboarding') return { portalApproved: (value) => value.onboarding_status === 'approved' };
    if (id === '@/lib/ai/supplier-translation-service') return { ensureSupplierProfileEnglish: async () => { translationCalls += 1; return { status: 'translated', supplier }; } };
    throw new Error(`Unexpected import ${id}`);
  },
}, { filename: 'profile-actions.ts' });
const action = module.exports.saveSupplierProfileEditAction;
access = { supplier, store, user: { id: 'user-1', email: 'owner@example.com' } };
const form = new FormData();
for (const [key, value] of Object.entries({
  contact_name: 'New contact', phone: '0911111111', products: 'Cashew and pepper', trade_name: 'New trade name',
  display_name: 'New display name', province: 'Bình Phước', intro_source: 'New story', moq_text: '1 tấn',
  export_markets: 'Hoa Kỳ, Nhật Bản', ports: 'Cát Lái', incoterms: 'FOB', private_label: 'yes',
})) form.set(key, value);
const result = await action(form);
assert.equal(result.ok, true);
assert.equal(patch.contact_name, 'New contact');
assert.equal(patch.products, 'Cashew and pepper');
assert.equal(JSON.stringify(patch.export_markets), JSON.stringify(['Hoa Kỳ', 'Nhật Bản']));
assert.equal(patch.private_label, true);
for (const locked of ['name', 'tax_id', 'address', 'status', 'onboarding_status', 'supplier_type', 'verification_level'])
  assert.ok(!(locked in patch), `Owner edit must not write ${locked}`);
assert.equal(translationCalls, 1, 'Saving an owner profile triggers English translation');
assert.equal(audit.action, 'supplier.profile_owner_updated');
assert.ok(revalidated.includes('/supplier/portal/profile'));
assert.ok(revalidated.includes('/suppliers/supplier-one'));

access = { supplier: { ...supplier, onboarding_status: 'pending' }, store, user: { id: 'user-1', email: 'owner@example.com' } };
assert.equal((await action(form)).ok, false, 'Pending profiles cannot use the approved-owner editor');

const profile = fs.readFileSync(new URL('../app/supplier/portal/profile/page.tsx', import.meta.url), 'utf8');
assert.match(profile, /href="\/supplier\/portal\/profile\/edit"/);
assert.match(profile, /Chỉnh sửa hồ sơ/);
const editPage = fs.readFileSync(new URL('../app/supplier/portal/profile/edit/page.tsx', import.meta.url), 'utf8');
assert.match(editPage, /portalApproved/);
assert.match(editPage, /redirect\("\/supplier\/portal"\)/);
const editForm = fs.readFileSync(new URL('../app/supplier/portal/profile/profile-edit-form.tsx', import.meta.url), 'utf8');
assert.match(editForm, /saveSupplierProfileEditAction/);
assert.match(editForm, /Tên pháp nhân, mã số thuế, địa chỉ đăng ký/);
console.log('✅ Supplier profile edit: linked-owner access, locked legal/review fields, audit and translation trigger.');
