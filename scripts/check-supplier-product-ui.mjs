// node scripts/check-supplier-product-ui.mjs — private storefront server render with real status/media states.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

function load(file, mocks) {
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, { module: mod, exports: mod.exports, require: (id) => {
    assert.ok(id in mocks, `${file}: unexpected ${id}`); return mocks[id];
  }, console, Date, URL, encodeURIComponent }, { filename: file });
  return mod.exports;
}
const view = load('../lib/supplier-portal/product-view.ts', {});
const icons = new Proxy({}, { get: (_target, name) => (props) => React.createElement('span', { 'aria-hidden': true, className: props.className }, String(name)) });
const Link = ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children);
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

const { SupplierProductStorefront } = load('../app/supplier/portal/products/product-storefront.tsx', {
  react: React, 'react/jsx-runtime': jsx, 'next/link': { default: Link }, 'lucide-react': icons,
  '@/lib/supplier-portal/product-view': view,
  '@/lib/products/completeness': completenessExports,
});
const product = (id, status, name) => ({ id, supplier_id: 'ours', name, description: 'True example product', spec: '25kg',
  supplier_review_status: status, ready_for_buyer: status === 'approved', ref_price: 5000, currency: 'USD', unit: 'tấn',
  moq: '1 container', category: 'Cashew', updated_at: '2026-10-17T00:00:00Z' });
const media = (product_id, supplier_id, created_by, audience, storage_path) => ({ owner_type: 'product', product_id, supplier_id,
  created_by, audience, kind: 'image', storage_path });
const products = [product('p1', 'draft', 'Cashew W320'), product('p2', 'pending', 'Cashew W240'),
  product('p3', 'approved', 'Cashew W180'), product('p4', 'paused', 'Cashew paused')];
const sixteenItems = Array.from({ length: 16 }, (_, index) => index + 1);
const firstPage = view.supplierProductPage(sixteenItems, 1);
assert.equal(view.SUPPLIER_PRODUCTS_PER_PAGE, 15);
assert.equal(firstPage.shown.length, 15);
assert.equal(firstPage.shown[0], 1);
assert.equal(firstPage.shown[14], 15);
assert.equal(firstPage.currentPage, 1);
assert.equal(firstPage.pageCount, 2);
assert.equal(firstPage.firstItem, 1);
assert.equal(firstPage.lastItem, 15);
const secondPage = view.supplierProductPage(sixteenItems, 2);
assert.equal(secondPage.shown.length, 1);
assert.equal(secondPage.shown[0], 16);
assert.equal(secondPage.currentPage, 2);
assert.equal(secondPage.firstItem, 16);
assert.equal(secondPage.lastItem, 16);
assert.equal(view.supplierProductPage(sixteenItems, 99).currentPage, 2, 'Page overflow clamps to the last page');
assert.equal(view.supplierProductPage(sixteenItems, -2).currentPage, 1, 'Invalid low pages clamp to the first page');
const emptyPage = view.supplierProductPage([], 1);
assert.equal(emptyPage.shown.length, 0);
assert.equal(emptyPage.pageCount, 1);
assert.equal(emptyPage.firstItem, 0);
assert.equal(emptyPage.lastItem, 0);
const scoped = view.supplierVisibleProductMedia([
  media('p1', 'ours', 'owner', 'internal', 'products/p1/real.jpg'),
  media('p2', 'ours', 'staff', 'internal', 'products/p2/secret.jpg'),
  media('p3', 'ours', 'staff', 'buyer', 'products/p3/shared.jpg'),
  media('p1', 'other', 'owner', 'internal', 'products/p1/foreign.jpg'),
], 'ours', 'owner');
assert.equal(scoped.length, 2);
const html = renderToStaticMarkup(React.createElement(SupplierProductStorefront, { products, media: scoped, supplierPublished: false }));
for (const phrase of ['Cashew W320', 'Cashew W240', 'Cashew W180', 'Cashew paused', 'Bản nháp', 'Chờ duyệt', 'Đã đăng', 'Đã tạm ẩn', 'Trang nhà cung cấp chưa được công khai', 'Tìm sản phẩm của tôi', 'Thêm sản phẩm'])
  assert.ok(html.includes(phrase), `Missing UI content: ${phrase}`);
assert.match(html, /left-3 top-1\/2 size-4 -translate-y-1\/2 text-ink-400/, 'The search icon is vertically centered in the input');
// Độ hoàn thiện: thẻ sản phẩm nhắc ngắn gọn, tính từ bản đã lưu + tệp chia sẻ cho người mua.
assert.match(html, /Hồ sơ \d+% · còn thiếu/, 'Thẻ sản phẩm trong cổng nhắc mục còn thiếu');
const completeProduct = { ...product('p9', 'approved', 'Cashew đủ hồ sơ'), display_name: 'Cashew W320', packaging: 'Túi 22,68 kg',
  lead_time_days: 21, payment_terms: '30% đặt cọc', monthly_capacity: '300 tấn', export_port: 'Cát Lái',
  keywords: ['cashew', 'w320'], sample_price_usd: 5, package_type: 'bao', package_weight_kg: 22.68 };
const completeHtml = renderToStaticMarkup(React.createElement(SupplierProductStorefront, {
  products: [completeProduct], supplierPublished: true,
  media: [media('p9', 'ours', 'staff', 'buyer', 'products/p9/a.jpg')],
}));
assert.doesNotMatch(completeHtml, /Hồ sơ \d+%/, 'Hồ sơ đã đủ thì không nhắc thêm');
assert.doesNotMatch(html, /-tranink-y-1\/2/, 'The misspelled vertical-centering utility does not return');
assert.match(html, /<label class="ml-auto flex [^"]*items-center[^"]*"><span[^>]*>Sắp xếp<\/span>/,
  'The sort/filter control is pushed to the right of search');
assert.ok(html.includes('products/p1/real.jpg') && html.includes('products/p3/shared.jpg'), 'Real owner or buyer files are used for thumbnails');
assert.ok(!html.includes('secret.jpg') && !html.includes('foreign.jpg'), 'Private staff and foreign media cannot render');
assert.ok(!html.includes('Đang bán'), 'Review must not masquerade as public listing');
assert.ok(!html.includes('Hiển thị với buyer'), 'The separate buyer-visibility panel is removed');
assert.ok(html.includes('Sau khi duyệt, sản phẩm được đăng'), 'The list explains the single review-to-marketplace flow');
assert.ok(!html.includes('aria-label="Phân trang danh sách sản phẩm"'), 'Small product lists do not show an unnecessary pager');
const pagedProducts = Array.from({ length: 16 }, (_, index) =>
  product(`p${index + 1}`, 'draft', `Cashew lot ${String(index + 1).padStart(2, '0')}`));
const pagedHtml = renderToStaticMarkup(React.createElement(SupplierProductStorefront, { products: pagedProducts, media: [], supplierPublished: true }));
assert.match(pagedHtml, /sm:grid-cols-2 sm:p-6 lg:hidden lg:grid-cols-3 xl:grid-cols-5/,
  'Màn hình nhỏ dùng thẻ gọn; từ lg trở lên danh sách chuyển sang bảng dày');
assert.match(pagedHtml, /<table class="hidden w-full border-collapse text-left lg:table">/,
  'Bảng sản phẩm dày hiện từ lg trở lên');
assert.match(pagedHtml, /aria-label="Hồ sơ"|>Hồ sơ<\/th>/, 'Bảng có cột độ hoàn thiện');
assert.equal((pagedHtml.match(/aria-label="Xem và quản lý /g) ?? []).length, 15, 'Only 15 product cards render on page one');
assert.ok(pagedHtml.includes('Cashew lot 01') && pagedHtml.includes('Cashew lot 15'), 'Page one includes products 1 through 15');
assert.ok(!pagedHtml.includes('Cashew lot 16'), 'Product 16 moves to page two');
assert.ok(pagedHtml.includes('Hiển thị 1-15 trong 16 sản phẩm'), 'The pager explains the visible range');
assert.ok(pagedHtml.includes('Mỗi trang tối đa 15 sản phẩm'), 'The page size is clear to suppliers');
assert.ok(pagedHtml.includes('Trang 1 / 2'), 'The pager shows current and total pages');
for (const label of ['Phân trang danh sách sản phẩm', 'Trang trước', 'Trang sau'])
  assert.ok(pagedHtml.includes(`aria-label="${label}"`), `Pager has accessible label: ${label}`);
const editor = fs.readFileSync(new URL('../app/supplier/portal/products/product-editor.tsx', import.meta.url), 'utf8');
assert.match(editor, /productCanSubmit\(product, media\) && !dirty/, 'Nút gửi vẫn phụ thuộc dữ liệu đã lưu');
assert.match(editor, /productCanSubmit\(product, media\)/);
assert.doesNotMatch(editor, /aria-label="Trạng thái công khai"/, 'The separate buyer-visibility panel is removed from the editor');
assert.ok(editor.includes('!["approved", "paused"].includes(review) || product.supplier_originated === true'),
  'Approved or paused supplier-originated products can manage their own media');
assert.match(editor, /const categoryLocked = review === "approved"/, 'The reviewed category remains staff-controlled');
assert.ok(editor.includes('<ProductDescriptionEditor') && editor.includes('onChange={onDescriptionDetailChange}'),
  'Supplier detail edits use the shared editor and its existing dirty/snapshot update path');
assert.ok(editor.includes('name="description_detail"') && editor.includes('value={snapshot.description_detail}'),
  'The existing FormData save contract receives the canonical rich HTML');
assert.match(editor, /<ProductDescriptionPreview value=\{snapshot\.description_detail\}/, 'Supplier review renders the same safe detail format');
let editorDirty = false;
const { SupplierProductReviewControls } = load('../app/crm/products/[slug]/edit/review-controls.tsx', {
  react: React, 'react/jsx-runtime': jsx,
  'next/navigation': { useRouter: () => ({ refresh() {} }) },
  './review-actions': { decideSupplierProductAction: async () => ({ ok: true, message: 'saved' }) },
  './edit-workspace': { useProductEditWorkspace: () => ({ dirty: editorDirty }) },
});
const reviewProps = { id: 'p3', proposal: 'cashew', reviewed: 'cashew',
  categories: [{ slug: 'cashew', label: 'Hạt điều' }],
  mediaReview: { verifiedBuyerImages: 1, uncheckedBuyerFiles: 0, ready: true } };
const retryHtml = renderToStaticMarkup(React.createElement(SupplierProductReviewControls, reviewProps));
assert.ok(retryHtml.includes('Duyệt và đăng'), 'One staff action publishes pending and legacy products');
assert.ok(retryHtml.includes('Danh mục đăng'), 'Staff can choose the final published category');
assert.ok(!retryHtml.includes('Yêu cầu chỉnh sửa'), 'Legacy completion does not reopen the review');
const pendingReviewHtml = renderToStaticMarkup(React.createElement(SupplierProductReviewControls, { ...reviewProps, allowChanges: true }));
assert.ok(pendingReviewHtml.includes('Duyệt và đăng') && pendingReviewHtml.includes('Yêu cầu chỉnh sửa'),
  'Pending review keeps both staff decisions');
const blockedMediaHtml = renderToStaticMarkup(React.createElement(SupplierProductReviewControls, {
  ...reviewProps, mediaReview: { verifiedBuyerImages: 0, uncheckedBuyerFiles: 1, ready: false },
}));
assert.ok(blockedMediaHtml.includes('Cần ít nhất một ảnh đã kiểm tra và được chia sẻ cho người mua'),
  'The button explains the exact media settings required');
assert.ok(blockedMediaHtml.includes('href="#product-media"'), 'The blocker opens the existing media workspace');
assert.match(blockedMediaHtml, /<button disabled="" class="btn btn-primary">Duyệt và đăng<\/button>/,
  'Publication stays disabled until media review is complete');
editorDirty = true;
const dirtyReviewHtml = renderToStaticMarkup(React.createElement(SupplierProductReviewControls, reviewProps));
assert.ok(dirtyReviewHtml.includes('Lưu thay đổi trong hồ sơ và bản dịch trước khi duyệt và đăng'),
  'Review explains why publication is waiting for saved edits');
assert.match(dirtyReviewHtml, /<button disabled="" class="btn btn-primary">Duyệt và đăng<\/button>/,
  'Publication is disabled while product or translation edits are unsaved');
editorDirty = false;
const crmList = fs.readFileSync(new URL('../app/crm/products/page.tsx', import.meta.url), 'utf8');
const crmSupplier = fs.readFileSync(new URL('../app/crm/suppliers/[slug]/page.tsx', import.meta.url), 'utf8');
assert.match(crmList, /supplier_review_status === "paused"[\s\S]*?Nhà cung cấp đã tạm ẩn/, 'CRM list labels paused products');
assert.match(crmSupplier, /supplier_review_status === "paused"[\s\S]*?Nhà cung cấp đã tạm ẩn/, 'Supplier CRM page labels paused products');
const crmEditPage = fs.readFileSync(new URL('../app/crm/products/[slug]/edit/page.tsx', import.meta.url), 'utf8');
assert.match(crmEditPage, /needsPublicationAction = supplierReviewedListing && \(product\.supplier_review_status === "pending" \|\| needsPublicationRetry\)/);
assert.match(crmEditPage, /missingWebsiteChecks/);
assert.match(crmEditPage, /CRM-created products keep their existing checklist/, 'CRM-created product posting stays outside the simplification');
assert.match(crmEditPage, /supplierReviewedListing \? \[/, 'Only supplier products use the simplified checklist');
assert.ok(crmEditPage.includes('const missingWebsiteChecks = websiteChecks.filter((item) => !item.done'),
  'The status card only lists outstanding readiness work');
assert.ok(crmEditPage.includes('order-2 min-w-0 space-y-5 xl:order-1') && crmEditPage.includes('contents xl:order-2 xl:block') && crmEditPage.includes('card order-3 p-4'),
  'Only publication status precedes the mobile form; desktop keeps the right column');
assert.ok(crmEditPage.indexOf('<MediaManager') < crmEditPage.indexOf('<ProductTranslationPanel'),
  'Media comes before translation in the editor workflow');
assert.ok(crmEditPage.indexOf('<ProductTranslationPanel') < crmEditPage.indexOf('<section id="product-review"'),
  'Review and category selection follow content, media and translation instead of sitting on top');
assert.ok(!crmEditPage.includes('key={product.id}'),
  'Server refreshes do not remount and erase the active product form');
assert.ok(crmEditPage.includes('previewImage={previewImage}'),
  'The editor has an in-form preview backed by the saved cover image');
const editWorkspace = fs.readFileSync(new URL('../app/crm/products/[slug]/edit/edit-workspace.tsx', import.meta.url), 'utf8');
assert.ok(editWorkspace.includes('beforeunload') && editWorkspace.includes('event.preventDefault()'),
  'Shared dirty state protects browser close and reload');
assert.ok(editWorkspace.includes('window.confirm("Bạn có thay đổi chưa lưu.'),
  'Internal navigation warns before losing unsaved edits');
const translationPanel = fs.readFileSync(new URL('../app/crm/products/[slug]/edit/translation-panel.tsx', import.meta.url), 'utf8');
assert.match(translationPanel, /supplierProduct = false/);
assert.match(translationPanel, /bản dịch không chặn việc duyệt và đăng/i);
const productForm = fs.readFileSync(new URL('../components/product-form.tsx', import.meta.url), 'utf8');
assert.match(productForm, /mediaState && !supplierReviewedListing/);
assert.ok(productForm.includes('handleTabKeyDown') && productForm.includes('aria-controls={`product-panel-${t.key}`}'),
  'Product tabs expose relationships and keyboard navigation');
assert.ok(productForm.includes('<fieldset disabled={busy}') && productForm.includes('disabled={busy || (!!product && !dirty)}'),
  'Inputs lock during save and clean existing forms disable saving');
assert.ok(productForm.includes('const priceRangeError =') && productForm.includes('if (priceRangeError) {'),
  'Invalid price ranges are caught inline and before submission');
assert.ok(productForm.includes('Xem trước thẻ sản phẩm') && productForm.includes('previewPrice'),
  'The preview reflects current form values without adding a separate detail page');
assert.ok(productForm.includes('mayAutoTranslate') && productForm.includes('có thể kích hoạt AI dịch lại'),
  'Automatic AI translation during product save also requires overwrite confirmation');
assert.ok(productForm.includes('useRegisterProductEditDirty("source", sourceDirty)'),
  'Translation waits only for unsaved original text, not unrelated price or category edits');
assert.ok(translationPanel.includes('sourceDirty') && translationPanel.includes('Lưu nội dung gốc trước khi dịch'),
  'Translation cannot silently use an older original version');
assert.ok(translationPanel.includes('response.english') && translationPanel.includes('setSavedValues(response.english)'),
  'AI responses synchronize displayed and saved English values');
assert.ok(translationPanel.includes('previousEnglishSnapshot') && translationPanel.includes('setSavedValues(english)'),
  'Server-side translations also synchronize without erasing unsaved staff edits');
assert.ok(translationPanel.includes('hasDisplayedEnglish') && translationPanel.includes('window.confirm("Dịch lại bằng AI'),
  'AI overwrite requires confirmation');
const productActions = fs.readFileSync(new URL('../app/actions.ts', import.meta.url), 'utf8');
assert.match(productActions, /input\.ready_for_buyer = existing\.ready_for_buyer/);
assert.match(productActions, /if \(input\.ready_for_buyer && !supplierProduct\)/, 'CRM-created products retain the old readiness gate; supplier saves do not change it');
console.log('✅ Supplier/CRM product UI: one publish action, clear copy and only missing blockers.');
