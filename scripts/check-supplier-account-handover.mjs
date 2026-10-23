// node scripts/check-supplier-account-handover.mjs — Vexim nạp hộ nhà cung cấp,
// rồi bàn giao tài khoản bằng cách đổi email đăng nhập và mật khẩu, không gửi thư xác nhận.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, mocks) {
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    module: mod, exports: mod.exports, console, Date, process, JSON, Object, Array, String, Boolean, Promise, Error, RegExp, Map, Set,
    require: (id) => {
      if (id === "server-only") return {};
      assert.ok(id in mocks, `${file}: unexpected import ${id}`);
      return mocks[id];
    },
  }, { filename: file });
  return mod.exports;
}

const { handOverSupplierAccount } = load("../lib/supplier-portal/handover-account.ts", { "@/lib/types": {} });

const SUPPLIER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_SUPPLIER_ID = "22222222-2222-2222-2222-222222222222";

function makeStore(users) {
  const state = { users: users.map((u) => ({ ...u })), updates: [] };
  return {
    state,
    async getUserBySupplierId(id) { return state.users.find((u) => u.supplier_id === id) ?? null; },
    async getUserByEmail(email) { return state.users.find((u) => u.email === email.trim().toLowerCase()) ?? null; },
    async updateUser(id, patch) {
      const row = state.users.find((u) => u.id === id);
      if (!row) throw new Error("Không tìm thấy tài khoản.");
      // app_users có ràng buộc email duy nhất; mô phỏng để bắt lỗi thứ tự cập nhật.
      if (patch.email && state.users.some((u) => u.id !== id && u.email === patch.email)) throw new Error("duplicate key value violates unique constraint");
      Object.assign(row, patch);
      state.updates.push({ id, patch });
      return row;
    },
  };
}

const account = (over = {}) => ({
  id: "u-supplier", email: "tam@veximtrade.local", name: "Anh A", role: "supplier",
  supplier_id: SUPPLIER_ID, is_active: true, auth_provider: "supabase", password_hash: null, ...over,
});
const deps = (over = {}) => ({
  validatePassword: (pw) => (pw.length < 8 || !/[a-zA-Z]/.test(pw) || !/\d/.test(pw) ? "Mật khẩu cần 8–128 ký tự, gồm cả chữ và số." : null),
  handOverAuthUser: async () => true,
  ...over,
});

/* 1. Bàn giao bình thường: đổi email, đặt mật khẩu mới, giữ nguyên tài khoản. */
{
  const store = makeStore([account()]);
  const authCalls = [];
  const result = await handOverSupplierAccount(store, SUPPLIER_ID,
    { email: "  KeToan@CongTy.vn ", password: "matkhau2026" },
    deps({ handOverAuthUser: async (current, next) => { authCalls.push({ current, next }); return true; } }));
  assert.equal(result.changedEmail, true);
  assert.equal(result.previousEmail, "tam@veximtrade.local");
  assert.equal(result.user.email, "ketoan@congty.vn", "Email được chuẩn hoá chữ thường và cắt khoảng trắng");
  assert.equal(result.user.id, "u-supplier", "Cùng một tài khoản, không tạo bản ghi mới");
  assert.equal(result.user.supplier_id, SUPPLIER_ID, "Hồ sơ nhà cung cấp vẫn gắn nguyên");
  // So bằng JSON: object đi qua vm nên không cùng realm với deepEqual.
  assert.equal(JSON.stringify(authCalls),
    JSON.stringify([{ current: "tam@veximtrade.local", next: { email: "ketoan@congty.vn", password: "matkhau2026" } }]),
    "Supabase Auth nhận email cũ để tìm user, rồi đổi sang email mới kèm mật khẩu mới");
  assert.equal(store.state.users.length, 1, "Không đẻ thêm tài khoản");
}

/* 2. Chỉ đổi mật khẩu (email đã đúng): không ghi lại email. */
{
  const store = makeStore([account({ email: "ketoan@congty.vn" })]);
  const authCalls = [];
  const result = await handOverSupplierAccount(store, SUPPLIER_ID,
    { email: "ketoan@congty.vn", password: "matkhau2026" },
    deps({ handOverAuthUser: async (current, next) => { authCalls.push({ current, next }); return true; } }));
  assert.equal(result.changedEmail, false);
  assert.equal(store.state.updates.length, 0, "Email không đổi thì không ghi vào app_users");
  assert.equal(authCalls[0].next.email, "ketoan@congty.vn");
}

/* 3. Chưa có tài khoản: phải cấp trước. */
{
  const store = makeStore([]);
  await assert.rejects(() => handOverSupplierAccount(store, SUPPLIER_ID, { email: "a@b.vn", password: "matkhau2026" }, deps()),
    /Cấp tài khoản trước/);
}

/* 4. Email đã thuộc tài khoản nhà cung cấp khác, hoặc tài khoản nội bộ: chặn trước khi gọi Auth. */
{
  for (const [existing, pattern] of [
    [account({ id: "u-other", email: "khac@congty.vn", supplier_id: OTHER_SUPPLIER_ID }), /đã gắn với một tài khoản nhà cung cấp khác/],
    [{ id: "u-staff", email: "sale@veximtrade.com", role: "sale", supplier_id: null, is_active: true }, /tài khoản nội bộ/],
  ]) {
    const store = makeStore([account(), existing]);
    let authCalled = false;
    await assert.rejects(() => handOverSupplierAccount(store, SUPPLIER_ID,
      { email: existing.email, password: "matkhau2026" },
      deps({ handOverAuthUser: async () => { authCalled = true; return true; } })), pattern);
    assert.equal(authCalled, false, "Không đụng tới Supabase Auth khi email bị từ chối");
    assert.equal(store.state.updates.length, 0, "Không đổi gì trong app_users");
  }
}

/* 5. Mật khẩu yếu: chặn, không đổi email. */
{
  const store = makeStore([account()]);
  let authCalled = false;
  await assert.rejects(() => handOverSupplierAccount(store, SUPPLIER_ID,
    { email: "ketoan@congty.vn", password: "ngan" },
    deps({ handOverAuthUser: async () => { authCalled = true; return true; } })), /Mật khẩu cần 8–128/);
  assert.equal(authCalled, false);
  assert.equal(store.state.updates.length, 0);
}

/* 6. Supabase Auth từ chối: trả email cũ, không để app_users lệch với Auth. */
{
  const store = makeStore([account()]);
  await assert.rejects(() => handOverSupplierAccount(store, SUPPLIER_ID,
    { email: "ketoan@congty.vn", password: "matkhau2026" },
    deps({ handOverAuthUser: async () => false })), /Email đã giữ nguyên, mật khẩu chưa đổi/);
  assert.equal(store.state.users[0].email, "tam@veximtrade.local", "Email được trả về như trước");
  assert.deepEqual(store.state.updates.map((u) => u.patch.email), ["ketoan@congty.vn", "tam@veximtrade.local"],
    "Chỉ ghi email mới rồi hoàn lại email cũ");
}

/* 7. Tài khoản bị khoá hoặc không phải tài khoản nhà cung cấp: không bàn giao. */
{
  const locked = makeStore([account({ is_active: false })]);
  await assert.rejects(() => handOverSupplierAccount(locked, SUPPLIER_ID, { email: "a@b.vn", password: "matkhau2026" }, deps()),
    /đang bị tạm khoá/);
  const wrongRole = makeStore([account({ role: "viewer" })]);
  await assert.rejects(() => handOverSupplierAccount(wrongRole, SUPPLIER_ID, { email: "a@b.vn", password: "matkhau2026" }, deps()),
    /không phải tài khoản nhà cung cấp/);
}

/* ---------------- Bề mặt: action, trang CRM và đường Supabase Auth ---------------- */

const action = fs.readFileSync(new URL("../app/crm/suppliers/[slug]/account-actions.ts", import.meta.url), "utf8");
assert.match(action, /export async function handOverSupplierAccountAction/, "Có action bàn giao riêng");
assert.match(action, /guard\("suppliers\.manage"\)/, "Action bàn giao kiểm quyền quản lý NCC");
assert.match(action, /session\.role !== "admin" && session\.role !== "sourcing"/, "Chỉ quản trị và thu mua được bàn giao");
assert.match(action, /supplier\.account_handed_over/, "Bàn giao phải ghi nhật ký kiểm toán");
assert.doesNotMatch(action, /password:\s*password\b[\s\S]{0,120}addAuditLog/, "Không ghi mật khẩu vào nhật ký");

const page = fs.readFileSync(new URL("../app/crm/suppliers/[slug]/page.tsx", import.meta.url), "utf8");
assert.match(page, /canHandOver=/, "Trang chi tiết NCC truyền quyền bàn giao");
const controls = fs.readFileSync(new URL("../app/crm/suppliers/[slug]/account-controls.tsx", import.meta.url), "utf8");
assert.match(controls, /Bàn giao cho doanh nghiệp/, "Có mục bàn giao trong thẻ tài khoản");
assert.match(controls, /name="new_email"/, "Form bàn giao nhận email mới");
assert.match(controls, /name="new_password"/, "Form bàn giao nhận mật khẩu mới");
assert.match(controls, /Không có thư xác nhận nào được gửi/, "Nói rõ không gửi thư xác nhận");

const auth = fs.readFileSync(new URL("../lib/auth/authenticate.ts", import.meta.url), "utf8");
const handOverBlock = auth.slice(auth.indexOf("export async function handOverSupabaseAccount"));
assert.match(handOverBlock, /updateUserById/, "Bàn giao đổi tài khoản Supabase Auth hiện có, không tạo user mới");
assert.match(handOverBlock, /email_confirm: true/, "Email mới được coi là đã xác nhận nên không có thư xác nhận");
assert.doesNotMatch(handOverBlock, /signUp\(|inviteUserByEmail|generateLink/, "Không gửi thư hay tạo link xác nhận");

console.log("✅ Handover: staff load suppliers, then hand the account over by changing email and password without a confirmation email, same record and full rollback.");
