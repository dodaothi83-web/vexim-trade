// CRM thấy được gói của nhà cung cấp và yêu cầu nâng gói mới (không chỉ qua email).
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const layout = read("app/crm/layout.tsx");
const sidebar = read("components/sidebar.tsx");
const table = read("components/supplier-table.tsx");
const page = read("app/crm/suppliers/page.tsx");

// Chuông + menu: đếm yêu cầu mới (submitted), tách nâng gói khỏi dịch vụ khác.
assert.match(layout, /listSupplierServiceRequests\(\{ status: "submitted"/);
assert.match(layout, /href: "\/crm\/suppliers\?plan=upgrade"/);
assert.match(layout, /href: "\/crm\/service-requests", label: "Yêu cầu dịch vụ mới"/);
assert.match(sidebar, /item\.href === "\/crm\/plans" \? \(pendingPlanUpgrades > 0/);
assert.match(sidebar, /item\.href === "\/crm\/service-requests" \? \(pendingServiceRequests > 0/);

// Bảng nhà cung cấp: gói đang hiệu lực (gói hết hạn tính là Basic), bộ lọc gói, nhãn xin nâng.
assert.match(table, /effectiveSupplierPlan\(s, new Date\(now\)\)/);
for (const key of ["basic", "premium", "pro", "upgrade", "expiring"]) assert.ok(table.includes(`"${key}"`), key);
assert.match(table, /<th className="table-th">Gói<\/th>/);
assert.match(table, /Xin nâng/);
assert.match(page, /r\.service_key !== "plan_upgrade" \|\| r\.status === "closed"/);
assert.match(page, /initialPlanFilter=\{initialPlanFilter\}/);
// Chỉ hiển thị: bảng không ghi gói hay yêu cầu.
assert.doesNotMatch(table, /updateSupplier|"use server"/);
console.log("check-crm-plan-visibility: ok");
