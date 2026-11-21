// node --experimental-strip-types --no-warnings scripts/check-supplier-performance.mjs
// Báo cáo hiệu quả cho nhà cung cấp (đợt 3): tăng/giảm so với kỳ trước, RFQ, email marketing, quốc gia
// (không lưu IP, không danh tính), email báo cáo hằng tuần chỉ khi có số.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const r = await import("../lib/supplier-portal/traffic-report.ts");
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

// 1. % thay đổi; kỳ trước bằng 0 thì không so.
assert.equal(r.percentChange(150, 100), 50);
assert.equal(r.percentChange(50, 100), -50);
assert.equal(r.percentChange(10, 0), null);
assert.equal(r.percentChange(0, 0), null);

// 2. Kỳ hiện tại và kỳ liền trước cùng độ dài, không chồng nhau.
const p = r.periodRanges(7, new Date("2026-12-14T10:00:00Z"));
assert.deepEqual(p.current, { from: "2026-12-08", to: "2026-12-14" });
assert.deepEqual(p.previous, { from: "2026-12-01", to: "2026-12-07" });

// 3. Quốc gia: chỉ mã Vercel gắn sẵn, không đọc IP; bảng không có cột IP hay người xem.
const route = read("app/api/public/traffic/route.ts");
assert.match(route, /recordCountryView\(page\.supplierId, request\.headers\.get\("x-vercel-ip-country"\)\)/);
assert.doesNotMatch(route, /x-forwarded-for|x-real-ip|request\.ip/, "Không đọc IP");
const sql = read("supabase/migrations/20261224_supplier_traffic_country.sql");
assert.match(sql, /country text not null check \(country ~ '\^\[A-Z\]\{2\}\$'\)/);
assert.doesNotMatch(sql.slice(sql.indexOf("supplier_traffic_country_daily"), sql.indexOf("create index")), /\bip\b|buyer|viewer_id/i);
assert.match(read("lib/traffic/server.ts"), /code === "XX" \|\| code === "T1"/, "Bỏ mã không xác định và Tor");

// 4. Trang: RFQ, email marketing, quốc gia; ghi chú cách tính nói rõ chỉ đếm quốc gia.
const summary = read("app/supplier/portal/traffic/summary.tsx");
assert.match(summary, /copy\.kpi\.rfqs/);
assert.match(summary, /copy\.kpi\.email/);
assert.match(read("lib/i18n/portal/traffic.ts"), /email marketing của Vexim/);
assert.match(read("lib/i18n/portal/traffic.ts"), /chỉ đếm theo quốc gia/);
assert.match(read("lib/supplier-portal/performance.ts"), /\.from\("rfq_matches"\)[\s\S]{0,160}sent_to_supplier_at/, "RFQ tính theo lúc chuyển tới nhà cung cấp");

// 5. Email hằng tuần: thứ Hai, chỉ khi có lượt xem hoặc RFQ, mỗi tuần một thư, không lộ danh tính.
const weekly = read("lib/supplier-portal/weekly-report.ts");
assert.match(weekly, /REPORT_WEEKDAY = 1/);
assert.match(weekly, /perf\.views\.current === 0 && perf\.rfqs\.current === 0/);
assert.match(weekly, /\.eq\("week", week\)/);
assert.match(weekly, /không chia sẻ danh tính người xem/);
assert.match(read("app/api/cron/rfq-sla/route.ts"), /runSupplierWeeklyReport\(\)/);
console.log("✅ Báo cáo hiệu quả nhà cung cấp: tăng/giảm, RFQ, email marketing, quốc gia không lưu IP, email tuần chỉ khi có số.");
