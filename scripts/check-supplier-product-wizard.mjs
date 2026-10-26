// node scripts/check-supplier-product-wizard.mjs
// Trang sản phẩm của NCC: 3 bước, mỗi lần chỉ mở một bước, nút Trở về / Tiếp tục ở đáy,
// và thông tin thương mại & xuất khẩu hiện ngay ở bước 1 (không giấu sau mũi tên gập).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

function load(file, mocks) {
  const mod = { exports: {} };
  const source = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, {
    module: mod, exports: mod.exports, console, Date, URL, FormData, requestAnimationFrame: (fn) => fn(),
    require: (id) => {
      if (!(id in mocks)) throw new Error(`${file}: unexpected import ${id}`);
      return mocks[id];
    },
  }, { filename: file });
  return mod.exports;
}

const icons = new Proxy({}, { get: (_target, name) => (props) => React.createElement('span', { 'data-icon': String(name), className: props.className }, null) });
const Link = ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children);

const view = {
  PRODUCT_STATUS: {
    draft: { label: 'Bản nháp', tone: 'bg-slate-100' },
    pending: { label: 'Chờ duyệt', tone: 'bg-amber-100' },
    changes_requested: { label: 'Cần chỉnh sửa', tone: 'bg-rose-100' },
    approved: { label: 'Đã đăng', tone: 'bg-emerald-100' },
  },
  productReview: (p) => p.supplier_review_status ?? 'approved',
  privateMediaUrl: (m) => m.storage_path ? `/api/media/file/${m.storage_path}` : null,
  productCanSubmit: (p, media) => ['draft', 'changes_requested'].includes(p.supplier_review_status ?? 'approved') &&
    !!(p.name?.trim() && (p.description?.trim() || p.spec?.trim())) &&
    media.some((m) => (m.kind === 'image' || m.kind === 'catalogue') && !!m.storage_path),
};

const { SupplierProductEditor, snapshotFromForm } = load('../app/supplier/portal/products/product-editor.tsx', {
  react: React,
  'react/jsx-runtime': jsx,
  'next/link': { default: Link },
  'next/navigation': { useRouter: () => ({ push() {}, refresh() {}, replace() {} }) },
  'lucide-react': icons,
  '@/lib/types': {},
  '@/lib/public/product-selection': { productPriceBlockers: () => [], supplierPriceConsentCurrent: (s) => s?.fob_publicly_visible !== false },
  '@/lib/supplier-portal/category-proposals': {},
  '@/lib/supplier-portal/product-view': view,
  '../product-actions': {
    saveSupplierProductAction: async () => ({ ok: true, id: 'p1', message: 'Đã lưu bản nháp.' }),
    submitSupplierProductAction: async () => ({ ok: true, message: 'Đã gửi.' }),
  },
  '@/components/supplier-attribute-inputs': {
    SupplierAttributeInputs: (props) => React.createElement('div', {
      'data-attribute-inputs': '1',
      'data-official': String(props.officialFields?.length ?? 0),
      'data-supplier': String(props.supplierFields?.length ?? 0),
    }),
  },
  '@/components/raw-material-region-input': {
    RawMaterialRegionInput: (props) => React.createElement('input', {
      name: 'raw_material_region', defaultValue: props.defaultValue, disabled: props.disabled,
    }),
  },
  '@/components/products/product-description-editor': {
    ProductDescriptionEditor: (props) => React.createElement('input', {
      type: 'hidden', id: props.id, name: props.name, value: props.value, disabled: props.disabled, readOnly: true,
    }),
  },
  '@/components/products/product-description-preview': {
    ProductDescriptionPreview: (props) => React.createElement('div', { className: 'product-description' }, props.value || 'Chưa có mô tả chi tiết.'),
  },
  '@/lib/product-attributes': { fieldsFor: () => [], supplierFieldsFor: () => [], effectiveFieldsFor: () => [] },
});

const categories = [
  { id: 'c1', slug: 'cashew', label: 'Hạt điều', group: 'Hạt & hạt nhân',
    supplier_product_fields: [{ key: 'do_am', label: 'Độ ẩm thực tế', type: 'text', options: [], supplier_added: true }] },
  { id: 'c2', slug: 'pepper', label: 'Hồ tiêu', group: 'Gia vị' },
];
const supplier = { id: 'sup-1', status: 'published', fob_publicly_visible: true, fob_updated_at: new Date().toISOString() };
const product = {
  id: 'p1', supplier_id: 'sup-1', name: 'Hạt điều nhân W320', category: 'cashew', supplier_category_proposal: 'cashew',
  description: 'Hạt điều trắng', spec: 'W320', supplier_review_status: 'draft', ready_for_buyer: false,
  ref_price: 7.2, currency: 'USD', unit: 'kg', moq: '1 tấn', monthly_capacity: '200 tấn', packaging: 'Carton 22.68kg',
  lead_time_days: 21, export_port: 'Cát Lái', incoterm: 'FOB', incoterm_place: 'Hồ Chí Minh',
  payment_terms: 'T/T 30%', certifications: 'HACCP', updated_at: '2026-10-20T00:00:00Z',
  raw_material_region: 'Đắk Lắk, vùng Buôn Ma Thuột', input_material_origin: 'Việt Nam và Campuchia',
};
const media = [{ id: 'm1', owner_type: 'product', product_id: 'p1', supplier_id: 'sup-1', created_by: 'u1',
  audience: 'internal', kind: 'image', storage_path: 'products/p1/a.jpg', caption: 'Ảnh nhà máy' }];

const render = (props = {}) => renderToStaticMarkup(React.createElement(SupplierProductEditor, {
  product, media, userId: 'u1', categories, supplier, ...props,
}));

const source = read('../app/supplier/portal/products/product-editor.tsx');
const step1 = render();

// 1. Ba bước, mỗi lần chỉ mở MỘT bước; các bước khác vẫn nằm trong DOM (hidden) để
//    không mất dữ liệu khi gửi form.
assert.match(step1, /Bước 1: Thông tin sản phẩm|data-step-panel="1"/, 'Có panel bước 1');
assert.match(step1, /data-step-panel="2"/, 'Panel bước 2 tồn tại');
assert.match(step1, /data-step-panel="3"/, 'Panel bước 3 tồn tại');
assert.match(step1, /data-step-panel="1"[^>]*class="space-y-4"|class="space-y-4"[^>]*data-step-panel="1"/, 'Bước 1 đang mở');
assert.equal((step1.match(/data-step-panel="(2|3)"/g) ?? []).length, 2, 'Đủ ba panel');
for (const panel of ['2', '3']) {
  assert.match(step1, new RegExp(`data-step-panel="${panel}" class="hidden"`), `Bước ${panel} bị ẩn, không đẩy nội dung dài xuống`);
}
assert.doesNotMatch(source, /<details/, 'Không còn khối gập <details> trong trang sản phẩm');

// 2. Thông tin thương mại & xuất khẩu HIỆN NGAY ở bước 1, không cần bấm mũi tên.
assert.match(step1, /Thông tin thương mại &amp; xuất khẩu/, 'Tiêu đề khối thương mại & xuất khẩu hiện ngay');
for (const field of ['ref_price', 'ref_price_max', 'currency', 'unit', 'price_valid_until', 'lead_time_days',
  'payment_terms', 'export_port', 'incoterm', 'incoterm_place']) {
  assert.ok(step1.includes(`name="${field}"`), `Ô ${field} nằm ngay trong bước 1`);
}
for (const field of ['raw_material_region', 'input_material_origin']) {
  assert.ok(step1.includes(`name="${field}"`), `Thông tin nguyên liệu của sản phẩm nằm trong bước 1: ${field}`);
}
assert.match(step1, /Vùng nguyên liệu/);
assert.match(step1, /Xuất xứ nguyên liệu đầu vào/);
// Chứng nhận chỉ đến từ hồ sơ Giấy tờ L1: không còn ô tự khai, không còn dòng nhắc về nó.
assert.ok(!source.includes('name="certifications"'), 'Bỏ ô chứng nhận sản phẩm tự khai');
assert.ok(!source.includes('Chứng nhận sản phẩm (tự khai)'), 'Bỏ nhãn chứng nhận tự khai');
assert.ok(!source.includes('Giấy tờ L1 để AI tự quét'), 'Bỏ dòng nhắc tải chứng nhận ở L1');
assert.ok(!source.includes('Điều kiện bán và giao hàng buyer cần thấy'), 'Bỏ mô tả dài ở khối thương mại');
assert.ok(!source.includes('Số liệu cung ứng giúp buyer'), 'Bỏ mô tả dài ở khối đặt hàng & năng lực');
assert.match(step1, /<h2 class="text-\[15px\] font-black text-ink-900">Thông tin thương mại &amp; xuất khẩu<\/h2>/, 'Khối thương mại chỉ còn tiêu đề');
assert.match(step1, /<h2 class="text-\[15px\] font-black text-ink-900">Đặt hàng &amp; năng lực<\/h2>/, 'Khối đặt hàng chỉ còn tiêu đề');
// Nhãn "Bước 1" chỉ hiện ở thanh bước, không lặp lại trên từng thẻ con trong bước 1.
assert.equal((step1.match(/>Bước 1</g) ?? []).length, 0, 'Không lặp nhãn Bước 1 trên các thẻ con');
assert.equal((step1.match(/Bước 1/g) ?? []).length, 1, 'Chỉ còn một nhãn Bước 1 (cho trình đọc màn hình của panel)');
assert.match(step1, /data-step-panel="1" class="space-y-4" aria-label="Bước 1: Thông tin sản phẩm"/, 'Panel bước 1 vẫn được đánh nhãn cho trình đọc màn hình');
assert.ok(step1.indexOf('Thông tin thương mại &amp; xuất khẩu') > 0, 'Khối thương mại nằm trong bước 1 đang mở');
assert.ok(step1.includes('Nhận gia công/OEM') && step1.includes('Có thể gửi mẫu'), 'Ba lựa chọn thương mại hiện ngay');

// 3. Điều hướng dưới đáy: quay lại / tiếp tục, thanh dính đáy màn hình.
assert.match(step1, /sticky bottom-0[^"]*backdrop-blur/, 'Thanh hành động dính đáy màn hình');
assert.match(step1, /Tiếp tục/, 'Bước 1 có nút đi tiếp');
assert.equal((step1.match(/name="payment_terms"/g) ?? []).length, 1, 'Không lặp ô điều kiện thanh toán');
assert.match(step1, /href="\/supplier\/portal\/products"/, 'Bước 1 có lối hủy về danh sách');
const onStep2 = render({ initialStep: 2 });
assert.equal((onStep2.match(/>Bước 2</g) ?? []).length, 1, 'Thẻ của bước 2 vẫn giữ đúng một nhãn bước');
assert.match(onStep2, /Trở về bước 1/, 'Bước 2 có nút Trở về bước 1');
assert.match(onStep2, /Sang bước 3/, 'Bước 2 có nút sang bước 3');
const onStep3 = render({ initialStep: 3 });
assert.equal((onStep3.match(/>Bước 3</g) ?? []).length, 1, 'Thẻ của bước 3 vẫn giữ đúng một nhãn bước');
assert.match(onStep3, /Trở về bước 2/, 'Bước 3 có nút Trở về bước 2');
assert.match(onStep3, /Gửi duyệt/, 'Bước 3 có nút gửi hồ sơ');

// 3b. Bước 3 là bước XEM LẠI: hiển thị lại toàn bộ dữ liệu bước 1 và tệp của bước 2.
assert.match(onStep3, /Xem lại toàn bộ hồ sơ/, 'Bước 3 là bước xem lại');
assert.match(onStep3, /Bước 3: Xem lại và gửi/, 'Nhãn bước 3 nói rõ xem lại rồi gửi');
for (const label of ['Thông tin sản phẩm', 'Thông tin thương mại &amp; xuất khẩu', 'Đặt hàng &amp; năng lực', 'Ảnh và catalogue']) {
  assert.ok(onStep3.includes(label), `Bước 3 đọc lại khối ${label}`);
}
for (const value of ['Hạt điều nhân W320', 'Hạt &amp; hạt nhân / Hạt điều', 'Hạt điều trắng', 'W320', '7.2', '200 tấn',
  'Cát Lái', 'FOB', 'T/T 30%', 'Carton 22.68kg', 'Đắk Lắk, vùng Buôn Ma Thuột', 'Việt Nam và Campuchia', 'products/p1/a.jpg']) {
  assert.ok(onStep3.includes(value), `Bước 3 hiển thị giá trị đã nhập: ${value}`);
}
assert.equal((onStep3.match(/Sửa<\/button>/g) ?? []).length, 4, 'Mỗi khối ở bước 3 có nút Sửa quay lại đúng bước');
assert.match(source, /ReviewField/, 'Có thành phần đọc lại từng trường');
assert.match(source, /snapshotFromForm/, 'Bản xem lại cập nhật theo nội dung đang nhập');
assert.match(source, /price_publicly_visible === "yes"/, 'Cờ thương mại hiện thành chip ở bước 3');

// Giá của sản phẩm mới mặc định được chia sẻ, nhưng lựa chọn tắt đã lưu không bị bật lại.
const priceCheckbox = (html) => {
  const tag = html.match(/<input[^>]*name="price_publicly_visible"[^>]*>/)?.[0];
  assert.ok(tag, 'Có checkbox chia sẻ giá của sản phẩm');
  return tag;
};
const newProductStep1 = render({ product: undefined, media: [] });
assert.match(priceCheckbox(newProductStep1), /checked=""/, 'Sản phẩm mới được tick sẵn');
for (const savedProduct of [product, { ...product, price_publicly_visible: false }]) {
  assert.doesNotMatch(priceCheckbox(render({ product: savedProduct })), /checked=""/,
    'Bản ghi cũ thiếu cờ hoặc đã tắt giá vẫn giữ trạng thái riêng tư');
}
assert.match(priceCheckbox(render({ product: { ...product, price_publicly_visible: true } })), /checked=""/,
  'Lựa chọn chia sẻ giá đã lưu vẫn được giữ');
const priceReviewChip = (html) => {
  const chip = html.match(/<span class="([^"]*)">Công khai giá khi đủ điều kiện<\/span>/);
  assert.ok(chip, 'Bước xem lại có trạng thái chia sẻ giá');
  return chip[1];
};
assert.match(priceReviewChip(onStep3), /line-through/, 'Bước xem lại không tự bật giá cho sản phẩm đã lưu ở trạng thái tắt');
const newProductStep3 = render({ product: undefined, media: [], initialStep: 3 });
assert.doesNotMatch(priceReviewChip(newProductStep3), /line-through/, 'Bước xem lại khớp lựa chọn mặc định của sản phẩm mới');

// 3c. Nút gửi luôn phản hồi: không phải nút chết khi còn thiếu điều kiện.
assert.doesNotMatch(source, /onClick=\{submit\} disabled=\{busy \|\| !canSubmit\}/, 'Nút gửi không bị khoá im lặng');
assert.match(source, /function requestSubmit\(\)/, 'Nút gửi đi qua requestSubmit để luôn phản hồi');
assert.match(source, /submitBlockers\(\)/, 'Có danh sách việc còn thiếu');
assert.match(source, /setSubmitHint\(blockers\)/, 'Bấm gửi khi thiếu sẽ hiện lời nhắc thay vì không làm gì');
assert.match(source, /Đang gửi.../, 'Nút có trạng thái đang gửi');
assert.match(source, /animate-spin/, 'Có vòng xoay khi đang gửi');
assert.match(source, /Đã gửi duyệt/, 'Gửi xong có xác nhận rõ ràng');
assert.match(source, /aria-live="polite"/, 'Lời nhắc được đọc bởi trình đọc màn hình');
assert.match(source, /id="submit-blockers"/, 'Nút gửi liên kết tới phần giải thích điều kiện');

// 3d. Sẵn sàng thì nói rõ; thiếu thì nút vẫn bấm được và liệt kê việc cần làm.
assert.match(onStep3, /Hồ sơ đủ điều kiện/, 'Đủ điều kiện thì báo rõ trước khi gửi');
const missingMedia = render({ initialStep: 3, media: [] });
const sendButton = (missingMedia.match(/<button[^>]*>[\s\S]{0,80}lucide-send|<button[^>]*aria-describedby="submit-blockers"/) ?? [''])[0];
assert.ok(sendButton && !/disabled/.test(sendButton.split('>')[0]), 'Thiếu điều kiện vẫn không khoá nút gửi');
assert.match(missingMedia, /Tải ít nhất một ảnh hoặc catalogue thật ở bước 2/, 'Nói rõ thiếu tệp ở đâu');
assert.match(missingMedia, /<div id="submit-blockers" aria-live="polite">/, 'Danh sách việc cần làm có aria-live');
assert.match(onStep2, /data-step-panel="1" class="hidden"/, 'Bước 2 ẩn hẳn form bước 1 (không kéo dài trang) nhưng vẫn giữ dữ liệu để gửi form');
assert.match(onStep2, /data-step-panel="2" class="space-y-3"/, 'Bước 2 đang mở');
assert.equal((onStep2.match(/aria-current="step"/g) ?? []).length, 1, 'Ở bước 2 chỉ đánh dấu bước 2');
assert.equal((onStep3.match(/data-step-panel="1"/g) ?? []).length, 1, 'Panel bước 1 vẫn tồn tại (chỉ ẩn) ở bước 3');

// 4. Thanh bước đánh dấu đúng bước đang mở.
assert.match(step1, /aria-current="step"/, 'Thanh bước đánh dấu bước hiện tại');
assert.equal((step1.match(/aria-current="step"/g) ?? []).length, 1, 'Chỉ một bước được đánh dấu');
assert.match(source, /selectStep/, 'Bấm vào thanh bước để chuyển bước');

// 5. Hành vi cũ còn nguyên: lưu, kiểm tra trường bắt buộc, cảnh báo mất dữ liệu, nộp, tải tệp.
assert.match(source, /saveSupplierProductAction\(form\)/, 'Vẫn lưu qua saveSupplierProductAction');
assert.match(source, /submitSupplierProductAction\(form\)/, 'Vẫn nộp qua submitSupplierProductAction');
assert.match(source, /productCanSubmit\(product, media\) && !dirty/, 'Nút nộp vẫn phụ thuộc điều kiện dữ liệu');
assert.doesNotMatch(source, /Lưu thay đổi sẽ đưa sản phẩm về bản nháp/, 'Sửa sản phẩm đã duyệt không còn tự rút khỏi sàn');
assert.match(source, /const canUpload = !!product && !locked && !dirty && \(review !== "approved" \|\| product\.supplier_originated === true\)/, 'Sản phẩm NCC đã duyệt vẫn tải được ảnh');
assert.ok(source.includes('useState(product?.reviewed_category_slug ?? product?.supplier_category_proposal ?? product?.category ?? "")'),
  'Danh mục staff đã duyệt được ưu tiên khi mở lại editor');
assert.match(source, /Bạn có thay đổi chưa lưu/, 'Vẫn cảnh báo rời trang khi chưa lưu');
assert.match(source, /firstInvalidField\(formRef\.current, 1\)/, 'Chặn sang bước khi còn trường bắt buộc');
assert.match(source, /requestSubmit\(\)/, 'Đi tiếp được sau khi lưu thành công');
assert.match(source, /\/api\/supplier-portal\/products\/\$\{product\.id\}\/media/, 'Vẫn tải tệp qua API riêng');
assert.match(source, /method: "DELETE"/, 'Vẫn xoá được tệp nháp');
assert.match(source, /form="product-info"/, 'Nút ở thanh đáy submit đúng form bước 1');
assert.match(source, /if \(!product\)[\s\S]{0,400}\?step=/, 'Sản phẩm mới lưu xong mở thẳng bước tiếp theo');

// 6. Đọc ?step= ở trang chi tiết để mở đúng bước sau khi tạo mới.
const detailPage = read('../app/supplier/portal/products/[id]/page.tsx');
assert.match(detailPage, /searchParams/, 'Trang chi tiết đọc searchParams');
assert.match(detailPage, /initialStep=\{step\}/, 'Truyền bước mở đầu cho editor');
assert.match(detailPage, /value === 2 \? 2 : value === 3 \? 3 : 1/, 'Chỉ nhận bước 1–3');

// 7. Danh sách sản phẩm: nhãn danh mục tiếng Việt + cảnh báo ngoài phạm vi.
const storefront = read('../app/supplier/portal/products/product-storefront.tsx');
assert.match(storefront, /categoryLabels\?: Record<string, string>/, 'Danh sách nhận nhãn danh mục');
assert.match(storefront, /categoryLabels\[slug\] \?\? slug/, 'Hiện nhãn thay vì slug thô');
assert.match(storefront, /Ngoài phạm vi/, 'Sản phẩm ngoài phạm vi được đánh dấu');
assert.match(storefront, /Chọn thêm danh mục/, 'Có lối sang trang Danh mục kinh doanh');
const listPage = read('../app/supplier/portal/products/page.tsx');
assert.match(listPage, /categoryLabels=/, 'Trang danh sách truyền nhãn danh mục');
assert.match(listPage, /scope=\{\[?scope/, 'Trang danh sách truyền phạm vi danh mục');
assert.match(listPage, /allowedSupplierCategories/, 'Phạm vi lấy từ đúng lớp dữ liệu danh mục');

// 9b. Copy B2B: không lạm dụng tên nền tảng, không giọng hành chính.
const brandMentions = (step1.match(/Vexim/g) ?? []).length;
assert.ok(brandMentions <= 1, `Chỉ nhắc tên nền tảng khi thật cần (đang ${brandMentions} lần)`);
for (const phrase of [
  'Vexim duyệt', 'Vexim kiểm tra', 'Vexim xác nhận', 'cho Vexim', 'Chờ Vexim',
  'Tôi đại diện NCC xác nhận đồng ý cho', 'không tự duyệt sản phẩm',
]) {
  assert.ok(!source.includes(phrase), `Bỏ giọng hành chính/lặp thương hiệu: ${phrase}`);
}
assert.match(step1, /Chọn danh mục gần nhất\. Danh mục sẽ được kiểm tra khi duyệt\./,
  'Hint danh mục nói đúng mức cần thiết');
// Chỉ hiện khi chưa có xác nhận chia sẻ giá còn hiệu lực.
const noConsent = render({ supplier: { ...supplier, fob_publicly_visible: false } });
assert.match(noConsent, /Tôi đồng ý chia sẻ giá tham khảo của những sản phẩm tôi chọn công khai\./,
  'Xác nhận chia sẻ giá gọn một dòng');
assert.match(noConsent, /Hiệu lực 180 ngày kể từ khi lưu; giá tham khảo không phải báo giá chính thức/,
  'Điều kiện ngắn nằm dưới checkbox');
assert.match(noConsent, /href="\/dieu-khoan-su-dung"[^>]*>Điều khoản</, 'Có link điều khoản thay vì nhồi văn bản pháp lý');
assert.doesNotMatch(noConsent, /Tôi đại diện NCC xác nhận/, 'Bỏ câu cam kết dài kiểu hợp đồng');
assert.match(source, /Gửi duyệt/, 'Nút gửi dùng từ trung tính');
assert.match(source, /Yêu cầu chỉnh sửa:/, 'Phản hồi duyệt gọi đúng việc phải làm');

// 9d. Bố cục bước 1: danh mục chiếm trọn hàng để Mô tả ngắn luôn nằm chung hàng
//     với Quy cách / tiêu chuẩn, kể cả khi nhóm hàng có hoặc không có thông số.
const labelTag = (name) => `<label class="block text-[12.5px]"><span class="mb-1 block font-semibold text-ink-800">${name}`;
assert.ok(step1.includes('<label class="block text-[12.5px] md:col-span-2"><span class="mb-1 block font-semibold text-ink-800">Danh mục sản phẩm'),
  'Danh mục sản phẩm chiếm trọn hàng');
assert.ok(step1.includes(labelTag('Mô tả ngắn')), 'Mô tả ngắn là ô nửa hàng');
assert.ok(step1.includes(labelTag('Quy cách / tiêu chuẩn')), 'Quy cách là ô nửa hàng');
const iDesc = step1.indexOf('name="description"');
const iSpec = step1.indexOf('name="spec"');
assert.ok(iDesc > 0 && iSpec > iDesc, 'Mô tả ngắn đứng ngay trước Quy cách để cùng hàng');
assert.ok(step1.indexOf('name="supplier_category_proposal"') < iDesc, 'Danh mục đứng trước, không chen giữa hai ô này');
// Bước 3 đọc lại theo đúng bố cục đó: danh mục một hàng, mô tả ngắn và quy cách cùng hàng.
assert.ok(source.includes('<div className="sm:col-span-2"><ReviewField label="Danh mục"'), 'Bước 3: danh mục chiếm trọn hàng');
assert.ok(source.includes('<div><ReviewField label="Mô tả ngắn"'), 'Bước 3: mô tả ngắn là ô nửa hàng');
assert.ok(source.includes('<div><ReviewField label="Quy cách / tiêu chuẩn"'), 'Bước 3: quy cách là ô nửa hàng');

// 9c. Không lặp nhãn bước trên các thẻ con của bước 1.
assert.equal((step1.match(/>Bước 1</g) ?? []).length, 0, 'Không có chữ "Bước 1" lặp trong nội dung bước 1');
assert.equal((step1.match(/Bước 1/g) ?? []).length, 1, 'Chỉ panel giữ nhãn Bước 1 cho trình đọc màn hình');

// 10. Gõ vào bất kỳ ô nào cũng không được làm vỡ trang: handler đọc form qua ref,
//    vì React dọn `event.currentTarget` về null trước khi state updater chạy.
assert.doesNotMatch(source, /snapshotFromForm\(event\.currentTarget/,
  'Không đọc event.currentTarget bên trong state updater (gây FormData(null))');
assert.doesNotMatch(source, /snapshotFromForm\([^)]*currentTarget/,
  'Mọi lời gọi snapshotFromForm đều dùng phần tử form đã lấy sẵn');
assert.match(source, /function onFormChange\(\) \{\s*const form = formRef\.current;/,
  'onFormChange đọc form qua ref ngay trong handler');
assert.match(source, /const formElement = event\.currentTarget;/,
  'save() giữ phần tử form trước khi await');
assert.match(source, /new FormData\(formElement\)/, 'save() dùng phần tử đã giữ, không dùng lại event sau await');
assert.match(source, /function snapshotFromForm\(form: HTMLFormElement \| null/,
  'snapshotFromForm chấp nhận form null');
assert.deepEqual(snapshotFromForm(null, { name: 'giữ nguyên' }), { name: 'giữ nguyên' },
  'Chưa có form thì giữ bản nháp cũ, không ném lỗi');
assert.match(source, /for \(const key of checkKeys\) if \(form\.querySelector/,
  'Checkbox không tick vẫn được ghi nhận là trống');

// 11. Bản nháp chỉ có nhãn trên ảnh, không lặp cả thanh trạng thái phía trên form.
for (const draftHtml of [step1, newProductStep1]) {
  assert.doesNotMatch(draftHtml, /aria-label="Trạng thái xét duyệt"/, 'Bản nháp không hiện thanh trạng thái trùng lặp');
  assert.doesNotMatch(draftHtml, /Sản phẩm còn riêng tư\. Điền thông tin, thêm tệp rồi gửi duyệt\./);
  assert.equal((draftHtml.match(/>Bản nháp</g) ?? []).length, 1, 'Chỉ giữ nhãn Bản nháp trên ảnh');
}
const pending = render({ product: { ...product, supplier_review_status: 'pending' } });
assert.match(pending, /aria-label="Trạng thái xét duyệt"/, 'Các trạng thái cần hướng dẫn vẫn giữ thanh trạng thái');
assert.match(pending, /Đã gửi duyệt\. Bạn có thể xem nhưng chưa thể chỉnh sửa hoặc tải tệp\./);

// 12. Sau xác nhận, NCC quản lý sản phẩm đang trên sàn; không còn panel trạng thái riêng.
const approved = render({ product: { ...product, supplier_review_status: 'approved', ready_for_buyer: true, reviewed_category_slug: 'cashew' },
  media: [{ ...media[0], audience: 'buyer' }] });
assert.match(approved, /đã đăng/);
assert.match(approved, /type="hidden" name="supplier_category_proposal"/);
assert.match(approved, /Sản phẩm đã đăng/);
assert.doesNotMatch(approved, /Trạng thái công khai|Hiển thị với buyer/);

console.log('✅ Product page: 3 bước một màn hình, bước 3 đọc lại toàn bộ dữ liệu bước 1–2, nút gửi luôn phản hồi, thương mại & xuất khẩu hiện ngay.');
