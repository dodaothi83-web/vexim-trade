#!/usr/bin/env node
/**
 * Kiểm tra bộ lọc phong cách cho bản nháp AI: bỏ dấu gạch dài, ký hiệu
 * markdown, gạch đầu dòng đánh số và emoji, giữ nguyên đoạn văn.
 * Chạy: node --experimental-strip-types --no-warnings scripts/check-ai-draft-style.mjs
 */
import assert from "node:assert/strict";

import { sanitizeDraftText } from "../lib/ai/draft-style.ts";

const dirty = `## Cashew from Vietnam

Vietnam is a **leading** exporter — known for *steady* supply – and careful grading. 🚀

- Grades W240 and W320
1. MOQ from 5 MT

"Buyers usually start with samples."`;

const clean = sanitizeDraftText(dirty);
assert.ok(!clean.includes("—") && !clean.includes("–"), "còn dấu gạch dài");
assert.ok(!clean.includes("**") && !clean.includes("##"), "còn ký hiệu markdown");
assert.ok(!/^\s*[-•]\s/m.test(clean) && !/^\s*\d+[.)]\s/m.test(clean), "còn gạch đầu dòng");
assert.ok(!clean.includes("🚀"), "còn emoji");
assert.ok(clean.includes("Vietnam is a leading exporter, known for steady supply, and careful grading."));
assert.ok(clean.includes("Grades W240 and W320"));
assert.ok(clean.includes("MOQ from 5 MT"));
assert.ok(clean.split("\n\n").length >= 2, "mất cấu trúc đoạn văn");

console.log("ĐẠT: bộ lọc phong cách loại bỏ dấu vết AI và giữ nguyên đoạn văn.");
