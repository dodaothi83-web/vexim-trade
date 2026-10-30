// node --experimental-strip-types --no-warnings scripts/check-crm-product-edit-preview.mjs
// CRM sửa sản phẩm: thẻ "Người mua sẽ thấy" nằm ở cột phải (sidebar), có ảnh đại diện,
// và trang không còn nút "Đối chiếu form mới" trỏ tới route đã xoá.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as pricing from '../lib/products/quantity-pricing.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

function compile(path, mocks) {
  const exports = {};
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, console, Intl, Number, Math, JSON, Set, String, Array, Object,
    require: (key) => {
      if (!(key in mocks)) throw Error(`${path}: unexpected import ${key}`);
      return mocks[key];
    } });
  return exports;
}

const lucide = new Proxy({}, { get: (_target, name) => (props) => React.createElement('svg', { 'data-icon': String(name), ...props }) });
const link = { default: ({ children, ...props }) => React.createElement('a', props, children) };
const store = compile('../components/products/quantity-preview-store.ts', { react: React });
const editor = compile('../components/products/quantity-pricing-editor.tsx',
  { 'react/jsx-runtime': jsx, 'next/link': link, 'lucide-react': lucide, '@/lib/products/quantity-pricing': pricing });
const card = compile('../components/products/quantity-preview-card.tsx',
  { 'react/jsx-runtime': jsx, '@/components/products/quantity-pricing-editor': editor, '@/components/products/quantity-preview-store': store });

const initial = {
  value: { grade: 'W320', incoterm: 'FOB', currency: 'USD', nameVi: 'Nhân điều', nameEn: '', tiers: [
    { minKg: '1000', priceUsdPerKg: '6.40', incoterm: 'FOB' },
    { minKg: '5000', priceUsdPerKg: '6.00', incoterm: 'FOB' },
  ] },
  standardGrades: ['W320'],
  policy: pricing.DEFAULT_QUANTITY_PRICING_POLICY,
  buyerPriceUnit: 'kg',
  pricePubliclyVisible: true,
};

// 1. Ảnh đại diện đã lưu hiện ngay trong thẻ xem trước.
const withImage = renderToStaticMarkup(React.createElement(card.QuantityPreviewCard,
  { initial, imageUrl: '/api/media/file/products/p1/cover.jpg' }));
assert.match(withImage, /<img[^>]+src="\/api\/media\/file\/products\/p1\/cover\.jpg"/, 'Thẻ xem trước có ảnh đại diện');
assert.match(withImage, /alt="Ảnh đại diện sản phẩm"/, 'Ảnh đại diện có alt đọc được');
assert.match(withImage, /Người mua sẽ thấy/, 'Thẻ giữ tiêu đề Người mua sẽ thấy');
assert.match(withImage, /USD 6\.00–6\.40\/kg/, 'Thẻ hiện khoảng giá người mua');
assert.match(withImage, /Bản xem trước theo nội dung đang nhập/, 'Nói rõ đây là bản xem trước');

// 2. Chưa có ảnh thì có ô giữ chỗ, không phải thẻ trống.
const noImage = renderToStaticMarkup(React.createElement(card.QuantityPreviewCard, { initial, imageUrl: null }));
assert.doesNotMatch(noImage, /<img/, 'Không có ảnh thì không render ảnh hỏng');
assert.match(noImage, /Chưa có ảnh/, 'Có ô giữ chỗ ghi Chưa có ảnh');

// 3. Nơi gọi không truyền ảnh (sidebar nhà cung cấp đã có ảnh lớn) thì không thêm ô ảnh thứ hai.
const legacy = renderToStaticMarkup(React.createElement(editor.QuantityBuyerPreview,
  { value: initial.value, standardGrades: initial.standardGrades, policy: initial.policy,
    buyerPriceUnit: 'kg', pricePubliclyVisible: true }));
assert.doesNotMatch(legacy, /Chưa có ảnh/, 'Không tự thêm ô ảnh rỗng khi nơi gọi không truyền ảnh');
assert.match(legacy, /USD 6\.00–6\.40\/kg/, 'Vẫn hiện giá khi không có ảnh');

// 4. Chưa có bảng giá thì thẻ nói rõ, không hiện bảng rỗng.
const empty = renderToStaticMarkup(React.createElement(card.QuantityPreviewCard, { initial: null, imageUrl: null }));
assert.match(empty, /chưa có bảng giá theo số lượng/, 'Thẻ trống giải thích vì sao chưa có bảng giá');

// 5. Thẻ nằm ở sidebar của trang sửa, không nằm trong form; form đẩy giá đang nhập sang.
const page = read('../app/crm/products/[slug]/edit/page.tsx');
const aside = page.slice(page.indexOf('<aside'), page.indexOf('</aside>'));
assert.ok(aside.includes('<QuantityPreviewCard'), 'Thẻ xem trước nằm trong cột phải');
assert.ok(page.indexOf('<QuantityPreviewCard') > page.indexOf('<aside'), 'Không lặp thẻ xem trước trong form');
assert.match(page, /imageUrl=\{previewImage\}/, 'Truyền ảnh đại diện đã lưu vào thẻ');
const form = read('../components/product-form.tsx');
assert.match(form, /publishPreview/, 'Form đẩy bảng giá đang nhập sang thẻ ở cột phải');

// 6. Nút "Đối chiếu form mới" đã bỏ vì route mapping-preview không còn.
assert.doesNotMatch(page, /Đối chiếu form mới|mapping-preview/, 'Không còn liên kết tới route đã xoá');
assert.match(page, /DeleteProductButton/, 'Vẫn còn nút xoá sản phẩm cho người có quyền');

console.log('CRM product edit preview: sidebar card with cover image passed');
