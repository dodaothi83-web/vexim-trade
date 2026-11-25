import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const services = await import("../lib/supplier-services.ts");
const { servicesMessages } = await import("../lib/i18n/portal/services.ts");

// 1. Trong cổng có 3 dịch vụ tư vấn và yêu cầu nâng gói; không có "đăng ký miễn phí".
assert.deepEqual([...services.SUPPLIER_SERVICE_KEYS], ["international_website", "featured_ads", "fda_compliance", "plan_upgrade"]);
assert.equal(services.isSupplierServiceKey("free_listing"), false, "Nhà cung cấp đã ở trong cổng, không đăng ký lại");
assert.equal(services.isSupplierServiceKey("fda_compliance"), true);
assert.deepEqual([...services.SUPPLIER_SERVICE_STATUSES], ["submitted", "active", "cancelled", "expired"], "Chỉ 4 trạng thái: Mới, Đã mở, Đã huỷ, Hết hạn");
assert.equal(services.isSupplierServiceStatus("quoted"), false, "Bỏ các bước tư vấn / báo giá");
assert.deepEqual([...services.manualServiceStatuses("plan_upgrade")], ["submitted", "cancelled"], "Nâng gói: Đã mở và Hết hạn do hệ thống đặt");
assert.equal(services.requestedPlanOf("Nâng lên gói Pro"), "pro");
assert.equal(services.requestedPlanOf("Gia hạn gói Premium"), "premium");
assert.equal(services.isRenewalNote("Gia hạn gói Premium"), true);
assert.equal(services.isRenewalNote("Nâng lên gói Pro"), false);
assert.equal(services.isSupplierServiceStatus("paid"), false, "Không có trạng thái thanh toán");

// 2. Chỉ yêu cầu "Mới" chặn gửi trùng; đã mở, huỷ hay hết hạn thì được gửi lại (nâng tiếp, gia hạn).
assert.equal(services.hasOpenServiceRequest([{ service_key: "featured_ads", status: "submitted" }], "featured_ads"), true);
for (const status of ["active", "cancelled", "expired"]) assert.equal(services.hasOpenServiceRequest([{ service_key: "featured_ads", status }], "featured_ads"), false, status);
assert.equal(services.hasOpenServiceRequest([{ service_key: "fda_compliance", status: "submitted" }], "featured_ads"), false);

// 3. CSDL khớp mã nguồn: cùng bộ mã dịch vụ, cùng bộ trạng thái, chỉ mục chặn gửi trùng.
const migration = read("supabase/migrations/20261123_supplier_service_requests.sql") + read("supabase/migrations/20261128_supplier_plan_upgrade_requests.sql")
  + read("supabase/migrations/20261201_service_request_simple_statuses.sql");
for (const key of services.SUPPLIER_SERVICE_KEYS) assert.match(migration, new RegExp(`'${key}'`), `Migration có mã ${key}`);
for (const status of services.SUPPLIER_SERVICE_STATUSES) assert.match(migration, new RegExp(`'${status}'`), `Migration có trạng thái ${status}`);
assert.match(migration, /drop index if exists public\.supplier_service_requests_one_open;[\s\S]*unique index if not exists supplier_service_requests_one_open[\s\S]*where status = 'submitted'/, "Chặn hai yêu cầu đang mở");
assert.match(migration, /revoke all on table public\.supplier_service_requests from public, anon, authenticated/, "Trình duyệt không đọc thẳng bảng");

// 4. Server action lấy danh tính từ phiên, không tin form.
const action = read("app/supplier/portal/services/actions.ts");
assert.match(action, /await supplierPortalAccess\(\)/, "Kiểm tra đăng nhập nhà cung cấp");
assert.match(action, /portalApproved\(supplier\)/, "Chỉ tài khoản đã duyệt");
assert.match(action, /isSupplierServiceKey\(serviceKey\)/, "Chỉ nhận mã dịch vụ hợp lệ");
assert.match(action, /supplier_id: supplier\.id/, "supplier_id lấy từ phiên");
assert.doesNotMatch(action, /form\.get\("supplier_id"\)/, "Không đọc supplier_id từ form");
assert.match(action, /hasOpenServiceRequest\(existing, serviceKey\)/, "Chặn gửi trùng trước khi ghi");

// 5. CRM: xem cần suppliers.view, đổi trạng thái cần suppliers.manage.
assert.match(read("app/crm/service-requests/page.tsx"), /requirePagePermission\("suppliers\.view"/);
assert.match(read("app/crm/service-requests/actions.ts"), /guard\("suppliers\.manage"\)/);
assert.match(read("components/sidebar.tsx"), /\/crm\/service-requests/, "CRM có mục Yêu cầu dịch vụ");

// 6. Menu cổng có nhóm Phát triển với mục Dịch vụ Vexim, chỉ khi đã được duyệt.
const sidebar = read("components/supplier-sidebar.tsx");
assert.match(sidebar, /href: "\/supplier\/portal\/services", labelKey: "services", icon: BriefcaseBusiness, group: "grow", needsApproval: true/);
assert.match(sidebar, /NAV_GROUPS = \["work", "shop", "verify", "grow", "account"\]/);

// 7. Văn phong: không ghi giá, đủ chuỗi hai ngôn ngữ cho mỗi dịch vụ.
for (const lang of ["en", "vi"]) {
  const copy = servicesMessages[lang];
  for (const key of services.SUPPLIER_SERVICE_KEYS) assert.ok(copy.services[key].title && copy.services[key].fit, `${lang}: ${key} có tên và "phù hợp khi"`);
  for (const status of services.SUPPLIER_SERVICE_STATUSES) assert.ok(copy.status[status], `${lang}: nhãn trạng thái ${status}`);
  assert.doesNotMatch(JSON.stringify(copy), /\$|USD|VND|đồng\b|price:/i, `${lang}: trang không ghi giá`);
}

console.log("✅ Dịch vụ Vexim trong cổng: 3 dịch vụ tư vấn, chặn gửi trùng, danh tính từ phiên, CRM đổi trạng thái theo quyền.");

// "Đăng ký nâng gói" ở trang Dịch vụ mở bảng chọn gói (cùng bảng với "Trang của tôi"), không phải ô
// ghi chú như dịch vụ tư vấn; quyền lợi viết theo gói thật, không còn "Đăng đến 20 sản phẩm".
{
  const cards = read("app/supplier/portal/services/service-cards.tsx");
  const page = read("app/supplier/portal/services/page.tsx");
  const servicesCopy = read("lib/i18n/portal/services.ts");
  assert.match(cards, /if \(isPlan\) return \([\s\S]*?<StorefrontUpgradeButton plan=\{planPicker\.plan\} catalog=\{planPicker\.catalog\}[\s\S]*?requestOpen=\{hasOpen\}/,
    "Plan upgrade button opens the plan picker");
  assert.match(page, /planPicker=\{\{ \.\.\.planStatus, catalog: planCatalog, copy: m\.storefront\.owner \}\}/);
  assert.match(read("app/supplier/portal/storefront/page.tsx"), /supplierPlanStatus\(supplier, planCatalog, locale\)/, "Both pages share the plan status");
  assert.doesNotMatch(servicesCopy, /\{premium\}|Đăng đến|List up to|hằng tháng trên Vexim|Monthly English SEO/, "No 20-product line, no monthly-article promise");
  assert.match(servicesCopy, /Đăng sản phẩm không giới hạn với gói Pro/);
  assert.match(servicesCopy, /Unlimited product listings with Pro/);
  console.log("supplier services: plan upgrade opens the plan picker");
}
