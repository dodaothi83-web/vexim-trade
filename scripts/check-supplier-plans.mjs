import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const plans = await import("../lib/supplier-plans.ts");
const now = new Date("2026-11-15T00:00:00Z");

// 1. Số sản phẩm và quyền theo gói.
assert.equal(plans.SUPPLIER_PLAN_RULES.basic.maxProducts, 5);
assert.equal(plans.SUPPLIER_PLAN_RULES.premium.maxProducts, 20);
assert.equal(plans.SUPPLIER_PLAN_RULES.pro.maxProducts, 50);
assert.equal(plans.SUPPLIER_PLAN_RULES.basic.video, false, "Basic không có video");
assert.equal(plans.SUPPLIER_PLAN_RULES.premium.video && plans.SUPPLIER_PLAN_RULES.pro.video, true);

// 2. Gói hiệu lực: thiếu cột, giá trị lạ, hết hạn đều là Basic.
assert.equal(plans.effectiveSupplierPlan({}, now), "basic", "Chưa chạy migration thì là Basic");
assert.equal(plans.effectiveSupplierPlan({ plan: "gold" }, now), "basic");
assert.equal(plans.effectiveSupplierPlan({ plan: "pro", plan_expires_at: null }, now), "pro", "Không ngày hết hạn thì giữ gói");
assert.equal(plans.effectiveSupplierPlan({ plan: "premium", plan_expires_at: "2026-12-01T00:00:00Z" }, now), "premium");
assert.equal(plans.effectiveSupplierPlan({ plan: "premium", plan_expires_at: "2026-11-01T00:00:00Z" }, now), "basic", "Hết hạn về Basic");

// 3. Còn chỗ thêm sản phẩm.
assert.equal(plans.canAddSupplierProduct({ plan: "basic" }, 4, now), true);
assert.equal(plans.canAddSupplierProduct({ plan: "basic" }, 5, now), false, "Basic đủ 5 thì chặn");
assert.equal(plans.canAddSupplierProduct({ plan: "premium" }, 5, now), true);
assert.equal(plans.canAddSupplierProduct({ plan: "pro", plan_expires_at: "2026-01-01T00:00:00Z" }, 5, now), false, "Pro hết hạn tính như Basic");

// 4. Nhận ra lỗi trigger CSDL.
assert.equal(plans.isProductLimitError({ message: "supplier_product_limit_reached: 5 of 5", code: "P0001" }), true);
assert.equal(plans.isProductLimitError(new Error("supplier_product_limit_reached: 20 of 20")), true);
assert.equal(plans.isProductLimitError(new Error("duplicate key")), false);

// 5. CSDL khớp mã nguồn và chặn mọi đường tạo sản phẩm.
const migration = read("supabase/migrations/20261124_supplier_plans.sql");
assert.match(migration, /when p_plan = 'pro' then 50/);
assert.match(migration, /when p_plan = 'premium' then 20/);
assert.match(migration, /else 5/);
assert.match(migration, /p_expires_at <= now\(\) then 5/, "Hết hạn về 5 sản phẩm");
assert.match(migration, /before insert on public\.supplier_products/, "Trigger chặn khi tạo");
assert.match(migration, /for update/, "Khoá dòng nhà cung cấp chống tạo đồng thời");
assert.match(migration, /check \(plan in \('basic', 'premium', 'pro'\)\)/);
assert.doesNotMatch(migration, /\nimmutable\n/, "Hàm dùng now() không được immutable");

// 6. Ứng dụng báo trước ở cả hai đường tạo, và trang tạo mới chặn khi hết chỗ.
const portal = read("app/supplier/portal/product-actions.ts");
assert.match(portal, /canAddSupplierProduct\(access\.supplier,/);
assert.match(portal, /isProductLimitError\(error\)/);
const crm = read("app/actions.ts");
assert.match(crm, /canAddSupplierProduct\(planSupplier, count\)/);
assert.match(crm, /isProductLimitError\(err\)/);
assert.match(read("app/supplier/portal/products/new/page.tsx"), /canAddSupplierProduct\(access\.supplier,[\s\S]*redirect\("\/supplier\/portal\/products"\)/);

// 7. Chỉ người có quyền quản lý nhà cung cấp mới đổi gói, và có audit.
const action = read("app/crm/suppliers/[slug]/plan-actions.ts");
assert.match(action, /guard\("suppliers\.manage"\)/);
assert.match(action, /action: "supplier\.plan_changed"/);
assert.match(action, /isSupplierPlan\(plan\)/);

// 8. Đổi gói phải báo nhà cung cấp: hành động thật chạy với kho giả, đếm thư gửi đi.
{
  const ts = (await import("typescript")).default;
  const vm = await import("node:vm");
  const compile = (file, mocks) => {
    const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports = {};
    vm.runInNewContext(code, { exports, console, Date, Promise, String, Number, Set, FormData,
      require: (key) => { if (!(key in mocks)) throw new Error(`Unexpected import ${key}`); return mocks[key]; } });
    return exports;
  };
  const mails = [];
  let supplier = { id: "s1", plan: "basic", plan_expires_at: null };
  const store = {
    getSupplier: async () => supplier,
    updateSupplier: async (_id, patch) => { supplier = { ...supplier, ...patch }; },
    addAuditLog: async () => {},
    listUsers: async () => [
      { email: "Owner@Supplier.vn", role: "supplier", supplier_id: "s1", is_active: true },
      { email: "other@supplier.vn", role: "supplier", supplier_id: "s2", is_active: true },
      { email: "old@supplier.vn", role: "supplier", supplier_id: "s1", is_active: false },
    ],
  };
  const notify = compile("lib/supplier-portal/notify.ts", {
    "server-only": {}, "@/lib/config": { SERVICE_FROM_ADDRESS: "Vexim <service@vexim.test>" },
    "@/lib/db": { getStore: () => store },
    "@/lib/email/send": { transport: async (mail) => { mails.push(mail); return { ok: true, status: "sent" }; } },
    "@/lib/email/templates": { escapeHtml: (v) => String(v), wrapPlainEmail: ({ title, body }) => `${title}${body}` },
    "@/lib/site": { SITE_URL: "https://www.veximtrade.com" },
    "@/lib/certificate-supplier-copy": { formatCertificateDate: (iso) => iso.split("-").reverse().join("/") },
    "@/lib/supplier-plans": plans,
  });
  const actionExports = compile("app/crm/suppliers/[slug]/plan-actions.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/auth/session": { guard: async () => null, getSession: async () => ({ uid: "staff", email: "staff@vexim.test" }) },
    "@/lib/db": { getStore: () => store }, "@/lib/supplier-plans": plans,
    "@/lib/supplier-portal/notify": notify,
  });
  const form = (plan, expires = "") => { const fd = new FormData(); fd.set("supplier_id", "s1"); fd.set("plan", plan); fd.set("expires_on", expires); return fd; };
  const future = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
  let result = await actionExports.setSupplierPlanAction(form("premium", future));
  assert.equal(result.ok, true);
  assert.equal(mails.length, 1, "Lên Premium phải gửi thư");
  assert.equal(JSON.stringify(mails[0].to), JSON.stringify(["owner@supplier.vn"]), "Chỉ gửi tài khoản đang hoạt động của đúng nhà cung cấp");
  assert.equal(mails[0].subject, "Gói Premium đã được kích hoạt");
  assert.match(mails[0].text, /tối đa 20 sản phẩm/);
  assert.match(mails[0].text, new RegExp(future.split("-").reverse().join("/")));
  result = await actionExports.setSupplierPlanAction(form("premium", future));
  assert.equal(result.message, "Gói không thay đổi.");
  assert.equal(mails.length, 1, "Lưu lại đúng gói cũ không gửi thư trùng");
  const later = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
  await actionExports.setSupplierPlanAction(form("premium", later));
  assert.equal(mails[1].subject, "Gói Premium đã được gia hạn");
  await actionExports.setSupplierPlanAction(form("pro"));
  assert.equal(mails[2].subject, "Gói Pro đã được kích hoạt");
  await actionExports.setSupplierPlanAction(form("basic"));
  assert.equal(mails[3].subject, "Gói của bạn đã chuyển về Basic");
  assert.match(mails[3].text, /Sản phẩm đã đăng vẫn hiển thị/);
  store.listUsers = async () => [];
  result = await actionExports.setSupplierPlanAction(form("pro"));
  assert.equal(result.ok, true, "Không gửi được thư thì gói vẫn được lưu");
  assert.match(result.message, /Chưa gửi được email/);
}

console.log("✅ Gói nhà cung cấp: Basic 5, Premium 20, Pro 50, hết hạn về Basic, chặn ở CSDL và ứng dụng, CRM đổi gói có audit và báo nhà cung cấp.");
