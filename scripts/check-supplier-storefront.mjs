import { brandIcons } from './lib/vexim-icons.mjs';
// node scripts/check-supplier-storefront.mjs — “Trang của tôi” là đúng giao diện buyer thấy:
// dựng từ component dùng chung, không SEO, không đếm lượt xem, và không trắng trang khi
// thiếu dữ liệu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { supplierShortName, supplierNameCase } from '../lib/public/supplier-name.ts';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as icons from 'lucide-react';

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
  const dictionary = load('lib/i18n/portal/storefront.ts', {}).storefrontMessages.en;
  const base = {
    '@/lib/i18n/server': { getPortalMessages: async () => ({ m: { storefront: dictionary }, locale: 'en' }) },
    '@/lib/i18n/format': { fill: (text, values) => text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`) },
    react: React,
    '@/lib/verification-status': { verificationLabel: () => 'Factory verification' },
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
      steps: [], approvedCount: 1, currentLevel: 2, percent: 33, headline: 'Bước tiếp theo: Xác thực nhà máy.',
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
assert.match(draft.html, /Not reviewed yet: Factory verification, Delivery history/, 'Nêu đúng bước còn thiếu');

const published = await render({ status: 'published', steps: [1, 2, 3] });
assert.match(published.html, /productLinks=true/, 'Hồ sơ đã publish thì sản phẩm dẫn được');
assert.match(published.html, /Open public page/, 'Có lối mở trang công khai khi hồ sơ đã lên sóng');
assert.match(published.html, /3 of 3 checks approved/, 'Đủ ba cấp thì hiện 3/3');
assert.match(published.html, /all three checks are approved/, 'Đủ ba cấp thì không còn bước thiếu');

// 3. Thiếu bảng thì báo lỗi dữ liệu, không trắng trang và không lộ stack trace.
const broken = await render({ fail: true });
assert.match(broken.html, /Could not build the preview/, 'Lỗi dữ liệu có màn hình báo cho NCC');
assert.match(broken.html, /Your profile has not been changed/, 'Nói rõ hồ sơ không bị ảnh hưởng');
assert.doesNotMatch(broken.html, /Could not find the table/, 'Không đẩy lỗi CSDL ra giao diện');
assert.equal(broken.calls.storefront.length, 0, 'Không dựng khung buyer khi thiếu dữ liệu');

// 4. Bản xem trước không tự sinh SEO, JSON-LD hay lượt xem.
const source = read('app/supplier/portal/storefront/page.tsx');
assert.match(source, /robots: \{ index: false, follow: false \}/, 'Trang xem trước noindex');
for (const forbidden of ['SupplierTrafficBeacon', 'createTrafficToken', 'safeJsonLd', 'countView'])
  assert.ok(!source.includes(forbidden), `Bản xem trước không dùng ${forbidden}`);
assert.ok(!source.includes('notFound('), 'Hồ sơ chưa publish không bị 404');

// 5. Hai nơi dùng chung một khung, nên nội dung không thể lệch nhau.
const publicPage = read('app/(public)/suppliers/[slug]/page.tsx');
assert.match(publicPage, /<SupplierStorefront/, 'Trang công khai dùng khung chung');
assert.match(read('app/supplier/portal/storefront/page.tsx'), /<SupplierStorefront/, 'Trang của tôi dùng đúng khung đó');
const shared = read('components/public/supplier-storefront.tsx');
for (const section of ['About this supplier', 'Business details', 'Supplier checks', 'Trade overview', 'Company details', 'Supplier catalogue'])
  assert.ok(shared.includes(section), `Khung chung có mục ${section}`);
for (const field of ['supplierSummaryDisplay', 'supplierProductsDisplay', 'supplierMarketsDisplay', 'supplierCapacityDisplay', 'supplierPaymentTermsDisplay'])
  assert.match(shared, new RegExp(`${field}\\(s\\)`), `Trang buyer hiển thị ${field}`);
const supplierHeader = shared.slice(shared.indexOf('<section className="mt-5'), shared.indexOf('<nav aria-label="Supplier sections"'));
assert.match(supplierHeader, /text-left text-xl font-bold leading-7[^"\n]*sm:text-2xl sm:leading-8/,
  'The supplier name uses compact, left-aligned typography');
assert.match(supplierHeader, /Business registration checked/);
assert.match(supplierHeader, /View supplier checks/);
assert.doesNotMatch(supplierHeader, /VerificationTierBadge|VerificationCoverSeal|\/3 approved/);
assert.match(shared, /const reviewStatus = approvedStep \? "Checked" : "No completed check shown"/,
  'Do not infer a failed or unstarted review from the absence of published approval');
assert.match(shared, /bg-success-surface text-success/);
assert.match(shared, /bg-ink-50 text-ink-500/);
assert.ok(shared.indexOf('<section id="products"') < shared.indexOf('<section id="about"'), 'Products precede profile details');
assert.match(shared, /supplierShortName\(s\)/, 'Heading uses the normalised display or trade name');
assert.doesNotMatch(shared, /checks approved|Not approved|Level \$\{level\}|bg-gradient-to-br/);
assert.doesNotMatch(shared, /Factory visit|Factory visited|Thăm nhà máy|thăm nhà máy/,
  'The supplier profile never falls back to the old Level 2 terminology');
assert.match(publicPage, /id="related-title" className="text-left text-base font-semibold/,
  'The related-supplier heading uses compact left-aligned typography');
assert.match(publicPage, /flex items-start gap-3/, 'Related-supplier logos align with the top of the text block');
// Tên NCC hay được nhập viết hoa toàn bộ: hạ kiểu chữ, cắt 2 dòng, tên đầy đủ nằm trong title.
assert.match(publicPage, /line-clamp-2 break-words text-left text-base font-semibold leading-6/,
  'Related-supplier names are 16px, semibold and clamp at two lines');
assert.match(publicPage, /<p title=\{relatedName\}/, 'Related-supplier name keeps the full text in title');
assert.match(publicPage, /const relatedName = supplierNameCase\(/, 'Related-supplier names leave ALL CAPS');
// Thẻ là flex column, hàng huy hiệu ghim đáy để bốn thẻ thẳng hàng dù tên dài ngắn khác nhau.
assert.match(publicPage, /className="flex h-full flex-col rounded-xl border border-ink-200 bg-white p-4/,
  'Related-supplier card is a full-height flex column');
assert.match(publicPage, /className="mt-auto flex flex-wrap items-center gap-1\.5 pt-3"/,
  'Related-supplier badge row is pinned to the card bottom');
// Tên thật trong CSDL hay viết hoa toàn bộ: hạ kiểu chữ nhưng giữ nguyên tên pháp lý.
assert.equal(supplierNameCase('TINIMEX COMPANY LIMITED'), 'Tinimex Company Limited');
assert.equal(supplierNameCase('AN KHANG FOOD PROCESSING AND PRODUCTION ONE MEMBER COMPANY LIMITED'),
  'An Khang Food Processing And Production One Member Company Limited');
assert.equal(supplierNameCase('CÔNG TY TNHH MTV AN KHANG'), 'Công Ty TNHH MTV An Khang',
  'Giữ nguyên TNHH, MTV và dấu tiếng Việt');
assert.equal(supplierNameCase('An Phat Foods JSC'), 'An Phat Foods JSC',
  'Tên đã có chữ thường thì không bị sửa');
assert.equal(supplierNameCase('GIA GIA NGUYEN 22000'), 'Gia Gia Nguyen 22000', 'Giữ nguyên số trong tên');
assert.match(shared, /See the main products below or ask Vexim about specifications and availability/,
  'Hồ sơ chưa có listing vẫn dẫn buyer tới thông tin mặt hàng chính');
const verificationBlock = shared.slice(shared.indexOf('<section id="verification"'), shared.indexOf('{verificationActions}'));
assert.doesNotMatch(verificationBlock, /Target markets|supplierExportMarketsDisplay/,
  'Supplier-stated markets are not presented as delivery evidence');
assert.match(shared, /Provided by the supplier. Confirm terms when requesting a quote/);
assert.match(shared, /divide-y divide-ink-200/, 'Checks are readable rows rather than ranked cards');
assert.match(shared, /<SupplierProductRail productCount=\{s\.main_products\.length\}>/,
  'Supplier catalogue uses the shared product rail');
assert.match(shared, /lg:w-\[calc\(\(100%_-_4rem\)\/5\)\] lg:shrink-0/,
  'Each desktop rail item takes one fifth of the visible width after gaps');
const { SupplierProductRail } = load('components/public/supplier-product-rail.tsx', {
  react: React, 'react/jsx-runtime': jsxRuntime, '@/components/brand/vexim-icons': brandIcons,
  'lucide-react': { ChevronLeft, ChevronRight },
});
const railItems = (count) => Array.from({ length: count }, (_, index) => React.createElement('li', { key: index }, `Product ${index + 1}`));
const sixProductRail = renderToStaticMarkup(React.createElement(SupplierProductRail, { productCount: 6 }, railItems(6)));
assert.match(sixProductRail, /grid-cols-1[^"\n]*sm:grid-cols-2[^"\n]*md:grid-cols-3/,
  'Phone and tablet catalogue grids remain unchanged');
assert.match(sixProductRail, /lg:flex[^"\n]*lg:overflow-x-auto/, 'Desktop enables native horizontal scrolling');
assert.match(sixProductRail, /Scroll horizontally to explore all 6 products/);
assert.match(sixProductRail, /aria-label="Show previous products"/);
assert.match(sixProductRail, /aria-label="Show next products"/);
assert.equal((sixProductRail.match(/<li/g) ?? []).length, 6, 'The rail keeps all products in document order');
const fiveProductRail = renderToStaticMarkup(React.createElement(SupplierProductRail, { productCount: 5 }, railItems(5)));
assert.doesNotMatch(fiveProductRail, /Show previous products|Show next products|Scroll horizontally/,
  'Five or fewer products do not show unnecessary carousel controls');
assert.match(publicPage, /r\.profile_image \? mediaUrl\(r\.profile_image\)/,
  'Related suppliers use their own stored profile image');
assert.match(publicPage, /src=\{relatedLogoUrl\}/, 'Related supplier logos use the safe public-media URL');
assert.match(publicPage, /relatedName\.charAt\(0\)\.toUpperCase\(\) \|\| "S"/,
  'A missing related-supplier logo has a clear initial fallback');
assert.ok(!shared.includes('chưa hiện với buyer') && !/hidden from buyer/i.test(shared),
  'Không thêm danh sách “chưa hiện với buyer”');
assert.doesNotMatch(shared, /supplier\.email|supplier\.phone|supplier\.zalo|tax_number|public_review_summaries\[1\]/,
  'Khung buyer không lộ email, điện thoại hay giấy tờ nội bộ');

// Render the actual shared profile, not just its preview-page stub.
const englishFields = new Proxy({}, { get: (_, key) => key === 'supplierExportMarketsDisplay' || key === 'supplierPortsDisplay' || key === 'supplierIncotermsDisplay'
  ? () => [] : key === 'supplierLegalNameDisplay' ? () => 'LEGAL NAME UNCHANGED' : () => '' });
const { SupplierStorefront } = load('components/public/supplier-storefront.tsx', {
  'react/jsx-runtime': jsxRuntime,
  'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  '@/components/brand/vexim-icons': brandIcons,
  'lucide-react': icons,
  '@/components/public-product-card': { PublicProductCard: () => null },
  '@/components/public/supplier-product-rail': { SupplierProductRail },
  '@/components/verification-tier': { VERIFICATION_LEVEL_ICONS: { 1: icons.FileCheck2, 2: icons.Factory, 3: icons.Truck } },
  '@/lib/public/supplier-name': { supplierShortName },
  '@/lib/public/catalog': { supplierTypeLabel: () => 'Manufacturer' },
  '@/lib/verification-status': { verificationLabel: (level, scope) => level === 2 && scope === 'partner_contract' ? 'Partner factory contract' : level === 2 ? 'Factory verification' : 'Delivery history' },
  '@/lib/public/display-name': {}, '@/lib/products/price-display': {},
  '@/lib/public/product-selection': { withoutDirectContacts: (value) => value },
  '@/lib/public/supplier-english': englishFields,
});
const profile = (steps, overrides = {}) => renderToStaticMarkup(React.createElement(SupplierStorefront, {
  supplier: { ...card, name: 'MIGHTY ASIA', display_name: null, supplier_type: 'manufacturer', gallery_images: [], public_review_summaries: {}, approved_verification_steps: steps, ...overrides },
  categories: [], certificates: [], synthetic: false, coverUrl: null, avatarUrl: null,
}));
const oneCheck = profile([1]);
assert.match(oneCheck, />Mighty Asia</);
assert.match(oneCheck, /Business registration checked/);
assert.match(oneCheck, /Business registration documents reviewed by Vexim/);
assert.equal((oneCheck.match(/No completed check shown/g) ?? []).length, 2);
assert.doesNotMatch(oneCheck, /Level 1|1\/3|Not approved|bg-gradient/);
assert.ok(oneCheck.indexOf('id="products"') < oneCheck.indexOf('id="about"'));
assert.match(oneCheck, /LEGAL NAME UNCHANGED/);
assert.equal((profile([]).match(/No completed check shown/g) ?? []).length, 3);
assert.doesNotMatch(profile([1, 2, 3]), /No completed check shown/);
const partner = profile([2], { approved_l2_scope: 'partner_contract', partner_review_summary: 'Reviewed partner contract only.' });
assert.match(partner, /Partner factory contract/);
assert.match(partner, /Reviewed partner contract only/);
assert.match(partner, /does not establish ownership or a factory inspection/);
const both = profile([2], { approved_l2_scope: 'both', partner_review_summary: 'Partner scope', public_review_summaries: { 2: 'Factory scope' } });
assert.match(both, /Factory scope/);
assert.match(both, /Partner scope/);

console.log('✅ Storefront preview: same view as buyers, English, verification gaps shown, no SEO or traffic counting.');
