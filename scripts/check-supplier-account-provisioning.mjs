// node scripts/check-supplier-account-provisioning.mjs — nhân viên cấp tài khoản cổng NCC
// cho hồ sơ tạo sẵn trong CRM: tạo mới bằng mật khẩu tạm, gắn tài khoản đã tự đăng ký,
// chặn trùng tài khoản và tài khoản nội bộ, huỷ bản ghi khi Supabase Auth tạo không thành công.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, mocks) {
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    module: mod, exports: mod.exports, console, Date, process, JSON, Object, Array, String, Boolean, Promise, Error, RegExp, Map, Set,
    require: (id) => {
      if (id === 'server-only') return {};
      assert.ok(id in mocks, `${file}: unexpected import ${id}`);
      return mocks[id];
    },
  }, { filename: file });
  return mod.exports;
}

const { provisionSupplierAccount } = load('../lib/supplier-portal/provision-account.ts', { '@/lib/types': {} });

const SUPPLIER_ID = '11111111-1111-1111-1111-111111111111';
function makeStore({ supplier = { id: SUPPLIER_ID, name: 'Công ty A', contact_name: 'Anh A' }, users = [] } = {}) {
  const state = { users: [...users], created: [], deleted: [] };
  return {
    state,
    async getSupplier(id) { return id === SUPPLIER_ID ? supplier : null; },
    async getUserBySupplierId(id) { return state.users.find((u) => u.supplier_id === id) ?? null; },
    async getUserByEmail(email) { return state.users.find((u) => u.email === email.trim().toLowerCase()) ?? null; },
    async createUser(input) {
      if (state.users.some((u) => u.email === input.email)) throw new Error('Email này đã có tài khoản.');
      const row = { ...input, id: `user-${state.users.length + 1}`, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', last_login_at: null };
      state.users.push(row); state.created.push(row);
      return row;
    },
    async deleteUser(id) { state.deleted.push(id); state.users = state.users.filter((u) => u.id !== id); },
    async claimSupplierForUser(userId, supplierId) {
      const user = state.users.find((u) => u.id === userId);
      if (!user || user.role !== 'supplier' || !user.is_active || user.supplier_id) return false;
      user.supplier_id = supplierId;
      return true;
    },
  };
}
const deps = {
  validatePassword: (pw) => (pw.length < 8 ? 'Mật khẩu cần ít nhất 8 ký tự.' : null),
  createAuthUser: async () => 'supabase-id-1',
};
const user = (over) => ({ id: 'u-x', email: 'x@example.com', name: null, role: 'supplier', supplier_id: null, is_active: true, auth_provider: 'supabase', password_hash: null, ...over });

// Tạo mới: gắn thẳng supplier_id, không giữ mật khẩu nội bộ, vai trò supplier.
{
  const store = makeStore();
  const result = await provisionSupplierAccount(store, SUPPLIER_ID, { email: ' Owner@Example.com ', tempSecret: '<MASKED_SECRET_001>' }, deps);
  assert.equal(result.mode, 'created');
  assert.equal(result.user.email, 'owner@example.com');
  assert.equal(result.user.supplier_id, SUPPLIER_ID);
  assert.equal(result.user.role, 'supplier');
  assert.equal(result.user.password_hash, null);
  assert.equal(result.user.name, 'Anh A', 'mặc định lấy tên người liên hệ trong hồ sơ');
}

// Hồ sơ đã có tài khoản thì không cấp thêm tài khoản thứ hai.
{
  const store = makeStore({ users: [user({ supplier_id: SUPPLIER_ID })] });
  await assert.rejects(
    provisionSupplierAccount(store, SUPPLIER_ID, { email: 'moi@example.com', tempSecret: '<MASKED_SECRET_001>' }, deps),
    /đã có tài khoản/);
}

// Email đã tự đăng ký nhưng chưa gắn doanh nghiệp: gắn vào hồ sơ, không cần mật khẩu tạm.
{
  const store = makeStore({ users: [user({ id: 'u-self', email: 'self@example.com' })] });
  const result = await provisionSupplierAccount(store, SUPPLIER_ID, { email: 'self@example.com' }, deps);
  assert.equal(result.mode, 'linked');
  assert.equal(result.user.supplier_id, SUPPLIER_ID);
  assert.equal(store.state.created.length, 0, 'gắn tài khoản có sẵn thì không tạo tài khoản mới');
}

// Các trường hợp phải chặn: tài khoản nội bộ, đã gắn NCC khác, đang tạm khoá.
{
  const store = makeStore({ users: [user({ id: 'u-admin', email: 'admin@veximglobal.com', role: 'admin' })] });
  await assert.rejects(
    provisionSupplierAccount(store, SUPPLIER_ID, { email: 'admin@veximglobal.com', tempSecret: '<MASKED_SECRET_001>' }, deps),
    /tài khoản nội bộ/);
}
{
  const store = makeStore({ users: [user({ id: 'u-other', email: 'other@example.com', supplier_id: '22222222-2222-2222-2222-222222222222' })] });
  await assert.rejects(
    provisionSupplierAccount(store, SUPPLIER_ID, { email: 'other@example.com' }, deps),
    /một nhà cung cấp khác/);
}
{
  const store = makeStore({ users: [user({ id: 'u-locked', email: 'locked@example.com', is_active: false })] });
  await assert.rejects(
    provisionSupplierAccount(store, SUPPLIER_ID, { email: 'locked@example.com' }, deps),
    /tạm khoá/);
}

// Tạo tài khoản mới mà thiếu mật khẩu tạm hợp lệ thì chặn trước khi tạo bất cứ thứ gì.
{
  const store = makeStore();
  await assert.rejects(
    provisionSupplierAccount(store, SUPPLIER_ID, { email: 'new@example.com', tempSecret: 'ngan' }, deps),
    /mật khẩu tạm/);
  assert.equal(store.state.users.length, 0);
}

// Supabase Auth không tạo được thì huỷ bản ghi nội bộ vừa tạo, không để lại tài khoản không đăng nhập được.
{
  const store = makeStore();
  await assert.rejects(
    provisionSupplierAccount(store, SUPPLIER_ID, { email: 'fail@example.com', tempSecret: '<MASKED_SECRET_001>' },
      { ...deps, createAuthUser: async () => null }),
    /Supabase Auth/);
  assert.equal(store.state.users.length, 0, 'phải huỷ bản ghi nội bộ khi Supabase Auth thất bại');
  assert.equal(store.state.deleted.length, 1);
}

// Bề mặt CRM: card tài khoản trên trang chi tiết, action có kiểm quyền và ghi nhật ký.
const page = fs.readFileSync(new URL('../app/crm/suppliers/[slug]/page.tsx', import.meta.url), 'utf8');
assert.match(page, /Tài khoản cổng nhà cung cấp/, 'trang chi tiết NCC phải có khu vực tài khoản');
assert.match(page, /getUserBySupplierId/, 'trang chi tiết phải đọc tài khoản đang gắn với hồ sơ');
assert.match(page, /SupplierAccountControls/, 'trang chi tiết phải có điều khiển cấp tài khoản');

const action = fs.readFileSync(new URL('../app/crm/suppliers/[slug]/account-actions.ts', import.meta.url), 'utf8');
assert.match(action, /guard\("suppliers\.manage"\)/, 'action cấp tài khoản phải kiểm quyền quản lý NCC');
assert.match(action, /session\.role !== "admin" && session\.role !== "sourcing"/, 'chỉ quản trị và thu mua được cấp tài khoản');
assert.match(action, /supplier\.account_provisioned/, 'tạo mới phải ghi nhật ký kiểm toán');
assert.match(action, /supplier\.account_linked/, 'gắn tài khoản có sẵn phải ghi nhật ký kiểm toán');

const onboardingAction = fs.readFileSync(new URL('../app/crm/suppliers/[slug]/onboarding-actions.ts', import.meta.url), 'utf8');
assert.match(onboardingAction, /getUserBySupplierId/, 'duyệt mở cổng phải tra tài khoản theo hồ sơ, không theo email liên hệ');

const usersPage = fs.readFileSync(new URL('../app/auth-actions.ts', import.meta.url), 'utf8');
assert.match(usersPage, /Tài khoản cổng nhà cung cấp trong trang chi tiết nhà cung cấp/, 'luồng tạo tài khoản nội bộ phải trỏ về đúng nơi cấp tài khoản NCC');

console.log('✅ Supplier account provisioning: create with temp password, link self-registered, duplicate/internal guards, Supabase rollback, CRM surface.');
