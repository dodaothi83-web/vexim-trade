// node --experimental-strip-types --no-warnings scripts/check-product-completeness.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// ---- Nạp lib điểm với mock cho 3 phụ thuộc (dịch, hạn media, trạng thái duyệt) ----
let translationState = { hasEnglish: false, current: false, translatedAt: null, origin: null };
const TODAY = '2026-10-27';
const mocks = {
  'server-only': {},
  '@/lib/ai/translate-content': { productTranslationState: () => translationState },
  '@/lib/media/readiness': { isExpired: (m) => m.status === 'expired' || (!!m.expires_on && m.expires_on < TODAY) },
  '@/lib/supplier-portal/product-view': { productReview: (p) => p.supplier_review_status ?? 'approved' },
};
const file = '../lib/supplier-portal/product-completeness.ts';
const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(code, {
  module: mod, exports: mod.exports, console, Date,
  require: (key) => { assert.ok(key in mocks, `${file}: unexpected ${key}`); return mocks[key]; },
}, { filename: file });
const { productCompleteness, completenessLabel } = mod.exports;

const base = {
  supplier_review_status: 'draft', ready_for_buyer: false,
  ref_price: null, currency: null, price_publicly_visible: false,
  moq: null, moq_qty: null, display_name: null, monthly_capacity: null,
  lead_time_days: null, incoterm: null, featured_media_id: null,
};
const img = (id, over = {}) => ({ id, kind: 'image', audience: 'buyer', status: 'checked', expires_on: null, storage_path: `products/p/${id}.webp`, product_id: 'p1', ...over });
const cat = (id) => ({ id, kind: 'catalogue', audience: 'buyer', status: 'checked', expires_on: null, storage_path: `products/p/${id}.pdf`, product_id: 'p1' });
const vid = (id) => ({ id, kind: 'video', audience: 'buyer', status: 'checked', expires_on: null, external_url: 'https://youtu.be/x', product_id: 'p1' });

// ---- 1. Trọng số công bố 40/40/20, tổng đúng 100 ----
{
  const c = productCompleteness(base, []);
  for (const [group, max] of [['gate', 40], ['buyer', 40], ['fresh', 20]]) {
    const total = c.checks.filter((x) => x.group === group).reduce((s, x) => s + x.points, 0);
    assert.equal(total, max, `Nhóm ${group} phải đúng ${max} điểm`);
  }
  assert.equal(c.checks.reduce((s, x) => s + x.points, 0), 100, 'Tổng điểm phải là 100');
}

// ---- 2. Sản phẩm trống: gần như 0 điểm, đủ mọi việc ở gate + buyer ----
{
  translationState = { hasEnglish: false, current: false, translatedAt: null, origin: null };
  const c = productCompleteness(base, []);
  assert.equal(c.score, 7, 'Chỉ điểm "dịch không thể cũ" được coi là đạt khi chưa có gì');
  assert.equal(c.label, 'Cần bổ sung');
  assert.ok(c.missing.some((x) => x.key === 'gate_image'), 'Thiếu ảnh là việc đầu tiên');
  assert.ok(c.missing.some((x) => x.key === 'buyer_price'));
  assert.ok(!c.missing.some((x) => x.key === 'fresh_translation'), 'Chưa có bản dịch thì không đục "bản dịch cũ"');
}

// ---- 3. Sản phẩm mẫu mực: 100 điểm, nhãn Xuất sắc ----
{
  translationState = { hasEnglish: true, current: true, translatedAt: '2026-10-01T00:00:00Z', origin: 'staff' };
  const perfect = {
    ...base, supplier_review_status: 'approved', ready_for_buyer: true,
    ref_price: 1200, currency: 'USD', price_publicly_visible: true,
    moq: '1 container', display_name: 'Cashew W320, FOB HCMC',
    monthly_capacity: '200 tấn/tháng', lead_time_days: 14, incoterm: 'FOB',
    featured_media_id: 'i2',
  };
  const c = productCompleteness(perfect, [img('i1'), img('i2'), img('i3'), cat('c1'), vid('v1')]);
  assert.equal(c.score, 100, `Phải 100, còn thiếu: ${c.missing.map((m) => m.key).join(',') || 'không'}`);
  assert.equal(c.label, 'Xuất sắc');
  assert.equal(c.missing.length, 0, 'Sản phẩm hoàn hảo không còn việc thiếu'); // mảng từ vm realm — so độ dài thay vì deepEqual
}

// ---- 4. Bản dịch cũ: có EN nhưng nội dung gốc đã sửa ----
{
  translationState = { hasEnglish: true, current: false, translatedAt: '2026-01-01T00:00:00Z', origin: 'ai' };
  const c = productCompleteness({ ...base }, []);
  assert.ok(c.missing.some((x) => x.key === 'fresh_translation' && x.points === 7), 'Bản dịch cũ phải bị trừ 7 điểm');
  assert.ok(!c.missing.some((x) => x.key === 'buyer_english'), 'Có EN thì vẫn giữ điểm buyer_english');
}

// ---- 5. Quy tắc media: nội bộ/hết hạn/không đủ ảnh/chưa chọn đại diện ----
{
  translationState = { hasEnglish: false, current: false, translatedAt: null, origin: null };
  const internal = img('i9', { audience: 'internal' });
  const expired = img('i10', { expires_on: '2025-01-01' });
  const c = productCompleteness(base, [internal, expired, cat('c1')]);
  assert.ok(c.missing.some((x) => x.key === 'gate_image'), 'Ảnh nội bộ/ hết hạn không tính là ảnh buyer');
  assert.ok(!c.missing.some((x) => x.key === 'gate_catalogue'), 'Catalogue buyer chưa hết hạn được tính');

  const two = productCompleteness(base, [img('i1'), img('i2')]);
  assert.ok(two.missing.some((x) => x.key === 'fresh_images3'), 'Dưới 3 ảnh chưa được điểm chiều sâu');

  const notFeatured = productCompleteness({ ...base, featured_media_id: 'nope' }, [img('i1')]);
  assert.ok(notFeatured.missing.some((x) => x.key === 'fresh_featured'), 'Ảnh đại diện phải nằm trong ảnh buyer hợp lệ');
}

// ---- 6. Giá: đủ giá+tien tệ nhưng chưa cho hiện công khai ----
{
  translationState = { hasEnglish: false, current: false, translatedAt: null, origin: null };
  const c = productCompleteness({ ...base, ref_price: 8.5, currency: 'USD' }, []);
  assert.ok(!c.missing.some((x) => x.key === 'buyer_price'), 'Có giá + tiền tệ là đủ điểm giá');
  assert.ok(c.missing.some((x) => x.key === 'buyer_price_public' && x.points === 3), 'Chưa consent công khai mất 3 điểm nhỏ');
  const noCurrency = productCompleteness({ ...base, ref_price: 8.5 }, []);
  assert.ok(noCurrency.missing.some((x) => x.key === 'buyer_price'), 'Thiếu tiền tệ thì giá chưa tính');
}

// ---- 7. MOQ: chuỗi hoặc số ----
{
  translationState = { hasEnglish: false, current: false, translatedAt: null, origin: null };
  assert.ok(!productCompleteness({ ...base, moq_qty: 20 }, []).missing.some((x) => x.key === 'buyer_moq'), 'moq_qty đủ');
  assert.ok(!productCompleteness({ ...base, moq: '1 container' }, []).missing.some((x) => x.key === 'buyer_moq'), 'moq chuỗi đủ');
  assert.ok(productCompleteness({ ...base, moq: '   ' }, []).missing.some((x) => x.key === 'buyer_moq'), 'MOQ toàn khoảng trắng là chưa có');
}

// ---- 8. Nhãn theo ngưỡng ----
assert.equal(completenessLabel(85).label, 'Xuất sắc');
assert.equal(completenessLabel(84).label, 'Tốt');
assert.equal(completenessLabel(65).label, 'Tốt');
assert.equal(completenessLabel(64).label, 'Cơ bản');
assert.equal(completenessLabel(40).label, 'Cơ bản');
assert.equal(completenessLabel(39).label, 'Cần bổ sung');

// ---- 9. Nối dây: điểm xuất hiện đúng nơi quy định và KHÔNG lộ cho buyer ----
const source = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const catalog = source('lib/public/product-catalog.ts');
assert.match(catalog, /b\.card\.verificationCount - a\.card\.verificationCount \|\| b\.completeness - a\.completeness/,
  'Thứ tự catalog: tầng xác minh TRƯỚC, điểm hoàn thiện chỉ là tín hiệu phụ');
assert.doesNotMatch(catalog, /completenessScore/, 'Điểm hoàn thiện không nằm trên thẻ sản phẩm — không gửi xuống browser');
assert.match(source('app/supplier/portal/products/product-storefront.tsx'), /Điểm hoàn thiện hồ sơ: \$\{completenessByProduct\[p\.id\]\.score\}\/100/,
  'Thẻ sản phẩm portal hiện tooltip điểm');
assert.match(source('app/supplier/portal/products/product-editor.tsx'), /completeness\.missing\.slice\(0, 5\)/,
  'Editor gợi ý tối đa 5 việc còn thiếu, bấm tới đúng bước');
assert.match(source('app/supplier/portal/products/product-editor.tsx'), /selectStep\(item\.step\)/, 'Gợi ý thiếu điều hướng được tới bước điền');
assert.match(source('app/crm/products/page.tsx'), /Hoàn thiện \{complete\.score\}\/100/, 'CRM thấy badge điểm để ưu tiên rà hồ sơ yếu');
const publicCard = source('components/public-product-card.tsx');
assert.doesNotMatch(publicCard, /completeness|hoàn thiện/i, 'Buyer KHÔNG thấy điểm — tầng xác minh mới là tín hiệu công khai');

console.log('✅ Product completeness: trọng số 40/40/20, luật media/giá/dịch, nhãn ngưỡng, nối dây portal+CRM+catalog và không lộ cho buyer.');
