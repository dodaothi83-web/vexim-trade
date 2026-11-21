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
assert.match(page, /r\.service_key !== "plan_upgrade" \|\| r\.status !== "submitted"/);
assert.match(page, /initialPlanFilter=\{initialPlanFilter\}/);
// Chỉ hiển thị: bảng không ghi gói hay yêu cầu.
assert.doesNotMatch(table, /updateSupplier|"use server"/);

// Mở gói trả phí tự chuyển yêu cầu "Mới" sang "Đã mở"; tác vụ hằng ngày nhắc gia hạn và đặt "Hết hạn".
const planAction = read("app/crm/suppliers/[slug]/plan-actions.ts");
assert.match(planAction, /if \(plan !== "basic"\) await closeUpgradeRequests/);
assert.match(planAction, /status: "active", handled_by: session\.uid/);
const expiry = await import("../lib/supplier-plan-expiry.ts");
const now = Date.parse("2026-12-01T00:00:00Z"), day = 86_400_000;
const at = (d) => new Date(now + d * day).toISOString();
assert.equal(expiry.planReminderKind(at(40), now), null);
assert.equal(expiry.planReminderKind(at(30), now), "d30");
assert.equal(expiry.planReminderKind(at(8), now), "d30");
assert.equal(expiry.planReminderKind(at(7), now), "d7");
assert.equal(expiry.planReminderKind(at(0.2), now), "d7");
assert.equal(expiry.planReminderKind(at(-1), now), "expired");
assert.equal(expiry.planReminderKind(at(-20), now), null, "Không báo gói hết hạn đã lâu");
assert.equal(expiry.planReminderKind(null, now), null);
const server = read("lib/supplier-portal/plan-expiry-server.ts");
assert.match(server, /ignoreDuplicates: true/, "Mỗi mốc gửi một lần");
assert.match(server, /status: "expired"/);
assert.match(read("app/api/cron/rfq-sla/route.ts"), /await runPlanExpiry\(\)/);
assert.match(layout, /href: "\/crm\/suppliers\?plan=expiring"/);
console.log("check-crm-plan-visibility: ok");
