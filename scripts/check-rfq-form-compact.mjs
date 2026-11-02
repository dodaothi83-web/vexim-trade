// node --experimental-strip-types scripts/check-rfq-form-compact.mjs
//
// Chặn tái phát đúng lỗi cũ: form 3 bước nhưng `validateStep(2)` kiểm company/contact/email/
// consent trong khi các ô đó chỉ render ở bước 3 → bấm Continue không đi được và không có
// thông báo lỗi. Từ nay: một trang, và MỌI ô bị validate phải thật sự có trên màn hình.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'app/(public)/rfq/rfq-form.tsx');
const form = readFileSync(file, 'utf8');

/* 1. Không còn wizard */
assert.doesNotMatch(form, /setStep\b/, 'Form không còn state bước');
assert.doesNotMatch(form, /step === \d/, 'Form không còn render theo bước');
assert.doesNotMatch(form, />\s*Continue\s*</, 'Không còn nút Continue của wizard');
assert.match(form, /function validateQuote\(\)/, 'Có đúng một hàm validate cho chế độ báo giá');
assert.match(form, /function validateQuestion\(\)/, 'Chế độ câu hỏi có validate riêng');

/* 2. Mỗi ô bị validate phải có trên màn hình (đúng lỗi cũ) */
function validatedKeys(source, fnName) {
  const start = source.indexOf(`function ${fnName}(`);
  assert.ok(start > 0, `Thiếu ${fnName}`);
  const end = source.indexOf('\n  }', start);
  const body = source.slice(start, end);
  return [...body.matchAll(/e\.([a-z_]+)\s*=/g)].map((m) => m[1]);
}

for (const [fn, keys] of [
  ['validateQuote', validatedKeys(form, 'validateQuote')],
  ['validateQuestion', validatedKeys(form, 'validateQuestion')],
]) {
  assert.ok(keys.length >= 4, `${fn} phải kiểm các ô bắt buộc`);
  for (const key of keys) {
    // id phải gắn trên chính control (input/select/textarea), không chỉ trên <Field>,
    // nếu không `focusFirstError()` không tìm thấy phần tử để cuộn tới.
    assert.match(
      form,
      new RegExp(`<(?:input|select|textarea)[^>]*id="rfq-${key}"|<(?:input|select|textarea)\\s*\\n\\s*id="rfq-${key}"`),
      `${fn}: control của "${key}" phải có id="rfq-${key}" để cuộn/focus tới được`,
    );
  }
}
// Chế độ câu hỏi không được đòi số lượng/điểm đến
const questionKeys = validatedKeys(form, 'validateQuestion');
assert.ok(!questionKeys.includes('quantity') && !questionKeys.includes('destination_country'), 'Câu hỏi trực tiếp không đòi trường báo giá');
const quoteKeys = validatedKeys(form, 'validateQuote');
for (const required of ['product_text', 'quantity', 'destination_country', 'company', 'contact_name', 'email', 'consent']) {
  assert.ok(quoteKeys.includes(required), `Báo giá vẫn phải bắt buộc "${required}"`);
}
assert.ok(!quoteKeys.includes('phone'), 'Số điện thoại không được bắt buộc (không dùng cho email NCC)');

/* 3. Trường nặng nằm trong mục chi tiết, đóng mặc định */
// Dùng thẻ div thật (không phải aria-controls của nút) để mốc so sánh đúng.
const detailsAt = form.indexOf('<div id="rfq-details"');
assert.ok(detailsAt > 0, 'Có mục chi tiết thu gọn');
for (const heavy of ['label="Grade / spec"', 'label="Target price"', 'label="Incoterm"', 'label="Needed by"', 'label="Packaging / labelling"', 'label="Required certifications"', 'label="Website"', 'label="Business type"', 'label="Purchase frequency"', 'label="Notes for the desk"']) {
  const at = form.indexOf(heavy);
  assert.ok(at > detailsAt, `${heavy} phải nằm trong mục chi tiết (sau id="rfq-details")`);
}
assert.match(form, /aria-expanded=\{detailsOpen\}/, 'Nút chi tiết phải công bố trạng thái cho trình đọc màn hình');
assert.match(form, /useState\(Boolean\(initialGrade\) \|\| wantsSamples\)/, 'Mục chi tiết tự mở khi URL đã điền sẵn dữ liệu');

/* 4. Trường lõi vẫn hiển thị trực tiếp, không cần mở chi tiết */
for (const core of ['What do you need?', 'label="Quantity"', 'label="Destination"', 'label="Company"', 'label="Your name"', 'label="Work email"']) {
  const at = form.indexOf(core);
  assert.ok(at > 0 && at < detailsAt, `${core} phải hiện ngay, không nằm trong mục chi tiết`);
}

/* 5. Không mất dữ liệu khi submit: mọi trường vẫn được gửi dù bị ẩn */
const submitPayload = form.slice(form.indexOf('submitRfqAction({'), form.indexOf('});', form.indexOf('submitRfqAction({')));
for (const field of ['quantity', 'unit', 'frequency', 'incoterm', 'destination_country', 'needed_by', 'target_price', 'target_price_currency', 'packaging', 'certifications', 'message', 'phone', 'website', 'business_type', 'wants_samples', 'wants_inspection', 'wants_video_call', 'preferred_supplier_ids', 'honeypot', 'challenge_token']) {
  assert.ok(new RegExp(`\\b${field}:`).test(submitPayload), `Payload còn gửi "${field}"`);
}

/* 6. Chống spam và prefill không bị mất */
assert.match(form, /<FormChallenge purpose="rfq"/);
assert.match(form, /challenge_token: challengeToken/);
assert.match(form, /data\.websiteHp/, 'Honeypot vẫn được gửi');
assert.match(form, /preferred_supplier_ids: initialSupplierIds/, 'NCC buyer chỉ định vẫn được giữ');
assert.match(form, /source_product_id/, 'Liên kết sản phẩm nguồn vẫn được gửi');

/* 7. Gọn thật: đếm số Field hiển thị ngay (trước mục chi tiết) */
// Chỉ đếm phần báo giá; chế độ câu hỏi ở phía trên có bộ ô riêng.
const quoteStart = form.indexOf("{/* 1. Sản phẩm");
const visibleFields = (form.slice(quoteStart, detailsAt).match(/<Field\b/g) ?? []).length;
assert.ok(visibleFields <= 9, `Chỉ nên còn tối đa 9 ô hiện ngay, đang có ${visibleFields}`);

console.log(`✅ RFQ form compact: một trang, ${visibleFields} ô hiện ngay, mọi ô bị validate đều nhìn thấy được, chi tiết đóng mặc định.`);
