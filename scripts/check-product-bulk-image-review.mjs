// node --experimental-strip-types --no-warnings scripts/check-product-bulk-image-review.mjs
// Chốt 31/10/2026: bỏ bước duyệt ảnh. CRM chỉ còn một công tắc Hiện / Ẩn với người mua;
// ảnh nhà cung cấp tải lên là chia sẻ cho người mua ngay, không có hàng loạt "đã kiểm tra".
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isExpired, productPublicationMediaState } from '../lib/media/readiness.ts';

const require = createRequire(import.meta.url);
const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');

function load(file, mocks) {
  const code = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, console, Date, URL, process,
    require: (key) => { assert.ok(key in mocks, `${file}: unexpected ${key}`); return mocks[key]; },
  }, { filename: file });
  return mod.exports;
}

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const productId = id(1), supplierId = id(2);
const picture = (n, patch = {}) => ({ id: id(n), owner_type: 'product', product_id: productId, supplier_id: supplierId,
  kind: 'image', status: 'unverified', audience: 'internal', expires_on: null, storage_path: `products/${n}.jpg`, caption: `Ảnh ${n}`, ...patch });

// 1. Cổng đăng chỉ cần ảnh chia sẻ cho người mua; trạng thái "đã kiểm tra" không còn ý nghĩa.
const internalOnly = productPublicationMediaState([picture(10), picture(11)], productId, supplierId);
assert.equal(internalOnly.ready, false, 'Ảnh nội bộ không đủ để đăng');
assert.match(JSON.stringify(internalOnly), /"buyerImages":0/);
const sharedUnverified = productPublicationMediaState([picture(12, { audience: 'buyer', status: 'unverified' })], productId, supplierId);
assert.equal(sharedUnverified.ready, true, 'Ảnh chia sẻ cho người mua là đủ, không cần đánh dấu đã kiểm tra');
assert.equal(sharedUnverified.buyerImages, 1);
const expiredShared = productPublicationMediaState([picture(13, { audience: 'buyer', status: 'checked', expires_on: '2020-01-01' })], productId, supplierId);
assert.equal(expiredShared.ready, false, 'Ảnh hết hạn vẫn bị loại');
const catalogueOnly = productPublicationMediaState([picture(14, { audience: 'buyer', kind: 'catalogue' })], productId, supplierId);
assert.equal(catalogueOnly.ready, false, 'Catalogue không thay cho ảnh');

// 2. Không còn mô-đun duyệt ảnh hàng loạt.
assert.equal(existsSync(new URL('../app/crm/products/[slug]/edit/bulk-media-review-action.ts', import.meta.url)), false,
  'Đã xoá action đánh dấu đã kiểm tra');
assert.equal(existsSync(new URL('../lib/media/bulk-review.ts', import.meta.url)), false, 'Đã xoá tiện ích duyệt hàng loạt');

// 3. Trang duyệt và cổng đăng không còn nhắc "Đã kiểm tra".
for (const file of ['../app/crm/products/[slug]/edit/review-actions.ts', '../app/crm/products/[slug]/edit/review-controls.tsx',
  '../app/crm/products/[slug]/edit/page.tsx', '../components/media-manager.tsx']) {
  const source = read(file);
  assert.doesNotMatch(source, /Đã kiểm tra|Chưa xác minh|xác minh/, `${file} còn nhắc bước xác minh ảnh`);
}
assert.match(read('../app/crm/products/[slug]/edit/review-actions.ts'), /ít nhất một ảnh chia sẻ cho người mua/,
  'Cổng đăng chỉ đòi một ảnh chia sẻ cho người mua');

// 4. CRM chỉ còn một công tắc hiển thị.
const ui = load('../components/media-manager.tsx', {
  react: require('react'), 'react-dom': require('react-dom'), 'react/jsx-runtime': require('react/jsx-runtime'),
  'next/navigation': { useRouter: () => ({ refresh() {} }) },
  'lucide-react': new Proxy({}, { get: () => () => null }),
  '@/app/actions': { addMediaLinkAction() {}, updateMediaAction() {}, deleteMediaAction() {} },
  '@/app/crm/products/[slug]/edit/featured-image-action': { setFeaturedProductImageAction() {} },
  '@/lib/media/client-image': { MEDIA_ACCEPT: 'image/jpeg,image/png,image/webp', prepareImage() {} },
  '@/lib/media/upload-response': { readUploadResponse() {} },
  '@/lib/media/limits': { formatBytes: String, MEDIA_KINDS: [{ value: 'image', label: 'Ảnh' }, { value: 'document', label: 'Giấy tờ' }] },
  '@/lib/media/readiness': { isExpired },
  '@/components/ui': { Badge: ({ children }) => React.createElement('span', null, children),
    Button: ({ children, ...props }) => React.createElement('button', props, children), cx: (...parts) => parts.filter(Boolean).join(' '), formatDate: String },
  '@/components/toast': { useToast: () => ({ push() {} }) },
});
const samples = [picture(20), picture(21, { audience: 'buyer', status: 'checked' }), picture(22, { status: 'expired' }), picture(23, { kind: 'document' })];
const render = (props) => renderToStaticMarkup(React.createElement(ui.MediaManager, { ownerType: 'product', ownerId: productId, supplierId, items: samples, ...props }));
const html = render({});
assert.doesNotMatch(html, /Đánh dấu đã kiểm tra|Chọn tất cả ảnh|Chưa xác minh/, 'Không còn thanh duyệt ảnh hàng loạt');
assert.match(html, /Hiện với người mua/, 'Có nhãn hiện với người mua');
assert.match(html, /Ẩn \(nội bộ\)/, 'Có lựa chọn ẩn khỏi người mua');
assert.equal((html.match(/<select/g) ?? []).length, 3, 'Mỗi ảnh chỉ còn đúng một select hiển thị (ảnh + 2 tệp khác)');
assert.match(render({ readOnly: true }), /Hiện với người mua/);
console.log('✅ Ảnh: một cổng duyệt duy nhất, không còn đánh dấu đã kiểm tra.');
