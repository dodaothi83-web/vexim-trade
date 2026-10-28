#!/usr/bin/env node
// node scripts/check-sponsored-rotation.mjs
//
// Kiểm phép chọn thẻ cho vùng đẩy sản phẩm. Đây là phần duy nhất quyết định gói
// nào hiện ở cửa sổ nào, nên kiểm bằng số thay vì nhìn giao diện.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ROTATION_WINDOW_MINUTES,
  SPONSORED_SLOTS,
  pushIsLive,
  rankForWindow,
  rotationWindow,
  selectSponsored,
} from "../lib/sponsored/rotation.ts";

/* ---------------- Cửa sổ thời gian ---------------- */

const MINUTE = 60_000;
assert.equal(ROTATION_WINDOW_MINUTES, 10);
assert.equal(rotationWindow(0), 0);
assert.equal(rotationWindow(10 * MINUTE - 1), 0, "Cửa sổ chỉ đổi khi qua đúng mốc mười phút");
assert.equal(rotationWindow(10 * MINUTE), 1);
assert.equal(rotationWindow(25 * MINUTE, 5), 5, "Đổi độ dài cửa sổ phải đổi được để thử nhanh");
assert.equal(rotationWindow(-1), -1, "Mốc trước 1970 vẫn ra số nguyên, không sinh NaN");

/* ---------------- Bố cục cố định trong một cửa sổ ---------------- */

const pushes = Array.from({ length: 12 }, (_, index) => ({ id: `push-${index + 1}` }));
const atOneWindow = selectSponsored(pushes, SPONSORED_SLOTS.category, 1_000 * MINUTE);
assert.equal(atOneWindow.length, SPONSORED_SLOTS.category, "Vùng đẩy danh mục có ba thẻ");
assert.equal(SPONSORED_SLOTS.home, 2, "Vùng đẩy trang chủ có hai thẻ");

const again = selectSponsored([...pushes].reverse(), SPONSORED_SLOTS.category, 1_000 * MINUTE);
assert.deepEqual(
  again.map((push) => push.id),
  atOneWindow.map((push) => push.id),
  "Thứ tự đầu vào không đổi kết quả: cùng cửa sổ thì cùng bố cục",
);
assert.equal(new Set(atOneWindow.map((push) => push.id)).size, 3, "Một gói không chiếm hai thẻ");

/* Sang cửa sổ sau thì bố cục phải đổi, nếu không việc luân phiên là vô nghĩa. */
const nextWindow = selectSponsored(pushes, SPONSORED_SLOTS.category, 1_010 * MINUTE);
assert.notDeepEqual(
  nextWindow.map((push) => push.id),
  atOneWindow.map((push) => push.id),
  "Sang cửa sổ sau, thứ tự và tập thẻ phải khác",
);

const layouts = new Set();
for (let window = 0; window < pushes.length; window += 1) {
  layouts.add(selectSponsored(pushes, SPONSORED_SLOTS.category, window * 10 * MINUTE).map((p) => p.id).join(","));
}
assert.equal(layouts.size, pushes.length, "Mỗi bậc xoay cho ra một bố cục khác nhau, không lặp lại sớm");

/* ---------------- Cân bằng hiển thị trong một tuần ---------------- */

const WINDOWS = (7 * 24 * 60) / ROTATION_WINDOW_MINUTES; // 1008
const counts = new Map(pushes.map((push) => [push.id, 0]));
for (let window = 0; window < WINDOWS; window += 1) {
  for (const push of selectSponsored(pushes, SPONSORED_SLOTS.category, window * ROTATION_WINDOW_MINUTES * MINUTE)) {
    counts.set(push.id, counts.get(push.id) + 1);
  }
}
const expected = (WINDOWS * SPONSORED_SLOTS.category) / pushes.length;
const values = [...counts.values()];
const lowest = Math.min(...values);
const highest = Math.max(...values);
assert.equal(lowest, expected, `Gói ít nhất phải được chọn đúng ${expected} cửa sổ, thực tế ${lowest}`);
assert.equal(highest, expected, `Gói nhiều nhất cũng chỉ ${expected} lượt, thực tế ${highest}`);
assert.equal(
  values.reduce((sum, value) => sum + value, 0),
  WINDOWS * SPONSORED_SLOTS.category,
  "Không cửa sổ chọn nào bị đếm hai lần hoặc bị mất",
);

/* ---------------- Đầu vào biên ---------------- */

assert.deepEqual(selectSponsored(pushes, 0, 0), [], "Không có suất thì không chọn gì");
assert.equal(selectSponsored(pushes.slice(0, 2), 3, 0).length, 2, "Ít gói hơn số suất thì hiện hết");
assert.deepEqual(selectSponsored([], 3, 0), []);
assert.equal(rankForWindow(pushes, 7).length, pushes.length, "Xếp hạng không làm mất phần tử");

/* ---------------- Gói còn hiệu lực ---------------- */

const now = Date.parse("2026-10-23T10:00:00Z");
const live = { status: "approved", starts_at: "2026-10-20T10:00:00Z", ends_at: "2026-10-27T10:00:00Z" };
assert.equal(pushIsLive(live, now), true);
assert.equal(pushIsLive({ ...live, status: "paused" }, now), false, "Gói tạm dừng không hiện");
assert.equal(pushIsLive({ ...live, status: "draft" }, now), false, "Gói nháp không hiện");
assert.equal(pushIsLive({ ...live, starts_at: "2026-10-24T00:00:00Z" }, now), false, "Gói chưa tới giờ không hiện");
assert.equal(pushIsLive({ ...live, ends_at: "2026-10-23T09:59:59Z" }, now), false, "Gói vừa hết hạn thì rời vùng");
assert.equal(pushIsLive({ ...live, ends_at: "không phải ngày" }, now), false, "Ngày hỏng thì coi như không hiệu lực");

/* ---------------- Không phụ thuộc may rủi ---------------- */

const source = readFileSync(new URL("../lib/sponsored/rotation.ts", import.meta.url), "utf8");
assert.ok(!/Math\.random\s*\(/.test(source), "Chọn thẻ không được gọi số ngẫu nhiên");
assert.ok(!/Date\.now\s*\(/.test(source), "Mốc thời gian phải do nơi gọi truyền vào, không đọc đồng hồ bên trong");

console.log("✅ check-sponsored-rotation: cửa sổ mười phút, ba suất danh mục, hai suất trang chủ, mỗi gói đúng 252 cửa sổ được chọn mỗi tuần");
