// node scripts/check-buyer-email-language.mjs — thư gửi người mua: tiếng Anh, mã ở cuối tiêu đề,
// và nối mạch thư bằng In-Reply-To/References.
//
// README dòng 9 chốt: "email gửi buyer tiếng Anh, email gửi NCC tiếng Việt".
// Ba luật dưới đây đều là thứ đã từng sai một lần, nên giữ bằng máy:
//   1. Chỉ tiếng Anh: người mua nước ngoài không nhận thư nửa Anh nửa Việt.
//   2. Mã RFQ đặt ở CUỐI tiêu đề dạng "(Ref …)", không đứng đầu trong ngoặc vuông:
//      trên điện thoại hộp thư chỉ hiện ~40 ký tự đầu, phần cần thấy là mặt hàng.
//   3. Thư tự động phải mở mạch thư (openThread) để Gmail/Outlook gom một chuỗi.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậđêềếểễệôồốổỗộơờớởỡợưừứửữựýỳỷỹỵ]/i;

/** Bỏ chú thích (giữ nguyên chuỗi https://…) để không bắt oan ghi chú tiếng Việt. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

function read(file) {
  return readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
}

function region(file, startMarker, endMarker) {
  const source = read(file);
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${file}: không tìm thấy mốc "${startMarker}"`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `${file}: không tìm thấy mốc kết "${endMarker}"`);
  return { file, text: stripComments(source.slice(start, end)) };
}

// Các hàm soạn thư gửi người mua (không tính thư nhà cung cấp trong cùng tệp).
const builders = [
  region('lib/rfq/buyer-notify.ts', 'function buildSubject(', 'export async function notifyBuyerRfqStatus'),
  region('lib/rfq/outreach.ts', 'export function buildRfqShortlistBuyerEmail', 'function stripHtml('),
  region('lib/email/rfq.ts', 'export async function sendRfqAckBuyer', '/* 2) Thông báo nội bộ'),
  region('lib/email/templates.ts', 'export function buildBuyerEmail', 'export function buildSupplierEmail'),
];

// Nội dung theo giai đoạn: khối buyer của mỗi giai đoạn cũng phải là tiếng Anh.
const stageSource = stripComments(read('lib/email/stage-content.ts'));
const stageBlocks = [...stageSource.matchAll(/buyer: \{([\s\S]*?)\n    \},\n    supplier: \{/g)].map((match) => ({
  file: 'lib/email/stage-content.ts',
  text: match[1],
}));

const problems = [];
for (const block of [...builders, ...stageBlocks]) {
  block.text.split('\n').forEach((line) => {
    const char = line.match(VIETNAMESE);
    if (char) problems.push(`${block.file}: "${char[0]}" trong dòng soạn thư: ${line.trim().slice(0, 90)}`);
  });
}

for (const block of builders) {
  if (!block.text.includes('(Ref ')) {
    problems.push(`${block.file}: thiếu mã tham chiếu dạng "(Ref <mã RFQ>)" ở cuối tiêu đề`);
  }
  for (const line of block.text.split('\n')) {
    if (/`\[\$\{/.test(line) || /subject\s*=\s*`\[/.test(line)) {
      problems.push(`${block.file}: mã đứng đầu tiêu đề trong ngoặc vuông: ${line.trim().slice(0, 90)}`);
    }
  }
}

// Ba đường thư tự động phải nối mạch thư; thiếu thì Gmail tách mỗi thư một chuỗi.
for (const file of ['lib/rfq/buyer-notify.ts', 'lib/rfq/outreach.ts', 'lib/email/rfq.ts', 'lib/email/send.ts']) {
  const source = stripComments(read(file));
  if (!source.includes('openThread(')) problems.push(`${file}: thư tự động chưa nối mạch (thiếu openThread)`);
  if (!source.includes('mailThread.headers')) problems.push(`${file}: chưa gắn In-Reply-To/References vào header gửi`);
}

assert.ok(builders.length + stageBlocks.length >= 12, `Chỉ quét được ${builders.length + stageBlocks.length} khối; mốc tệp có thể đã đổi.`);
assert.deepEqual(problems, [], `Thư gửi người mua chưa đạt:\n${problems.join('\n')}`);

console.log(`✅ Buyer email: ${builders.length + stageBlocks.length} khối soạn thư tiếng Anh, mã ở cuối tiêu đề, có nối mạch thư.`);
