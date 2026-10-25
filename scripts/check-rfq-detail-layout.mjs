import assert from "node:assert/strict";
import fs from "node:fs";
import { spamFlagDetail } from "../lib/rfq/spam-flags.ts";

const page = fs.readFileSync(new URL("../app/crm/rfqs/[id]/page.tsx", import.meta.url), "utf8");

// Khung CRM đã có max-width và padding. Trang chi tiết không được thêm lớp lề thứ hai.
assert.ok(!page.includes("mx-auto max-w-7xl px-4 py-6"), "trang chi tiết RFQ không được nhân đôi padding của khung CRM");
assert.match(page, /mt-5 grid items-start gap-5 xl:grid-cols-3/, "lưới chỉ tách cột khi đủ rộng và không kéo giãn cột phải");
assert.match(page, /min-w-0 space-y-5 xl:col-span-2/, "cột nội dung chính phải co được và giữ khoảng cách đều");
assert.match(page, /\{\/\* RIGHT: workflow \*\/\}\s*<div className="min-w-0 space-y-5">/, "cột thao tác phải co được và thẳng hàng");

// Mọi thẻ nội dung đều có cùng padding trong, tránh chữ và form sát viền.
const cards = [...page.matchAll(/<section className="([^"]*\bcard\b[^"]*)"/g)];
assert.ok(cards.length >= 9, "phải kiểm tra được các thẻ nội dung của trang RFQ");
for (const [full, classes] of cards) {
  assert.ok(classes.split(/\s+/).includes("p-4"), `thẻ thiếu padding mobile: ${full}`);
  assert.ok(classes.split(/\s+/).includes("sm:p-5"), `thẻ thiếu padding desktop: ${full}`);
}
assert.ok(page.includes('<section className={`card p-4 sm:p-5'), "thẻ dấu hiệu rủi ro cũng phải giữ padding chuẩn");

// Tiêu đề và nhóm trạng thái được phép xuống dòng, không đẩy nút thao tác lệch lề.
const headerEnd = page.indexOf('{sp?.selection_email');
const header = page.slice(page.indexOf("<Breadcrumbs"), headerEnd);
assert.match(header, /flex flex-wrap items-center justify-between gap-3/);
assert.match(header, /<h1 className="font-mono text-xl font-bold text-ink-900">\{rfq\.code\}<\/h1>/);
assert.ok(!header.includes("ml-auto"), "nút đầu trang không dùng auto-margin gây xô lề khi xuống dòng");

// Nội dung dài trong lưới thông tin phải xuống dòng thay vì làm tràn cột.
assert.match(page, /function Field[\s\S]*?min-w-0 items-start gap-2/);
assert.match(page, /function Field[\s\S]*?break-words text-\[13\.5px\] leading-5/);

// Mã kỹ thuật phải có tên và giải thích rõ ràng cho nhân viên CRM.
assert.match(page, /Dấu hiệu cần kiểm tra/);
assert.match(page, /spamFlagDetail\(flag\)/);
assert.equal(spamFlagDetail("webmail_domain").label, "Dùng email miễn phí");
assert.match(spamFlagDetail("webmail_domain").description, /không phải bằng chứng spam/);
assert.equal(spamFlagDetail("invalid_phone").label, "Số điện thoại cần kiểm tra");
assert.match(spamFlagDetail("invalid_phone").description, /ít hơn 7 chữ số/);
for (const flag of [
  "honeypot_filled",
  "turnstile_missing",
  "webmail_domain",
  "missing_company",
  "invalid_phone",
  "too_short",
  "contains_link",
  "spam_keyword",
  "missing_name",
  "rate_limit_not_configured",
  "rate_limit_unavailable",
]) {
  assert.notEqual(spamFlagDetail(flag).label, "Dấu hiệu khác", `thiếu giải thích cho ${flag}`);
}
assert.match(spamFlagDetail("unknown_check").description, /unknown_check/, "mã chưa biết vẫn được giữ để đối chiếu");

console.log("✅ RFQ detail layout: aligned responsive cards and readable Vietnamese risk signals.");
