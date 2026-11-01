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
import * as priceDisplay from "../lib/products/price-display.ts";

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
/** Nạp module thật để test bằng đúng thang điểm đang chạy. */
const completenessExports = (() => {
  const mod = { exports: {} };
  const isExpired = (asset) => asset.status === 'expired' ||
    Boolean(asset.expires_on && asset.expires_on < new Date().toISOString().slice(0, 10));
  const source = ts.transpileModule(fs.readFileSync(new URL('../lib/products/completeness.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { module: mod, exports: mod.exports,
    require: (id) => { assert.equal(id, '@/lib/media/readiness'); return { isExpired }; } }, { filename: 'completeness.ts' });
  return mod.exports;
})();

const Link = ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children);

const view = {
  PRODUCT_STATUS: {
    draft: { label: 'Bản nháp', tone: 'bg-slate-100' },
    pending: { label: 'Chờ duyệt', tone: 'bg-amber-100' },
    changes_requested: { label: 'Cần chỉnh sửa', tone: 'bg-rose-100' },
    approved: { label: 'Đã đăng', tone: 'bg-emerald-100' },
    paused: { label: 'Đã tạm ẩn', tone: 'bg-slate-200' },
  },
  productReview: (p) => p.supplier_review_status ?? 'approved',
  privateMediaUrl: (m) => m.storage_path ? `/api/media/file/${m.storage_path}` : null,
  productCanSubmit: (p, media) => ['draft', 'changes_requested', 'paused'].includes(p.supplier_review_status ?? 'approved') &&
    !!(p.name?.trim() && (p.description?.trim() || p.spec?.trim())) &&
    media.some((m) => (m.kind === 'image' || m.kind === 'catalogue') && !!m.storage_path),
};

const priceUnits = load('../lib/public/price-units.ts', { '../products/price-display.ts': priceDisplay });
const gradeResolution = load('../lib/public/grade-resolution.ts', {});
const gradePricing = load('../lib/products/grade-pricing.ts', {
  '@/lib/public/price-units': priceUnits,
  '@/lib/public/grade-resolution': gradeResolution,
});
const gradePricingTable = load('../components/products/grade-pricing-table.tsx', {
  react: React,
  'react/jsx-runtime': jsx,
  'lucide-react': icons,
  '@/lib/products/grade-pricing': gradePricing,
});
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
  '@/lib/products/grade-pricing': gradePricing,
  '@/lib/products/completeness': completenessExports,
  '@/lib/public/price-units': priceUnits,
  '@/lib/products/quantity-pricing': {
    validateQuantityPricing: () => ({ value: null, errors: [], warnings: [] }),
    draftPublicQuantityOffer: () => null,
    nameContainsGrade: () => false,
  },
  '@/components/products/buyer-preview-dialog': {
    BuyerPreviewDialog: (props) => React.createElement('div', { 'data-buyer-page-preview': '1' }, props.data.title),
  },
  '@/components/products/grade-pricing-table': gradePricingTable,
  '@/components/products/quantity-pricing-inline': { QuantityPricingInline: (props) => React.createElement('div', { 'data-quantity-editor': '1', 'data-sidebar-preview': String(!!props.onPreviewChange) }) },
  '@/components/products/quantity-pricing-editor': { QuantityBuyerPreview: (props) => React.createElement('div', { 'data-buyer-preview': '1' }, props.value.nameEn), QuantityPricingEditor: () => React.createElement('div', { 'data-new-quantity': '1' }) },
  '@/components/toast': { useToast: () => ({ push() {} }) },
  '../product-actions': {
    saveSupplierProductAction: async () => ({ ok: true, id: 'p1', message: 'Đã lưu bản nháp.' }),
    submitSupplierProductAction: async () => ({ ok: true, message: 'Đã gửi.' }),
    deleteSupplierDraftProductAction: async () => ({ ok: true, message: 'Đã xóa.' }),
    pauseSupplierProductAction: async () => ({ ok: true, message: 'Đã tạm ẩn.' }),
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
const page = render();
const quantityEditor = { productId: 'p1', updatedAt: '2026-10-20', nameVi: 'Nhân điều', nameEn: 'Cashew kernels',
  pendingPriceId: null, pendingNameId: null, hasApprovedPrice: false, hasApprovedName: false,
  grade: 'W320', incoterm: 'FOB', tiers: [{ minKg: '1000', priceUsdPerKg: '6.40' }], standardGrades: ['W320'],
  policy: { maxTiers: 4, maxPriceRatio: 1.5, maxLastMoqRatio: 100 }, buyerPriceUnit: 'kg', pricePubliclyVisible: true };
const withQuantity = render({ quantityEditor });

// 1. Một trang duy nhất, tám khối, mục lục neo bên trái — không còn wizard ba bước.
const SECTION_IDS = ['sec-category', 'sec-basic', 'sec-media', 'sec-spec', 'sec-price', 'sec-shipping', 'sec-detail', 'sec-review'];
const sectionHtml = (html, id) => {
  const at = html.indexOf(`data-form-section="${id}"`);
  assert.ok(at > 0, `Có khối ${id}`);
  const rest = html.slice(at + 20);
  const next = rest.indexOf('data-form-section="');
  return rest.slice(0, next > 0 ? next : rest.length);
};
for (const id of SECTION_IDS) sectionHtml(page, id);
assert.doesNotMatch(source, /data-step-panel/, 'Không còn panel theo bước');
assert.doesNotMatch(page, />Bước \d</, 'Không còn nhãn Bước 1/2/3 trong nội dung');
assert.doesNotMatch(source, /STEPS|goToStep|selectStep|leaveInfoFor|advanceTo/, 'Đã bỏ toàn bộ máy móc chuyển bước');
assert.match(page, /<nav aria-label="Mục lục hồ sơ sản phẩm"/, 'Có mục lục neo bên trái');
for (const id of SECTION_IDS) {
  assert.match(page, new RegExp(`href="#${id}"`), `Mục lục có liên kết tới ${id}`);
  assert.match(page, new RegExp(`scroll-mt-24[^"]*"\\s*aria-label|<section id="${id}"[^>]*scroll-mt-24`), `Khối ${id} có khoảng cuộn cho thanh dính`);
}
assert.match(page, /Mọi khối nằm trên cùng một trang/, 'Nói rõ cho người bán biết đây là một trang');

// 2. Trường nằm đúng khối theo mạch: ngành hàng → tên → ảnh → quy cách → giá → đóng gói → mô tả.
const inSection = (id, html, marker) => assert.ok(sectionHtml(html, id).includes(marker), `${marker} nằm trong ${id}`);
inSection('sec-category', page, 'name="supplier_category_proposal"');
for (const marker of ['name="name"', 'name="keywords"', 'name="description"']) inSection('sec-basic', page, marker);
assert.ok(sectionHtml(page, 'sec-basic').indexOf('name="keywords"') < sectionHtml(page, 'sec-basic').indexOf('name="description"'),
  'Từ khoá đứng ngay sau tên, trước mô tả ngắn');
for (const marker of ['6 ô ảnh sản phẩm', 'Ảnh chính', 'aria-label="Xóa ảnh đại diện"', 'aria-label="Chọn ảnh sản phẩm hoặc catalogue"']) inSection('sec-media', page, marker);
for (const marker of ['name="spec"', 'name="monthly_capacity"', 'name="raw_material_region"', 'name="input_material_origin"',
  'name="oem"', 'name="odm"', 'name="samples"']) inSection('sec-spec', page, marker);
for (const marker of ['name="sample_price_usd"', 'name="price_publicly_visible"']) inSection('sec-price', page, marker);
assert.match(sectionHtml(page, 'sec-price'), /Nhập 0 nếu nhận mẫu miễn phí/, 'ghi rõ nhập 0 để nhận mẫu miễn phí');
inSection('sec-price', withQuantity, 'data-quantity-editor="1"');
assert.match(withQuantity, /data-sidebar-preview="true"/, 'Bảng giá đẩy bản nháp sang thẻ xem nhanh');
assert.equal((withQuantity.match(/data-buyer-preview="1"/g) ?? []).length, 1, 'Bản xem trước của người mua nằm trong thẻ có sẵn');
assert.match(withQuantity, /Giá thật chỉ đổi sau khi bản giá được duyệt/, 'Bản xem trước không bị nhầm với giá thật');
assert.doesNotMatch(withQuantity, />Giá tham khảo<\//, 'Không lặp giá cũ cạnh bản xem trước');
for (const marker of ['name="packaging"', 'name="package_type"', 'name="package_weight_kg"', 'name="package_size"',
  'name="units_per_carton"', 'name="lead_time_value"', 'name="lead_time_unit"', 'name="lead_time_days"',
  'name="export_port"', 'name="incoterm_place"', 'name="payment_terms"']) inSection('sec-shipping', page, marker);
inSection('sec-detail', page, 'name="description_detail"');
assert.equal((page.match(/name="payment_terms"/g) ?? []).length, 1, 'Không lặp ô điều kiện thanh toán');
assert.ok(page.indexOf('data-form-section="sec-media"') > page.indexOf('data-form-section="sec-basic"'), 'Ảnh nằm ngay sau tên & từ khoá');
assert.ok(page.indexOf('data-form-section="sec-price"') < page.indexOf('data-form-section="sec-shipping"'), 'Giá đứng trước đóng gói & giao hàng');
assert.ok(page.indexOf('data-form-section="sec-detail"') > page.indexOf('data-form-section="sec-shipping"'), 'Mô tả chi tiết đặt cuối, như Alibaba');

// 3. Khối xem lại: đọc lại đủ bốn nhóm, mỗi nhóm một nút Sửa cuộn về đúng khối.
const review = sectionHtml(page, 'sec-review');
assert.match(review, /Xem lại/, 'Có khối xem lại');
for (const title of ['Tên, danh mục &amp; mô tả', 'Giá, MOQ &amp; điều kiện bán', 'Đóng gói &amp; giao hàng', 'Ảnh và catalogue'])
  assert.ok(review.includes(title), `Khối xem lại có nhóm ${title}`);
assert.ok((review.match(/Sửa<\/button>/g) ?? []).length >= 4, 'Mỗi nhóm xem lại có nút Sửa');
for (const target of ['sec-basic', 'sec-price', 'sec-shipping', 'sec-media']) {
  assert.ok(source.includes(`scrollToSection(\"${target}\")`), `Nút Sửa của nhóm trỏ về ${target}`);
}
for (const value of ['Hạt điều nhân W320', 'Hạt &amp; hạt nhân / Hạt điều', 'Hạt điều trắng', 'W320', '200 tấn',
  'Cát Lái', 'FOB', 'T/T 30%', 'Carton 22.68kg', 'Đắk Lắk, vùng Buôn Ma Thuột', 'Việt Nam và Campuchia', 'products/p1/a.jpg']) {
  assert.ok(page.includes(value), `Khối xem lại hiển thị giá trị đã nhập: ${value}`);
}
assert.match(source, /ReviewField/, 'Có thành phần đọc lại từng trường');
assert.match(source, /snapshotFromForm/, 'Bản xem lại cập nhật theo nội dung đang nhập');

// 4. Nút gửi: luôn phản hồi, liệt kê việc còn thiếu, thanh dính đáy.
assert.match(page, /sticky bottom-0[^"]*backdrop-blur/, 'Thanh hành động dính đáy màn hình');
assert.match(source, /<button type="submit" form="product-info"/, 'Nút lưu submit đúng form');
assert.doesNotMatch(source, /onClick=\{submit\} disabled=\{busy \|\| !canSubmit\}/, 'Nút gửi không bị khoá im lặng');
assert.match(source, /function requestSubmit\(\)/, 'Nút gửi đi qua requestSubmit để luôn phản hồi');
assert.match(source, /submitBlockers\(\)/, 'Có danh sách việc còn thiếu');
assert.match(source, /setSubmitHint\(blockers\)/, 'Bấm gửi khi thiếu sẽ hiện lời nhắc thay vì không làm gì');
assert.match(source, /Đang gửi\.\.\./, 'Nút có trạng thái đang gửi');
assert.match(source, /animate-spin/, 'Có vòng xoay khi đang gửi');
assert.match(page, /id="submit-blockers"/, 'Nút gửi liên kết tới phần giải thích điều kiện');
assert.match(page, /<div id="submit-blockers" aria-live="polite">/, 'Danh sách việc cần làm có aria-live');
assert.match(page, /Hồ sơ đủ điều kiện/, 'Đủ điều kiện thì báo rõ trước khi gửi');
const missingMedia = render({ media: [] });
assert.match(source, /Tải ít nhất một ảnh sản phẩm ở mục Ảnh & tệp\./, 'Nói rõ thiếu tệp ở mục nào khi bấm gửi');
assert.doesNotMatch(missingMedia, /Tải ít nhất một ảnh sản phẩm ở mục Ảnh &amp; tệp/,
  'Không còn liệt kê sẵn việc thiếu dưới mục 8; chỉ hiện sau khi bấm gửi');
assert.doesNotMatch(source, /Tên tiếng Anh được kiểm tra trong quá trình duyệt sản phẩm/,
  'Bỏ câu nhắc tên tiếng Anh ở mục xem lại');
const sendButton = (missingMedia.match(/<button[^>]*aria-describedby="submit-blockers"[^>]*>/) ?? [''])[0];
assert.ok(sendButton && !/\sdisabled(?:=""|=|\s|>)/.test(sendButton), 'Thiếu điều kiện vẫn không khoá nút gửi');
for (const hint of ['requestSubmit', 'scrollToSection("sec-media")', 'scrollToSection("sec-basic")']) {
  assert.ok(source.includes(hint), `Thiếu gì thì đưa tới đúng khối: ${hint}`);
}
assert.match(page, /Đã gửi duyệt|Gửi duyệt/, 'Có nhãn gửi duyệt');
// Nút Xem trước phải mở bản xem trước thật, không chỉ cuộn trang.
assert.match(source, /onClick=\{\(\) => setPreviewOpen\(true\)\}/, 'Nút Xem trước mở hộp xem trước');
assert.match(source, /aria-haspopup="dialog"/, 'Nút Xem trước báo trước là mở hộp thoại');
assert.doesNotMatch(source, /onClick=\{\(\) => scrollToSection\("sec-review"\)\}/, 'Nút Xem trước không còn chỉ cuộn tới mục 8');
assert.match(source, /\{previewOpen && <BuyerPreviewDialog open onClose=/, 'Hộp xem trước được dựng từ component dùng chung');
const dialog = read('../components/products/buyer-preview-dialog.tsx');
assert.match(dialog, /role="dialog" aria-modal="true"/, 'Hộp xem trước có ngữ nghĩa hộp thoại');
assert.match(dialog, /event\.key === "Escape"/, 'Đóng được bằng Escape');
assert.match(dialog, /Đóng bản xem trước/, 'Có nút đóng có nhãn đọc được');
assert.match(dialog, /<QuantityPriceTable offer=\{data\.offer\}/, 'Bảng giá dùng đúng component của trang người mua');
assert.match(dialog, /<ProductTradeLabels oem=/, 'Nhãn OEM/ODM/mẫu giống trang người mua');
assert.match(dialog, /Bản xem trước/);
assert.match(source, /certificates: certificates\.map\(\(certificate\) => \(\{/, 'Bản xem trước nhận chứng nhận đã duyệt từ trang sản phẩm');
assert.match(read('../app/supplier/portal/products/[id]/page.tsx'), /certificates=\{approvedCertificates\}/,
  'Trang sản phẩm truyền chứng nhận đã duyệt vào bản xem trước');
assert.doesNotMatch(source, /Trở về bước|Sang bước|Tiếp tục/, 'Không còn nút chuyển bước');

// 5. Độ hoàn thiện: chỉ đọc, gợi ý theo mục chứ không theo bước.
assert.match(page, /Độ hoàn thiện/, 'Cột phải có khối độ hoàn thiện');
assert.match(page, /Hồ sơ \d+%|Độ hoàn thiện/, 'Điểm hoàn thiện hiển thị trong cột phải');
assert.match(page, /Bổ sung: Ảnh thật|Bổ sung: /, 'Nút bổ sung gọi tên mục còn thiếu');
assert.doesNotMatch(page, /Bổ sung ở bước/, 'Không còn địa chỉ theo bước');
assert.match(source, /scrollToSection\(SECTION_FOR_ITEM\[completeness\.next!\.key\] \?\? "sec-basic"\)/, 'Nút bổ sung cuộn tới đúng khối');

// 6. Giá của sản phẩm mới: mặc định chia sẻ, nhưng lựa chọn đã lưu không bị bật lại.
const priceCheckbox = (html) => {
  const tag = html.match(/<input[^>]*name="price_publicly_visible"[^>]*>/)?.[0];
  assert.ok(tag, 'Có checkbox chia sẻ giá của sản phẩm');
  return tag;
};
const newProduct = render({ product: undefined, media: [] });
// Nhãn dòng "Giá theo số lượng" là của form; chỉ cấm tiêu đề cũ lặp lại trong bảng giá.
assert.doesNotMatch(newProduct, /Bảng giá theo số lượng|Tên tiếng Anh \(tùy chọn\)/);
assert.match(newProduct, /Chọn danh mục để nhập grade và bảng giá/);
assert.doesNotMatch(newProduct, /Bảng giá cũ|Thêm grade|name="grade_rows_json"|name="price_valid_until"/);
assert.match(priceCheckbox(newProduct), /checked=""/, 'Sản phẩm mới được tick sẵn');
for (const savedProduct of [product, { ...product, price_publicly_visible: false }]) {
  assert.doesNotMatch(priceCheckbox(render({ product: savedProduct })), /checked=""/,
    'Bản ghi cũ thiếu cờ hoặc đã tắt giá vẫn giữ trạng thái riêng tư');
}
assert.match(priceCheckbox(render({ product: { ...product, price_publicly_visible: true } })), /checked=""/,
  'Lựa chọn chia sẻ giá đã lưu vẫn được giữ');
const priceReviewChip = (html) => {
  const chip = html.match(/<span class="([^"]*)">Công khai giá khi đủ điều kiện<\/span>/);
  assert.ok(chip, 'Khối xem lại có trạng thái chia sẻ giá');
  return chip[1];
};
assert.match(priceReviewChip(page), /line-through/, 'Khối xem lại không tự bật giá cho sản phẩm đã lưu ở trạng thái tắt');
assert.doesNotMatch(priceReviewChip(newProduct), /line-through/, 'Khối xem lại khớp lựa chọn mặc định của sản phẩm mới');

// 7. Xác nhận chia sẻ giá.
const noConsent = render({ supplier: { ...supplier, fob_publicly_visible: false } });
inSection('sec-price', noConsent, 'name="confirm_supplier_price_consent"');
assert.match(noConsent, /Tôi đồng ý chia sẻ giá tham khảo của những sản phẩm tôi chọn công khai\./, 'Xác nhận chia sẻ giá gọn một dòng');
assert.match(noConsent, /Hiệu lực 180 ngày kể từ khi lưu; giá tham khảo không phải báo giá chính thức/, 'Điều kiện ngắn nằm dưới checkbox');
assert.match(noConsent, /href="\/dieu-khoan-su-dung"[^>]*>Điều khoản</, 'Có link điều khoản thay vì nhồi văn bản pháp lý');
const noConsentOptedIn = render({ product: { ...product, price_publicly_visible: true }, supplier: { ...supplier, fob_publicly_visible: false } });
assert.match(noConsentOptedIn.match(/<input[^>]*name="confirm_supplier_price_consent"[^>]*>/)?.[0] ?? '', /required=""/,
  'Ô xác nhận chia sẻ giá là bắt buộc khi bật công khai giá');
assert.doesNotMatch(noConsent.match(/<input[^>]*name="confirm_supplier_price_consent"[^>]*>/)?.[0] ?? '', /required=""/,
  'Không bắt buộc tick xác nhận khi công khai giá đang tắt');

// 8. Không đưa UI giá v2 hay bảng giá cũ trở lại cổng NCC.
assert.doesNotMatch(source, /Bảng giá cũ \(cơ chế hiện tại\)|GradePricingTable|grade_rows_json/, 'Không còn bảng giá cũ');
assert.match(source, /<QuantityPricingEditor value=\{newQuantity\}/, 'Sản phẩm mới dùng bảng giá theo số lượng');
assert.match(source, /quantity_creation_request_id/, 'Sản phẩm mới gửi kèm mã chống trùng');
assert.match(source, /quantity_tiers_json/, 'Bảng giá bậc được gửi lên');
assert.doesNotMatch(source, /QuantityPricingV2Editor|QuantityGradeV2Field|QuantityBuyerV2Preview|quantityV2FormEnabled|onV2PreviewChange/, 'Không mở UI giá v2 ở cổng NCC');
assert.doesNotMatch(source, /form\.set\("quantity_version", "2"\)/, 'Không tự gửi bản giá v2');
const newPage = read('../app/supplier/portal/products/new/page.tsx');
assert.doesNotMatch(newPage, /VEXIM_QUANTITY_V2_STAGING|quantityV2FormEnabled/, 'Trang tạo mới không có cờ v2');

// 9. Chứng nhận chỉ đến từ hồ sơ Giấy tờ L1.
assert.ok(!source.includes('name="certifications"'), 'Bỏ ô chứng nhận sản phẩm tự khai');
assert.ok(!source.includes('Chứng nhận sản phẩm (tự khai)'), 'Bỏ nhãn chứng nhận tự khai');

// 10. Hành vi cũ còn nguyên.
assert.match(source, /saveSupplierProductAction\(form\)/, 'Vẫn lưu qua saveSupplierProductAction');
assert.match(source, /submitSupplierProductAction\(form\)/, 'Vẫn nộp qua submitSupplierProductAction');
// Gửi duyệt không còn đòi bấm Lưu trước: nút gửi tự lưu rồi nộp.
assert.match(source, /const submitReady = /, 'Điều kiện gửi đọc nội dung đang nhập, không đòi bản đã lưu');
assert.match(source, /const id = product && !dirty \? product\.id : await persist\(\);/,
  'Bấm Gửi duyệt tự lưu trước rồi gửi');
assert.doesNotMatch(source, /Lưu thông tin sản phẩm trước khi gửi|Lưu thay đổi trước khi gửi/,
  'Không còn bắt người bán lưu thông tin trước khi gửi');
assert.doesNotMatch(source, /label: "Lưu thông tin sản phẩm trước khi gửi"/, 'Mục 8 không còn dòng nhắc lưu');
assert.match(source, /const hasDetails = !!\(\(snapshot\.spec/,
  'Mô tả ngắn / quy cách đọc từ nội dung đang nhập nên hết nhắc sau khi gõ');
assert.doesNotMatch(source, /Lưu thay đổi sẽ đưa sản phẩm về bản nháp/, 'Sửa sản phẩm đã duyệt không tự rút khỏi sàn');
assert.ok(source.includes('!["approved", "paused"].includes(review) || product?.supplier_originated === true'),
  'Sản phẩm NCC đã duyệt hoặc tạm ẩn vẫn quản lý được ảnh của mình');
assert.ok(source.includes('useState(product?.reviewed_category_slug ?? product?.supplier_category_proposal ?? product?.category ?? "")'),
  'Danh mục staff đã duyệt được ưu tiên khi mở lại editor');
assert.match(source, /Bạn có thay đổi chưa lưu/, 'Vẫn cảnh báo rời trang khi chưa lưu');
assert.match(source, /firstInvalidField\(formElement\)/, 'Vẫn kiểm tra trường bắt buộc trên cả trang');
assert.match(source, /invalid\.scrollIntoView/, 'Lưu thiếu trường bắt buộc thì cuộn tới đúng ô');
assert.match(source, /\/api\/supplier-portal\/products\/\$\{product\.id\}\/media/, 'Vẫn tải tệp qua API riêng');
assert.match(source, /method: "DELETE"/, 'Vẫn xoá được tệp nháp');
assert.match(source, /data\?\.message \|\| `Xóa tệp thất bại \(HTTP/, 'Lỗi xóa hiển thị lý do API hoặc HTTP nếu không có JSON');
assert.match(source, /data\?\.message \|\| `Đặt ảnh đại diện thất bại \(HTTP/, 'Lỗi đổi ảnh hiển thị lý do API');
assert.doesNotMatch(source, /snapshotFromForm\(event\.currentTarget/, 'Không đọc event.currentTarget bên trong state updater');
assert.match(source, /function onFormChange\(\) \{\s*const form = formRef\.current;/, 'onFormChange đọc form qua ref ngay trong handler');
assert.match(source, /const formElement = formRef\.current;/, 'persist() đọc form qua ref, không giữ event sau await');
assert.match(source, /new FormData\(formElement\)/, 'save() dùng phần tử đã giữ, không dùng lại event sau await');
assert.match(source, /function snapshotFromForm\(form: HTMLFormElement \| null/, 'snapshotFromForm chấp nhận form null');
assert.deepEqual(snapshotFromForm(null, { name: 'giữ nguyên' }), { name: 'giữ nguyên' }, 'Chưa có form thì giữ bản nháp cũ, không ném lỗi');
assert.match(source, /for \(const key of checkKeys\) if \(form\.querySelector/, 'Checkbox không tick vẫn được ghi nhận là trống');
assert.match(source, /Yêu cầu chỉnh sửa:/, 'Phản hồi duyệt gọi đúng việc phải làm');

// 11. ?step=2 sau khi tạo mới vẫn dùng được: cuộn thẳng tới khối ảnh.
const onStep2 = render({ initialStep: 2 });
assert.match(source, /initialStep === 2[\s\S]{0,120}sec-media/, 'Đọc ?step=2 và cuộn tới khối ảnh');
const detailPage = read('../app/supplier/portal/products/[id]/page.tsx');
assert.match(detailPage, /initialStep=\{step\}/, 'Truyền bước mở đầu cho editor');
assert.match(detailPage, /value === 2 \? 2 : value === 3 \? 3 : 1/, 'Chỉ nhận bước 1–3');

// 12. Trạng thái: nháp không lặp thanh trạng thái; đang duyệt/tạm ẩn có hướng dẫn.
for (const draftHtml of [page, newProduct]) {
  assert.doesNotMatch(draftHtml, /aria-label="Trạng thái xét duyệt"/, 'Bản nháp không hiện thanh trạng thái trùng lặp');
  assert.equal((draftHtml.match(/>Bản nháp</g) ?? []).length, 1, 'Chỉ giữ nhãn Bản nháp trên ảnh');
}
const pendingHtml = render({ product: { ...product, supplier_review_status: 'pending' } });
assert.match(pendingHtml, /aria-label="Trạng thái xét duyệt"/, 'Các trạng thái cần hướng dẫn vẫn giữ thanh trạng thái');
assert.match(pendingHtml, /Đã gửi duyệt\. Bạn có thể xem nhưng chưa thể chỉnh sửa hoặc tải tệp\./);
const approvedHtml = render({ product: { ...product, supplier_review_status: 'approved', ready_for_buyer: true, reviewed_category_slug: 'cashew' },
  media: [{ ...media[0], audience: 'buyer' }] });
assert.match(approvedHtml, /Sản phẩm đã đăng/);
assert.match(approvedHtml, /type="hidden" name="supplier_category_proposal"/);
assert.doesNotMatch(approvedHtml, /Trạng thái công khai|Hiển thị với buyer/);

// 13. Ảnh và thao tác tệp theo đúng người và trạng thái.
const ownDraft = { ...product, supplier_originated: true, featured_media_id: 'm1' };
const oneCover = render({ product: ownDraft, media });
assert.match(oneCover, /aria-label="Xóa ảnh đại diện"/, 'Có thể xóa trực tiếp ảnh đại diện duy nhất của bản nháp');
assert.match(oneCover, /Xóa bản nháp/, 'Nháp do NCC tạo có thao tác xóa vĩnh viễn');
assert.doesNotMatch(render({ product: ownDraft, media: [{ ...media[0], created_by: 'someone-else' }] }), /aria-label="Xóa ảnh đại diện"/,
  'Không có nút xóa tệp do người khác tải');
assert.doesNotMatch(render({ product: { ...ownDraft, supplier_review_status: 'pending' } }), /aria-label="Xóa ảnh đại diện"|Xóa bản nháp/,
  'Đang duyệt khoá xóa ảnh và sản phẩm');
const ownApproved = { ...ownDraft, supplier_review_status: 'approved', ready_for_buyer: true, reviewed_category_slug: 'cashew' };
const approvedOwnHtml = render({ product: ownApproved, media: [{ ...media[0], audience: 'buyer' }] });
assert.match(approvedOwnHtml, /aria-label="Xóa ảnh đại diện"/, 'Ảnh do mình tải có nút xóa cả khi đang đăng');
assert.match(approvedOwnHtml, /Tạm ẩn sản phẩm/);
assert.doesNotMatch(approvedOwnHtml, /Xóa bản nháp/);
// Chốt 31/10/2026: bỏ dòng nhắc dài về việc kiểm tra lại giá.
assert.doesNotMatch(approvedOwnHtml, /chỉnh sửa giá trên sản phẩm đã duyệt/, 'Không còn dòng nhắc kiểm tra lại giá');
const pausedHtml = render({ product: { ...ownApproved, supplier_review_status: 'paused', ready_for_buyer: false },
  media: [{ ...media[0], audience: 'buyer' }] });
assert.match(pausedHtml, /Đã tạm ẩn/);
assert.match(pausedHtml, /Gửi duyệt lại khi muốn đăng/);
assert.match(pausedHtml, /aria-label="Xóa ảnh đại diện"/);
assert.doesNotMatch(pausedHtml, /Xóa bản nháp|Tạm ẩn sản phẩm/);
const legacyPaused = render({ product: { ...ownApproved, supplier_originated: false, supplier_review_status: 'paused',
  supplier_category_proposal: null, reviewed_category_slug: null, ready_for_buyer: false } });
assert.match(legacyPaused, /Gửi duyệt/, 'Sản phẩm staff tạo cũ vẫn có luồng gửi duyệt lại');
assert.doesNotMatch(legacyPaused, /aria-label="Xóa ảnh đại diện"/, 'Tệp staff quản lý vẫn bị khóa');

// 14. Một chỗ cho ảnh: lưới 6 ô, không lặp lại danh sách ảnh; catalogue chỉ chứa tệp PDF.
const multiBuyerMedia = [
  { ...media[0], id: 'm1', audience: 'buyer', caption: 'cover.png' },
  { ...media[0], id: 'm2', audience: 'buyer', storage_path: 'products/p1/b.png', caption: '6 (5).png' },
];
const multiHtml = render({ product: ownApproved, media: multiBuyerMedia });
assert.doesNotMatch(source, /\bleft-11\b/, 'Không dùng vị trí cứng left-11 khiến nút X đè lên nhãn');
assert.match(multiHtml, /aria-label="6 ô ảnh sản phẩm"/, 'Ảnh sản phẩm nằm trong lưới 6 ô');
assert.match(multiHtml, /aria-label="Ảnh chính"/, 'Ô ảnh chính có dấu hiệu riêng cho trình đọc màn hình');
assert.doesNotMatch(multiHtml, />Ảnh chính</, 'Không dùng chữ Ảnh chính đè lên ảnh nhỏ');
assert.doesNotMatch(multiHtml, /Catalogue PDF/, 'Chỉ có ảnh thì không hiện khối catalogue');
// Ảnh đại diện đứng trước lưới ảnh sản phẩm, và lưới phải có nút đổi ảnh đại diện / xoá ảnh.
assert.ok(multiHtml.indexOf('Ảnh đại diện') < multiHtml.indexOf('6 ô ảnh sản phẩm'), 'Ảnh đại diện nằm trên ảnh sản phẩm');
assert.match(multiHtml, /title="Đặt làm ảnh đại diện"/, 'Mỗi ô ảnh đổi được ảnh đại diện');
assert.match(multiHtml, /aria-label="Đặt [^"]*làm ảnh đại diện"/, 'Nút đổi ảnh đại diện có nhãn đọc được');
assert.match(multiHtml, /title="Xóa ảnh"/, 'Mỗi ô ảnh xoá được ngay tại ô');
assert.doesNotMatch(source, /chọn chia sẻ|chọn tệp chia sẻ/, 'Nhà cung cấp không có nút chia sẻ nên không được hướng dẫn chọn chia sẻ');
const pdfMedia = [...multiBuyerMedia, { ...media[0], id: 'pdf1', kind: 'catalogue', caption: 'catalogue.pdf' }];
const pdfHtml = render({ product: ownApproved, media: pdfMedia });
assert.match(pdfHtml, /Catalogue PDF/, 'Có tệp PDF thì hiện khối catalogue');
assert.match(pdfHtml, /catalogue\.pdf/, 'Khối catalogue gọi tên tệp PDF');

// 15. Danh sách sản phẩm: nhãn danh mục tiếng Việt + cảnh báo ngoài phạm vi.
const storefront = read('../app/supplier/portal/products/product-storefront.tsx');
assert.match(storefront, /categoryLabels\?: Record<string, string>/, 'Danh sách nhận nhãn danh mục');
assert.match(storefront, /categoryLabels\[slug\] \?\? slug/, 'Hiện nhãn thay vì slug thô');
assert.match(storefront, /Ngoài phạm vi/, 'Sản phẩm ngoài phạm vi được đánh dấu');
assert.match(storefront, /Chọn thêm danh mục/, 'Có lối sang trang Danh mục kinh doanh');
const listPage = read('../app/supplier/portal/products/page.tsx');
assert.match(listPage, /categoryLabels=/, 'Trang danh sách truyền nhãn danh mục');
assert.match(listPage, /scope=\{\[?scope/, 'Trang danh sách truyền phạm vi danh mục');
assert.match(listPage, /allowedSupplierCategories/, 'Phạm vi lấy từ đúng lớp dữ liệu danh mục');

// 16. Copy: không lạm dụng tên nền tảng, không giọng hành chính.
const brandMentions = (page.match(/Vexim/g) ?? []).length;
assert.ok(brandMentions <= 3, `Chỉ nhắc tên nền tảng khi thật cần (đang ${brandMentions} lần)`);
for (const phrase of ['Vexim duyệt', 'Vexim kiểm tra', 'Vexim xác nhận', 'cho Vexim', 'Chờ Vexim', 'Tôi đại diện NCC xác nhận đồng ý cho', 'không tự duyệt sản phẩm']) {
  assert.ok(!source.includes(phrase), `Bỏ giọng hành chính/lặp thương hiệu: ${phrase}`);
}
assert.match(page, /Chọn danh mục phù hợp với sản phẩm\. Danh mục được kiểm tra khi duyệt/, 'Hint danh mục nói đúng mức cần thiết');
assert.match(source, /Chọn danh mục phù hợp với sản phẩm để mở grade và bảng giá\./, 'Câu mở grade dùng "phù hợp với sản phẩm"');
assert.doesNotMatch(source, /mục cần sửa trước khi gửi duyệt/, 'Đã bỏ khối nhắc đầu trang về các mục cần sửa');
assert.doesNotMatch(page, /mục cần sửa trước khi gửi duyệt/, 'Không còn khối nhắc đầu trang khi render');

// 17. Kho ảnh: tải ảnh trước khi có sản phẩm, gắn vào sản phẩm ngay khi bấm Lưu.
assert.match(source, /const canUpload = !locked &&/, 'Ô chọn tệp không đòi sản phẩm đã tồn tại');
assert.doesNotMatch(source, /canUpload = !!product/, 'Đã bỏ điều kiện phải có sản phẩm trước khi tải tệp');
assert.match(source, /async function persist\(\): Promise<string \| null>/, 'Lưu và trả về id dùng chung cho nút Lưu và lúc tạo sản phẩm');
assert.match(source, /fetch\("\/api\/supplier-portal\/media", \{ method: "POST", body \}\)/, 'Ảnh mới tải đi vào kho ảnh riêng');
assert.match(source, /if \(chosen\.length\) setPickedBank\(\(current\) => Array\.from\(new Set\(\[\.\.\.current, \.\.\.chosen\]\)\)\.slice\(0, 6\)\)/,
  'Ảnh vừa tải được chọn sẵn cho sản phẩm đang tạo, tối đa 6 ô');
assert.match(source, /const room = Math\.max\(0, 6 - pickedBank\.length\);/,
  'Ảnh thứ 7 trở đi nằm lại kho vì sản phẩm chỉ hiện 6 ảnh');
assert.match(source, /form\.set\("bank_media_ids", JSON\.stringify\(pickedBank\.slice\(0, 6\)\)\)/, 'Ảnh đã chọn được gửi kèm khi lưu');
assert.doesNotMatch(source, /ensureDraft/, 'Không quay lại cơ chế lưu nháp trước khi tải ảnh');
assert.doesNotMatch(source, /Lưu nháp rồi tải ảnh|Lưu thay đổi rồi tải ảnh|saveIntent/, 'Không còn bắt người bán bấm lưu trước khi tải ảnh');
assert.match(source, /Chọn ảnh là tải lên ngay và tự gắn vào ô trống\./, 'Nói trước là chọn ảnh là tải lên ngay');
assert.match(source, /Một sản phẩm hiện tối đa 6 ảnh; ảnh thứ 7 trở đi nằm trong kho cho sản phẩm khác\./,
  'Nói rõ ảnh thứ 7 trở đi nằm lại kho');
assert.ok(!source.includes('Đã chọn {selected.length} tệp'),
  'Không còn bước bấm nút tải sau khi chọn tệp');
const newProductMedia = render({ product: undefined, media: [] });
assert.doesNotMatch(newProductMedia, /Kho ảnh của bạn/, 'Không còn khối kho ảnh riêng trùng với 6 ô ảnh');
assert.match(newProductMedia, /Kho có 0\/12 ảnh\. Chọn ảnh là tải lên ngay và tự gắn vào ô trống\./,
  'Kho trống vẫn chỉ rõ chọn ảnh là tải lên ngay');
assert.match(newProductMedia, /aria-label="Chọn ảnh sản phẩm hoặc catalogue"/, 'Sản phẩm mới vẫn thấy nút chọn tệp');
assert.match(newProductMedia, /Kéo thả hoặc <label[^>]*>chọn ảnh|Kéo thả hoặc/, 'Sản phẩm mới thấy vùng kéo thả ảnh');

// 18. Ảnh chọn trong kho ảnh phải hiện ngay trong 6 ô; ảnh chọn đầu tiên là ảnh chính,
// nên ảnh đại diện không còn trống trước khi bấm Lưu (lỗi người bán báo).
assert.match(source, /const pickedImages = pickedBank/, 'Ảnh đang chọn trong kho được dựng thành danh sách ảnh');
assert.match(source, /const cover = product \? savedCover : pickedImages\[0\] \?\? null;/,
  'Sản phẩm mới lấy ảnh chọn đầu tiên làm ảnh đại diện');
assert.match(source, /: pickedImages\.slice\(0, 6\);/, 'Sáu ô ảnh của sản phẩm mới lấy từ ảnh đang chọn trong kho');
assert.match(source, /const hasAnyImage = product \? hasMedia : pickedImages\.length > 0;/,
  'Đã chọn ảnh trong kho thì mục Ảnh & tệp được tính là đã có ảnh');
assert.match(source, /\[mediaId, \.\.\.current\.filter\(\(id\) => id !== mediaId\)\]/,
  'Bấm ngôi sao đưa ảnh lên đầu danh sách chọn, tức đổi ảnh chính ngay');
assert.doesNotMatch(source, /if \(!product \|\| busy \|\| mediaId === cover\?\.id\) return;/,
  'Bấm ngôi sao không còn bị chặn khi sản phẩm chưa lưu');
assert.match(source, /function dropImage\(asset: MediaAsset\)/, 'Bỏ ảnh dùng chung cho ảnh đã lưu và ảnh đang chọn');
assert.match(source, /\{product \? "Xóa ảnh đại diện" : "Bỏ chọn ảnh đại diện"\}/,
  'Nút bỏ ảnh đại diện nói đúng việc đang làm với ảnh chưa gắn');
assert.match(source, /Đang chọn \{pickedImages\.length\} ảnh\./, 'Nói rõ số ảnh đang chọn và việc bấm Lưu để gắn');
const bankAsset = (id, path) => ({ id, owner_type: 'supplier', supplier_id: 'sup-1', created_by: 'u1',
  audience: 'internal', kind: 'image', storage_path: path, caption: id, sort_order: 0,
  created_at: '2026-10-30T00:00:00Z' });
const bankNew = render({ product: undefined, media: [],
  bankMedia: [bankAsset('b1', 'bank/a.jpg'), bankAsset('b2', 'bank/b.jpg')] });
assert.match(bankNew, /Ảnh có sẵn trong kho/, 'Ảnh chưa dùng trong kho hiện thành dải riêng dưới 6 ô');
assert.doesNotMatch(bankNew, /Kho ảnh của bạn/, 'Không lặp lại khối kho ảnh ở đầu mục');
assert.match(bankNew, /Tự lấy ảnh đầu tiên bạn chọn trong kho ảnh\./,
  'Ảnh đại diện trống hướng dẫn lấy ảnh chọn đầu tiên');

console.log('✅ Product page: một trang, mục lục neo, đủ khối, gửi duyệt và quản lý tệp.');
