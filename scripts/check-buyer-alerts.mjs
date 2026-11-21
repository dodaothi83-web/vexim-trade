// Thư theo hành vi của người mua: 4 loại, gộp 1 thư/ngày, giới hạn chung 4 thư/7 ngày.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const a = await import("../lib/buyer/alerts.ts");
const now = new Date("2026-11-24T03:00:00Z"); // thứ Ba, 10:00 giờ Việt Nam
const day = 86_400_000;
const ago = (d) => new Date(now.getTime() - d * day).toISOString();
const product = (id, extra = {}) => ({ id, name: `Product ${id}`, href: `/products/cashew/${id}`, imagePath: null, categoryId: "cashew", supplierId: "s1", pro: false,
  moq: "1 MT", leadTime: "14 days", price: "US$ 6.50 / kg", createdAt: ago(60), updatedAt: ago(1), certificates: ["HACCP"], imageCount: 3, ...extra });
const base = { now, consented: true, categories: ["cashew"], allCategories: [{ id: "cashew", slug: "cashew", name: "Cashew",
  harvest: { windows: [{ label: "Main crop", start_month: 11, end_month: 2, regions: ["Binh Phuoc"] }] } }],
  products: [], directory: [], parentOf: {}, saved: [], followedSuppliers: [], rfqs: [], sent: new Set() };

// 1. Sản phẩm đã lưu: báo thay đổi có ích; chưa có mốc thì không báo.
const before = a.snapshotOf(product("p1"));
const changed = product("p1", { price: "US$ 6.20 / kg", certificates: ["HACCP", "ISO 22000"], imageCount: 5 });
assert.deepEqual(a.describeChanges(before, a.snapshotOf(changed)), ["Price is now US$ 6.20 / kg", "New certificate: ISO 22000", "2 new photos"]);
assert.deepEqual(a.describeChanges(before, a.snapshotOf(product("p1", { imageCount: 1 }))), [], "Bớt ảnh thì không báo");
let r = a.buildAlerts({ ...base, allCategories: [], products: [changed], saved: [{ id: "p1", before }] });
assert.equal(r.saved.length, 1);
assert.equal(a.buildAlerts({ ...base, allCategories: [], products: [changed], saved: [{ id: "p1", before: null }] }), null, "Lần đầu chỉ ghi mốc");

// 2. Nhà cung cấp đang theo dõi đăng sản phẩm mới trong 7 ngày; không lặp lại sản phẩm đã báo.
const fresh = product("p2", { createdAt: ago(2), supplierId: "s9" });
r = a.buildAlerts({ ...base, allCategories: [], products: [fresh, product("p3", { createdAt: ago(9), supplierId: "s9" })], followedSuppliers: ["s9"] });
assert.deepEqual(r.fresh.map((p) => p.id), ["p2"]);
assert.equal(a.buildAlerts({ ...base, allCategories: [], products: [fresh], followedSuppliers: ["s9"], sent: new Set(["new:p2"]) }), null);

// 3. RFQ 3 đến 14 ngày chưa có báo giá; gợi ý nhà cung cấp cùng ngành, bỏ nhà cung cấp đã chọn.
const rfq = { id: "r1", code: "RFQ-1", product: "Cashew W320", createdAt: ago(4), categoryId: "cashew-w320", preferredSupplierIds: ["s2"], open: true, hasQuote: false };
const dir = [{ id: "s2", name: "B", href: "/suppliers/b", location: "Vietnam", type: "", products: "", checks: ["x"], categoryIds: ["cashew"] },
  { id: "s3", name: "C", href: "/suppliers/c", location: "Vietnam", type: "", products: "", checks: ["x", "y"], categoryIds: ["cashew"] }];
r = a.buildAlerts({ ...base, consented: false, allCategories: [], directory: dir, parentOf: { "cashew-w320": "cashew" }, rfqs: [rfq] });
assert.deepEqual(r.rfqs[0].suppliers.map((s) => s.id), ["s3"]);
for (const bad of [{ createdAt: ago(1) }, { createdAt: ago(20) }, { hasQuote: true }, { open: false }])
  assert.equal(a.buildAlerts({ ...base, consented: false, allCategories: [], rfqs: [{ ...rfq, ...bad }] }), null, JSON.stringify(bad));
assert.equal(a.buildAlerts({ ...base, consented: false, products: [changed], saved: [{ id: "p1", before }] }), null, "Chưa đồng ý: chỉ nhận thư về RFQ");

// 4. Ngành bắt đầu mùa thu hoạch trong tháng này (giờ Việt Nam), mỗi năm một lần.
r = a.buildAlerts({ ...base, products: [product("p4")] });
assert.equal(r.seasons.length, 1);
assert.equal(r.seasons[0].months, "November to February");
assert.equal(a.buildAlerts({ ...base, sent: new Set([`season:${r.seasons[0].key}`]) }), null);

// Giới hạn chung: 1 thư/ngày (giờ Việt Nam), 4 thư/7 ngày.
assert.equal(a.capAllows([], now), true);
assert.equal(a.capAllows(["2026-11-23T18:00:00Z"], now), false, "01:00 ngày 24 giờ Việt Nam là cùng ngày");
assert.equal(a.capAllows([ago(1), ago(2), ago(3)], now), true);
assert.equal(a.capAllows([ago(1), ago(2), ago(3), ago(5)], now), false);
assert.equal(a.capAllows([ago(1), ago(2), ago(3), ago(8)], now), true);

// Máy chủ: chạy sau thư hằng tuần, dùng chung nhật ký, có công tắc tạm dừng, có link huỷ đăng ký.
const server = readFileSync(new URL("../lib/buyer/alerts-server.ts", import.meta.url), "utf8");
assert.match(server, /await digestPaused\(\)/);
assert.match(server, /capAllows\(mine\.map/);
assert.match(server, /kind: "alerts", week: vietnamDay\(now\)/);
assert.match(server, /List-Unsubscribe-Post/);
const cron = readFileSync(new URL("../app/api/cron/rfq-sla/route.ts", import.meta.url), "utf8");
assert.ok(cron.indexOf("runBuyerDigest()") < cron.indexOf("runBuyerAlerts()"), "Thư hằng tuần chạy trước");
const migration = readFileSync(new URL("../supabase/migrations/20261202_buyer_alerts.sql", import.meta.url), "utf8");
assert.match(migration, /kind in \('products', 'brief', 'alerts'\)/);
assert.match(migration, /create table if not exists public\.buyer_saved_snapshots/);
console.log("check-buyer-alerts: ok");
