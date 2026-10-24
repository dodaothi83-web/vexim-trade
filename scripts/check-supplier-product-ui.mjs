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
const { SupplierProductStorefront } = load('../app/supplier/portal/products/product-storefront.tsx', {
  react: React, 'react/jsx-runtime': jsx, 'next/link': { default: Link }, 'lucide-react': icons,
  '@/lib/supplier-portal/product-view': view,
});
const product = (id, status, name) => ({ id, supplier_id: 'ours', name, description: 'True example product', spec: '25kg',
  supplier_review_status: status, ready_for_buyer: status === 'approved', ref_price: 5000, currency: 'USD', unit: 'tấn',
  moq: '1 container', category: 'Cashew', updated_at: '2026-10-17T00:00:00Z' });
const media = (product_id, supplier_id, created_by, audience, storage_path) => ({ owner_type: 'product', product_id, supplier_id,
  created_by, audience, kind: 'image', storage_path });
const products = [product('p1', 'draft', 'Cashew W320'), product('p2', 'pending', 'Cashew W240'), product('p3', 'approved', 'Cashew W180')];
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
for (const phrase of ['Cashew W320', 'Cashew W240', 'Cashew W180', 'Bản nháp', 'Chờ duyệt', 'Đã đăng', 'Trang NCC chưa được công khai', 'Tìm sản phẩm của tôi', 'Thêm sản phẩm'])
  assert.ok(html.includes(phrase), `Missing UI content: ${phrase}`);
assert.match(html, /left-3 top-1\/2 size-4 -translate-y-1\/2 text-ink-400/, 'The search icon is vertically centered in the input');
assert.doesNotMatch(html, /-tranink-y-1\/2/, 'The misspelled vertical-centering utility does not return');
assert.match(html, /<label class="ml-auto flex items-center gap-2 text-xs font-semibold text-ink-600"><span>Sắp xếp<\/span>/,
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
assert.match(pagedHtml, /sm:grid-cols-2 sm:p-6 lg:grid-cols-3 xl:grid-cols-4/, 'The desktop grid uses four cards per row');
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
assert.match(editor, /const canUpload = !!product && !locked && !dirty && \(review !== "approved" \|\| product\.supplier_originated === true\)/, 'Approved supplier-originated products remain editable and accept media');
assert.match(editor, /const categoryLocked = review === "approved"/, 'The reviewed category remains staff-controlled');
const { SupplierProductReviewControls } = load('../app/crm/products/[slug]/edit/review-controls.tsx', {
  react: React, 'react/jsx-runtime': jsx,
  'next/navigation': { useRouter: () => ({ refresh() {} }) },
  './review-actions': { decideSupplierProductAction: async () => ({ ok: true, message: 'saved' }) },
});
const reviewProps = { id: 'p3', proposal: 'cashew', reviewed: 'cashew',
  categories: [{ slug: 'cashew', label: 'Hạt điều' }] };
const retryHtml = renderToStaticMarkup(React.createElement(SupplierProductReviewControls, reviewProps));
assert.ok(retryHtml.includes('Duyệt và đăng'), 'One staff action publishes pending and legacy products');
assert.ok(retryHtml.includes('Danh mục đăng'), 'Staff can choose the final published category');
assert.ok(!retryHtml.includes('Yêu cầu chỉnh sửa'), 'Legacy completion does not reopen the review');
const pendingReviewHtml = renderToStaticMarkup(React.createElement(SupplierProductReviewControls, { ...reviewProps, allowChanges: true }));
assert.ok(pendingReviewHtml.includes('Duyệt và đăng') && pendingReviewHtml.includes('Yêu cầu chỉnh sửa'),
  'Pending review keeps both staff decisions');
const crmEditPage = fs.readFileSync(new URL('../app/crm/products/[slug]/edit/page.tsx', import.meta.url), 'utf8');
assert.match(crmEditPage, /needsPublicationAction = supplierReviewedListing && \(product\.supplier_review_status === "pending" \|\| needsPublicationRetry\)/);
assert.match(crmEditPage, /missingWebsiteChecks/);
assert.match(crmEditPage, /CRM-created products keep their existing checklist/, 'CRM-created product posting stays outside the simplification');
assert.match(crmEditPage, /supplierReviewedListing \? \[/, 'Only supplier products use the simplified checklist');
const translationPanel = fs.readFileSync(new URL('../app/crm/products/[slug]/edit/translation-panel.tsx', import.meta.url), 'utf8');
assert.match(translationPanel, /supplierProduct = false/);
assert.match(translationPanel, /bản dịch không chặn việc duyệt và đăng/i);
const productForm = fs.readFileSync(new URL('../components/product-form.tsx', import.meta.url), 'utf8');
assert.match(productForm, /mediaState && !supplierReviewedListing/);
const productActions = fs.readFileSync(new URL('../app/actions.ts', import.meta.url), 'utf8');
assert.match(productActions, /input\.ready_for_buyer = existing\.ready_for_buyer/);
assert.match(productActions, /if \(input\.ready_for_buyer && !supplierProduct\)/, 'CRM-created products retain the old readiness gate; supplier saves do not change it');
console.log('✅ Supplier/CRM product UI: one publish action, clear copy and only missing blockers.');
