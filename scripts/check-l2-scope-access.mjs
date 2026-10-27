// Real server access helpers, with mocked identity/store. No production credentials.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: (id) => {
    if (id === 'server-only') return {};
    assert.ok(id in mocks, `Unexpected ${id}`); return mocks[id];
  } }, { filename: path });
  return mod.exports;
}
const scope = load('lib/l2-scope.ts');
let supplier = { id: 'sup', supplier_type: 'trading', onboarding_status: 'approved' };
let submission = { id: 'sub', supplier_id: 'sup', target_level: 2, l2_scope: 'partner_contract' };
let user = { id: 'user', supplier_id: 'sup', email: 'owner@example.com' };
let session = { uid: 'staff', email: 'staff@example.com', role: 'reviewer' };
const store = { getSupplier: async () => supplier };
const access = load('lib/supplier-portal/submission-access.ts', {
  '@/lib/db': { getStore: () => store },
  '@/lib/auth/session': { getSession: async () => session },
  '@/lib/auth/permissions': { hasPermission: (role, permission) => role === 'reviewer' && ['verifications.view', 'media.internal'].includes(permission) },
  '@/lib/l2-scope': scope,
  './onboarding': { portalApproved: (value) => value.onboarding_status === 'approved' },
  './access': { supplierAccountAccess: async () => user ? { user, store } : null },
  '@/lib/verification-submission-service': { loadSubmissionBundle: async () => ({ submission, items: [], links: [] }) },
});
assert.ok(await access.supplierSubmissionAccess('sub'));
submission = { ...submission, l2_scope: null };
assert.equal(await access.supplierSubmissionAccess('sub'), null, 'Trader cannot act on old factory scope');
assert.ok(await access.staffSubmissionAccess('sub'), 'Authorized staff can still inspect history');
submission = { ...submission, l2_scope: 'partner_contract' };
supplier = { ...supplier, supplier_type: null };
assert.equal(await access.supplierSubmissionAccess('sub'), null, 'Unknown type is not silently assigned a scope');
supplier = { ...supplier, supplier_type: 'manufacturer' };
assert.equal(await access.supplierSubmissionAccess('sub'), null, 'Changed type cannot act on old partner scope');
supplier = { ...supplier, supplier_type: 'trading' }; user = { ...user, supplier_id: 'other' };
assert.equal(await access.supplierSubmissionAccess('sub'), null, 'Another supplier cannot open the contract');
user = { ...user, supplier_id: 'sup' }; supplier = { ...supplier, onboarding_status: 'pending' };
assert.equal(await access.supplierSubmissionAccess('sub'), null, 'Portal must be approved');
session = { ...session, role: 'sale' };
assert.equal(await access.staffSubmissionAccess('sub'), null, 'Staff without internal-media permission cannot see history');
console.log('✅ L2 scope ACL: only the matching supplier and authorized staff; old scope stays inspectable.');
