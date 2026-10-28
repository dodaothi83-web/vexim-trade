// Runtime tests: role matrix, account-management actions and stale session rejection.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';

function load(file, mocks = {}, extra = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, { exports, require: (id) => {
    if (id === 'server-only') return {};
    if (id === 'node:crypto') return crypto;
    assert.ok(id in mocks, `Missing test mock ${id}`); return mocks[id];
  }, console, process, Buffer, Date, ...extra }, { filename: file });
  return exports;
}
const permissions = load('lib/auth/permissions.ts');
for (const perm of ['suppliers.manage', 'suppliers.publish', 'products.manage', 'media.manage', 'verifications.inspect', 'verifications.approve']) {
  assert.equal(permissions.hasPermission('admin', perm), true, `admin ${perm}`);
  assert.equal(permissions.hasPermission('reviewer', perm), true, `reviewer ${perm}`);
  assert.equal(permissions.hasPermission('sourcing', perm), false, `sourcing ${perm}`);
  assert.equal(permissions.hasPermission('sale', perm), false, `sale ${perm}`);
}
for (const perm of ['users.manage', 'suppliers.delete', 'products.delete']) {
  assert.equal(permissions.hasPermission('reviewer', perm), false, `reviewer must not hold ${perm}`);
  assert.equal(permissions.hasPermission('admin', perm), true, `admin must hold ${perm}`);
}
let current = { id: 'target', role: 'sourcing', is_active: false, email: 'staff@example.com' };
const store = { getUser: async () => current, getUserByEmail: async () => null,
  listUsers: async () => [], updateUser: async (_id, patch) => { current = { ...current, ...patch }; },
  createUser: async () => { throw new Error('must not create disabled role'); } };
const actions = load('app/auth-actions.ts', {
  'next/cache': { revalidatePath() {} }, 'next/navigation': { redirect() {} }, 'next/headers': { headers: async () => ({}) },
  '@/lib/db': { getStore: () => store }, '@/lib/auth/abuse-protection': {}, '@/lib/auth/authenticate': {},
  '@/lib/auth/session': { guard: async () => null, getSession: async () => ({ uid: 'admin', role: 'admin' }) },
  '@/lib/auth/password': {}, '@/lib/auth/permissions': permissions, '@/lib/config': {}, '@/lib/email/sender': {},
});
assert.equal((await actions.createUserAction({ email: 'staff@example.com', role: 'sourcing', password: 'A12345678' })).ok, false);
assert.equal((await actions.updateUserAction('target', { is_active: true })).ok, false);
current = { ...current, role: 'viewer' };
assert.equal((await actions.updateUserAction('target', { role: 'sourcing' })).ok, false);
current = { ...current, role: 'sourcing', is_active: false };
assert.equal((await actions.updateUserAction('target', { role: 'reviewer' })).ok, true, 'admin may reassign a legacy account');
assert.equal(current.is_active, false, 'reassignment never silently unlocks the account');

let token = '';
let dbError = false;
let dbUser = { id: 'target', role: 'sourcing', is_active: true, email: 'staff@example.com', name: 'Staff' };
const session = load('lib/auth/session.ts', {
  'next/headers': { cookies: async () => ({ get: () => ({ value: token }) }), headers: async () => ({}) },
  'next/navigation': { redirect() {} }, '@/lib/auth/secret': { getAuthSecret: () => 'test-secret' },
  '@/lib/auth/permissions': permissions,
  '@/lib/db': { getStore: () => ({ getUser: async () => { if (dbError) throw new Error('network'); return dbUser; } }) },
  '@/lib/auth/authenticate': { describeAppUsersError: () => null, isMissingUsersTable: () => false },
});
token = session.createSessionToken({ uid: 'target', email: 'staff@example.com', name: 'Staff', role: 'sourcing', via: 'local' });
assert.equal((await session.lookupSession()).miss, 'locked');
dbError = true;
assert.equal((await session.lookupSession()).miss, 'locked', 'old sourcing cookie cannot use network fallback');
dbError = false;
token = session.createSessionToken({ uid: 'target', email: 'staff@example.com', name: 'Staff', role: 'reviewer', via: 'local' });
assert.equal((await session.lookupSession()).miss, 'locked', 'DB role change takes effect for an existing session');
dbError = true;
assert.equal((await session.lookupSession()).miss, 'unreadable', 'a stale previously privileged token fails closed when account state cannot be checked');
dbError = false;
dbUser = { ...dbUser, role: 'reviewer', is_active: true };
assert.equal((await session.lookupSession()).session.role, 'reviewer');
console.log('✅ Review-lead roles: least-privilege matrix, disabled assignment/reactivation and stale sourcing sessions.');
