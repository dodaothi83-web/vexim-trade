// node scripts/check-marketplace-ranking.mjs — GĐ1+GĐ2: hàm xếp hạng thuần + evidence + trọng số đặc tả.
//
// Lời hứa còn nguyên: rankPublicCategoryProducts(cards) với ZERO_RANKING_WEIGHTS phải
// cho ra ĐÚNG thứ tự của bộ so sánh cũ (verificationCount DESC → tên A-Z → thứ tự vào)
// — property test 400 hoán vị có hạt giống. GĐ2 thêm: rule evidence còn hiệu lực,
// tín hiệu trustAlive đọc từ thẻ, và trang danh mục truyền SPEC_RANKING_WEIGHTS.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(path) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: () => { throw new Error(`${path} phải là module thuần, không import`); } });
  return exports;
}

const {
  rankPublicCategoryProducts, compareRankedProducts, rankingScore, rankingTier, trustAliveSignal,
  evidenceValidVerificationSteps,
  ZERO_RANKING_WEIGHTS, SPEC_RANKING_WEIGHTS, fnv1a,
} = compile('../lib/public/ranking.ts');

/* ---------- 1. Nối vào hệ thống thật ---------- */
const catalogSource = readFileSync(new URL('../lib/public/product-catalog.ts', import.meta.url), 'utf8');
assert.match(catalogSource, /rankPublicCategoryProducts\(/, 'product-catalog đi qua hàm xếp hạng mới');
assert.doesNotMatch(catalogSource, /\.sort\(\(a, b\) => b\.verificationCount/, 'Bộ so sánh inline cũ đã nhường chỗ cho ranking.ts');
assert.match(catalogSource, /SPEC_RANKING_WEIGHTS/, 'GĐ2: trang danh mục truyền trọng số đặc tả vào hàm xếp hạng');
assert.match(catalogSource, /evidenceValidVerificationSteps\(/, 'Evidence còn hiệu lực được tính qua rule chung');
assert.match(catalogSource, /listCertificates\(/, 'Chứng nhận của NCC được đọc để đối chiếu hiệu lực L1');
assert.equal(Object.values(SPEC_RANKING_WEIGHTS).reduce((sum, w) => sum + w, 0), 100, 'Trọng số mục tiêu của đặc tả cộng đúng 100');
assert.ok(Object.values(ZERO_RANKING_WEIGHTS).every((w) => w === 0), 'Trọng số 0 vẫn là mặc định của hàm thuần (tái tạo thứ tự cũ)');

/* ---------- Dữ liệu giả định: đủ các tầng 0-3, tên trùng, dấu tiếng Việt ---------- */
function card(overrides) {
  return {
    id: 'p', name: 'Cashew W320', grade: 'W320', attributes: { grade: 'W320' }, moq: '1 MT',
    price: 'USD 8.4/kg', pricePoint: { value: 8.4, unit: 'kg', currency: 'USD', updatedAt: '2026-10-01' },
    province: 'Binh Phuoc', leadTimeDays: 14, incoterm: 'FOB', oem: true, odm: false, samples: true,
    verificationCount: 3, imagePaths: ['a.jpg', 'b.jpg'], ...overrides,
  };
}
const fixtures = [
  card({ id: 't3-a', name: 'Hạt điều nhân W240', verificationCount: 3 }),
  card({ id: 't3-b', name: 'Bộ xử lý điều W320', verificationCount: 3 }),
  card({ id: 't3-c', name: 'Anh dú W180', verificationCount: 3 }),
  card({ id: 't2-a', name: 'Cashew W320', verificationCount: 2, grade: null, price: null, pricePoint: null }),
  card({ id: 't2-b', name: 'Điều nhân trắng W320', verificationCount: 2, moq: 'On request', leadTimeDays: null, incoterm: null }),
  card({ id: 't2-c', name: 'Cashew W320', verificationCount: 2, imagePaths: [], oem: false, odm: false, samples: false }),
  card({ id: 't1-a', name: 'Gạo Jasmine 5%', verificationCount: 1, province: 'An Giang' }),
  card({ id: 't1-b', name: 'Ả cáo hồ tiêu', verificationCount: 1 }),
  card({ id: 't0-a', name: 'Sản phẩm chưa xác minh', verificationCount: 0 }),
  card({ id: 't0-b', name: 'Sản phẩm chưa xác minh', verificationCount: 0 }),
  card({ id: 't3-dup', name: 'Hạt điều nhân W240', verificationCount: 3 }),
];

// Bộ so sánh hiện tại của product-catalog (sao chép nguyên văn để đối chiếu).
const legacyCompare = (a, b) => b.verificationCount - a.verificationCount || a.name.localeCompare(b.name);

// PRNG có hạt giống để lần chạy nào cũng như lần nào.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 2. Lời hứa GĐ1: trọng số 0 → đúng thứ tự cũ, trên 400 hoán vị ---------- */
for (let seed = 1; seed <= 400; seed++) {
  const random = mulberry32(seed);
  const shuffled = [...fixtures];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const inputSnapshot = shuffled.map((c) => c.id).join('|');
  // Mảng từ vm realm khác prototype với mảng host nên so bằng chuỗi thay vì deepEqual chặt.
  const byLegacy = [...shuffled].sort(legacyCompare).map((c) => c.id).join('|');
  const byRanking = rankPublicCategoryProducts(shuffled).map((c) => c.id).join('|');
  assert.equal(byRanking, byLegacy, `seed ${seed}: trọng số 0 phải tái tạo đúng thứ tự sort hiện tại`);
  assert.equal(shuffled.map((c) => c.id).join('|'), inputSnapshot, `seed ${seed}: hàm thuần không được đổi mảng đầu vào`);
}
console.log('✓ 400 hoán vị: trọng số 0 tái tạo đúng thứ tự verificationCount DESC → tên A-Z, không đổi mảng vào');

/* ---------- 3. Tính chất riêng ---------- */
// a) Tầng cứng: 2/3 dữ liệu đẹp vẫn không vượt 3/3 kể cả khi bật đủ trọng số đặc tả.
const tier3Thin = card({ id: 't3-thin', name: 'Zài Zui', verificationCount: 3, grade: null, price: null, pricePoint: null, moq: 'On request', leadTimeDays: null, incoterm: null, imagePaths: [], oem: false, odm: false, samples: false });
const tier2Full = card({ id: 't2-full', name: 'Aaa đẹp nhất', verificationCount: 2 });
const withWeights = rankPublicCategoryProducts([tier2Full, tier3Thin], SPEC_RANKING_WEIGHTS);
assert.equal(withWeights[0].id, 't3-thin', 'Tầng xác minh là cứng: 3/3 luôn trên 2/3 dù điểm thấp hơn');
assert.ok(rankingScore(tier2Full, SPEC_RANKING_WEIGHTS) > rankingScore(tier3Thin, SPEC_RANKING_WEIGHTS),
  'Điểm chỉ so trong cùng tầng — thẻ 2/3 vẫn được điểm cao hơn nhưng không vượt tầng');

// b) Trong cùng tầng, bật trọng số làm thẻ đầy đủ dữ liệu lên trước thẻ trống.
const sameTier = rankPublicCategoryProducts([tier3Thin, card({ id: 't3-full', name: 'Zzz', verificationCount: 3 })], SPEC_RANKING_WEIGHTS);
assert.equal(sameTier[0].id, 't3-full', 'Cùng tầng: điểm đầy đủ dữ liệu thắng tên A-Z');

// c) Tín hiệu offerAlive ăn theo cổng giá: mất giá → mất điểm chào hàng + 1/6 nhóm đầy đủ (giá là một trong 6 mục).
const priceDrop = rankingScore(card({}), SPEC_RANKING_WEIGHTS) - rankingScore(card({ price: null }), SPEC_RANKING_WEIGHTS);
assert.ok(Math.abs(priceDrop - (SPEC_RANKING_WEIGHTS.offerAlive + SPEC_RANKING_WEIGHTS.dataCompleteness / 6)) < 1e-9,
  'Giá bị cổng ẩn thì mất đúng phần điểm chào hàng và một phần nhóm đầy đủ dữ liệu');

// d) Bám filter (B1) khi có ngữ cảnh: grade khớp được thưởng, lệch mất phần khớp.
const filter = { grade: 'W240', province: 'Binh Phuoc' };
assert.ok(rankingScore(card({ grade: 'W240' }), SPEC_RANKING_WEIGHTS, { filter }) >
  rankingScore(card({ grade: 'W320' }), SPEC_RANKING_WEIGHTS, { filter }), 'Khớp grade của bộ lọc được điểm độ khớp');

// e) Sort ổn định khi trùng hoàn toàn: giữ thứ tự vào (đúng hành vi sort hiện tại).
const twins = [card({ id: 'first', name: 'Trùng nhau', verificationCount: 2 }), card({ id: 'second', name: 'Trùng nhau', verificationCount: 2 })];
assert.equal(rankPublicCategoryProducts(twins).map((c) => c.id).join(','), 'first,second', 'Hoà tuyệt đối giữ thứ tự vào — không băm ở GĐ1');

// f) fnv1a: vectơ đã biết, deterministic giữa các lần gọi.
assert.equal(fnv1a(''), 2166136261);
assert.equal(fnv1a('a'), 0xe40c292c);
assert.equal(fnv1a('product-42'), fnv1a('product-42'), 'Băm ổn định dành cho GĐ2 xử lý hoà');

// g) Tầng đọc từ thẻ công khai, không tự suy cấp còn thiếu.
assert.equal(rankingTier(card({ verificationCount: 2 })), 2);

/* ---------- 4. GĐ2: rule evidence còn hiệu lực (quyết định: trừ điểm, KHÔNG cổng ẩn) ---------- */
const TODAY = '2026-10-26';
const cert = (overrides) => ({ review_status: 'approved', staff_hidden: false, valid_until: '2099-01-01', ...overrides });
// L1 đã duyệt + chứng nhận còn hạn → giữ đủ 3 bước.
assert.equal(evidenceValidVerificationSteps([1, 2, 3], [cert({ valid_until: '2099-01-01' })], TODAY), 3,
  'Chứng nhận L1 còn hạn giữ đủ số bước');
// Tất cả chứng nhận đã duyệt đều quá hạn → trừ đúng 1 bước (chỉ L1 bị ảnh hưởng).
assert.equal(evidenceValidVerificationSteps([1, 2, 3], [cert({ valid_until: '2020-01-01' }), cert({ valid_until: '2024-12-31' })], TODAY), 2,
  'L1 hết hạn trừ đúng một bước — L2/L3 theo sự kiện không bị ảnh hưởng');
// Hỗn hợp hết hạn + còn hạn → còn sống.
assert.equal(evidenceValidVerificationSteps([1, 2, 3], [cert({ valid_until: '2020-01-01' }), cert({})], TODAY), 3,
  'Một chứng nhận còn hạn là đủ');
// Không có chứng nhận nào (NCC legacy / lỗi đọc CSDL) → fail-open, không trừ.
assert.equal(evidenceValidVerificationSteps([1, 2, 3], [], TODAY), 3, 'NCC legacy không có bảng chứng nhận vẫn giữ số bước');
// Chỉ còn chứng nhận bị nhân viên ẩn → không đếm được → fail-open.
assert.equal(evidenceValidVerificationSteps([1, 2, 3], [cert({ valid_until: '2099-01-01', staff_hidden: true })], TODAY), 3,
  'Chứng nhận bị ẩn không là chứng cứ sống; ẩn hết thì rơi về fail-open');
// Trạng thái chưa duyệt không là chứng cứ: không cộng cũng không trừ (fail-open).
assert.equal(evidenceValidVerificationSteps([1, 2, 3], [cert({ valid_until: '2099-01-01', review_status: 'pending' })], TODAY), 3,
  'Chứng nhận chưa duyệt không làm mất hiệu lực các bước đã duyệt');
// valid_until thiếu hoặc sai dạng ISO → coi như còn hạn, không phạt dữ liệu lỗi.
assert.equal(evidenceValidVerificationSteps([1], [cert({ valid_until: null })], TODAY), 1, 'Giấy tờ không ghi hạn không bị coi là hết hạn');
assert.equal(evidenceValidVerificationSteps([1], [cert({ valid_until: '20990101' })], TODAY), 1, 'Ngày sai dạng không bị coi là hết hạn');
// Chỉ có L1 thì trừ xuống 0, không âm.
assert.equal(evidenceValidVerificationSteps([1], [cert({ valid_until: '2020-01-01' })], TODAY), 0, 'Trừ không xuống dưới 0');
// NCC chưa duyệt L1: chứng nhận hết hạn không đổi gì (không có gì để trừ).
assert.equal(evidenceValidVerificationSteps([2, 3], [cert({ valid_until: '2020-01-01' })], TODAY), 2,
  'L2/L3 là xác minh theo sự kiện — không bao giờ hết hạn');

/* ---------- 5. GĐ2: trustAlive đọc từ thẻ; trừ điểm đổi thứ tự TRONG TẦNG ---------- */
// Tín hiệu đọc evidenceValidSteps trên từng thẻ; thiếu dữ liệu thì = 0, không tự suy.
assert.equal(trustAliveSignal(card({ evidenceValidSteps: 3 })), 1);
assert.equal(trustAliveSignal(card({ evidenceValidSteps: 2 })), 2 / 3);
assert.equal(trustAliveSignal(card({})), 0, 'Thẻ không có dữ liệu evidence thì tín hiệu tin cậy bằng 0');
assert.equal(trustAliveSignal(card({ evidenceValidSteps: null })), 0);
const trustDrop = rankingScore(card({ evidenceValidSteps: 3 }), SPEC_RANKING_WEIGHTS) -
  rankingScore(card({ evidenceValidSteps: 2 }), SPEC_RANKING_WEIGHTS);
assert.ok(Math.abs(trustDrop - SPEC_RANKING_WEIGHTS.trustAlive / 3) < 1e-9,
  'Mất đúng 1/3 nhóm tin cậy khi một bước hết hiệu lực');
// Cùng tầng 3/3: thẻ đủ dữ liệu nhưng L1 hết hạn (evidence 2) thua thẻ evidence 3 —
// đặt tên ngược A-Z để chứng minh điểm thắng tên.
const staleWinner = card({ id: 'aaa-stale', name: 'Aaa hết hạn', evidenceValidSteps: 3 });
const freshLoser = card({ id: 'zzz-fresh', name: 'Zzz còn hạn', evidenceValidSteps: 2 });
assert.equal(rankPublicCategoryProducts([freshLoser, staleWinner], SPEC_RANKING_WEIGHTS)[0].id, 'aaa-stale',
  'Trong cùng tầng: evidence còn hiệu lực thắng tên A-Z');
// Tầng vẫn cứng trước evidence: 3/3 hết hạn cả 3 bước (evidence 0) vẫn trên 2/3 còn đủ.
const tier3AllStale = card({ id: 't3-stale', name: 'Aaa', verificationCount: 3, evidenceValidSteps: 0 });
assert.equal(rankPublicCategoryProducts([tier2Full, tier3AllStale], SPEC_RANKING_WEIGHTS)[0].id, 't3-stale',
  'Chứng nhận hết hạn chỉ trừ điểm trong tầng — KHÔNG hạ tầng, không cổng ẩn');

console.log('✓ Tầng cứng 3/2/1/0, điểm chỉ so trong tầng, tín hiệu server-side, sort ổn định, băm deterministic');
console.log('✓ GĐ2 evidence: L1 hết hạn trừ đúng 1 bước, L2/L3 không hết hạn, fail-open cho NCC legacy và dữ liệu lỗi');
console.log('✅ Marketplace ranking GĐ1+GĐ2: hàm thuần tách đúng, trọng số 0 tái tạo thứ tự cũ, đặc tả 30/30/15/15/10 đã bật ở trang danh mục.');
