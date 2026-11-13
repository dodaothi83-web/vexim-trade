// node --experimental-strip-types --no-warnings scripts/check-supplier-password-reset.mjs
// Quản trị đặt mật khẩu mới cho nhà cung cấp quên mật khẩu: đổi thẳng bên Supabase Auth,
// không tạo mật khẩu nội bộ, báo lỗi khi Supabase không đổi được, có nhật ký, cần quyền.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const users = new Map([
  ['sup', { id: 'sup', email: 'supply1@gmail.com', role: 'supplier', is_active: true, password_hash: null }],
  ['locked', { id: 'locked', email: 'locked@gmail.com', role: 'supplier', is_active: false, password_hash: null }],
  ['staff', { id: 'staff', email: 'lan@veximtrade.com', role: 'sale', is_active: true, password_hash: 'old' }],
]);
const calls = { supabase: [], updates: [], audit: [] };
let supabaseOk = true, gate = null;
const store = {
  getUser: async (id) => users.get(id) ?? null,
  updateUser: async (id, patch) => { calls.updates.push([id, patch]); },
  addAuditLog: async (entry) => { calls.audit.push(entry); return entry; },
};
const out = ts.transpileModule(fs.readFileSync(new URL('../app/auth-actions.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mocks = {
  'next/cache': { revalidatePath() {} }, 'next/navigation': { redirect() {} }, 'next/headers': { headers: async () => new Map() },
  '@/lib/db': { getStore: () => store },
  '@/lib/auth/abuse-protection': { protectPasswordAuth: async () => ({ ok: true }) },
  '@/lib/auth/authenticate': { authenticate() {}, createSupabaseUser() {}, describeAppUsersError: () => null, isMissingUsersTable: () => false,
    updateSupabasePassword: async (email, password) => { calls.supabase.push([email, password]); return supabaseOk; } },
  '@/lib/auth/session': { endSession() {}, startSession() {}, getSession: async () => ({ uid: 'admin', email: 'admin@veximtrade.com' }), guard: async () => gate },
  '@/lib/auth/password': { hashPassword: async (p) => `hash:${p}`, verifyPassword: async () => true,
    passwordProblem: (p) => (p.length < 8 || !/\d/.test(p) || !/[a-z]/i.test(p) ? 'Mật khẩu cần ít nhất 8 ký tự, gồm cả chữ và số.' : null) },
  '@/lib/auth/permissions': { ROLES: [] }, '@/lib/config': { MAIL_DOMAIN: 'veximtrade.com' },
  '@/lib/email/sender': { checkSenderAddress() {}, senderAddressFor() {} },
};
const module = { exports: {} };
vm.runInNewContext(out, { module, exports: module.exports, console: { ...console, error() {} }, Promise,
  require: (id) => { assert.ok(id in mocks, `Unexpected ${id}`); return mocks[id]; } });
const { resetUserPasswordAction } = module.exports;

let res = await resetUserPasswordAction('sup', 'NewPass2026', 'NewPass2026');
assert.equal(res.ok, true, res.message);
assert.deepEqual(calls.supabase.at(-1), ['supply1@gmail.com', 'NewPass2026'], 'Đổi mật khẩu bên Supabase Auth');
assert.equal(calls.updates.length, 0, 'Không tạo mật khẩu nội bộ cho nhà cung cấp');
assert.equal(calls.audit.at(-1).action, 'user.password_reset');
assert.doesNotMatch(JSON.stringify(calls.audit), /NewPass2026/, 'Nhật ký không chứa mật khẩu');

supabaseOk = false;
res = await resetUserPasswordAction('sup', 'NewPass2026', 'NewPass2026');
assert.equal(res.ok, false, 'Supabase không đổi được thì không báo thành công');
supabaseOk = true;

assert.equal((await resetUserPasswordAction('locked', 'NewPass2026', 'NewPass2026')).ok, false, 'Tài khoản khoá không đổi được');
assert.equal((await resetUserPasswordAction('sup', 'short', 'short')).ok, false, 'Mật khẩu yếu bị từ chối');
gate = { ok: false, message: 'Không có quyền' };
assert.equal((await resetUserPasswordAction('sup', 'NewPass2026', 'NewPass2026')).ok, false, 'Cần quyền quản lý người dùng');
gate = null;

const before = calls.updates.length;
assert.equal((await resetUserPasswordAction('staff', 'NewPass2026', 'NewPass2026')).ok, true);
assert.equal(calls.updates.length, before + 1, 'Nhân sự Vexim vẫn đổi cả mật khẩu nội bộ như trước');

const ui = fs.readFileSync(new URL('../components/user-manager.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(ui, /user\.role !== "supplier" && <Button/, 'Nút Đặt lại mật khẩu hiện cho cả tài khoản nhà cung cấp');
console.log('✅ Đặt lại mật khẩu nhà cung cấp: đổi bên Supabase, không tạo mật khẩu nội bộ, báo lỗi thật, cần quyền, có nhật ký.');
