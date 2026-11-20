import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const plans = await import("../lib/supplier-plans.ts");
const now = new Date("2026-11-15T00:00:00Z");

// 1. Số sản phẩm và quyền theo gói.
assert.equal(plans.SUPPLIER_PLAN_RULES.basic.maxProducts, 5);
assert.equal(plans.SUPPLIER_PLAN_RULES.premium.maxProducts, 20);
assert.equal(plans.SUPPLIER_PLAN_RULES.pro.maxProducts, null, "Pro không giới hạn sản phẩm");
assert.equal(plans.SUPPLIER_PLAN_RULES.basic.richContent, false, "Basic: mô tả chi tiết chỉ có chữ");
assert.equal(plans.SUPPLIER_PLAN_RULES.premium.richContent && plans.SUPPLIER_PLAN_RULES.pro.richContent, true, "Premium/Pro mở nội dung A+");
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
// Bảng gói trong CRM (20261129): giới hạn đọc từ supplier_plan_catalog, null là không giới hạn.
const catalogMigration = read("supabase/migrations/20261129_supplier_plan_catalog.sql");
assert.match(catalogMigration, /create table if not exists public\.supplier_plan_catalog/);
assert.match(catalogMigration, /\('pro', 'Pro'[\s\S]*?, null, true\)/, "Pro khởi tạo không giới hạn");
assert.match(catalogMigration, /\('basic', 'Basic'[\s\S]*?, 5, false\)/, "Basic 5 sản phẩm, không có nội dung A+");
assert.match(catalogMigration, /if v_limit is null then\s+return new;/, "Không giới hạn thì không chặn");
assert.match(catalogMigration, /on conflict \(plan\) do nothing/, "Chạy lại không ghi đè nội dung đã sửa");
assert.equal(plans.canAddSupplierProduct({ plan: "pro" }, 10_000, now), true, "Pro không giới hạn");
const customCatalog = { ...plans.DEFAULT_PLAN_CATALOG, premium: { ...plans.DEFAULT_PLAN_CATALOG.premium, maxProducts: 3 } };
assert.equal(plans.canAddSupplierProduct({ plan: "premium" }, 3, now, customCatalog), false, "Giới hạn theo bảng gói CRM");
assert.equal(plans.supplierPlanRules({ plan: "basic" }, now).richContent, false);
assert.equal(plans.supplierPlanRules({ plan: "premium", plan_expires_at: "2026-01-01T00:00:00Z" }, now).richContent, false, "Gói hết hạn không còn A+");
assert.equal(plans.supplierPlanRules({ plan: "pro" }, now).richContent, true);

// 6. Ứng dụng báo trước ở cả hai đường tạo, và trang tạo mới chặn khi hết chỗ.
const portal = read("app/supplier/portal/product-actions.ts");
assert.match(portal, /canAddSupplierProduct\(access\.supplier,/);
assert.match(portal, /isProductLimitError\(error\)/);
const crm = read("app/actions.ts");
assert.match(crm, /canAddSupplierProduct\(planSupplier, count, new Date\(\), planCatalog\)/, "CRM tạo sản phẩm theo bảng gói hiện hành");
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
    "@/lib/supplier-plan-catalog": { readPlanCatalog: async () => plans.DEFAULT_PLAN_CATALOG },
  });
  const activations = [];
  const actionExports = compile("app/crm/suppliers/[slug]/plan-actions.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/auth/session": { guard: async () => null, getSession: async () => ({ uid: "staff", email: "staff@vexim.test" }) },
    "@/lib/db": { getStore: () => store }, "@/lib/supplier-plans": plans,
    "@/lib/supplier-portal/notify": notify,
    "@/lib/supplier-plan-catalog": { recordPlanActivation: async (row) => { activations.push(row); } },
  });
  const form = (plan, expires = "", extra = {}) => { const fd = new FormData(); fd.set("supplier_id", "s1"); fd.set("plan", plan); fd.set("expires_on", expires);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v); return fd; };
  const future = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
  let result = await actionExports.setSupplierPlanAction(form("premium", future, { months: "3", amount_vnd: "1399000" }));
  assert.equal(result.ok, true);
  assert.equal(mails.length, 1, "Lên Premium phải gửi thư");
  assert.equal(JSON.stringify(mails[0].to), JSON.stringify(["owner@supplier.vn"]), "Chỉ gửi tài khoản đang hoạt động của đúng nhà cung cấp");
  assert.equal(mails[0].subject, "Gói Premium đã được kích hoạt");
  assert.match(mails[0].text, /tối đa 20 sản phẩm/);
  assert.equal(activations.length, 1, "Bật gói trả phí ghi một dòng cho báo cáo doanh thu");
  assert.equal(activations[0].months, 3); assert.equal(activations[0].amountVnd, 1399000); assert.equal(activations[0].plan, "premium");
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
  assert.match(mails[3].text, /mô tả chi tiết chỉ gồm chữ/);
  assert.match(mails[2].text, /không giới hạn sản phẩm/, "Pro không giới hạn");
  assert.equal(activations.filter((a) => a.plan === "pro").length, 1, "Về Basic không ghi doanh thu");
  store.listUsers = async () => [];
  result = await actionExports.setSupplierPlanAction(form("pro"));
  assert.equal(result.ok, true, "Không gửi được thư thì gói vẫn được lưu");
  assert.match(result.message, /Chưa gửi được email/);
}

console.log("✅ Gói nhà cung cấp: Basic 5 (mô tả chữ), Premium 20 (A+), Pro không giới hạn, hết hạn về Basic, chặn ở CSDL và ứng dụng, CRM đổi gói có audit và báo nhà cung cấp.");
