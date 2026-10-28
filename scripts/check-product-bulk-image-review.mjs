// Run with node --experimental-strip-types --no-warnings scripts/check-product-bulk-image-review.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isExpired } from '../lib/media/readiness.ts';
import { checkSelectedImages } from '../lib/media/bulk-review.ts';

const require = createRequire(import.meta.url);
function load(file, mocks) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
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
const rows = new Map([picture(10), picture(11, { audience: 'buyer' }), picture(12, { status: 'checked' }),
  picture(13, { product_id: id(3) }), picture(14, { status: 'expired' }), picture(15, { kind: 'document' }), picture(16)].map((r) => [r.id, r]));
let denied = true, updates = [];
const store = { getProduct: async (pid) => pid === productId ? { id: pid, supplier_id: supplierId } : null, getMedia: async (mid) => rows.get(mid) ?? null };
const { checkProductImagesAction } = load('../app/crm/products/[slug]/edit/bulk-media-review-action.ts', {
  '@/app/actions': { updateMediaAction: async (mid, patch) => {
    updates.push({ mid, patch });
    if (mid === id(16)) return { ok: false, message: 'Lỗi lưu' };
    Object.assign(rows.get(mid), patch); return { ok: true, message: 'ok' };
  } },
  '@/lib/auth/session': { guard: async () => denied ? { message: 'Không có quyền' } : null },
  '@/lib/db': { getStore: () => store }, '@/lib/media/readiness': { isExpired },
});
let result = await checkProductImagesAction(productId, [id(10)]);
assert.equal(result.failed.length, 1); assert.equal(updates.length, 0);
denied = false;
result = await checkProductImagesAction(productId, [id(10), id(11), id(12), id(13), id(14), id(15), id(16)]);
assert.equal(result.checked.length, 3); assert.equal(result.failed.length, 4);
assert.deepEqual(updates.map((x) => x.mid), [id(10), id(11), id(16)]);
for (const update of updates) assert.deepEqual(Object.keys(update.patch), ['status']);
assert.equal(rows.get(id(10)).audience, 'internal', 'Checking does not expose a private photo');
assert.equal(rows.get(id(11)).audience, 'buyer');
assert.equal(rows.get(id(13)).status, 'unverified');
assert.equal(rows.get(id(14)).status, 'expired');
assert.equal(rows.get(id(16)).status, 'unverified');
result = await checkProductImagesAction(productId, [id(10), id(10)]);
assert.equal(result.checked.length, 0, 'Duplicates are rejected');
assert.equal((await checkProductImagesAction(productId, Array.from({ length: 101 }, (_, n) => id(200+n)))).checked.length, 0);

let batchSizes = [];
const many = Array.from({ length: 205 }, (_, n) => id(300+n));
const batchResult = await checkSelectedImages(productId, many, async (_pid, ids) => {
  batchSizes.push(ids.length);
  if (batchSizes.length === 2) throw new Error('network');
  return { checked: ids, failed: [] };
});
assert.deepEqual(batchSizes, [100, 100, 5]);
assert.equal(batchResult.checked.length, 105); assert.equal(batchResult.failed.length, 100);
assert.match(batchResult.failed[0].message, /tải lại/);

const ui = load('../components/media-manager.tsx', {
  react: require('react'), 'react-dom': require('react-dom'), 'react/jsx-runtime': require('react/jsx-runtime'),
  'next/navigation': { useRouter: () => ({ refresh() {} }) },
  'lucide-react': new Proxy({}, { get: () => () => null }),
  '@/app/actions': { addMediaLinkAction() {}, updateMediaAction() {}, deleteMediaAction() {} },
  '@/app/crm/products/[slug]/edit/bulk-media-review-action': { checkProductImagesAction() {} },
  '@/app/crm/products/[slug]/edit/featured-image-action': { setFeaturedProductImageAction() {} },
  '@/lib/media/bulk-review': { checkSelectedImages },
  '@/lib/media/client-image': { MEDIA_ACCEPT: 'image/jpeg,image/png,image/webp', prepareImage() {} },
  '@/lib/media/upload-response': { readUploadResponse() {} },
  '@/lib/media/limits': { formatBytes: String, MEDIA_KINDS: [{ value: 'image', label: 'Ảnh' }, { value: 'document', label: 'Giấy tờ' }] },
  '@/lib/media/readiness': { isExpired },
  '@/components/ui': { Badge: ({ children }) => React.createElement('span', null, children),
    Button: ({ children, ...props }) => React.createElement('button', props, children), cx: (...parts) => parts.filter(Boolean).join(' '), formatDate: String },
  '@/components/toast': { useToast: () => ({ push() {} }) },
});
const samples = [picture(20), picture(21, { status: 'checked' }), picture(22, { status: 'expired' }), picture(23, { kind: 'document' })];
const render = (props) => renderToStaticMarkup(React.createElement(ui.MediaManager, { ownerType: 'product', ownerId: productId, supplierId, items: samples, ...props }));
const html = render({});
assert.match(html, /Chọn tất cả ảnh/); assert.match(html, /Đánh dấu đã kiểm tra/);
assert.equal((html.match(/aria-label="Chọn Ảnh \d+ để kiểm tra"/g) ?? []).length, 2, 'Only nonexpired photos can be selected');
assert.match(html, /Chia sẻ buyer/); assert.match(html, /Nội bộ/);
assert.doesNotMatch(render({ readOnly: true }), /Chọn tất cả ảnh|để kiểm tra/);
assert.doesNotMatch(render({ ownerType: 'supplier' }), /Chọn tất cả ảnh|để kiểm tra/);
console.log('✅ Bulk photo review: scoped permissions, partial failures, bounded batches, selection UI and unchanged audience.');
