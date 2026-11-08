// node --experimental-strip-types --no-warnings scripts/check-rfq-rate-limit.mjs
//
// Chứng minh: giới hạn "5 RFQ/giờ/người" đúng theo DANH TÍNH BUYER đã đăng nhập, đọc trên
// dữ liệu dùng chung (listRfqs/getBuyerByEmail) — không chỉ dựa vào bộ đếm IP/UA trong bộ
// nhớ tiến trình (lib/rfq/rate-limit.ts), vốn KHÔNG đáng tin khi nhiều lambda Vercel xử lý
// song song (mỗi instance có bộ nhớ riêng). Test này cố tình đổi IP/UA ở MỖI lần gọi để
// bộ đếm IP/UA cũ không bao giờ tự chặn — nếu test vẫn chặn đúng ở lần thứ 6, chứng tỏ lớp
// chặn MỚI (theo buyer, trên dữ liệu thật) mới là cái đang hoạt động.
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

function makeHarness({ buyers = [], rfqs = [] } = {}) {
  const createdRfqs = [];
  let callIp = 0;
  const store = {
    listBuyers: async () => buyers,
    getBuyerByEmail: async (email) => buyers.find((b) => b.email === email) ?? null,
    createBuyer: async (input) => {
      const row = { id: `buyer-${buyers.length + 1}`, ...input };
      buyers.push(row);
      return row;
    },
    updateBuyer: async (id, patch) => {
      const existing = buyers.find((b) => b.id === id);
      Object.assign(existing, patch);
      return existing;
    },
    getCategoryBySlug: async () => null,
    listRfqs: async (options) => (options?.buyerId === undefined ? rfqs : rfqs.filter((r) => r.buyer_id === options.buyerId)),
    createRfq: async (input) => {
      // Thật ra thì store (Supabase/local) tự gắn created_at lúc insert, không nhận từ input.
      const row = {
        ...input,
        id: `r-${createdRfqs.length + 1}`,
        access_token: `tok-${createdRfqs.length + 1}`,
        created_at: new Date().toISOString(),
      };
      createdRfqs.push(row);
      rfqs.push(row);
      return row;
    },
    addAuditLog: async () => null,
  };
  const mocks = {
    '@/lib/db': { getStore: () => store },
    'next/headers': {
      // Mỗi lần gọi trả về một IP khác nhau → bộ đếm IP/UA cũ (lib/rfq/rate-limit.ts) không
      // bao giờ thấy quá 1 request/IP, nên không thể tự chặn lần thứ 6.
      headers: async () => ({ get: (name) => (name === 'x-forwarded-for' ? `203.0.113.${++callIp}` : 'test-agent') }),
    },
    '@/lib/public/catalog': { listPublicSuppliers: async () => [] },
    '@/lib/public/product-catalog': { listPublicCategoryProducts: async () => [] },
    '@/lib/email/rfq': { sendRfqAckBuyer: async () => null, sendRfqNewInternal: async () => null },
    '@/lib/site': { SITE_URL: 'https://www.veximtrade.com' },
    '@/lib/security/challenge': { verifyFormChallenge: () => ({ ok: true }) },
    '.': {
      emailDomain: () => 'example.com', fingerprint: () => 'unused', generateAccessToken: () => 'tok',
      rfqDayKey: () => '20261108', generateRfqCode: (seq, dayKey) => `RFQ-${dayKey}-${seq}`, hasMxRecord: async () => ({ ok: true }),
      isLikelyWebmail: () => false, normalizeCompanyWebsite: () => null, scoreSpam: () => ({ score: 0, flags: [] }),
    },
    './targeted-portal': { releaseTargetedQuoteToPortal: async () => 0 },
    './auto-match': { createPreferredSupplierMatches: async () => [] },
    './enrich': { scheduleRfqEnrichment: () => {} },
    // Giới hạn IP/UA cũ: "luôn ok" ở nghĩa là bộ đếm riêng của nó không bao giờ tới hạn vì
    // mỗi request có fingerprint khác nhau — ở đây mock thẳng để khỏi phụ thuộc trạng thái
    // Map nội bộ dùng chung giữa các lần gọi `load()`.
    './rate-limit': { gcRateLimit() {}, rateLimit: () => ({ ok: true, remaining: 4, resetInMs: 0, limit: 5 }) },
  };
  return { store, createdRfqs, mocks };
}

function makeRaw(overrides = {}) {
  return {
    company: 'Buyer Co', contact_name: 'Jane Doe', email: 'jane@buyer.com', consent: true,
    product_text: 'Cashew kernels W320', ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* 1) 5 RFQ đầu tiên của CÙNG một buyer phải thành công                */
/* ------------------------------------------------------------------ */
{
  const { store, createdRfqs, mocks } = makeHarness();
  const submit = load('../lib/rfq/submit.ts', {
    ...mocks,
    '@/lib/auth/buyer-session': { getBuyerSession: async () => ({ uid: 'u-1', email: 'jane@buyer.com' }) },
  });
  for (let i = 1; i <= 5; i += 1) {
    const res = await submit.submitRfq(makeRaw({ product_text: `Yêu cầu số ${i}` }));
    assert.equal(res.ok, true, `RFQ thứ ${i} của cùng buyer phải thành công`);
  }
  assert.equal(createdRfqs.length, 5, '5 RFQ được tạo thật trong store');

  /* ------------------------------------------------------------------ */
  /* 2) RFQ thứ 6 TRONG CÙNG GIỜ của buyer này phải bị chặn               */
  /* ------------------------------------------------------------------ */
  const sixth = await submit.submitRfq(makeRaw({ product_text: 'Yêu cầu số 6' }));
  assert.equal(sixth.ok, false, 'RFQ thứ 6 trong cùng 1 giờ phải bị chặn');
  assert.equal(sixth.rateLimited, true, 'Phải gắn cờ rateLimited');
  assert.equal(createdRfqs.length, 5, 'Không được tạo thêm bản ghi khi đã chạm giới hạn');
}

/* ------------------------------------------------------------------ */
/* 3) Buyer KHÁC không bị ảnh hưởng bởi giới hạn của buyer thứ nhất      */
/* ------------------------------------------------------------------ */
{
  const buyers = [{ id: 'buyer-jane', email: 'jane@buyer.com' }];
  const rfqs = Array.from({ length: 5 }, (_, i) => ({
    id: `old-${i}`, buyer_id: 'buyer-jane', code: `RFQ-OLD-${i}`, created_at: new Date().toISOString(),
  }));
  const { createdRfqs, mocks } = makeHarness({ buyers, rfqs });
  const submit = load('../lib/rfq/submit.ts', {
    ...mocks,
    '@/lib/auth/buyer-session': { getBuyerSession: async () => ({ uid: 'u-2', email: 'other@buyer.com' }) },
  });
  const res = await submit.submitRfq(makeRaw({ email: 'other@buyer.com', product_text: 'Hạt tiêu đen' }));
  assert.equal(res.ok, true, 'Buyer khác (chưa gửi RFQ nào) không bị chặn bởi giới hạn của buyer khác');
  assert.equal(createdRfqs.length, 1);
}

/* ------------------------------------------------------------------ */
/* 4) RFQ cũ hơn 1 giờ không tính vào giới hạn (cửa sổ trượt)           */
/* ------------------------------------------------------------------ */
{
  const buyers = [{ id: 'buyer-old', email: 'old@buyer.com' }];
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const rfqs = Array.from({ length: 5 }, (_, i) => ({
    id: `stale-${i}`, buyer_id: 'buyer-old', code: `RFQ-STALE-${i}`, created_at: twoHoursAgo,
  }));
  const { createdRfqs, mocks } = makeHarness({ buyers, rfqs });
  const submit = load('../lib/rfq/submit.ts', {
    ...mocks,
    '@/lib/auth/buyer-session': { getBuyerSession: async () => ({ uid: 'u-3', email: 'old@buyer.com' }) },
  });
  const res = await submit.submitRfq(makeRaw({ email: 'old@buyer.com', product_text: 'Gạo ST25' }));
  assert.equal(res.ok, true, '5 RFQ từ hơn 1 giờ trước không được tính vào giới hạn hiện tại');
  assert.equal(createdRfqs.length, 1);
}

console.log('✅ RFQ rate limit: 5/giờ tính theo buyer thật trên dữ liệu dùng chung (không phụ thuộc IP/UA hay bộ nhớ một lambda instance), cách ly theo buyer, cửa sổ trượt 1 giờ đúng.');
