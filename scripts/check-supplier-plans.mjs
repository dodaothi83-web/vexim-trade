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

console.log("✅ Gói nhà cung cấp: Basic 5, Premium 20, Pro 50, hết hạn về Basic, chặn ở CSDL và ứng dụng, CRM đổi gói có audit.");
