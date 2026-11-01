// node scripts/check-email-copy.mjs — thư gửi nhà cung cấp và người mua không dùng ký tự máy.
//
// Quy tắc lấy từ docs/copy-style.md và docs/email-lifecycle-plan.md mục 1c:
//   - không gạch dài "—", gạch ngắn "–", mũi tên "→/←", emoji trong nội dung thư;
//   - Vexim tự xưng "Vexim", không "chúng tôi";
//   - gọi người nhận là "bạn", không "Anh/Chị", không "Kính gửi"/"Trân trọng".
//
// Chỉ quét chuỗi hiển thị trong các tệp soạn thư. Dòng có `// copy-allow: <lý do>` được bỏ qua
// (cùng quy ước với scripts/check-ui-copy.mjs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FILES = [
  'lib/email/rfq.ts',
  'lib/email/service-inquiry.ts',
  'lib/email/stage-content.ts',
  'lib/email/templates.ts',
  'lib/email/send.ts',
  'lib/rfq/outreach.ts',
  'lib/rfq/buyer-notify.ts',
  'lib/supplier-portal/notify.ts',
  'lib/supplier-portal/reminders.ts',
];

const MACHINE_CHARS = /[—–→←]|\p{Extended_Pictographic}/u;
const MACHINE_PHRASES = [
  { pattern: /chúng tôi/i, why: 'Vexim tự xưng "Vexim", không "chúng tôi"' },
  { pattern: /Kính gửi/i, why: 'gọi người nhận là "bạn", không "Kính gửi"' },
  { pattern: /Trân trọng/i, why: 'kết thư bằng tên Vexim, không "Trân trọng"' },
  { pattern: /Anh\/Chị/i, why: 'gọi người nhận là "bạn", không "Anh/Chị"' },
  { pattern: /quý khách/i, why: 'gọi người nhận là "bạn", không "quý khách"' },
  { pattern: /kính mong/i, why: 'bỏ lời rào đón, nói thẳng việc cần làm' },
];

const problems = [];
let checked = 0;

for (const file of FILES) {
  const lines = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').split('\n');
  lines.forEach((line, index) => {
    if (/copy-allow/.test(line)) return;
    // Bỏ dòng chú thích và phần chú thích cuối dòng (giữ URL https://…).
    const code = line
      .replace(/^\s*(\/\/|\*|\/\*).*$/, '')
      .replace(/(^|\s)\/\/.*$/, '$1');
    if (!code.trim()) return;
    checked += 1;
    const at = `${file}:${index + 1}`;
    const char = code.match(MACHINE_CHARS);
    if (char) problems.push(`${at}: ký tự máy "${char[0]}" — ${line.trim().slice(0, 90)}`);
    for (const rule of MACHINE_PHRASES) {
      if (rule.pattern.test(code)) problems.push(`${at}: ${rule.why} — ${line.trim().slice(0, 90)}`);
    }
  });
}

assert.ok(checked > 100, `Quét được quá ít dòng (${checked}); danh sách tệp có thể sai.`);
assert.deepEqual(problems, [], `Văn phong thư chưa đạt:\n${problems.join('\n')}`);

console.log(`✅ Email copy: ${checked} dòng trong ${FILES.length} tệp soạn thư không dùng ký tự máy hay giọng máy.`);
