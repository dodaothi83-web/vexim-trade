import assert from "node:assert/strict";
import fs from "node:fs";

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

// Tiêu đề và nhóm trạng thái được phép xuống dòng, không đẩy nút thao tác lệch lề.
const headerEnd = page.indexOf('{sp?.selection_email');
const header = page.slice(page.indexOf("<Breadcrumbs"), headerEnd);
assert.match(header, /flex flex-wrap items-center justify-between gap-3/);
assert.match(header, /<h1 className="font-mono text-xl font-bold text-ink-900">\{rfq\.code\}<\/h1>/);
assert.ok(!header.includes("ml-auto"), "nút đầu trang không dùng auto-margin gây xô lề khi xuống dòng");

// Nội dung dài trong lưới thông tin phải xuống dòng thay vì làm tràn cột.
assert.match(page, /function Field[\s\S]*?min-w-0 items-start gap-2/);
assert.match(page, /function Field[\s\S]*?break-words text-\[13\.5px\] leading-5/);

console.log("✅ RFQ detail layout: single CRM gutter, padded cards, aligned header and responsive columns.");
