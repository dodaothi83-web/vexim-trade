import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { loadPortalDictionary } from './lib/portal-dictionary.mjs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
function load(file, mocks = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: mod, exports: mod.exports, console, Date, FormData,
    require(id) { assert.ok(id in mocks, `Unexpected import: ${id}`); return mocks[id]; },
  }, { filename: file });
  return mod.exports;
}
const { parseSupplierProfile } = load('lib/supplier-portal/profile-input.ts');
const validForm = () => {
  const f = new FormData();
  for (const [key, value] of Object.entries({ name: 'Annual output test supplier', contact_name: 'Contact', phone: '0900000000',
    products: 'Cashew kernels', supplier_type: 'manufacturer', tax_number: '1234567890', consent: 'yes', information_accuracy: 'yes' })) f.set(key, value);
  return f;
};
const legacy = { capacity_per_month: '10 metric tons/month', moq_text: '1 metric ton', annual_output: '95 metric tons/year' };
const f = validForm();
f.set('annual_output', '  95 metric tons/year  ');
// Forged legacy terms are ignored, not overwritten or cleared.
f.set('capacity_per_month', '999'); f.set('moq_text', '999');
const patch = parseSupplierProfile(f).patch;
assert.equal(patch.annual_output, '95 metric tons/year');
for (const field of ['moq_text', 'capacity_per_month']) assert.ok(!Object.hasOwn(patch, field));
assert.equal({ ...legacy, ...patch }.capacity_per_month, legacy.capacity_per_month);
assert.equal({ ...legacy, ...patch }.moq_text, legacy.moq_text);
f.delete('annual_output');
assert.ok(!Object.hasOwn(parseSupplierProfile(f).patch, 'annual_output'), 'Older client preserves annual output');
f.set('annual_output', '');
assert.equal(parseSupplierProfile(f).patch.annual_output, null, 'Explicitly clearing annual output is supported');
f.set('annual_output', 'a'.repeat(200));
assert.equal(parseSupplierProfile(f).patch.annual_output.length, 180);

// Execute the approved-owner action, including its real patch construction.
let captured;
let allowed = true;
let approved = true;
const revalidated = [];
const dictionary = loadPortalDictionary();
const owner = load('app/supplier/portal/profile/profile-actions.ts', {
  'next/cache': { revalidatePath: (path) => revalidated.push(path) },
  '@/lib/ai/supplier-translation-service': { ensureSupplierProfileEnglish: async () => ({ status: 'unconfigured' }) },
  '@/lib/i18n/server': { getPortalMessages: async () => ({ m: dictionary.en }) },
  '@/lib/supplier-portal/onboarding': { portalApproved: () => approved },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => allowed ? {
    supplier: { id: 'supplier-test', slug: 'supplier-test', ...legacy }, user: { id: 'owner-test', email: 'test@example.com' },
    store: { updateSupplier: async (id, value) => { assert.equal(id, 'supplier-test'); captured = value; }, addAuditLog: async () => {} },
  } : null },
});
f.set('annual_output', '96 metric tons/year');
assert.equal((await owner.saveSupplierProfileEditAction(f)).ok, true);
assert.equal(captured.annual_output, '96 metric tons/year');
for (const field of ['moq_text', 'capacity_per_month']) assert.ok(!Object.hasOwn(captured, field));
assert.ok(revalidated.includes('/suppliers/supplier-test'));
f.delete('annual_output');
assert.equal((await owner.saveSupplierProfileEditAction(f)).ok, true);
assert.ok(!Object.hasOwn(captured, 'annual_output'));
f.set('annual_output', '');
assert.equal((await owner.saveSupplierProfileEditAction(f)).ok, true);
assert.equal(captured.annual_output, null);
allowed = false; captured = undefined;
assert.equal((await owner.saveSupplierProfileEditAction(f)).ok, false);
assert.equal(captured, undefined);
allowed = true; approved = false;
assert.equal((await owner.saveSupplierProfileEditAction(f)).ok, false);
assert.equal(captured, undefined);

for (const file of ['app/supplier/portal/supplier-profile-form.tsx', 'app/supplier/portal/profile/profile-edit-form.tsx']) {
  const form = read(file);
  assert.match(form, /name="annual_output"/);
  assert.match(form, /defaultValue=\{supplier\??\.annual_output/);
  assert.match(form, /annualOutputPlaceholder/);
  assert.doesNotMatch(form, /name="(?:moq_text|capacity_per_month)"/);
}
assert.match(read('app/api/supplier-portal/profile/route.ts'), /annual_output: patch\.annual_output/);
const profile = read('app/supplier/portal/profile/page.tsx');
assert.match(profile, /f\.annualOutput\} value=\{supplier\.annual_output/);
assert.doesNotMatch(profile, /value=\{supplier\.(?:moq_text|capacity_per_month)\}/);
const storefront = read('components/public/supplier-storefront.tsx');
assert.match(storefront, /"Annual revenue" : "Monthly capacity"/);
assert.match(storefront, /supplierAnnualOutputDisplay\(s\)/);
assert.match(read('components/supplier-form.tsx'), /set\("annual_output", e\.target\.value\)/);
assert.match(read('app/actions.ts'), /annual_output: str\(raw\.annual_output\)/);
for (const lang of ['en', 'vi']) {
  assert.equal(dictionary[lang].onboarding.publicPage.labels.annualOutput, lang === 'en' ? 'Annual revenue' : 'Doanh thu hàng năm');
  assert.equal(dictionary[lang].profile.edit.labels.annualOutput, dictionary[lang].onboarding.publicPage.labels.annualOutput);
}
const migration = read('supabase/migrations/20261108_supplier_annual_output.sql');
assert.match(migration, /add column if not exists annual_output text/i);
assert.match(migration, /s\.updated_at,\s*s\.annual_output\s*from/i, 'View column is appended, not inserted into existing column order');
assert.doesNotMatch(migration, /\b(?:update|delete|drop|rename)\b\s+(?:public\.)?suppliers/i);
assert.match(migration, /notify pgrst, 'reload schema'/i);
assert.match(read('supabase/schema.sql'), /add column if not exists annual_output text/i);
console.log('✅ Annual output: onboarding/create mapping, owner edit, no legacy clearing, auth guards, forms, CRM, labels and additive migration.');
