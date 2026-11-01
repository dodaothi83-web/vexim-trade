// node scripts/check-buyer-email-language.mjs — thư gửi người mua phải là tiếng Anh.
//
// README dòng 9 chốt: "email gửi buyer tiếng Anh, email gửi NCC tiếng Việt".
// Trước đây hai đường thư (bảng so sánh nhà cung cấp, báo chọn mẫu / tạm dừng) viết
// tiếng Việt nên người mua nước ngoài nhận thư nửa Anh nửa Việt. Bài kiểm tra này
// chặn tái phát: quét đúng phần soạn thư gửi người mua và bắt buộc không có dấu tiếng Việt.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậđêềếểễệôồốổỗộơờớởỡợưừứửữựýỳỷỹỵ]/i;

/** Bỏ chú thích (giữ nguyên chuỗi https://…) để không bắt oan ghi chú tiếng Việt. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

function region(file, startMarker, endMarker) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${file}: không tìm thấy mốc "${startMarker}"`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `${file}: không tìm thấy mốc kết "${endMarker}"`);
  return { file, text: stripComments(source.slice(start, end)) };
}

const blocks = [
  region('lib/rfq/buyer-notify.ts', 'function buildSubject(', 'export async function notifyBuyerRfqStatus'),
  region('lib/rfq/outreach.ts', 'export function buildRfqShortlistBuyerEmail', 'function stripHtml('),
  region('lib/email/rfq.ts', 'export async function sendRfqAckBuyer', '/* 2) Thông báo nội bộ'),
  region('lib/email/templates.ts', 'export function buildBuyerEmail', 'export function buildSupplierEmail'),
];

// Nội dung theo giai đoạn: khối buyer của mỗi giai đoạn phải là tiếng Anh.
const stageSource = stripComments(
  readFileSync(new URL('../lib/email/stage-content.ts', import.meta.url), 'utf8'),
);
for (const match of stageSource.matchAll(/buyer: \{([\s\S]*?)\n    \},\n    supplier: \{/g)) {
  blocks.push({ file: 'lib/email/stage-content.ts', text: match[1] });
}

const problems = [];
for (const block of blocks) {
  block.text.split('\n').forEach((line, index) => {
    const char = line.match(VIETNAMESE);
    if (char) problems.push(`${block.file}: "${char[0]}" trong dòng soạn thư: ${line.trim().slice(0, 90)}`);
  });
}

assert.ok(blocks.length >= 6, `Chỉ quét được ${blocks.length} khối; mốc tệp có thể đã đổi.`);
assert.deepEqual(problems, [], `Thư gửi người mua còn tiếng Việt:\n${problems.join('\n')}`);

console.log(`✅ Buyer email: ${blocks.length} khối soạn thư gửi người mua đều là tiếng Anh.`);
