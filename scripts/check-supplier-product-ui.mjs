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
const scoped = view.supplierVisibleProductMedia([
  media('p1', 'ours', 'owner', 'internal', 'products/p1/real.jpg'),
  media('p2', 'ours', 'staff', 'internal', 'products/p2/secret.jpg'),
  media('p3', 'ours', 'staff', 'buyer', 'products/p3/shared.jpg'),
  media('p1', 'other', 'owner', 'internal', 'products/p1/foreign.jpg'),
], 'ours', 'owner');
assert.equal(scoped.length, 2);
const html = renderToStaticMarkup(React.createElement(SupplierProductStorefront, { products, media: scoped, supplierPublished: false }));
for (const phrase of ['Cashew W320', 'Cashew W240', 'Cashew W180', 'Bản nháp', 'Chờ duyệt', 'Đã lên sàn', 'Trang NCC chưa được công khai', 'Tìm sản phẩm của tôi', 'Thêm sản phẩm'])
  assert.ok(html.includes(phrase), `Missing UI content: ${phrase}`);
assert.ok(html.includes('products/p1/real.jpg') && html.includes('products/p3/shared.jpg'), 'Real owner or buyer files are used for thumbnails');
assert.ok(!html.includes('secret.jpg') && !html.includes('foreign.jpg'), 'Private staff and foreign media cannot render');
assert.ok(!html.includes('Đang bán'), 'Review must not masquerade as public listing');
assert.ok(!html.includes('Hiển thị với buyer'), 'The separate buyer-visibility panel is removed');
assert.ok(html.includes('Vexim xác nhận sản phẩm là đẩy sản phẩm lên sàn'), 'The list explains the single review-to-marketplace flow');
const editor = fs.readFileSync(new URL('../app/supplier/portal/products/product-editor.tsx', import.meta.url), 'utf8');
assert.match(editor, /productCanSubmit\(product, media\) && !dirty/, 'Nút gửi vẫn phụ thuộc dữ liệu đã lưu');
assert.match(editor, /productCanSubmit\(product, media\)/);
assert.doesNotMatch(editor, /aria-label="Trạng thái công khai"/, 'The separate buyer-visibility panel is removed from the editor');
assert.match(editor, /const canUpload = !!product && !locked && !dirty && \(review !== "approved" \|\| product\.supplier_originated === true\)/, 'Approved supplier-originated products remain editable and accept media');
assert.match(editor, /const categoryLocked = review === "approved"/, 'The reviewed category remains staff-controlled');
console.log('✅ Supplier storefront: responsive product cards, real scoped thumbnails, truthful status and guarded editing.');
