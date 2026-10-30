#!/usr/bin/env node
/**
 * Kiểm tra bộ đọc FAQ do AI soạn: chấp nhận JSON thuần hoặc JSON trong
 * khung ```json, làm sạch ký hiệu kiểu AI trong từng câu, chống trùng lặp
 * và giới hạn số lượng. Kết quả rác phải trả về mảng rỗng.
 * Chạy: node --experimental-strip-types --no-warnings scripts/check-ai-faq-draft.mjs
 */
import assert from "node:assert/strict";

import { parseFaqDraft } from "../lib/ai/draft-style.ts";

const plain = JSON.stringify({
  faqs: [
    { q: "What is the minimum order quantity?", a: "Most suppliers start from 5 MT — confirm in the quotation." },
    { q: "Can I order samples first?", a: "Yes. Ask for samples before a bulk order. 🚀" },
  ],
});
const items = parseFaqDraft(plain);
assert.equal(items.length, 2);
assert.ok(!items[0].a.includes("—"), "câu trả lời còn dấu gạch dài");
assert.ok(items[0].a.includes("5 MT, confirm"));
assert.ok(!items[1].a.includes("🚀"), "câu trả lời còn emoji");

const fenced = "```json\n" + JSON.stringify({ faqs: [{ q: "**How** do I get a quote?", a: "Send a request and wait one business day." }] }) + "\n```";
const fencedItems = parseFaqDraft(fenced);
assert.equal(fencedItems.length, 1);
assert.equal(fencedItems[0].q, "How do I get a quote?");

const duplicates = JSON.stringify({
  faqs: [
    { q: "Same question?", a: "First answer." },
    { q: "same question?", a: "Second answer." },
    { q: "", a: "No question." },
    { q: "No answer?", a: "   " },
  ],
});
assert.equal(parseFaqDraft(duplicates).length, 1, "chưa chống trùng hoặc chưa bỏ mục rỗng");

const many = JSON.stringify({ faqs: Array.from({ length: 9 }, (_, i) => ({ q: `Question ${i + 1}?`, a: "Answer." })) });
assert.equal(parseFaqDraft(many).length, 6, "chưa giới hạn 6 câu");

assert.deepEqual(parseFaqDraft("Đây không phải JSON"), []);
assert.deepEqual(parseFaqDraft(""), []);

console.log("ĐẠT: bộ đọc FAQ làm sạch ký hiệu AI, chống trùng và giới hạn số câu.");
