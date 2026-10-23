#!/usr/bin/env node
// node scripts/check-launch-categories.mjs
//
// Kiểm migration bộ danh mục ra mắt đợt 1. Chạy được bằng Node thuần, không cần
// node_modules, vì migration là dữ liệu chứ không phải code: kiểm ở đây rẻ hơn
// kiểm sau khi đã chạy trên production.
//
// Kiểm bốn nhóm:
//   1. Cấu trúc: ba slug, đổi tên có chuyển hướng, danh mục demo xử lý đúng.
//   2. Đơn vị giá và mùa vụ: đúng quy ước ngành, đủ ngày rà soát.
//   3. Nội dung: không còn chỗ giữ chỗ, không còn từ bị cấm, giới thiệu đủ dài.
//   4. Câu hỏi thường gặp: đủ số câu, không trùng câu hỏi.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/20261027_launch_categories.sql", import.meta.url), "utf8");

/* ---------------- Đọc các khối JSON trong migration ---------------- */

const dollarBlocks = [...sql.matchAll(/\$json\$([\s\S]*?)\$json\$/g)].map((m) => JSON.parse(m[1]));
const quotedBlocks = [...sql.matchAll(/'(\{"[^']*\})'::jsonb/g)].map((m) => JSON.parse(m[1]));
const allBlocks = [...dollarBlocks, ...quotedBlocks];

assert.ok(dollarBlocks.length > 0, "The migration stores its lists as dollar quoted JSON");
assert.ok(quotedBlocks.length > 0, "The migration stores its translations as quoted JSON");

/** Gom mọi chuỗi tiếng Anh lại để soi từ ngữ ở một chỗ. */
function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}
const corpus = allBlocks.flatMap((b) => strings(b)).join("\n");

/* ---------------- 1. Cấu trúc ---------------- */

for (const slug of ["cashew-kernels", "pepper", "cinnamon-star-anise"]) {
  assert.ok(sql.includes(`'${slug}'`), `The launch set includes ${slug}`);
}

assert.ok(
  sql.includes("set\n  slug = 'pepper'"),
  "Pepper is produced by renaming the existing spices row, so its suppliers and history stay attached",
);
assert.ok(
  sql.includes("where slug = 'spices'") && sql.includes("not exists (select 1 from public.categories c2 where c2.slug = 'pepper')"),
  "The rename only runs while there is no pepper row, so a second run cannot break the unique slug",
);
assert.ok(
  sql.includes("'spices'::text"),
  "The old slug is kept so /products/spices still resolves",
);
assert.ok(
  sql.includes("set category = 'pepper' where category = 'spices'"),
  "Products filed under the old slug are moved, or they would drop out of the category grid",
);
assert.ok(
  sql.includes("set reviewed_category_slug = 'pepper' where reviewed_category_slug = 'spices'"),
  "Reviewed products are moved too, not just unreviewed ones",
);

assert.ok(
  /update public\.categories\s+set\s+is_published = false,\s+status = 'draft',\s+active_on_homepage = false,\s+seo_indexable = false/.test(sql),
  "The seafood demo category is hidden from the site, the homepage and search",
);
assert.ok(!/delete from public\.categories/i.test(sql), "Nothing is deleted, because products and RFQs still point at these rows");
assert.ok(!/where slug = 'dried-fruits'/.test(sql), "Dried fruits is left exactly as it was");

/* ---------------- 2. Đơn vị giá và mùa vụ ---------------- */

assert.ok(/price_unit = 'mt',/.test(sql), "Pepper is priced by the tonne");
assert.ok(sql.includes("'kg', true, 'published'"), "Cashew kernels are priced by the kilogram");
assert.ok(sql.includes("'mt', true, 'published'"), "Cinnamon and star anise are priced by the tonne");

const calendars = allBlocks.filter((b) => b && Array.isArray(b.windows));
assert.equal(calendars.length, 3, "All three launch categories carry a harvest calendar");

for (const calendar of calendars) {
  assert.ok(
    /^\d{4}-\d{2}-\d{2}$/.test(calendar.reviewed_on ?? ""),
    `A calendar without a review date would print as unreviewed: ${JSON.stringify(calendar.reviewed_on)}`,
  );
  assert.ok(calendar.note_i18n?.en?.length > 40, "Every calendar carries the sentence that explains what the months mean");
  for (const w of calendar.windows) {
    assert.ok(w.label && Number.isInteger(w.start_month) && Number.isInteger(w.end_month), "Every window has a label and two months");
    assert.ok(w.start_month >= 1 && w.start_month <= 12 && w.end_month >= 1 && w.end_month <= 12, "Months stay inside the year");
    assert.ok(Array.isArray(w.regions) && w.regions.length > 0, "Every window names the growing regions");
    assert.ok(typeof w.note === "string" && w.note.length > 20, "Every window explains what happens in those months");
  }
}

const byShape = calendars.map((c) => c.windows.map((w) => `${w.start_month}-${w.end_month}`).join(","));
assert.ok(byShape.includes("2-4"), "Pepper is February to April, which is where VPSA places the 2026 crop");
assert.ok(byShape.includes("1-5"), "Cashew runs January to May across the provinces");
assert.ok(byShape.includes("3-5,8-11"), "Cinnamon and star anise carry both the spring and the autumn crop");

const cashewCalendar = calendars.find((c) => c.windows.some((w) => w.start_month === 1));
assert.ok(
  cashewCalendar.windows[0].note.includes("Binh Phuoc"),
  "The cashew window explains that Binh Phuoc is now part of Dong Nai, instead of listing a province that no longer exists",
);
assert.ok(
  !cashewCalendar.windows[0].regions.includes("Binh Phuoc"),
  "Binh Phuoc is not listed as a current province",
);

/* ---------------- 3. Nội dung ---------------- */

const banned = [
  "shortlist",
  "seamless",
  "elevate",
  "empower",
  "look no further",
  "in today's",
  "—",
  "–",
];
for (const word of banned) {
  assert.ok(!corpus.toLowerCase().includes(word.toLowerCase()), `Copy must not contain "${word}"`);
}

assert.ok(
  !/\[[^\]]*\]/.test(corpus),
  "No square bracket placeholders reach a public page, so nothing is published half filled",
);

assert.ok(
  /Vexim steps in only when the spec you need is not listed here/.test(corpus) ||
    /Send Vexim only the spec that is not on the page/.test(corpus) ||
    /Send your requirements to Vexim only for what is not on this page/.test(corpus),
  "Every category keeps the buyer-first flow: the buyer deals with the supplier, Vexim is the exception",
);

/** Tìm một chuỗi trong các khối đã parse theo đoạn mở đầu, thay vì dò trên văn bản thô. */
function englishStartingWith(prefix) {
  const found = allBlocks.flatMap((b) => strings(b)).find((text) => text.startsWith(prefix));
  assert.ok(found, `No English string starts with "${prefix}"`);
  return found;
}

const intros = {
  pepper: englishStartingWith("Vietnamese black and white pepper"),
  cashew: englishStartingWith("Vietnamese cashew kernels graded"),
  spice: englishStartingWith("Whole cassia bark and star anise"),
};
for (const [name, intro] of Object.entries(intros)) {
  assert.ok(!intro.startsWith("<p>"), `The ${name} introduction is the short paragraph, not the long body`);
  const words = intro.trim().split(/\s+/).length;
  assert.ok(words >= 40 && words <= 60, `The ${name} introduction is ${words} words, outside the 40 to 60 window`);
}

for (const block of allBlocks) {
  if (block && typeof block.en === "string" && block.en.startsWith("<p>")) {
    assert.ok(block.en.includes("</p>"), "Body copy is HTML paragraphs, which is what the page sanitizes and renders");
  }
}

/* ---------------- 4. Câu hỏi thường gặp ---------------- */

const faqSets = allBlocks.filter((b) => Array.isArray(b) && b.every((entry) => entry && typeof entry.q === "string"));
assert.equal(faqSets.length, 3, "Each launch category carries its own questions");

for (const set of faqSets) {
  assert.ok(set.length >= 6, `A category with only ${set.length} questions leaves buyers asking the rest by email`);
  const questions = set.map((f) => f.q);
  assert.equal(new Set(questions).size, questions.length, "No question is asked twice");
  for (const entry of set) {
    assert.ok(entry.a.trim().length > 40, `The answer to "${entry.q}" is too short to be useful`);
  }
}

const pepperFaqs = faqSets.find((set) => set.some((f) => /500 g\/L/.test(f.q)));
assert.ok(pepperFaqs, "Pepper explains what a density grade means, which is the first thing a buyer asks");

const cashewFaqs = faqSets.find((set) => set.some((f) => /W numbers/.test(f.q)));
assert.ok(cashewFaqs, "Cashew explains the AFI counts");
assert.ok(
  cashewFaqs.some((f) => /080131/.test(f.a)),
  "Cashew separates raw nuts from kernels, because the two are priced in different markets",
);

/* ---------------- Bảng quy cách và trường sản phẩm ---------------- */

const specRowSets = allBlocks.filter((b) => Array.isArray(b) && b.every((r) => r && r.values));
assert.equal(specRowSets.length, 3, "Every launch category has a specification table");

const cashewRows = specRowSets.find((rows) => rows.some((r) => r.values.code === "W320"));
for (const grade of ["W180", "W240", "W320", "W450", "SW", "WS", "LP", "SP"]) {
  assert.ok(cashewRows.some((r) => r.values.code === grade), `The cashew table lists ${grade}`);
}

const fieldSets = allBlocks.filter((b) => Array.isArray(b) && b.every((f) => f && f.key && f.type));
assert.equal(fieldSets.length, 3, "Every launch category can filter products by its own trade grade");

console.log("✅ check-launch-categories: cấu trúc, đơn vị giá, mùa vụ có nguồn, nội dung sạch và FAQ của ba danh mục ra mắt đều đạt");
