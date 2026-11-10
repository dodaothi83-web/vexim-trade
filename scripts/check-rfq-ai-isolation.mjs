// node --experimental-strip-types --no-warnings scripts/check-rfq-ai-isolation.mjs
//
// Chứng minh ràng buộc: AI chỉ là phần thêm, KHÔNG BAO GIỜ làm hỏng việc lưu RFQ.
// Kịch bản xấu được mô phỏng: AI throw, AI treo quá timeout, AI trả JSON rác, thiếu key,
// store lỗi, `after()` không khả dụng, và module enrichment throw ngay khi được gọi.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, mocks = {}, env = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    module, exports: module.exports, process: { env }, console,
    require: (key) => {
      assert.ok(key in mocks, `Unexpected import ${key} in ${file}`);
      return mocks[key];
    },
    Date, JSON, Math, Number, String, Boolean, Array, Object, Promise, Set, Map, Error, RegExp,
    setTimeout, clearTimeout, AbortController, URL,
  }, { filename: file });
  return module.exports;
}

const env = { RFQ_AI_EXTRACT: 'true', OPENAI_API_KEY: 'sk-test', RFQ_AI_TIMEOUT_MS: '60' };
const ai = load('../lib/rfq/ai-extract.ts', {}, env);
const okResponse = (payload) => ({ ok: true, json: async () => payload });
// Đối tượng trả về từ vm context có prototype khác realm → so sánh qua JSON.
const same = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
const jsonOf = (obj) => okResponse({ model: 'test-model', choices: [{ message: { content: JSON.stringify(obj) } }] });

/* ---------------------------------------------------------------- */
/* 1) AI lỗi kiểu gì cũng chỉ trả { ok: false }, không bao giờ throw   */
/* ---------------------------------------------------------------- */
let result = await ai.extractRfqFields({ productText: 'Cashew W320' }, { fetchImpl: async () => { throw new Error('boom'); } });
same(result, { ok: false, reason: 'error' }, 'fetch throw → ok:false, không throw');

result = await ai.extractRfqFields({ productText: 'Cashew W320' }, { fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
same(result, { ok: false, reason: 'network' });

result = await ai.extractRfqFields({ productText: 'Cashew W320' }, { fetchImpl: async () => okResponse({ choices: [{ message: { content: 'not json at all' } }] }) });
same(result, { ok: false, reason: 'invalid_json' }, 'JSON rác không được biến thành dữ liệu');

result = await ai.extractRfqFields({ productText: 'Cashew W320' }, { fetchImpl: async () => okResponse({ choices: [] }) });
same(result, { ok: false, reason: 'bad_response' });

// Model treo: phải bị AbortController cắt đúng hạn, không giữ request.
const startedAt = Date.now();
result = await ai.extractRfqFields({ productText: 'Cashew W320' }, {
  fetchImpl: (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }),
});
const elapsed = Date.now() - startedAt;
same(result, { ok: false, reason: 'timeout' }, 'Model treo → timeout, không treo theo');
assert.ok(elapsed < 1500, `Timeout phải cắt nhanh (đo được ${elapsed}ms)`);

// Tắt mặc định: không có cờ hoặc không có key thì không gọi mạng.
let fetchCalls = 0;
const offEnv = { RFQ_AI_EXTRACT: undefined, OPENAI_API_KEY: 'sk-test' };
const aiOff = load('../lib/rfq/ai-extract.ts', {}, offEnv);
result = await aiOff.extractRfqFields({ productText: 'Cashew' }, { fetchImpl: async () => { fetchCalls += 1; return jsonOf({}); } });
assert.equal(result.reason, 'disabled');
assert.equal(fetchCalls, 0, 'AI mặc định tắt, không tốn lượt gọi nào');
const aiNoKey = load('../lib/rfq/ai-extract.ts', {}, { RFQ_AI_EXTRACT: 'true' });
assert.equal((await aiNoKey.extractRfqFields({ productText: 'Cashew' }, { fetchImpl: async () => jsonOf({}) })).reason, 'disabled');

/* ---------------------------------------------------------------- */
/* 2) Kết quả model không được tự do: whitelist + ép kiểu            */
/* ---------------------------------------------------------------- */
const sanitized = ai.sanitizeExtraction({
  category_slug: 'cashew', grade: 'W320', quantity: '1,500', unit: 'MT',
  destination_country: 'Germany', needed_by: '2027-02-31', incoterm: 'fob',
  target_price: 'abc', target_price_currency: 'usd', wants_samples: 'true',
  summary: 'Buyer needs cashew', injected_key: 'drop me', __proto__: { polluted: true },
}, ['cashew']);
assert.equal(sanitized.category_slug, 'cashew');
assert.equal(sanitized.quantity, 1500, 'Chuỗi số có dấu phẩy được chuẩn hoá');
assert.equal(sanitized.unit, 'MT');
assert.equal(sanitized.needed_by, undefined, 'Ngày không tồn tại (31/02) bị loại');
assert.equal(sanitized.incoterm, 'FOB');
assert.equal(sanitized.target_price, undefined, 'Giá không phải số bị loại');
assert.equal(sanitized.wants_samples, undefined, '"true" dạng chuỗi không được bật cờ nghiệp vụ');
assert.equal('injected_key' in sanitized, false, 'Khoá lạ bị bỏ');
assert.equal(ai.sanitizeExtraction({ category_slug: 'coffee' }, ['cashew']).category_slug, undefined, 'Category ngoài danh sách bị bỏ');
same(ai.sanitizeExtraction('garbage'), {});
same(ai.sanitizeExtraction([1, 2, 3]), {});

/* ---------------------------------------------------------------- */
/* 3) Không gửi thông tin liên hệ của người mua sang nhà cung cấp AI  */
/* ---------------------------------------------------------------- */
const scrubbed = ai.scrubBuyerContacts('Write to jane@buyer.com or +84 912 345 678 about cashew');
assert.ok(!scrubbed.includes('jane@buyer.com') && !scrubbed.includes('912'), 'Email và số điện thoại bị xoá');
assert.ok(scrubbed.includes('cashew'), 'Nội dung cần trích xuất vẫn được giữ');
let sentBody = '';
await ai.extractRfqFields(
  { productText: 'Cashew W320, contact jane@buyer.com', message: 'Call +1 (555) 123-4567' },
  { fetchImpl: async (_url, init) => { sentBody = String(init.body); return jsonOf({ grade: 'W320' }); } },
);
assert.ok(!sentBody.includes('jane@buyer.com'), 'Email người mua bị xoá trước khi gửi AI');
assert.ok(!sentBody.includes('555'), 'Số điện thoại bị xoá trước khi gửi AI');

/* ---------------------------------------------------------------- */
/* 4) enrich: không throw, không ghi đè dữ liệu người thật           */
/* ---------------------------------------------------------------- */
let afterTask = null;
const enrich = load('../lib/rfq/enrich.ts', {
  'next/server': { after: (task) => { afterTask = task; } },
  './ai-extract': ai,
}, env);

const rfqRow = {
  id: 'rfq-1', specs: {}, source_page: '/rfq',
  quantity: 100, unit: 'MT', destination_country: null, grade: null,
  needed_by: null, incoterm: null, target_price: null, target_price_currency: null,
  wants_samples: false, wants_inspection: false, category_id: null,
};
const updates = [];
const store = {
  getRfq: async () => rfqRow,
  updateRfq: async (_id, patch) => { updates.push(patch); return { ...rfqRow, ...patch }; },
};
const job = { rfqId: 'rfq-1', productText: 'Cashew', message: null, store };

// 4a. AI ném lỗi → enrich nuốt lỗi, trả applied:false
let out = await enrich.enrichRfqAfterSubmit(job, { extract: async () => { throw new Error('model down'); } });
same(out, { applied: false, reason: 'error' });
// 4b. Store lỗi → vẫn không throw
out = await enrich.enrichRfqAfterSubmit({ ...job, store: { getRfq: async () => { throw new Error('db down'); }, updateRfq: async () => ({}) } });
same(out, { applied: false, reason: 'error' });
// 4c. AI trả ok nhưng chỉ điền ô trống; số lượng người mua đã nhập không bị đổi
out = await enrich.enrichRfqAfterSubmit(job, {
  extract: async () => ({ ok: true, model: 'm', fields: { quantity: 999, unit: 'kg', destination_country: 'Germany', grade: 'W320' } }),
});
assert.equal(out.applied, true);
const patch = updates.at(-1);
assert.equal('quantity' in patch, false, 'Không ghi đè số lượng người mua đã nhập');
assert.equal(patch.destination_country, 'Germany', 'Chỉ điền ô còn trống');
assert.equal(patch.specs.grade, 'W320');
assert.equal(patch.specs.ai_extract.model, 'm');
// 4d. Chạy lần hai thì bỏ qua, không gọi lại model
const second = await enrich.enrichRfqAfterSubmit({ ...job, store: { getRfq: async () => ({ ...rfqRow, specs: patch.specs }), updateRfq: async () => ({}) } },
  { extract: async () => { throw new Error('must not be called'); } });
assert.equal(second.reason, 'already_extracted');
// 4e. Câu hỏi trực tiếp cho nhà cung cấp không có trường báo giá để điền
const question = await enrich.enrichRfqAfterSubmit({ ...job, store: { getRfq: async () => ({ ...rfqRow, specs: { inquiry_kind: 'supplier_question' } }), updateRfq: async () => ({}) } });
assert.equal(question.reason, 'supplier_question');

/* ---------------------------------------------------------------- */
/* 5) schedule: after() không khả dụng thì bỏ qua, không crash        */
/* ---------------------------------------------------------------- */
const enrichNoAfter = load('../lib/rfq/enrich.ts', {
  'next/server': { after: () => { throw new Error('after() called outside a request scope'); } },
  './ai-extract': ai,
}, env);
enrichNoAfter.scheduleRfqEnrichment(job); // không được throw
enrichNoAfter.scheduleRfqEnrichment({ ...job, store: { getRfq: async () => { throw new Error('x'); }, updateRfq: async () => ({}) } });

// after() có hoạt động: tác vụ lỗi cũng phải tự nuốt
let scheduled = 0;
const enrichWithAfter = load('../lib/rfq/enrich.ts', {
  'next/server': { after: (task) => { scheduled += 1; afterTask = task; } },
  './ai-extract': ai,
}, env);
enrichWithAfter.scheduleRfqEnrichment(job);
assert.equal(scheduled, 1, 'Việc trích xuất được đẩy vào after(), không chạy trên đường submit');
await afterTask(); // tác vụ nền chạy sau response, lỗi mạng cũng không làm gì hỏng
// AI tắt thì không đăng ký tác vụ nền
const aiDisabled = load('../lib/rfq/ai-extract.ts', {}, { RFQ_AI_EXTRACT: 'false', OPENAI_API_KEY: 'sk-test' });
const enrichDisabled = load('../lib/rfq/enrich.ts', {
  'next/server': { after: () => { scheduled += 1; } }, './ai-extract': aiDisabled,
}, { RFQ_AI_EXTRACT: 'false' });
enrichDisabled.scheduleRfqEnrichment(job);
assert.equal(scheduled, 1, 'AI tắt thì không đẩy việc gì vào after()');

/* ---------------------------------------------------------------- */
/* 6) Đầu-cuối: module AI ném lỗi NGAY khi submit gọi → RFQ vẫn lưu   */
/* ---------------------------------------------------------------- */
const createdRfqs = [];
const createdBuyers = [];
const acks = [];
const internal = [];
const submitStore = {
  listBuyers: async () => [],
  getBuyerByEmail: async () => null,
  createBuyer: async (input) => { createdBuyers.push(input); return { id: 'buyer-1', ...input }; },
  updateBuyer: async (id, patch) => ({ id, ...patch }),
  getCategoryBySlug: async () => null,
  listRfqs: async () => [],
  createRfq: async (input) => { createdRfqs.push(input); return { ...input, id: 'r-1', access_token: 'tok-1' }; },
  addAuditLog: async () => null,
};
const contact = load('../lib/rfq/buyer-contact.ts', {});
const submit = load('../lib/rfq/submit.ts', {
  './buyer-contact': contact,
  '@/lib/auth/buyer-session': { getBuyerSession: async () => ({ uid: 'buyer-account', email: 'jane@buyer.com' }) },
  'next/headers': { headers: async () => ({ get: () => null }) },
  '@/lib/db': { getStore: () => submitStore },
  '@/lib/public/catalog': { listPublicSuppliers: async () => [] },
  '@/lib/supplier-portal/onboarding': { canInviteSupplier: async () => true },
  '@/lib/public/product-catalog': { listPublicCategoryProducts: async () => [] },
  '@/lib/site': { SITE_URL: 'https://www.veximtrade.com' },
  '@/lib/email/rfq': { sendRfqAckBuyer: async () => { acks.push(1); }, sendRfqNewInternal: async () => { internal.push(1); } },
  '.': {
    emailDomain: () => 'example.com', fingerprint: () => 'fp', generateAccessToken: () => 'tok-1',
    rfqDayKey: () => '20261102', generateRfqCode: (seq, day) => `RFQ-${day}-0000${seq}`,
    hasMxRecord: async () => ({ ok: true }), isLikelyWebmail: () => false, normalizeCompanyWebsite: () => null,
    scoreSpam: () => ({ score: 0, flags: [] }),
  },
  './targeted-portal': { releaseTargetedQuoteToPortal: async () => 0 },
  './auto-match': { createPreferredSupplierMatches: async () => 0 },
  './supplier-question-rate-limit': { checkSupplierQuestionRateLimit: async () => ({ status: 'ok' }) },
  './supplier-question': {
    deliverSupplierQuestion: async () => ({ delivered: false }),
    sendSupplierQuestionAckBuyer: async () => null,
    sendSupplierQuestionExceptionInternal: async () => null,
  },
  './rate-limit': { gcRateLimit() {}, rateLimit: () => ({ ok: true }) },
  '@/lib/security/challenge': { verifyFormChallenge: () => ({ ok: true }) },
  // Đây là kịch bản xấu nhất: mã AI ném lỗi đồng bộ ngay tại dòng gọi.
  './enrich': { scheduleRfqEnrichment: () => { throw new Error('AI module exploded'); } },
}, { RFQ_REJECT_WEBMAIL: 'false' });

const submitted = await submit.submitRfq({
  company: 'Buyer Co', contact_name: 'Jane Doe', email: 'jane@buyer.com', consent: true, share_contact_consent: true,
  product_text: 'Cashew W320', quantity: 100, unit: 'MT', destination_country: 'Germany', challenge_token: 'ok',
});
assert.equal(submitted.ok, true, 'AI ném lỗi không được biến submit thành thất bại');
assert.equal(submitted.statusPageUrl, '/buyer/account/requests/r-1');
assert.equal(createdRfqs.length, 1, 'RFQ vẫn được lưu');
assert.equal(createdBuyers.length, 1, 'Hồ sơ người mua vẫn được tạo');
assert.equal(acks.length, 1, 'Email xác nhận cho người mua vẫn gửi');
assert.equal(internal.length, 1, 'Email nội bộ vẫn gửi');

console.log('✅ RFQ AI isolation: model lỗi/treo/rác, thiếu key, after() không có, module throw — RFQ vẫn lưu và vẫn gửi email.');
