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
assert.doesNotMatch(form, /function validateQuestion\(\)|mode === "question"/, 'Câu hỏi cho nhà cung cấp đã chuyển sang chat');

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
const quoteKeys = validatedKeys(form, 'validateQuote');
for (const required of ['product_text', 'quantity', 'destination_country', 'company', 'contact_name', 'email', 'consent']) {
  assert.ok(quoteKeys.includes(required), `Báo giá vẫn phải bắt buộc "${required}"`);
}
assert.ok(!quoteKeys.includes('phone'), 'Số điện thoại không được bắt buộc (không dùng cho email NCC)');

/* 3. Trường nặng nằm trong mục chi tiết, đóng mặc định */
// Dùng thẻ div thật (không phải aria-controls của nút) để mốc so sánh đúng.
const detailsAt = form.indexOf('<div id="rfq-details"');
assert.ok(detailsAt > 0, 'Có mục chi tiết thu gọn');
for (const heavy of ['label="Grade / spec"', 'label="Target price"', 'label="Incoterm"', 'label="Shipment month"', 'label="Packaging / labelling"', 'label="Required certificates"', 'label="Website"', 'label="Business type"', 'label="Purchase frequency"', 'label={directForm ? "Private note for Vexim" : "Notes for Vexim"}']) {
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
for (const field of ['quantity', 'unit', 'frequency', 'incoterm', 'destination_country', 'destination_port', 'needed_by', 'shipment_month', 'target_price', 'target_price_currency', 'target_price_unit', 'share_target_price', 'marketing_opt_in', 'packaging', 'certifications', 'message', 'phone', 'website', 'business_type', 'wants_samples', 'wants_inspection', 'wants_video_call', 'preferred_supplier_ids', 'honeypot', 'challenge_token']) {
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
const quoteStart = form.indexOf("{/* Khối 1: sản phẩm");
const visibleFields = (form.slice(quoteStart, detailsAt).match(/<Field\b/g) ?? []).length;
assert.ok(visibleFields <= 9, `Chỉ nên còn tối đa 9 ô hiện ngay, đang có ${visibleFields}`);

/* 8b. Bố cục cột: trang rộng 1120px, sidebar 280-300px, hàng số lượng theo container query */
const rfqPublicPage = readFileSync(path.join(root, 'app/(public)/rfq/page.tsx'), 'utf8');
assert.match(rfqPublicPage, /max-w-\[1120px\]/, 'Khung trang RFQ rộng 1120px');
assert.match(form, /lg:grid-cols-\[minmax\(0,1fr\)_290px\]/, 'Cột "Your request" rộng 290px');
assert.match(form, /className="@container"/, 'Nhóm số lượng/điểm đến dùng container query, không dùng breakpoint màn hình');
assert.match(form, /@min-\[640px\]:grid-cols-2/, 'Container ≥640px mới chia hai cột Destination | Port');
assert.doesNotMatch(form, /grid gap-4 sm:grid-cols-3">\s*<Field label="Quantity"/, 'Không xếp Quantity/Destination/Port thành ba cột');

/* 8c. Không điền sẵn tiêu đề sản phẩm vào ô mô tả */
assert.match(form, /product_text: "",/, 'Ô "What do you need?" bắt đầu trống, không nhét tiêu đề sản phẩm vào');
assert.doesNotMatch(form, /product_text: initialProduct/, 'Không prefill tiêu đề sản phẩm');

/* 9. Hai trạng thái: có thẻ sản phẩm (từ PDP) và vào từ menu */
assert.match(form, /label=\{contextProduct \? "Your requirements" : "What do you need\?"\}/, 'Có thẻ sản phẩm thì nhãn là "Your requirements", vào từ menu là "What do you need?"');
assert.match(form, /required=\{!contextProduct\}/, 'Ô yêu cầu chỉ bắt buộc khi KHÔNG có thẻ sản phẩm');
assert.match(form, /if \(!contextProduct && !data\.product_text\.trim\(\)\)/, 'Validate bỏ qua mô tả khi server đã biết sản phẩm');
assert.match(form, /\{ key: "product", label: "Product", done: true \}/, 'Checklist tự tick dòng "Product" khi có thẻ ngữ cảnh');
assert.match(form, /ContextProduct\.checks|contextProduct\.checks/, 'Hiện tên bước xác minh đã duyệt');
assert.doesNotMatch(form, /\d\/3 approved/, 'Không hiện "x/3 approved" trên thẻ sản phẩm');
assert.match(form, /Supplier holds:/, 'Có chip chứng nhận của nhà cung cấp');
assert.match(form, /See certificates/, 'Có link xem chứng nhận trên hồ sơ nhà cung cấp');
assert.match(form, /<details[^>]*>\s*<summary[^>]*>Packaging and lead time/, 'Đóng gói và lead time nằm trong <details>');
assert.doesNotMatch(form, /preview=1|Opened from a product page/, 'Không có thanh chuyển trạng thái trong production');

const productPage = readFileSync(path.join(root, 'app/(public)/products/[slug]/[productId]/page.tsx'), 'utf8');
assert.match(productPage, /rfqGrade/ , 'Trang sản phẩm truyền grade sang form');
assert.match(productPage, /&grade=\$\{encodeURIComponent\(rfqGrade\)\}/, 'Link RFQ từ trang sản phẩm mang theo grade');

/* 8. Thanh tiến độ + giá mục tiêu mặc định riêng tư (chính sách, không chỉ giao diện) */
assert.match(form, /const requiredChecks = \[/, 'Có danh sách ô bắt buộc cho thanh tiến độ');
for (const key of ['product_text', 'quantity', 'destination_country', 'company', 'contact_name', 'email']) {
  assert.match(form, new RegExp(`key: "${key}"`), `Thanh tiến độ theo dõi "${key}"`);
}
assert.match(form, /\{completed\}\/\{requiredChecks\.length\} required/, 'Hiện số ô đã điền trên tổng số');
assert.match(form, /share_target_price: false/, 'Giá mục tiêu mặc định KHÔNG chia sẻ cho nhà cung cấp');
assert.match(form, /Share my target price with suppliers/, 'Có ô chọn chia sẻ giá mục tiêu');
assert.match(form, /maxLength=\{4000\}/, 'Mô tả sản phẩm bị giới hạn 4.000 ký tự');

/* 10. Ô tháng giao hàng và câu chú thích giá mục tiêu */
// Chốt theo yêu cầu: giữ ô chọn tháng của trình duyệt. Placeholder ("---- month ----" /
// "---- năm ----") do ngôn ngữ máy người dùng quyết định, không do trang — đây là đánh đổi
// đã được chấp nhận, nên guard chỉ kiểm giá trị vẫn ở định dạng YYYY-MM.
assert.match(form, /<input type="month"[^>]*value=\{data\.shipment_month\}/, 'Shipment month là ô chọn tháng của trình duyệt');
assert.doesNotMatch(form, /shipmentMonths/, 'Không còn danh sách tháng tự dựng');
assert.doesNotMatch(form, /Only Vexim sees it unless you tick this box/, 'Đã bỏ câu chú thích dưới ô chia sẻ giá mục tiêu');
assert.match(form, /Share my target price with suppliers/, 'Vẫn giữ ô chia sẻ giá mục tiêu');

console.log(`✅ RFQ form compact: một trang, ${visibleFields} ô hiện ngay, mọi ô bị validate đều nhìn thấy được, chi tiết đóng mặc định.`);
