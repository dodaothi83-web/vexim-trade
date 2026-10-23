#!/usr/bin/env node
// node --experimental-strip-types --no-warnings scripts/check-category-faq-copy.mjs
//
// Kiểm phần chuẩn hoá câu hỏi thường gặp của danh mục.
//
// Lỗi gốc: hai quy tắc thay thế chồng nhau biến "a shortlist of 2 to 4 matching
// suppliers" thành "a shortlist of matching suppliers matching suppliers" trên
// trang công khai. Quy tắc thứ hai thay một con số trần, nên nó cũng phá luôn
// "ships in 2 to 4 weeks" thành "ships in matching suppliers weeks".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { categoryFaqs, normalizeCategoryFaqText, STANDARD_CATEGORY_FAQS } from "../lib/public/category-faq.ts";

/* ---------------- Không nhân đôi cụm từ ---------------- */

assert.equal(
  normalizeCategoryFaqText("You receive a shortlist of 2 to 4 matching suppliers within one business day."),
  "You receive a shortlist of matching suppliers within one business day.",
  "A count followed by 'matching suppliers' is replaced once, not twice",
);

assert.equal(
  normalizeCategoryFaqText("We send 2 to 4 suppliers."),
  "We send matching suppliers.",
  "A bare count of suppliers is replaced",
);

assert.equal(
  normalizeCategoryFaqText("The request goes to 2 to 4 supplier options."),
  "The request goes to matching suppliers.",
  "Supplier options are replaced too",
);

/* ---------------- Không phá câu khác ---------------- */

assert.equal(
  normalizeCategoryFaqText("Shipment follows 2 to 4 weeks after the deposit."),
  "Shipment follows 2 to 4 weeks after the deposit.",
  "A lead time is not a supplier count and must survive untouched",
);

assert.equal(
  normalizeCategoryFaqText("Moisture is capped at 12 to 13.5 percent."),
  "Moisture is capped at 12 to 13.5 percent.",
  "A technical range is left alone",
);

assert.equal(normalizeCategoryFaqText("  spaced   out  "), "spaced out", "Runaway whitespace is collapsed");

/* ---------------- Đọc dữ liệu từ database ---------------- */

const stored = categoryFaqs([
  { q: "Do you charge buyers?", a: "No. Requesting a quote is free." },
  { q: "  ", a: "Missing question is dropped" },
  { question: "Legacy shape", answer: "Older rows use question and answer keys." },
]);
assert.equal(stored.length, 4, "Two usable rows plus the legacy shape, then the two standard questions, and the empty row dropped");
assert.equal(stored[0].q, "Do you charge buyers?");
assert.ok(
  stored.some((f) => f.q === "Legacy shape"),
  "Rows stored as question and answer still render",
);

/* ---------------- Câu chuẩn chỉ được thêm khi thiếu ---------------- */

const withSpecific = categoryFaqs([
  { q: "Can I request a quote from a specific supplier?", a: "Yes, it goes to that supplier first." },
]);
assert.ok(
  !withSpecific.some((f) => f.q === STANDARD_CATEGORY_FAQS[0].q && withSpecific.filter((x) => x.q === f.q).length > 1),
  "A hand-written answer to the standard question is not duplicated",
);

const bare = categoryFaqs([{ q: "Do you charge buyers?", a: "No." }]);
assert.equal(bare.length, 3, "A category with one question picks up the two standard ones");
assert.deepEqual(
  bare.slice(1).map((f) => f.q),
  [STANDARD_CATEGORY_FAQS[0].q, STANDARD_CATEGORY_FAQS[1].q],
  "The standard questions are appended in a stable order",
);

assert.deepEqual(categoryFaqs(null), [], "No stored questions means no block, not a crash");
assert.deepEqual(categoryFaqs([]), [], "An empty list means no block");

/* ---------------- Trang danh mục dùng đúng module ---------------- */

const page = readFileSync(new URL("../app/(public)/products/[slug]/page.tsx", import.meta.url), "utf8");
assert.ok(
  page.includes('import { categoryFaqs } from "@/lib/public/category-faq"'),
  "The category page imports the shared module instead of keeping a private copy",
);
assert.ok(!page.includes("function normalizeCategoryFaqText"), "The buggy private copy is gone from the page");
assert.ok(!/\.replace\(\/\\b2/.test(page), "No bare number rule is left behind in the page");

console.log("✅ check-category-faq-copy: không nhân đôi cụm từ, không phá thời gian giao hàng, câu chuẩn chỉ thêm khi thiếu");
