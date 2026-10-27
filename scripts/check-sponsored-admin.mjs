#!/usr/bin/env node
// node scripts/check-sponsored-admin.mjs
//
// Kiểm phần tính toán của màn quản trị gói đẩy: trạng thái, mức dùng bể, số lượt
// dự phòng, và hình học biểu đồ. Tất cả là hàm thuần nên kiểm được bằng số, không
// cần trình duyệt.
import assert from "node:assert/strict";
import { hasPermission } from "../lib/auth/permissions.ts";

import {
  POOL_CAP,
  POOL_SLOTS,
  WINDOWS_PER_WEEK,
  clickRate,
  dayKeyDaysAgo,
  expiringSoon,
  hoursLeft,
  overlapping,
  poolUsage,
  pushState,
  summarize,
  totalsByPush,
  weeklyRotationWindows,
} from "../lib/sponsored/admin.ts";
import { buildChartGeometry } from "../lib/sponsored/chart-geometry.ts";

const HOUR = 3_600_000;
const NOW = Date.parse("2026-10-23T07:00:00.000Z");
const at = (hoursFromNow) => new Date(NOW + hoursFromNow * HOUR).toISOString();

function push(overrides = {}) {
  return {
    id: "p1",
    surface: "category",
    category_slug: "pepper",
    status: "approved",
    starts_at: at(-24),
    ends_at: at(-24 + 168),
    ...overrides,
  };
}

/* ---------------- Trần bể khớp đặc tả ---------------- */

assert.equal(POOL_CAP.category, 12, "Bể danh mục bán 12 gói");
assert.equal(POOL_CAP.home, 8, "Bể trang chủ bán 8 gói");
assert.equal(POOL_SLOTS.category, 3, "Vùng đẩy danh mục hiện 3 thẻ");
assert.equal(POOL_SLOTS.home, 2, "Vùng đẩy trang chủ hiện 2 thẻ");
assert.equal(WINDOWS_PER_WEEK, 1008, "Một tuần có 1.008 cửa sổ mười phút");

/* ---------------- Trạng thái ---------------- */

assert.equal(pushState(push(), NOW), "live");
assert.equal(pushState(push({ status: "draft" }), NOW), "pending", "Gói nháp là chờ duyệt");
assert.equal(pushState(push({ status: "draft", ends_at: at(-32) }), NOW), "pending", "Nháp cũ vẫn chờ duyệt vì thời hạn tính lại lúc duyệt");
assert.equal(pushState(push({ status: "paused" }), NOW), "paused");
assert.equal(pushState(push({ starts_at: at(24), ends_at: at(24 + 168) }), NOW), "scheduled",
  "Đã duyệt nhưng chưa tới giờ thì không phải đang chạy");
assert.equal(pushState(push({ starts_at: at(-200), ends_at: at(-32) }), NOW), "ended");
assert.equal(pushState(push({ status: "paused", ends_at: at(-1) }), NOW), "ended",
  "Gói đã quá hạn thì hết hạn, kể cả đang tạm dừng");

assert.equal(hoursLeft(push({ ends_at: at(5) }), NOW), 5);
assert.equal(hoursLeft(push({ ends_at: at(-5) }), NOW), 0, "Quá hạn thì còn 0 giờ, không âm");
assert.equal(expiringSoon(push({ ends_at: at(23) }), NOW), true);
assert.equal(expiringSoon(push({ ends_at: at(25) }), NOW), false);
assert.equal(expiringSoon(push({ status: "draft", ends_at: at(5) }), NOW), false,
  "Gói còn chờ duyệt thì không nhắc hết hạn");

/* ---------------- Mức dùng bể ---------------- */

const pool = poolUsage([
  push({ id: "a" }),
  push({ id: "b" }),
  push({ id: "c", status: "paused" }),
  push({ id: "d", category_slug: "cinnamon-star-anise" }),
  push({ id: "e", surface: "home", category_slug: "pepper" }),
  push({ id: "f", status: "draft" }),
  push({ id: "g", starts_at: at(-200), ends_at: at(-32) }),
], NOW);

const pepper = pool.find((row) => row.key === "category:pepper");
assert.equal(pepper.used, 3, "Hai gói đang chạy và một gói tạm dừng cùng giữ suất");
assert.equal(pepper.paused, 1);
assert.equal(pepper.free, 9);
assert.equal(pool.find((row) => row.key === "home").cap, 8);
assert.equal(pool.length, 3, "Gói nháp và gói hết hạn không tạo dòng bể");

/* ---------------- Số lượt dự phòng ---------------- */

assert.equal(weeklyRotationWindows(12, "category"), 252, "Bể đầy 12 gói, 3 suất: khoảng 252 vòng chọn mỗi gói mỗi tuần");
assert.equal(weeklyRotationWindows(8, "home"), 252, "Bể trang chủ đầy 8 gói, 2 suất: cũng 252 vòng");
assert.equal(weeklyRotationWindows(1, "category"), 1008, "Bể một gói thì gói đó nhận mọi cửa sổ, không nhân đôi");
assert.equal(weeklyRotationWindows(0, "category"), 0, "Bể rỗng thì không chia cho ai");
assert.equal(weeklyRotationWindows(4, "category"), 756);
assert.ok(weeklyRotationWindows(5, "category") < weeklyRotationWindows(4, "category"),
  "Bể đông hơn thì mỗi gói nhận ít hơn");

/* ---------------- Chồng lấn cửa sổ ---------------- */

const existing = [push({ id: "a", starts_at: at(0), ends_at: at(168) })];
assert.equal(overlapping(existing, { surface: "category", category_slug: "pepper", starts_at: at(100), ends_at: at(268) }).length, 1,
  "Hai cửa sổ giao nhau thì tính là chồng lấn");
assert.equal(overlapping(existing, { surface: "category", category_slug: "pepper", starts_at: at(168), ends_at: at(336) }).length, 0,
  "Nối đuôi nhau đúng mốc thì không chồng lấn");
assert.equal(overlapping(existing, { surface: "home", category_slug: "pepper", starts_at: at(0), ends_at: at(168) }).length, 0,
  "Khác bề mặt thì không chia bể");
assert.equal(overlapping([...existing, push({ id: "b", status: "draft", starts_at: at(0), ends_at: at(168) })],
  { surface: "category", category_slug: "pepper", starts_at: at(0), ends_at: at(168) }).length, 1,
  "Gói nháp không chiếm suất");
assert.equal(overlapping([push({ status: "paused", starts_at: at(0), ends_at: at(168) })],
  { surface: "category", category_slug: "pepper", starts_at: at(0), ends_at: at(168) }).length, 1,
  "Gói đã bán nhưng tạm dừng vẫn giữ suất cho tới hết hạn");

/* ---------------- Tổng hợp số liệu ---------------- */

const totals = totalsByPush([
  { push_id: "a", day: "2026-10-22", event_type: "impression", events: 100 },
  { push_id: "a", day: "2026-10-23", event_type: "impression", events: 120 },
  { push_id: "a", day: "2026-10-23", event_type: "click", events: 5 },
  { push_id: "a", day: "2026-10-01", event_type: "impression", events: 999 },
], "2026-10-17");
assert.equal(totals.get("a").impressions, 220, "Bỏ các ngày ngoài cửa sổ báo cáo");
assert.equal(totals.get("a").clicks, 5);
assert.equal(clickRate(5, 220), 2.3);
assert.equal(clickRate(0, 0), 0, "Chưa có lượt hiển thị thì không chia cho 0");
assert.equal(dayKeyDaysAgo(NOW, 6), "2026-10-17", "Bảy ngày gần nhất tính cả hôm nay");

const summary = summarize([
  push({ id: "a" }),
  push({ id: "b", status: "draft" }),
  push({ id: "category-paused", status: "paused", ends_at: at(2) }),
  push({ id: "home-running", surface: "home", ends_at: at(2) }),
  push({ id: "home-draft", surface: "home", status: "draft" }),
], totals, NOW);
assert.equal(summary.live, 1, "Không tính gói trang chủ không hiển thị là đang chạy");
assert.equal(summary.pending, 1, "Nháp trang chủ không thể duyệt, không tính vào tổng chờ duyệt");
assert.equal(summary.expiring, 1, "Chỉ nhắc gói danh mục sắp hết hạn, kể cả tạm dừng");

/* ---------------- Hình học biểu đồ ---------------- */

const one = buildChartGeometry([{ day: "2026-10-23", value: 108 }]);
assert.equal(one.points.length, 1);
assert.ok(!one.path.includes("NaN"), "Một điểm vẫn ra đường dẫn hợp lệ");
assert.equal(one.points[0].x, (one.plot.left + one.plot.right) / 2, "Một điểm nằm giữa khung");
assert.deepEqual(one.labelIndices, [0]);

const week = [248, 291, 262, 305, 284, 236, 216].map((value, index) => ({
  day: `2026-10-${String(17 + index).padStart(2, "0")}`,
  value,
}));
const seven = buildChartGeometry(week);
assert.equal(seven.points.length, 7);
assert.equal(seven.ceiling, 350, "Trần trục tung làm tròn lên bội số của 50");
assert.equal(seven.mid, 175);
assert.ok(!seven.path.includes("NaN"));
for (let i = 1; i < seven.points.length; i += 1) {
  assert.ok(seven.points[i].x > seven.points[i - 1].x, "Các điểm xếp tăng dần theo trục hoành");
}
for (const point of seven.points) {
  assert.ok(point.y >= seven.plot.top - 0.01 && point.y <= seven.plot.bottom + 0.01, "Điểm nằm trong khung vẽ");
}
// Đường cong không được vượt quá điểm cao nhất: nếu không, biểu đồ vẽ một con số
// mà dữ liệu không có.
const highest = seven.points.reduce((min, point) => Math.min(min, point.y), Infinity);
assert.ok(highest >= seven.plot.top, "Đỉnh đường không vượt trần khung");

const flat = buildChartGeometry(week.map((point) => ({ ...point, value: 0 })));
assert.equal(flat.ceiling, 50, "Toàn số 0 vẫn có thang chia, không chia cho 0");
assert.ok(flat.points.every((point) => point.y === flat.plot.bottom), "Số 0 nằm đúng trên trục hoành");

/* ---------------- Toạ độ ổn định ---------------- */

const snapshot = (geo) => ({ path: geo.path, points: geo.points, ceiling: geo.ceiling, mid: geo.mid, labelIndices: geo.labelIndices });
assert.deepEqual(snapshot(buildChartGeometry(week)), snapshot(buildChartGeometry(week)),
  "Cùng dữ liệu phải ra cùng toạ độ");

/* ---------------- Ai được duyệt ---------------- */

assert.ok(hasPermission("admin", "sponsored.manage"), "Admin duyệt được gói");
assert.ok(hasPermission("reviewer", "sponsored.manage"), "Trưởng kiểm duyệt duyệt được gói");
assert.ok(hasPermission("reviewer", "sponsored.view"), "Trưởng kiểm duyệt xem được danh sách gói");
// Chỉ admin và trưởng kiểm duyệt được duyệt. Các vai trò nội bộ khác xem được
// danh sách nhưng không có nút thao tác; vai trò ngoài Vexim không vào được trang.
for (const role of ["sale", "sourcing", "viewer", "supplier"]) {
  assert.ok(!hasPermission(role, "sponsored.manage"), `Vai trò ${role} không duyệt được gói`);
}
assert.ok(hasPermission("sale", "sponsored.view"), "Kinh doanh xem được danh sách gói");
assert.ok(!hasPermission("supplier", "sponsored.view"), "Tài khoản doanh nghiệp không vào trang gói đẩy");
assert.ok(!hasPermission("viewer", "sponsored.view"), "Vai trò chỉ xem không vào trang gói đẩy");
assert.ok(!hasPermission(null, "sponsored.manage"), "Không có phiên thì không có quyền");

console.log("check-sponsored-admin: ok");
