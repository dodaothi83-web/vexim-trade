// node scripts/check-supplier-storefront.mjs — “Trang của tôi” là đúng giao diện buyer thấy:
// dựng từ component dùng chung, không SEO, không đếm lượt xem, và không trắng trang khi
// thiếu dữ liệu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function load(path, mocks, { quiet = false } = {}) {
  const exports = {};
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, module: { exports }, process,
  console: quiet ? { error() {}, log() {}, warn() {} } : console, require: (key) => {
    if (!(key in mocks)) throw new Error(`Unexpected import ${key} in ${path}`);
    return mocks[key];
  } });
  return exports;
}

const supplier = {
  id: 'sup-1', slug: 'dong-nai-cashew', name: 'Dong Nai Cashew Co., Ltd', display_name: 'Dong Nai Cashew',
  status: 'draft', cover_image: null, profile_image: null,
};
const card = { ...supplier, approved_verification_steps: [1], main_products: [], summary_i18n: { en: 'Cashew kernels.' } };

function pageMocks({ status = 'draft', steps = [1], fail = false, store } = {}) {
  const calls = { storefront: [], photos: [] };
  const base = {
    react: React,
    'react/jsx-runtime': jsxRuntime,
    'next/link': { default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children) },
    'next/navigation': { redirect: (to) => { throw new Error(`unexpected redirect ${to}`); } },
    '@/lib/supplier-portal/access': { supplierPortalAccess: async () => ({
      supplier: { ...supplier, status }, user: { id: 'usr-1' }, review: null, reviews: [],
      store: store ?? {
        listCategories: async () => [],
        listCertificates: async () => [],
        listMedia: async () => [],
        listSubmissions: async () => [],
        listSupplierVerificationRequests: async () => [],
        listSubmissionItems: async () => [],
      },
    }) },
    '@/lib/supplier-portal/verification-progress': { buildVerificationProgress: () => ({
      steps: [], approvedCount: 1, currentLevel: 2, percent: 33, headline: 'Bước tiếp theo: Thăm nhà máy.',
    }) },
    '../verification-progress': { StorefrontVerificationActions: () => React.createElement('div', { 'data-stub': 'verification-actions' }) },
    '@/lib/supplier-portal/onboarding': { portalApproved: () => true },
    '@/lib/db/migration-hints': { migrationHint: () => null },
    '@/lib/public/supplier-seo': { isSyntheticSupplier: () => false },
    '@/lib/public/certificates': { publicSupplierCertificates: () => [] },
    '@/lib/public/catalog': { getSupplierStorefront: async (s) => {
      if (fail) throw new Error("Could not find the table 'public.supplier_products' in the schema cache");
      return { ...card, status: s.status, approved_verification_steps: steps };
    } },
    '@/components/page-header': { PageHeader: ({ title, sub }) => React.createElement('header', null,
      React.createElement('h1', null, title), sub ? React.createElement('p', null, sub) : null) },
    '@/components/supplier-photo-button': { SupplierPhotoButton: ({ kind }) => {
      calls.photos.push(kind);
      return React.createElement('button', { 'data-photo': kind }, '+');
    } },
    '@/components/public/supplier-storefront': { SupplierStorefront: (props) => {
      calls.storefront.push(props);
      return React.createElement('div', { 'data-stub': 'storefront' },
        React.createElement('span', null, `productLinks=${props.productLinks}`),
        React.createElement('span', null, `rfqActions=${props.rfqActions}`),
        React.createElement('span', null, `cover=${props.coverUrl ?? 'none'}`),
        props.coverAction ?? null, props.avatarAction ?? null, props.verificationActions ?? null);
    } },
  };
  return { mocks: base, calls };
}

async function render(options) {
  const { mocks, calls } = pageMocks(options);
  const { default: Page } = load('app/supplier/portal/storefront/page.tsx', mocks, { quiet: !!options.fail });
  return { html: renderToStaticMarkup(await Page()), calls };
}

// 1. Hồ sơ chưa publish vẫn xem được, nhưng nói rõ và không dẫn tới trang chết.
const draft = await render({ status: 'draft', steps: [1] });
assert.match(draft.html, /Not published yet/, 'Hồ sơ chưa lên sóng được ghi rõ bằng tiếng Anh');
assert.match(draft.html, /productLinks=false/, 'Chưa publish thì sản phẩm không dẫn đi đâu');
assert.match(draft.html, /rfqActions=false/, 'Nhà cung cấp không tự gửi RFQ');
assert.deepEqual(draft.calls.photos, ['cover', 'profile'], 'Ảnh bìa và ảnh đại diện có nút + ngay trên trang buyer thấy');
assert.match(draft.html, /data-stub="verification-actions"/, 'Dưới phần kiểm toán có khối nút xác minh, chỉ NCC thấy');
assert.equal(draft.calls.storefront[0].verificationActions != null, true, 'Khối nút được truyền vào đúng chỗ trong khung buyer');

// 2. Tóm tắt xác minh nói rõ cái gì đã duyệt, cái gì còn thiếu.
assert.match(draft.html, /1 of 3 checks approved/, 'Hiện số bước đã duyệt');
assert.match(draft.html, /Approved: Documents checked/, 'Nêu tên bước đã duyệt');
assert.match(draft.html, /Not reviewed yet: Factory visit, Delivery history/, 'Nêu đúng bước còn thiếu');

const published = await render({ status: 'published', steps: [1, 2, 3] });
assert.match(published.html, /productLinks=true/, 'Hồ sơ đã publish thì sản phẩm dẫn được');
assert.match(published.html, /Open public page/, 'Có lối mở trang công khai khi hồ sơ đã lên sóng');
assert.match(published.html, /3 of 3 checks approved/, 'Đủ ba cấp thì hiện 3/3');
assert.match(published.html, /all three checks are approved/, 'Đủ ba cấp thì không còn bước thiếu');

// 3. Thiếu bảng thì báo lỗi dữ liệu, không trắng trang và không lộ stack trace.
const broken = await render({ fail: true });
assert.match(broken.html, /Chưa dựng được bản xem trước/, 'Lỗi dữ liệu có màn hình báo cho NCC');
assert.match(broken.html, /Hồ sơ của bạn không bị thay đổi/, 'Nói rõ hồ sơ không bị ảnh hưởng');
assert.doesNotMatch(broken.html, /Could not find the table/, 'Không đẩy lỗi CSDL ra giao diện');
assert.equal(broken.calls.storefront.length, 0, 'Không dựng khung buyer khi thiếu dữ liệu');

// 4. Bản xem trước không tự sinh SEO, JSON-LD hay lượt xem.
const source = read('app/supplier/portal/storefront/page.tsx');
assert.match(source, /robots: \{ index: false, follow: false \}/, 'Trang xem trước noindex');
for (const forbidden of ['SupplierTrafficBeacon', 'createTrafficToken', 'safeJsonLd', 'generateMetadata', 'countView'])
  assert.ok(!source.includes(forbidden), `Bản xem trước không dùng ${forbidden}`);
assert.ok(!source.includes('notFound('), 'Hồ sơ chưa publish không bị 404');

// 5. Hai nơi dùng chung một khung, nên nội dung không thể lệch nhau.
const publicPage = read('app/(public)/suppliers/[slug]/page.tsx');
assert.match(publicPage, /<SupplierStorefront/, 'Trang công khai dùng khung chung');
assert.match(read('app/supplier/portal/storefront/page.tsx'), /<SupplierStorefront/, 'Trang của tôi dùng đúng khung đó');
const shared = read('components/public/supplier-storefront.tsx');
for (const section of ['About this supplier', 'Business details', 'What Vexim checked', 'Trade at a glance', 'Seller information', 'Supplier catalogue'])
  assert.ok(shared.includes(section), `Khung chung có mục ${section}`);
for (const field of ['supplierSummaryDisplay', 'supplierProductsDisplay', 'supplierMarketsDisplay', 'supplierCapacityDisplay', 'supplierPaymentTermsDisplay'])
  assert.match(shared, new RegExp(`${field}\\(s\\)`), `Trang buyer hiển thị ${field}`);
assert.match(shared, /See the main products above or ask Vexim about specifications and availability/,
  'Hồ sơ chưa có listing vẫn dẫn buyer tới thông tin mặt hàng chính');
assert.ok(!shared.includes('chưa hiện với buyer') && !/hidden from buyer/i.test(shared),
  'Không thêm danh sách “chưa hiện với buyer”');
assert.doesNotMatch(shared, /supplier\.email|supplier\.phone|supplier\.zalo|tax_number|public_review_summaries\[1\]/,
  'Khung buyer không lộ email, điện thoại hay giấy tờ nội bộ');

console.log('✅ Storefront preview: same view as buyers, English, verification gaps shown, no SEO or traffic counting.');
