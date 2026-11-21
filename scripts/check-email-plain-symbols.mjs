// Email gửi cho người mua, nhà cung cấp và nhân viên viết bằng chữ thường, không dùng ký hiệu kiểu AI:
// gạch dài, mũi tên, chấm giữa, dấu tích, gạch đầu dòng tròn, dấu ba chấm liền, emoji (kể cả dạng &rarr;).
// Bỏ qua dòng chú thích và dòng có đánh dấu "copy-allow".
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const FILES = [
  "lib/buyer/alerts-server.ts", "lib/buyer/alerts.ts", "lib/buyer/digest-server.ts", "lib/buyer/digest.ts", "lib/buyer/introductions-server.ts",
  "lib/email/templates.ts", "lib/email/rfq.ts", "lib/email/buyer-auth.ts", "lib/email/service-inquiry.ts", "lib/email/stage-content.ts", "lib/email/signature.ts",
  "lib/rfq/buyer-notify.ts", "lib/rfq/direct-followup.ts", "lib/rfq/mediated-alerts.ts", "lib/rfq/outreach.ts", "lib/rfq/portal-alerts.ts", "lib/rfq/targeted-portal.ts",
  "lib/chat/notify.ts", "lib/sourcing/mail.ts",
  "lib/supplier-portal/notify.ts", "lib/supplier-portal/reminders.ts", "lib/supplier-portal/weekly-report.ts", "lib/supplier-portal/plan-expiry-server.ts",
  "app/api/auth/forgot-password/route.ts",
];
const SYMBOL = /[—–→←⇒✓✔✅•·…]|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]|&(rarr|larr|middot|mdash|ndash|bull|hellip|check);/u;
const problems = [];
for (const file of FILES) {
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8").split("\n").forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*") || line.includes("copy-allow")) return;
    const code = line.replace(/\s\/\/\s.*$/, "");
    if (SYMBOL.test(code)) problems.push(`${file}:${index + 1}: ${trimmed.slice(0, 100)}`);
  });
}
assert.deepEqual(problems, [], `Email còn ký hiệu kiểu AI:\n${problems.join("\n")}`);
console.log(`check-email-plain-symbols: ${FILES.length} tệp email không có ký hiệu kiểu AI`);
