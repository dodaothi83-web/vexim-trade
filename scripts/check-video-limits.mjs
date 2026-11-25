// Giới hạn video để kiểm soát phí Cloudflare Stream (tính theo phút lưu và phút xem):
// nhà máy 3 phút, sản phẩm và A+ 2 phút, tối đa 2 video mỗi trang A+, tổng phút theo gói.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const aplus = await import("../lib/products/aplus.ts");
assert.deepEqual({ ...aplus.VIDEO_LIMIT_SECONDS }, { factory: 180, product: 120, aplus: 120 });
assert.equal(aplus.APLUS_MAX_VIDEOS, 2);
const v = (n) => Array.from({ length: n }, () => ({ type: "video" }));
assert.equal(aplus.aplusVideoLimitExceeded([...v(2), { type: "text" }], []), false);
assert.equal(aplus.aplusVideoLimitExceeded(v(3), v(2)), true, "Không thêm video thứ 3");
assert.equal(aplus.aplusVideoLimitExceeded(v(3), v(4)), false, "Trang cũ đã có nhiều video vẫn lưu được khi bớt");
assert.equal(aplus.aplusVideoLimitExceeded(v(4), v(4)), false, "Trang cũ giữ nguyên số video vẫn lưu được");

const plans = await import("../lib/supplier-plans.ts");
assert.equal(plans.DEFAULT_PLAN_CATALOG.basic.videoMinutes, 0);
assert.equal(plans.DEFAULT_PLAN_CATALOG.premium.videoMinutes, 60);
assert.equal(plans.DEFAULT_PLAN_CATALOG.pro.videoMinutes, 180);
// Câu chữ mặc định phải vừa giới hạn của CRM (lib/supplier-plan-catalog.ts: 12 dòng, 200 ký tự/dòng),
// nếu không khi lưu ở /crm/plans sẽ bị từ chối hoặc khi đọc ra bị cắt cụt.
for (const entry of Object.values(plans.DEFAULT_PLAN_CATALOG)) {
  assert.ok(entry.features.length <= 12, `${entry.plan}: at most 12 benefit lines`);
  for (const line of entry.features) assert.ok(line.length <= 200, `${entry.plan}: benefit line over 200 characters: ${line.slice(0, 60)}…`);
}

// Cloudflare nhận giới hạn từ máy chủ, không dùng con số cố định 15 phút.
const stream = read("lib/media/cloudflare-stream.ts");
assert.match(stream, /maxDurationSeconds: Math\.max\(1, Math\.floor\(input\.maxSeconds \?\? APLUS_VIDEO_MAX_SECONDS\)\)/);
assert.match(stream, /creator: supplierId/);
const quota = read("lib/media/video-quota.ts");
assert.match(quota, /quotaMinutes \* 60 - used/);
for (const route of ["app/api/supplier-portal/pending-media/route.ts", "app/api/supplier-portal/products/[id]/aplus/route.ts",
  "app/api/supplier-portal/company-aplus/route.ts", "lib/products/aplus-staff-upload.ts"]) {
  const src = read(route);
  assert.match(src, /prepareVideoUpload\(/, route);
  assert.match(src, /maxSeconds: allowance\.maxSeconds/, route);
}
assert.match(read("app/api/supplier-portal/company-aplus/route.ts"), /form\.get\("video_kind"\) === "factory"/);
assert.match(read("app/supplier/portal/storefront/theme-editor.tsx"), /checkVideoFile\(file, videoErrors, fill, "factory"\)/);
assert.match(read("components/products/product-video-field.tsx"), /checkVideoFile\(file, copy\.errors, fill, "product"\)/);
for (const p of ["app/supplier/portal/aplus-actions.ts", "app/supplier/portal/storefront/company-aplus-actions.ts", "app/crm/aplus-staff-actions.ts"])
  assert.match(read(p), /aplusVideoLimitExceeded\(/, p);
assert.match(read("supabase/migrations/20261203_plan_video_minutes.sql"), /add column if not exists video_minutes/);
assert.doesNotMatch(read("lib/i18n/portal/aplus.ts") + read("lib/i18n/portal/showcase.ts"), /15 (phút|minutes)/);
console.log("check-video-limits: ok");
