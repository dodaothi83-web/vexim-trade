// node scripts/check-supplier-question.mjs — Ask supplier dùng chat; form RFQ không còn gửi câu hỏi qua email.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, mocks) {
  const output = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(output, { module: mod, exports: mod.exports, process, console, Date, Map, Set, URLSearchParams,
    require: (key) => {
      if (key === "@/lib/brand/colors.json") return { default: JSON.parse(fs.readFileSync(new URL("../lib/brand/colors.json", import.meta.url), "utf8")) }; assert.ok(key in mocks, `Unexpected ${key} in ${path}`); return mocks[key]; },
  }, { filename: path });
  return mod.exports;
}
const supplier = { id: 's-a' };
// Gửi RFQ thật qua submitRfq: câu hỏi kiểu cũ bị từ chối, báo giá giữ nguyên.
process.env.RFQ_REJECT_WEBMAIL = 'false';
const createdRfqs = [];
const createdBuyers = [];
const buyerUpdates = [];
let listedBuyers = [];
let autoMatches = 0;
let genericAcks = 0;
let genericInternal = 0;
let spamScore = 0;
const category = { id: 'cat-1', slug: 'cashew', status: 'published', is_published: true };
const submitStore = {
  listBuyers: async () => listedBuyers,
  createBuyer: async (input) => { createdBuyers.push(input); return { id: 'buyer-1', ...input }; },
  updateBuyer: async (id, patch) => {
    buyerUpdates.push({ id, patch });
    const current = listedBuyers.find((item) => item.id === id) ?? createdBuyers.at(-1) ?? {};
    return { ...current, id, ...patch };
  },
  getCategoryBySlug: async () => category,
  listRfqs: async () => [],
  createRfq: async (input) => { createdRfqs.push(input); return { ...input, id: `r-${createdRfqs.length}`, access_token: 'private-token' }; },
  addAuditLog: async () => null,
};
let buyerSession = { uid: 'buyer-account', email: 'buyer@example.com' };
const submit = load('../lib/rfq/submit.ts', {
  '@/lib/auth/buyer-session': { getBuyerSession: async () => buyerSession },
  'next/headers': { headers: async () => ({ get: () => null }) },
  '@/lib/db': { getStore: () => submitStore },
  '@/lib/public/catalog': { listPublicSuppliers: async () => [{ id: supplier.id }] },
  '@/lib/public/product-catalog': { listPublicCategoryProducts: async () => [{ id: 'p-a', name: 'Cashew W320', supplierId: supplier.id }] },
  '@/lib/email/rfq': { sendRfqAckBuyer: async () => { genericAcks++; }, sendRfqNewInternal: async () => { genericInternal++; } },
  '.': { emailDomain: () => 'example.com', fingerprint: () => 'test', generateAccessToken: () => 'private-token', rfqDayKey: () => '20261017', generateRfqCode: () => 'RFQ-Q-1',
    hasMxRecord: async () => ({ ok: true }), isLikelyWebmail: () => false, normalizeCompanyWebsite: () => null,
    scoreSpam: (input) => ({ score: spamScore + (input.challengeOk ? 0 : 60), flags: input.challengeOk ? [] : ['challenge_missing'] }) },
  './targeted-portal': { releaseTargetedQuoteToPortal: async () => 0 },
  './auto-match': { createPreferredSupplierMatches: async () => { autoMatches++; return []; } },
  './enrich': { scheduleRfqEnrichment: () => {} },
  './rate-limit': { gcRateLimit() {}, rateLimit: () => ({ ok: true }) },
  '@/lib/security/challenge': { verifyFormChallenge: ({ token }) => (token ? { ok: true } : { ok: false, reason: 'missing' }) },
});
const rawQuestion = {
  company: 'Buyer Co', contact_name: 'Jane Doe', email: 'buyer@example.com', consent: true, challenge_token: 'solved-token',
  product_text: 'Cashew W320', category_slug: 'cashew', source_product_id: 'p-a', preferred_supplier_ids: [supplier.id],
  inquiry_kind: 'supplier_question', share_contact_consent: true,
  message: 'Can you confirm the peroxide value and available packaging?',
};

// Neither a forged email nor a staff/supplier-only (no buyer cookie) request may write or send.
buyerSession = null;
assert.equal((await submit.submitRfq({ ...rawQuestion, inquiry_kind: 'quote' })).ok, false);
buyerSession = { uid: 'buyer-account', email: 'other@example.com' };
assert.equal((await submit.submitRfq({ ...rawQuestion, inquiry_kind: 'quote' })).ok, false);
assert.equal(createdRfqs.length, 0);
buyerSession = { uid: 'buyer-account', email: 'buyer@example.com' };

// Câu hỏi kiểu cũ (email) không còn được nhận: không lưu RFQ, không gửi thư, chỉ dẫn sang chat.
const legacy = await submit.submitRfq(rawQuestion);
assert.equal(legacy.ok, false);
assert.match(legacy.message, /Ask supplier/);
assert.equal(createdRfqs.length, 0, 'Câu hỏi kiểu cũ không tạo RFQ');
assert.equal(genericAcks + genericInternal + autoMatches, 0, 'Câu hỏi kiểu cũ không gửi thư nào');

const quote = await submit.submitRfq({ ...rawQuestion, inquiry_kind: 'quote', share_contact_consent: false,
  quantity: 10, unit: 'MT', destination_country: 'US', message: 'Quote notes' });
assert.equal(quote.ok, true);
assert.equal(quote.supplierDelivered, undefined);
assert.equal(createdBuyers[0].stage, 'lead', 'New RFQ buyers must satisfy buyers_stage_check');
assert.equal(buyerUpdates.length, 0, 'Ordinary quotes do not auto-link a buyer supplier');
assert.equal(genericAcks, 1, 'Quote acknowledgement is unchanged');
assert.equal(genericInternal, 1, 'Quote desk notification is unchanged');
assert.equal(createdRfqs[0].source_page, null);
assert.equal(createdRfqs[0].specs.inquiry_kind, undefined);

// Quote từ trang sản phẩm: giữ attribution theo product_id, KHÔNG so khớp tên.
const quoteFromProduct = await submit.submitRfq({ ...rawQuestion, inquiry_kind: 'quote', share_contact_consent: false,
  product_text: 'Other words entirely', quantity: 5, unit: 'MT', destination_country: 'US' });
assert.equal(quoteFromProduct.ok, true);
assert.equal(createdRfqs.at(-1).source_product_id, 'p-a', 'source_product_id theo product_id đã xác thực, không so tên');
assert.equal(createdRfqs.at(-1).product_text, 'Cashew W320. Other words entirely');

// Vào từ menu (không sản phẩm nguồn) thì mô tả vẫn bắt buộc.
const emptyQuote = await submit.submitRfq({ ...rawQuestion, inquiry_kind: 'quote', share_contact_consent: false,
  product_text: '', source_product_id: null, preferred_supplier_ids: [] });
assert.equal(emptyQuote.ok, false);
assert.match(emptyQuote.message, /mô tả sản phẩm/);

const productPage = fs.readFileSync(new URL('../app/(public)/products/[slug]/[productId]/page.tsx', import.meta.url), 'utf8');
const form = fs.readFileSync(new URL('../app/(public)/rfq/rfq-form.tsx', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../app/(public)/rfq/page.tsx', import.meta.url), 'utf8');
const status = fs.readFileSync(new URL('../components/buyer-enquiry-detail.tsx', import.meta.url), 'utf8');
const crm = fs.readFileSync(new URL('../app/crm/rfqs/[id]/page.tsx', import.meta.url), 'utf8');
const crmList = fs.readFileSync(new URL('../app/crm/rfqs/page.tsx', import.meta.url), 'utf8');
const crmActions = fs.readFileSync(new URL('../app/crm/rfqs/[id]/actions.ts', import.meta.url), 'utf8');
const outreach = fs.readFileSync(new URL('../lib/rfq/outreach.ts', import.meta.url), 'utf8');
assert.match(productPage, /grid grid-cols-2 gap-3/);
assert.match(productPage, /<AskSupplierDialog/);
assert.doesNotMatch(productPage, /href=\{questionRfq\}/);
const dialog = fs.readFileSync(new URL('../components/products/ask-supplier-dialog.tsx', import.meta.url), 'utf8');
assert.match(dialog, /<dialog/);
assert.match(dialog, /showModal\(\)/);
assert.match(dialog, /aria-labelledby="ask-supplier-title"/);
// Ask supplier mở chat trên Vexim, không còn gửi email trực tiếp qua form câu hỏi.
assert.doesNotMatch(dialog, /mode="question"|RfqForm/);
// Cửa sổ chat ngay trên trang sản phẩm, thẻ sản phẩm đính kèm sẵn, không chuyển trang.
assert.match(dialog, /<ChatWorkspace side="buyer" variant="popup"/);
assert.match(dialog, /product=\{product\}/);
assert.doesNotMatch(dialog, /router\.push/);
const workspace = fs.readFileSync(new URL('../components/chat/chat-workspace.tsx', import.meta.url), 'utf8');
assert.match(workspace, /fetch\(`\/api\/chat\/start\?productId=/, 'Mở lại đúng cuộc cũ với nhà cung cấp này');
assert.match(workspace, /creating \? "\/api\/chat\/start"/, 'Tin đầu tiên mới tạo cuộc trò chuyện');
assert.match(workspace, /data-testid="chat-attached-product"/);
assert.match(dialog, /params.get\("ask"\) === "1"/);
assert.doesNotMatch(form, /Send question|supplier_question|onQuestionSuccess/, 'Form RFQ chỉ còn báo giá');
assert.match(page, /mode="quote"/);
assert.match(page, /if \(sp\?.intent === "question"\)/);
assert.match(page, /redirect\(`\/products\/.*\?ask=1`\)/);
assert.doesNotMatch(page, /Ask the supplier/);
assert.match(status, /function questionStatusInfo/);
assert.match(status, /Supplier replies go to your email and are not shown here/);
// Người mua tự ký hợp đồng và tự thanh toán: trạng thái sau khi chọn nhà cung cấp không được
// nói Vexim nhận đơn hay điều phối sản xuất/vận chuyển (trái Điều khoản sử dụng).
assert.doesNotMatch(status, /Order confirmed|coordinate production and shipment/);
assert.match(status, /agreed directly between you and the supplier/);
assert.match(crm, /canManageRfq && !isSupplierQuestion/);
assert.match(crmList, /Câu hỏi nhà cung cấp/);
assert.match(crmList, /return !isSupplierQuestion\(rfq\) && rfq\.status === tab/);
assert.match(crmList, /không tính SLA báo giá/);
assert.match(crmActions, /tạo RFQ mới sau khi người mua đồng ý/);
assert.match(outreach, /không dùng quy trình gửi yêu cầu báo giá/);

console.log('✅ Supplier question: Ask supplier mở chat, form RFQ chỉ còn báo giá, câu hỏi kiểu cũ bị từ chối, câu hỏi cũ trong CRM vẫn đọc được.');
