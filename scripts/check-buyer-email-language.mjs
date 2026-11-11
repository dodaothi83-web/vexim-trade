// Buyer email policy: account/CRM stage emails may still thread; RFQ email is
// link-only notification with an English buyer-facing subject and no Reply-To.
// See check-rfq-email.mjs for rendered content and inbound-alias regression.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậđêềếểễệôồốổỗộơờớởỡợưừứửữựýỳỷỹỵ]/i;
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
/** Preserve URL literals while dropping comments from static checks. */
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
function region(file, startMarker, endMarker) {
  const source = read(file);
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${file}: không tìm thấy mốc "${startMarker}"`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `${file}: không tìm thấy mốc kết "${endMarker}"`);
  return { file, text: stripComments(source.slice(start, end)) };
}

const builders = [
  region('lib/rfq/buyer-notify.ts', 'function buildBody(', 'export async function notifyBuyerRfqStatus'),
  region('lib/email/rfq.ts', 'export async function sendRfqAckBuyer', '/** Sourcing only:'),
  region('lib/email/templates.ts', 'export function buildBuyerEmail', 'export function buildSupplierEmail'),
];
const stageSource = stripComments(read('lib/email/stage-content.ts'));
const stageBlocks = [...stageSource.matchAll(/buyer: \{([\s\S]*?)\n    \},\n    supplier: \{/g)]
  .map((match) => ({ file: 'lib/email/stage-content.ts', text: match[1] }));
assert.ok(builders.length + stageBlocks.length >= 11, 'Thiếu các đoạn email người mua hoặc mẫu theo giai đoạn');
const problems = [];
for (const block of [...builders, ...stageBlocks]) {
  for (const line of block.text.split('\n')) {
    const char = line.match(VIETNAMESE);
    if (char) problems.push(`${block.file}: "${char[0]}" trong thư gửi buyer: ${line.trim().slice(0, 90)}`);
  }
}
for (const block of builders) {
  if (!block.text.includes('(Ref ')) problems.push(`${block.file}: thiếu mã tham chiếu ở CUỐI tiêu đề`);
  if (/subject\s*=\s*`\[/.test(block.text)) problems.push(`${block.file}: mã RFQ đứng đầu tiêu đề`);
}
assert.match(builders[0].text, /\(Ref \$\{rfq\.code\}\)/);
assert.match(builders[1].text, /\(Ref \$\{rfq\.code\}\)/);
assert.match(builders[2].text, /\(Ref \$\{refCode\}\)/);

// The non-RFQ stage lifecycle still opens a real RFC thread, but a portal RFQ
// must never advertise a Reply-To address or use email to deliver a quote.
const stageSender = stripComments(read('lib/email/send.ts'));
assert.match(stageSender, /openThread\(mailTopic\(/);
assert.match(stageSender, /headers: mailThread\.headers/);
for (const file of ['lib/email/rfq.ts', 'lib/rfq/buyer-notify.ts', 'lib/rfq/outreach.ts',
  'lib/rfq/portal-alerts.ts', 'lib/rfq/mediated-alerts.ts', 'lib/sourcing/mail.ts']) {
  const source = stripComments(read(file));
  assert.doesNotMatch(source, /\breplyTo\s*:/, `${file}: RFQ/sourcing notices must not offer a reply alias`);
  assert.doesNotMatch(source, /\bopenThread\s*\(/, `${file}: portal notices do not open an email conversation`);
}
assert.match(builders[0].text, /\/buyer\/account\/requests\//);
assert.match(builders[1].text, /buyerUrl\(rfq\.id\)/);
assert.match(read('lib/email/rfq.ts'), /const buyerUrl = \(id: string\) => `\$\{SITE_URL\}\/buyer\/account\/requests\//);
for (const { file, text } of builders.slice(0, 2)) {
  assert.doesNotMatch(text, /rfq\.(?:product_text|target_price|access_token|lost_reason)/,
    `${file}: request contents and credentials must stay inside the account`);
}
const portal = stripComments(read('lib/rfq/portal-alerts.ts'));
assert.match(portal, /"New quote" : "New message"\} for your request \(Ref \$\{rfq\.code\}\)/,
  'Buyer quote/message notices have an English subject and reference at the end');
const mediation = stripComments(read('lib/rfq/mediated-alerts.ts'));
assert.match(mediation, /thread\.audience === "buyer" \? `New message about your request \(Ref \$\{rfq\.code\}\)`/,
  'Buyer desk notice has an English subject and reference at the end');
assert.deepEqual(problems, [], `Thư gửi người mua chưa đạt:\n${problems.join('\n')}`);
console.log(`✅ Buyer email: ${builders.length + stageBlocks.length} English buyer blocks; portal RFQ notices are link-only without Reply-To, stage mail keeps RFC threading.`);
