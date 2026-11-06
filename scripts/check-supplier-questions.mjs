// node scripts/check-supplier-questions.mjs
// Câu hỏi "Ask supplier" trên cổng nhà cung cấp: chỉ câu hỏi đã gửi thật, đúng nhà cung cấp,
// người mua đã đồng ý chia sẻ liên hệ; nhà cung cấp chỉ đánh dấu được câu hỏi của chính mình.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const src = fs.readFileSync(new URL('../lib/supplier-portal/questions.ts', import.meta.url), 'utf8');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { module: mod, exports: mod.exports, Date, console: { ...console, error() {} }, require: (id) => {
    if (id === '@/lib/rfq/reply-routing') return { supplierReplyAddress: (code, matchId) => `rfq+${code.toLowerCase()}-m${matchId}@veximtrade.com` };
    assert.equal(id, '@/lib/public/product-selection', `Unexpected ${id}`);
    return { withoutDirectContacts: (v) => String(v ?? '') };
  } });
const q = mod.exports;

const Q = '/rfq?intent=question';
const rfqs = {
  ok: { id: 'ok', code: 'RFQ-Q-1', status: 'matching', buyer_id: 'b1', product_text: 'Cashew W320', preferred_supplier_ids: ['s1'], source_page: Q, specs: { inquiry_kind: 'supplier_question', contact_share_consent: true, notes: 'Do you have 10 MT?' } },
  noConsent: { id: 'noConsent', code: 'RFQ-Q-2', status: 'matching', buyer_id: 'b1', product_text: 'X', preferred_supplier_ids: ['s1'], source_page: Q, specs: { inquiry_kind: 'supplier_question', contact_share_consent: false, notes: 'x' } },
  spam: { id: 'spam', code: 'RFQ-Q-3', status: 'spam', buyer_id: 'b1', product_text: 'X', preferred_supplier_ids: ['s1'], source_page: Q, specs: { inquiry_kind: 'supplier_question', contact_share_consent: true, notes: 'x' } },
  twoSuppliers: { id: 'twoSuppliers', code: 'RFQ-Q-4', status: 'matching', buyer_id: 'b1', product_text: 'X', preferred_supplier_ids: ['s1', 's2'], source_page: Q, specs: { inquiry_kind: 'supplier_question', contact_share_consent: true, notes: 'x' } },
  quote: { id: 'quote', code: 'RFQ-1', status: 'matching', buyer_id: 'b1', product_text: 'Pepper', preferred_supplier_ids: ['s1'], source_page: '/products/p', specs: {} },
};
const invite = (id, rfqId, extra = {}) => ({ id, rfq_id: rfqId, supplier_id: 's1', status: 'sent_to_supplier', sent_to_supplier_at: '2026-11-05T04:13:38Z', supplier_replied_at: null, rfq: { code: rfqs[rfqId].code, source_page: rfqs[rfqId].source_page, product_text: rfqs[rfqId].product_text }, ...extra });
const matches = new Map();
const audits = [];
const store = {
  getRfq: async (id) => rfqs[id] ?? null,
  getBuyer: async () => ({ id: 'b1', contact_name: 'Anna', company: 'Acme GmbH', email: 'anna@acme.de' }),
  getRfqMatch: async (id) => matches.get(id) ?? null,
  updateRfqMatch: async (id, patch) => { matches.set(id, { ...matches.get(id), ...patch }); },
  addAuditLog: async (e) => audits.push(e),
};
const invites = [
  invite('m-ok', 'ok'), invite('m-noConsent', 'noConsent'), invite('m-spam', 'spam'), invite('m-two', 'twoSuppliers'),
  invite('m-quote', 'quote'), invite('m-unsent', 'ok', { sent_to_supplier_at: null }), invite('m-foreign', 'ok', { supplier_id: 's2' }),
];
const list = await q.listSupplierQuestions(store, 's1', invites);
assert.equal(list.length, 1, 'Chỉ câu hỏi đã gửi, đúng nhà cung cấp, có đồng ý chia sẻ liên hệ và không bị cách ly');
assert.equal(list[0].matchId, 'm-ok');
assert.equal(list[0].question, 'Do you have 10 MT?');
assert.equal(list[0].buyerEmail, 'anna@acme.de');
assert.equal(list[0].replySubject, 'Re: [RFQ-Q-1] Câu hỏi sản phẩm: Cashew W320', 'Cùng tiêu đề với email gốc để giữ mạch thư');
assert.equal(list[0].answeredAt, null);
assert.equal(list[0].recordAddress, 'rfq+rfq-q-1-mm-ok@veximtrade.com', 'Nút trả lời Cc hộp định tuyến của đúng lời mời');

for (const inv of invites) matches.set(inv.id, { ...inv });
await assert.rejects(q.markSupplierQuestionAnswered({ store, supplierId: 's2', actorEmail: 'x@y.z', matchId: 'm-ok' }), /notFound/, 'Không đánh dấu được câu hỏi của nhà cung cấp khác');
await assert.rejects(q.markSupplierQuestionAnswered({ store, supplierId: 's1', actorEmail: 'x@y.z', matchId: 'm-quote' }), /notFound/, 'RFQ báo giá không đi qua nút này');
await assert.rejects(q.markSupplierQuestionAnswered({ store, supplierId: 's1', actorEmail: 'x@y.z', matchId: 'm-unsent' }), /notFound/);
await q.markSupplierQuestionAnswered({ store, supplierId: 's1', actorEmail: 'sup@vn.vn', matchId: 'm-ok' });
assert.ok(matches.get('m-ok').supplier_replied_at, 'Ghi mốc đã trả lời');
assert.equal(matches.get('m-ok').status, 'sent_to_supplier', 'Không đổi trạng thái lời mời');
assert.equal(audits.at(-1).action, 'supplier_portal.question_answered');
const before = matches.get('m-ok').supplier_replied_at;
await q.markSupplierQuestionAnswered({ store, supplierId: 's1', actorEmail: 'sup@vn.vn', matchId: 'm-ok' });
assert.equal(matches.get('m-ok').supplier_replied_at, before, 'Bấm lại không ghi đè mốc cũ');

const page = fs.readFileSync(new URL('../app/supplier/portal/rfqs/page.tsx', import.meta.url), 'utf8');
assert.match(page, /id="cau-hoi"/);
assert.match(page, /listSupplierQuestions\(store, supplier\.id, invites\)/);
assert.match(page, /markQuestionAnsweredAction/);
assert.match(page, /cc=\{q\.recordAddress\}/, 'Trả lời từ cổng đi qua bộ định tuyến thư có sẵn');
const question = fs.readFileSync(new URL('../lib/rfq/supplier-question.ts', import.meta.url), 'utf8');
assert.match(question, /replyTo: \[buyer\.email, supplierReplyAddress\(rfq\.code, match\.id\)\]/,
  'Email câu hỏi: trả lời tới người mua và hộp định tuyến, để bộ nhận thư lưu timeline và tự ghi đã trả lời');
const send = fs.readFileSync(new URL('../lib/email/send.ts', import.meta.url), 'utf8');
assert.match(send, /replyTo\?: string \| string\[\] \| null/);
assert.match(fs.readFileSync(new URL('../app/supplier/portal/rfqs/question-actions.ts', import.meta.url), 'utf8'), /supplierId: access\.supplier\.id/, 'Chủ sở hữu lấy từ phiên đăng nhập, không lấy từ form');
console.log('✅ Supplier questions: delivered, consented, own-supplier only; mark answered is scoped and idempotent.');
